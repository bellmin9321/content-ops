import { InstagramBudgetError } from "./instagram";
import { getInstagramMetric } from "./instagram";
import { judge, type Judgement } from "./metrics";
import { getNaverMetrics } from "./naver";
import type { InstagramMetric, NaverMetric, YoutubeMetric } from "./types";
import { getYoutubeMetric } from "./youtube";

/** 인스타 해시태그 예산 보호: 네이버 기회점수 상위 N개만 조회 */
export const IG_TOP_N = 5;
/** 유튜브 쿼터 보호: 네이버 기회점수 상위 N개만 조회 */
export const YT_TOP_N = 10;

export interface AnalyzeOptions {
  ig?: boolean;
  yt?: boolean;
  igTopN?: number;
  ytTopN?: number;
  /** 진행 상황 콜백 (CLI 콘솔 출력, 웹 로그 등) */
  onProgress?: (message: string) => void;
}

export interface KeywordReport {
  keyword: string;
  naver: NaverMetric;
  instagram?: InstagramMetric;
  youtube?: YoutubeMetric;
  judgement: Judgement;
}

export interface AnalyzeResult {
  rows: KeywordReport[];
  /** 예산 소진 등 치명적이지 않은 경고 */
  warnings: string[];
}

/**
 * 네이버 지표를 기준으로 정렬한 뒤, 예산/쿼터 보호를 위해
 * 상위 N개만 인스타·유튜브를 조회하고 교차 판정한다.
 */
export async function analyzeKeywords(
  keywords: string[],
  options: AnalyzeOptions = {},
): Promise<AnalyzeResult> {
  const progress = options.onProgress ?? (() => {});
  const warnings: string[] = [];

  progress(`네이버 지표 조회 중... (${keywords.length}개 키워드)`);
  const naverMetrics = await getNaverMetrics(keywords);
  const sorted = [...naverMetrics].sort((a, b) => b.opportunityScore - a.opportunityScore);

  const igMetrics = new Map<string, InstagramMetric>();
  if (options.ig) {
    const targets = sorted.slice(0, options.igTopN ?? IG_TOP_N);
    progress(`인스타 지표 조회 중... (기회점수 상위 ${targets.length}개)`);
    for (const m of targets) {
      try {
        igMetrics.set(m.keyword, await getInstagramMetric(m.keyword));
      } catch (e) {
        if (e instanceof InstagramBudgetError) {
          warnings.push(e.message);
          continue;
        }
        throw e;
      }
    }
  }

  const ytMetrics = new Map<string, YoutubeMetric>();
  if (options.yt) {
    const targets = sorted.slice(0, options.ytTopN ?? YT_TOP_N);
    progress(`유튜브 지표 조회 중... (기회점수 상위 ${targets.length}개)`);
    for (const m of targets) {
      ytMetrics.set(m.keyword, await getYoutubeMetric(m.keyword));
    }
  }

  const rows: KeywordReport[] = sorted.map((naver) => {
    const instagram = igMetrics.get(naver.keyword);
    const youtube = ytMetrics.get(naver.keyword);
    return { keyword: naver.keyword, naver, instagram, youtube, judgement: judge(naver, instagram, youtube) };
  });

  return { rows, warnings };
}
