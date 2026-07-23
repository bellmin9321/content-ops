import { requireEnv } from "./env.js";
import { average, chunk, sleep } from "./stats.js";

const DATALAB_URL = "https://openapi.naver.com/v1/datalab/search";
/** 데이터랩은 요청당 keywordGroups 5개 제한 */
const GROUPS_PER_REQUEST = 5;
const REQUEST_INTERVAL_MS = 300;
/** 비교 구간: 최근 N일 vs 직전 N일 */
export const TREND_WINDOW_DAYS = 7;

export interface TrendSpike {
  keyword: string;
  /** 최근 7일 평균 검색 비율 (데이터랩 상대값) */
  recentAvg: number;
  /** 직전 7일 평균 검색 비율 */
  prevAvg: number;
  /** 급등 배율 = recentAvg / prevAvg (이전 구간 0이면 99로 캡) */
  spikeRatio: number;
}

function requireDatalabEnv() {
  return requireEnv(
    "naver-datalab",
    ["NAVER_CLIENT_ID", "NAVER_CLIENT_SECRET"],
    "developers.naver.com 애플리케이션의 사용 API에 '데이터랩(검색어트렌드)' 추가",
  );
}

function toDateString(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

interface DatalabPoint {
  period: string;
  ratio: number;
}

/** 시계열을 반으로 갈라 급등 배율 계산 (순수 함수) */
export function computeSpike(keyword: string, points: DatalabPoint[], splitDate: string): TrendSpike {
  const prev = points.filter((p) => p.period < splitDate).map((p) => p.ratio);
  const recent = points.filter((p) => p.period >= splitDate).map((p) => p.ratio);
  const prevAvg = average(prev);
  const recentAvg = average(recent);
  const spikeRatio = prevAvg > 0 ? recentAvg / prevAvg : recentAvg > 0 ? 99 : 1;
  return { keyword, recentAvg, prevAvg, spikeRatio: Math.min(spikeRatio, 99) };
}

/**
 * 키워드 풀의 급등 배율 조회.
 * 데이터랩 검색어트렌드(모바일)로 최근 7일 vs 직전 7일 평균을 비교한다.
 * ratio는 요청 내 상대값이지만 같은 요청 안에서 구간끼리 비교하므로 유효하다.
 */
export async function getTrendSpikes(
  keywords: string[],
  now = Date.now(),
): Promise<TrendSpike[]> {
  const env = requireDatalabEnv();
  const DAY = 24 * 60 * 60 * 1000;
  // 데이터랩은 전일까지 집계되므로 어제를 끝으로 14일 구간을 잡는다
  const end = now - 1 * DAY;
  const start = end - (2 * TREND_WINDOW_DAYS - 1) * DAY;
  const splitDate = toDateString(end - (TREND_WINDOW_DAYS - 1) * DAY);

  const spikes: TrendSpike[] = [];
  const batches = chunk(keywords, GROUPS_PER_REQUEST);
  for (const [i, batch] of batches.entries()) {
    if (i > 0) await sleep(REQUEST_INTERVAL_MS);
    const res = await fetch(DATALAB_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Naver-Client-Id": env.NAVER_CLIENT_ID as string,
        "X-Naver-Client-Secret": env.NAVER_CLIENT_SECRET as string,
      },
      body: JSON.stringify({
        startDate: toDateString(start),
        endDate: toDateString(end),
        timeUnit: "date",
        device: "mo",
        keywordGroups: batch.map((k) => ({ groupName: k, keywords: [k] })),
      }),
    });
    if (!res.ok) {
      const body = (await res.text()).slice(0, 200);
      const hint =
        res.status === 401 || body.includes("Scope")
          ? "\n  → developers.naver.com > 내 애플리케이션 > API 설정에서 '데이터랩(검색어트렌드)'를 추가해주세요."
          : "";
      throw new Error(`네이버 데이터랩 API ${res.status}: ${body}${hint}`);
    }
    const body = (await res.json()) as {
      results?: { title: string; data?: DatalabPoint[] }[];
    };
    for (const result of body.results ?? []) {
      spikes.push(computeSpike(result.title, result.data ?? [], splitDate));
    }
  }
  return spikes;
}
