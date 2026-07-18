import type { InstagramMetric, NaverMetric } from "./types";

/** 판정 기준 — 운영하며 조정하는 값이므로 상수로 분리 */
export const JUDGE_THRESHOLDS = {
  blog: { maxRatio: 5, minMobileVolume: 300 },
  instagram: { maxPostsPerHour: 5, maxTopMedianLikes: 2000 },
} as const;

export type Verdict = "blog" | "instagram" | "both" | "skip";

export interface Judgement {
  verdict: Verdict;
  reasons: string[];
}

/** 플랫폼별 지표를 모아 어디에 발행할지 판정 */
export function judge(naver?: NaverMetric, instagram?: InstagramMetric): Judgement {
  const reasons: string[] = [];
  const t = JUDGE_THRESHOLDS;

  let blogFit = false;
  if (naver) {
    blogFit = naver.ratio <= t.blog.maxRatio && naver.mobileVolume >= t.blog.minMobileVolume;
    reasons.push(
      blogFit
        ? `블로그 적합: 경쟁강도 ${naver.ratio.toFixed(2)} ≤ ${t.blog.maxRatio}, 모바일 ${naver.mobileVolume} ≥ ${t.blog.minMobileVolume}`
        : `블로그 부적합: 경쟁강도 ${naver.ratio.toFixed(2)} (기준 ≤ ${t.blog.maxRatio}), 모바일 ${naver.mobileVolume} (기준 ≥ ${t.blog.minMobileVolume})`,
    );
  }

  let igFit = false;
  if (instagram) {
    igFit =
      instagram.postsPerHour <= t.instagram.maxPostsPerHour &&
      instagram.topMedianLikes <= t.instagram.maxTopMedianLikes;
    reasons.push(
      igFit
        ? `인스타 적합: ${instagram.postsPerHour.toFixed(1)}개/h ≤ ${t.instagram.maxPostsPerHour}, top 좋아요 중앙값 ${instagram.topMedianLikes} ≤ ${t.instagram.maxTopMedianLikes}`
        : `인스타 부적합: ${instagram.postsPerHour.toFixed(1)}개/h (기준 ≤ ${t.instagram.maxPostsPerHour}), top 좋아요 중앙값 ${instagram.topMedianLikes} (기준 ≤ ${t.instagram.maxTopMedianLikes})`,
    );
  }

  const verdict: Verdict =
    blogFit && igFit ? "both" : blogFit ? "blog" : igFit ? "instagram" : "skip";
  if (verdict === "skip") reasons.push("적합 플랫폼 없음");
  return { verdict, reasons };
}
