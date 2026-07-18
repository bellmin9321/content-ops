export type Platform = "blog" | "instagram";

/** 네이버 검색광고 + 블로그 검색을 합친 정규화 지표 */
export interface NaverMetric {
  keyword: string;
  pcVolume: number;
  mobileVolume: number;
  totalVolume: number;
  /** 총검색량 중 모바일 비중 (0~1) */
  mobileShare: number;
  /** 블로그 검색 total = 발행량 */
  blogTotal: number;
  /** 경쟁강도 = 발행량 / 총검색량 */
  ratio: number;
  /** 기회점수 = (모바일량 × 모바일비중) / (경쟁강도 + 1) */
  opportunityScore: number;
}

/** 인스타그램 해시태그 지표 */
export interface InstagramMetric {
  keyword: string;
  hashtag: string;
  /** recent_media 25개 타임스탬프 간격 기반 시간당 발행 수 */
  postsPerHour: number;
  /** top_media 좋아요 중앙값 */
  topMedianLikes: number;
  fromCache: boolean;
}
