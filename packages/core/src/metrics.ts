import type { InstagramMetric, NaverMetric, Platform, YoutubeMetric } from "./types";

/** 판정 기준 — 운영하며 조정하는 값이므로 상수로 분리 */
export const JUDGE_THRESHOLDS = {
  blog: { maxRatio: 5, minMobileVolume: 300 },
  /** 인스타 자체 수요 지표가 없으므로 수요는 네이버 모바일 검색량으로 검증 */
  instagram: { maxPostsPerHour: 5, maxTopMedianLikes: 2000 },
  youtube: { minMedianViews: 5000, maxVideoCount: 500 },
} as const;

export interface Judgement {
  /** 적합 판정된 플랫폼 조합 (빈 배열 = skip) */
  platforms: Platform[];
  /** "blog+youtube" 같은 조합 문자열, 없으면 "skip" */
  verdict: string;
  reasons: string[];
}

/**
 * 플랫폼별 지표를 모아 어디에 발행할지 판정.
 * 기존 단일 verdict(blog|instagram|both|skip)는 3플랫폼 조합(2^3)을 표현할 수
 * 없어 platforms 배열 + 조합 문자열로 리팩토링했다.
 */
export function judge(
  naver?: NaverMetric,
  instagram?: InstagramMetric,
  youtube?: YoutubeMetric,
): Judgement {
  const platforms: Platform[] = [];
  const reasons: string[] = [];
  const t = JUDGE_THRESHOLDS;

  if (naver) {
    const fit = naver.ratio <= t.blog.maxRatio && naver.mobileVolume >= t.blog.minMobileVolume;
    if (fit) platforms.push("blog");
    reasons.push(
      fit
        ? `블로그 적합: 경쟁강도 ${naver.ratio.toFixed(2)} ≤ ${t.blog.maxRatio}, 모바일 ${naver.mobileVolume} ≥ ${t.blog.minMobileVolume}`
        : `블로그 부적합: 경쟁강도 ${naver.ratio.toFixed(2)} (기준 ≤ ${t.blog.maxRatio}), 모바일 ${naver.mobileVolume} (기준 ≥ ${t.blog.minMobileVolume})`,
    );
  }

  if (instagram) {
    const supplyFit =
      instagram.postsPerHour <= t.instagram.maxPostsPerHour &&
      instagram.topMedianLikes <= t.instagram.maxTopMedianLikes;
    // 인스타 수요는 네이버 모바일 검색량으로 검증 (네이버 지표 없으면 공급 조건만 적용)
    const demandFit = !naver || naver.mobileVolume >= t.blog.minMobileVolume;
    const fit = supplyFit && demandFit;
    if (fit) platforms.push("instagram");
    if (!supplyFit) {
      reasons.push(
        `인스타 부적합: ${instagram.postsPerHour.toFixed(1)}개/h (기준 ≤ ${t.instagram.maxPostsPerHour}), top 좋아요 중앙값 ${instagram.topMedianLikes} (기준 ≤ ${t.instagram.maxTopMedianLikes})`,
      );
    } else if (!demandFit) {
      reasons.push(
        `인스타 부적합: 공급은 적으나 네이버 모바일 ${naver?.mobileVolume ?? 0}로 수요 미검증 (기준 ≥ ${t.blog.minMobileVolume})`,
      );
    } else {
      reasons.push(
        `인스타 적합: ${instagram.postsPerHour.toFixed(1)}개/h ≤ ${t.instagram.maxPostsPerHour}, top 좋아요 중앙값 ${instagram.topMedianLikes} ≤ ${t.instagram.maxTopMedianLikes}`,
      );
    }
  }

  if (youtube) {
    const fit =
      youtube.medianViews >= t.youtube.minMedianViews &&
      youtube.videoCount <= t.youtube.maxVideoCount;
    if (fit) platforms.push("youtube");
    reasons.push(
      fit
        ? `유튜브 적합: 중앙 조회수 ${Math.round(youtube.medianViews)} ≥ ${t.youtube.minMedianViews}, 90일 영상 ${youtube.videoCount}개 ≤ ${t.youtube.maxVideoCount} (수요 대비 공급 부족)`
        : `유튜브 부적합: 중앙 조회수 ${Math.round(youtube.medianViews)} (기준 ≥ ${t.youtube.minMedianViews}), 90일 영상 ${youtube.videoCount}개 (기준 ≤ ${t.youtube.maxVideoCount})`,
    );
  }

  if (platforms.length === 0) reasons.push("적합 플랫폼 없음");
  return {
    platforms,
    verdict: platforms.length > 0 ? platforms.join("+") : "skip",
    reasons,
  };
}
