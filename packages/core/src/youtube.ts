import { DAY_MS, HOUR_MS, isFresh, loadCache, saveCache } from "./cache";
import { requireEnv } from "./env";
import { average, median } from "./stats";
import type { YoutubeMetric } from "./types";

const API_BASE = "https://www.googleapis.com/youtube/v3";
const CACHE_FILE = "youtube.json";
/** 지표 캐시 TTL — search.list가 100유닛이므로 24h 캐시 필수 */
const METRIC_TTL_MS = 24 * HOUR_MS;
/** 경쟁 영상 수 집계 기간 */
const RECENT_WINDOW_DAYS = 90;
/** 키워드당 쿼터 비용: search.list 100 + videos.list 1 */
export const YT_UNITS_PER_KEYWORD = 101;
/** YouTube Data API 기본 일일 쿼터 */
export const YT_DAILY_QUOTA = 10_000;

interface YoutubeCache {
  version: 1;
  metrics: Record<
    string,
    { fetchedAt: number; videoCount: number; medianViews: number; velocity: number }
  >;
  /** 일일 쿼터 사용량 추정 로그 (쿼터는 태평양 시간 자정에 리셋되지만 로컬 날짜로 근사) */
  quotaLog: { at: number; units: number }[];
}

const EMPTY_CACHE: YoutubeCache = { version: 1, metrics: {}, quotaLog: [] };

function requireYtEnv() {
  return requireEnv(
    "youtube",
    ["YOUTUBE_API_KEY"],
    "https://console.cloud.google.com에서 프로젝트 생성 → YouTube Data API v3 사용 설정 → API 키 발급",
  );
}

/** 오늘 사용한 쿼터 유닛 추정 (캐시 로그 기반) */
export function quotaUsage(now = Date.now()): { usedToday: number; limit: number } {
  const cache = loadCache(CACHE_FILE, EMPTY_CACHE);
  const today = new Date(now).toDateString();
  const usedToday = cache.quotaLog
    .filter((e) => new Date(e.at).toDateString() === today)
    .reduce((sum, e) => sum + e.units, 0);
  return { usedToday, limit: YT_DAILY_QUOTA };
}

async function ytGet(path: string, params: Record<string, string>): Promise<unknown> {
  const env = requireYtEnv();
  const query = new URLSearchParams({ ...params, key: env.YOUTUBE_API_KEY as string });
  const res = await fetch(`${API_BASE}/${path}?${query}`);
  if (!res.ok) {
    throw new Error(`YouTube Data API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  return res.json();
}

export interface VideoStat {
  viewCount: number;
  publishedAt: string;
}

/** 조회수/영상나이(일) 상위 5개 평균 (순수 함수) */
export function computeVelocity(videos: VideoStat[], now = Date.now()): number {
  const velocities = videos.map((v) => {
    const ageDays = Math.max(1, (now - new Date(v.publishedAt).getTime()) / DAY_MS);
    return v.viewCount / ageDays;
  });
  return average(velocities.sort((a, b) => b - a).slice(0, 5));
}

/**
 * 키워드 유튜브 지표 조회.
 * 쿼터 보호를 위해 키워드당 최대 search.list 1회 + videos.list 1회, 24h 캐시 우선.
 */
export async function getYoutubeMetric(
  keyword: string,
  now = Date.now(),
): Promise<YoutubeMetric> {
  const cache = loadCache(CACHE_FILE, EMPTY_CACHE);
  // 오래된 쿼터 로그 정리 (2일 이상)
  cache.quotaLog = cache.quotaLog.filter((e) => now - e.at < 2 * DAY_MS);

  const cached = cache.metrics[keyword];
  if (cached && isFresh(cached.fetchedAt, METRIC_TTL_MS, now)) {
    return {
      keyword,
      videoCount: cached.videoCount,
      medianViews: cached.medianViews,
      velocity: cached.velocity,
      fromCache: true,
    };
  }

  const publishedAfter = new Date(now - RECENT_WINDOW_DAYS * DAY_MS).toISOString();
  const search = (await ytGet("search", {
    part: "snippet",
    q: keyword,
    type: "video",
    order: "relevance",
    maxResults: "25",
    publishedAfter,
  })) as {
    pageInfo?: { totalResults?: number };
    items?: { id?: { videoId?: string } }[];
  };

  const videoCount = search.pageInfo?.totalResults ?? 0;
  const videoIds = (search.items ?? [])
    .map((item) => item.id?.videoId)
    .filter((id): id is string => Boolean(id));

  let medianViews = 0;
  let velocity = 0;
  let units = 100; // search.list
  if (videoIds.length > 0) {
    const videos = (await ytGet("videos", {
      part: "statistics,snippet",
      id: videoIds.join(","),
    })) as {
      items?: { statistics?: { viewCount?: string }; snippet?: { publishedAt?: string } }[];
    };
    units += 1; // videos.list
    const stats: VideoStat[] = (videos.items ?? []).map((v) => ({
      viewCount: Number(v.statistics?.viewCount ?? 0),
      publishedAt: v.snippet?.publishedAt ?? new Date(now).toISOString(),
    }));
    medianViews = median(stats.map((s) => s.viewCount));
    velocity = computeVelocity(stats, now);
  }

  cache.quotaLog.push({ at: now, units });
  cache.metrics[keyword] = { fetchedAt: now, videoCount, medianViews, velocity };
  saveCache(CACHE_FILE, cache);

  return { keyword, videoCount, medianViews, velocity, fromCache: false };
}
