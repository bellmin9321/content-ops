import { createHmac } from "node:crypto";
import { requireEnv } from "./env.js";
import { chunk, sleep } from "./stats.js";
import type { NaverMetric } from "./types.js";

const AD_API_BASE = "https://api.searchad.naver.com";
const KEYWORDTOOL_PATH = "/keywordstool";
const BLOG_SEARCH_URL = "https://openapi.naver.com/v1/search/blog.json";

/** 검색광고 API는 요청당 hintKeywords 5개 제한 */
const HINT_KEYWORDS_PER_REQUEST = 5;
/** 연속 호출 간 대기 (rate limit 보호) */
const REQUEST_INTERVAL_MS = 300;

function requireAdEnv() {
  return requireEnv(
    "naver-searchad",
    ["NAVER_AD_API_KEY", "NAVER_AD_SECRET_KEY", "NAVER_AD_CUSTOMER_ID"],
    "https://manage.searchad.naver.com > 도구 > API 사용 관리에서 액세스라이선스 발급",
  );
}

function requireOpenApiEnv() {
  return requireEnv(
    "naver-openapi",
    ["NAVER_CLIENT_ID", "NAVER_CLIENT_SECRET"],
    "https://developers.naver.com/apps 애플리케이션 등록 후 '검색' API 사용 설정",
  );
}

function signAdRequest(timestamp: string, method: string, path: string, secret: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${method}.${path}`).digest("base64");
}

/** 검색광고 API의 월간 조회수는 10 미만이면 "< 10" 문자열로 온다 → 5로 보정 */
function normalizeCount(value: number | string | null | undefined): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return value.includes("<") ? 5 : Number(value) || 0;
  return 0;
}

interface KeywordToolRow {
  relKeyword: string;
  monthlyPcQcCnt: number | string;
  monthlyMobileQcCnt: number | string;
}

async function fetchSearchVolumes(
  keywords: string[],
): Promise<Map<string, { pc: number; mobile: number }>> {
  const env = requireAdEnv();
  const volumes = new Map<string, { pc: number; mobile: number }>();

  // 검색광고 API는 hintKeywords에 공백을 허용하지 않는다 → 공백 제거 후 원 키워드로 역매핑
  const stripped = new Map(keywords.map((k) => [k.replace(/\s+/g, ""), k]));
  const batches = chunk([...stripped.keys()], HINT_KEYWORDS_PER_REQUEST);

  for (const [i, batch] of batches.entries()) {
    if (i > 0) await sleep(REQUEST_INTERVAL_MS);
    const timestamp = String(Date.now());
    const query = new URLSearchParams({ hintKeywords: batch.join(","), showDetail: "1" });
    const res = await fetch(`${AD_API_BASE}${KEYWORDTOOL_PATH}?${query}`, {
      headers: {
        "X-Timestamp": timestamp,
        "X-API-KEY": env.NAVER_AD_API_KEY as string,
        "X-Customer": env.NAVER_AD_CUSTOMER_ID as string,
        "X-Signature": signAdRequest(
          timestamp,
          "GET",
          KEYWORDTOOL_PATH,
          env.NAVER_AD_SECRET_KEY as string,
        ),
      },
    });
    if (!res.ok) {
      throw new Error(`네이버 검색광고 API ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    const body = (await res.json()) as { keywordList?: KeywordToolRow[] };
    for (const row of body.keywordList ?? []) {
      const original = stripped.get(row.relKeyword);
      // keywordList에는 연관 키워드도 섞여 오므로 요청한 키워드만 취한다
      if (!original) continue;
      volumes.set(original, {
        pc: normalizeCount(row.monthlyPcQcCnt),
        mobile: normalizeCount(row.monthlyMobileQcCnt),
      });
    }
  }
  return volumes;
}

async function fetchBlogTotal(keyword: string): Promise<number> {
  const env = requireOpenApiEnv();
  const query = new URLSearchParams({ query: keyword, display: "1" });
  const res = await fetch(`${BLOG_SEARCH_URL}?${query}`, {
    headers: {
      "X-Naver-Client-Id": env.NAVER_CLIENT_ID as string,
      "X-Naver-Client-Secret": env.NAVER_CLIENT_SECRET as string,
    },
  });
  if (!res.ok) {
    throw new Error(`네이버 블로그 검색 API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const body = (await res.json()) as { total?: number };
  return body.total ?? 0;
}

/** 검색량·발행량으로 경쟁강도/기회점수를 계산하는 순수 함수 */
export function computeNaverMetric(
  keyword: string,
  pcVolume: number,
  mobileVolume: number,
  blogTotal: number,
): NaverMetric {
  const totalVolume = pcVolume + mobileVolume;
  const mobileShare = totalVolume > 0 ? mobileVolume / totalVolume : 0;
  const ratio =
    totalVolume > 0 ? blogTotal / totalVolume : blogTotal > 0 ? Number.POSITIVE_INFINITY : 0;
  const opportunityScore = Number.isFinite(ratio)
    ? (mobileVolume * mobileShare) / (ratio + 1)
    : 0;
  return {
    keyword,
    pcVolume,
    mobileVolume,
    totalVolume,
    mobileShare,
    blogTotal,
    ratio,
    opportunityScore,
  };
}

/** 키워드 목록의 네이버 지표를 일괄 조회 */
export async function getNaverMetrics(keywords: string[]): Promise<NaverMetric[]> {
  const volumes = await fetchSearchVolumes(keywords);
  const metrics: NaverMetric[] = [];
  for (const [i, keyword] of keywords.entries()) {
    if (i > 0) await sleep(REQUEST_INTERVAL_MS);
    const volume = volumes.get(keyword) ?? { pc: 0, mobile: 0 };
    const blogTotal = await fetchBlogTotal(keyword);
    metrics.push(computeNaverMetric(keyword, volume.pc, volume.mobile, blogTotal));
  }
  return metrics;
}
