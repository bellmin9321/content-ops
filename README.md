# content-ops

네이버 블로그 · 인스타그램 · 유튜브 세 플랫폼에서 **"모바일 검색량은 많은데
경쟁(발행량)이 적은 키워드"**를 교차 발굴해, 어느 플랫폼에 어떤 소재를 발행할지
판정하는 CLI 도구입니다.

## 구조

```
packages/
  core/   순수 로직 (provider 패턴, 외부 의존성 없음)
    naver.ts      검색광고 API(HMAC 서명) + 블로그 검색 API
    instagram.ts  Graph API 해시태그 2단계 조회 + 7일 예산 추적
    youtube.ts    Data API v3 + 일일 쿼터 추적
    metrics.ts    3플랫폼 교차 판정 (JUDGE_THRESHOLDS 상수로 기준 조정)
    types.ts      정규화된 Metric 인터페이스
  cli/    얇은 진입점 (tsx 실행, 표 출력 + BOM CSV 저장)
```

## 시작하기

```bash
pnpm install
cp .env.example .env   # 아래 발급 절차대로 키를 채운다

pnpm analyze "키워드1" "키워드2"          # 네이버만
pnpm analyze --ig --yt "키워드1" "키워드2" # 세 플랫폼 교차 분석
pnpm analyze --budget                      # 인스타 예산 + 유튜브 쿼터 현황
```

- 인스타는 네이버 **기회점수 상위 5개**, 유튜브는 **상위 10개**만 조회해 예산/쿼터를 보호합니다.
- 결과는 콘솔 표 + `out/keywords-<timestamp>.csv`(BOM 포함, 엑셀 호환)로 저장됩니다.
- provider 캐시는 `.cache/`에 저장되며 git에 올라가지 않습니다.

## API 발급 절차

### 1. 네이버 검색광고 API (검색량)
1. [searchad.naver.com](https://searchad.naver.com) 광고주 가입 후 [manage.searchad.naver.com](https://manage.searchad.naver.com) 접속
2. 도구 > API 사용 관리 > 네이버 검색광고 API 서비스 신청
3. 액세스라이선스 · 비밀키 발급 → `NAVER_AD_API_KEY`, `NAVER_AD_SECRET_KEY`
4. 우측 상단 계정 정보의 CUSTOMER_ID → `NAVER_AD_CUSTOMER_ID`

### 2. 네이버 오픈API (블로그 발행량)
1. [developers.naver.com/apps](https://developers.naver.com/apps)에서 애플리케이션 등록
2. 사용 API에 "검색" 추가 → `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`

### 3. Instagram Graph API (해시태그)
1. 인스타그램 계정을 비즈니스/크리에이터로 전환하고 Facebook 페이지와 연결
2. [developers.facebook.com](https://developers.facebook.com)에서 앱 생성, Instagram Graph API 추가
3. `instagram_basic`, `pages_show_list` 권한으로 장기 액세스 토큰 발급 → `IG_ACCESS_TOKEN`
4. 페이지에 연결된 IG 비즈니스 계정 ID → `IG_USER_ID`

### 4. YouTube Data API v3
1. [console.cloud.google.com](https://console.cloud.google.com)에서 프로젝트 생성
2. API 및 서비스 > 라이브러리에서 "YouTube Data API v3" 사용 설정
3. 사용자 인증 정보 > API 키 생성 → `YOUTUBE_API_KEY`

## 쿼터 / 제한 요약

| 플랫폼 | 제한 | 이 도구의 보호 장치 |
|---|---|---|
| 네이버 검색광고 | 요청당 hintKeywords 5개, 월간 조회수 10 미만은 `"< 10"` 문자열 | 5개씩 청크 + 300ms 간격, `"< 10"` → 5 보정 |
| 네이버 오픈API | 일 25,000회 (블로그 검색) | 키워드당 1회 호출 |
| Instagram Graph | **7일 롤링 윈도우당 고유 해시태그 30개** | `.cache/instagram.json`에 ID 영구 캐시 + 예산 추적 + 지표 24h TTL, 기회점수 상위 5개만 조회 |
| YouTube Data v3 | 일 10,000 유닛 (search.list = **100유닛**) | 키워드당 최대 1 search + 1 videos(101유닛), 24h TTL 캐시, 상위 10개만 조회 |

## 판정 기준 (`packages/core/src/metrics.ts` JUDGE_THRESHOLDS)

| 플랫폼 | 기준 | 해석 |
|---|---|---|
| 블로그 📝 | 경쟁강도(발행량/총검색량) ≤ 5 && 모바일 ≥ 300 | 검색 수요 대비 발행 경쟁 낮음 |
| 인스타 📸 | 글/h ≤ 5 && top 좋아요 중앙값 ≤ 2000 (+수요는 네이버 모바일 ≥ 300으로 검증) | 해시태그 공급 적고 진입장벽 낮음 |
| 유튜브 🎬 | 중앙 조회수 ≥ 5000 && 90일 영상 ≤ 500 | 수요 대비 공급 부족 |

판정은 적합 플랫폼 조합(`blog+youtube` 등)으로 출력되며, 각 판정에 수치 근거(reason)가 붙습니다.

## 다음 확장 포인트

- GitHub Actions 주간 cron: 고정 키워드 풀을 매주 분석해 CSV 아티팩트 업로드
- Slack 리포트: 판정이 `skip`이 아닌 키워드만 웹훅으로 요약 전송
- `smallChannelHits` 고도화: channels.list 구독자 수 결합해 소형 채널 진입 가능성 판단
