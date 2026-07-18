export type Platform = "blog" | "instagram" | "youtube";

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

/** 유튜브 키워드 지표 */
export interface YoutubeMetric {
  keyword: string;
  /** 최근 90일 관련 영상 수 = 공급 (search.list totalResults) */
  videoCount: number;
  /** 상위 25개 조회수 중앙값 = 수요 프록시 겸 진입장벽 */
  medianViews: number;
  /** 조회수/영상나이(일) 상위 5개 평균 = 신선한 키워드 감지 */
  velocity: number;
  fromCache: boolean;
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
