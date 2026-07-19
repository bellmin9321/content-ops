import { DAY_MS, HOUR_MS, isFresh, loadCache, saveCache } from "./cache.js";
import { requireEnv } from "./env.js";
import { median } from "./stats.js";
import type { InstagramMetric } from "./types.js";

const GRAPH_BASE = "https://graph.facebook.com/v21.0";
const CACHE_FILE = "instagram.json";
/** 7일 롤링 윈도우당 조회 가능한 고유 해시태그 수 (Graph API 제한) */
export const IG_HASHTAG_BUDGET_7D = 30;
const BUDGET_WINDOW_MS = 7 * DAY_MS;
/** 지표 캐시 TTL */
const METRIC_TTL_MS = 24 * HOUR_MS;

interface InstagramCache {
  version: 1;
  /** 해시태그 → ID 영구 캐시 (ID 조회는 예산을 소모하지 않도록 재사용) */
  hashtagIds: Record<string, string>;
  /** 예산 추적: 미디어를 조회한 해시태그와 시각 */
  budgetLog: { hashtag: string; at: number }[];
  /** 지표 24h TTL 캐시 */
  metrics: Record<
    string,
    { fetchedAt: number; postsPerHour: number; topMedianLikes: number }
  >;
}

const EMPTY_CACHE: InstagramCache = { version: 1, hashtagIds: {}, budgetLog: [], metrics: {} };

export class InstagramBudgetError extends Error {
  constructor(hashtag: string, nextFreeAt: number) {
    super(
      `[instagram] 7일 해시태그 예산(${IG_HASHTAG_BUDGET_7D}개) 소진 — "#${hashtag}" 조회 불가. ` +
        `다음 슬롯: ${new Date(nextFreeAt).toLocaleString("ko-KR")}`,
    );
    this.name = "InstagramBudgetError";
  }
}

function requireIgEnv() {
  return requireEnv(
    "instagram",
    ["IG_ACCESS_TOKEN", "IG_USER_ID"],
    "Meta for Developers 앱 생성 → Instagram Graph API + instagram_basic 권한, 비즈니스/크리에이터 계정 연결",
  );
}

function pruneBudget(cache: InstagramCache, now: number): void {
  cache.budgetLog = cache.budgetLog.filter((e) => now - e.at < BUDGET_WINDOW_MS);
}

/** 현재 7일 윈도우 안에서 조회한 고유 해시태그 목록 */
export function budgetUsage(now = Date.now()): { used: string[]; limit: number; nextFreeAt: number | null } {
  const cache = loadCache(CACHE_FILE, EMPTY_CACHE);
  pruneBudget(cache, now);
  const used = [...new Set(cache.budgetLog.map((e) => e.hashtag))];
  const oldest = cache.budgetLog.length
    ? Math.min(...cache.budgetLog.map((e) => e.at))
    : null;
  return {
    used,
    limit: IG_HASHTAG_BUDGET_7D,
    nextFreeAt: oldest !== null ? oldest + BUDGET_WINDOW_MS : null,
  };
}

async function graphGet(path: string, params: Record<string, string>): Promise<unknown> {
  const query = new URLSearchParams(params);
  const res = await fetch(`${GRAPH_BASE}/${path}?${query}`);
  if (!res.ok) {
    throw new Error(`Instagram Graph API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  return res.json();
}

async function resolveHashtagId(cache: InstagramCache, hashtag: string): Promise<string> {
  const cached = cache.hashtagIds[hashtag];
  if (cached) return cached;
  const env = requireIgEnv();
  const body = (await graphGet("ig_hashtag_search", {
    user_id: env.IG_USER_ID as string,
    q: hashtag,
    access_token: env.IG_ACCESS_TOKEN as string,
  })) as { data?: { id: string }[] };
  const id = body.data?.[0]?.id;
  if (!id) throw new Error(`[instagram] 해시태그 ID를 찾을 수 없습니다: #${hashtag}`);
  cache.hashtagIds[hashtag] = id;
  return id;
}

interface HashtagMedia {
  like_count?: number;
  timestamp?: string;
}

/** recent_media 타임스탬프 간격으로 시간당 발행 수 계산 (순수 함수) */
export function computePostsPerHour(timestamps: string[]): number {
  const times = timestamps
    .map((t) => new Date(t).getTime())
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b);
  if (times.length < 2) return 0;
  const spanHours = ((times[times.length - 1] as number) - (times[0] as number)) / HOUR_MS;
  if (spanHours <= 0) return times.length;
  return (times.length - 1) / spanHours;
}

/**
 * 해시태그 지표 조회.
 * 24h 캐시 우선 → 예산 확인 → recent_media(postsPerHour) + top_media(topMedianLikes)
 */
export async function getInstagramMetric(
  keyword: string,
  now = Date.now(),
): Promise<InstagramMetric> {
  const hashtag = keyword.replace(/[\s#]+/g, "");
  const cache = loadCache(CACHE_FILE, EMPTY_CACHE);
  pruneBudget(cache, now);

  const cachedMetric = cache.metrics[hashtag];
  if (cachedMetric && isFresh(cachedMetric.fetchedAt, METRIC_TTL_MS, now)) {
    return {
      keyword,
      hashtag,
      postsPerHour: cachedMetric.postsPerHour,
      topMedianLikes: cachedMetric.topMedianLikes,
      fromCache: true,
    };
  }

  // 이번 윈도우에서 아직 조회하지 않은 해시태그라면 예산 확인
  const usedTags = new Set(cache.budgetLog.map((e) => e.hashtag));
  if (!usedTags.has(hashtag) && usedTags.size >= IG_HASHTAG_BUDGET_7D) {
    const oldest = Math.min(...cache.budgetLog.map((e) => e.at));
    throw new InstagramBudgetError(hashtag, oldest + BUDGET_WINDOW_MS);
  }

  const env = requireIgEnv();
  const hashtagId = await resolveHashtagId(cache, hashtag);
  const mediaParams = {
    user_id: env.IG_USER_ID as string,
    access_token: env.IG_ACCESS_TOKEN as string,
    fields: "like_count,timestamp",
    limit: "25",
  };
  const recent = (await graphGet(`${hashtagId}/recent_media`, mediaParams)) as {
    data?: HashtagMedia[];
  };
  const top = (await graphGet(`${hashtagId}/top_media`, mediaParams)) as {
    data?: HashtagMedia[];
  };

  const postsPerHour = computePostsPerHour(
    (recent.data ?? []).map((m) => m.timestamp ?? "").filter(Boolean),
  );
  const topMedianLikes = median(
    (top.data ?? []).map((m) => m.like_count).filter((v): v is number => typeof v === "number"),
  );

  cache.budgetLog.push({ hashtag, at: now });
  cache.metrics[hashtag] = { fetchedAt: now, postsPerHour, topMedianLikes };
  saveCache(CACHE_FILE, cache);

  return { keyword, hashtag, postsPerHour, topMedianLikes, fromCache: false };
}
