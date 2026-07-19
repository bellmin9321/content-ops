import { join } from "node:path";
import {
  MissingEnvError,
  analyzeKeywords,
  budgetUsage,
  loadDotenv,
  quotaUsage,
  repoRoot,
  type Judgement,
  type Platform,
} from "@content-ops/core";
import { writeCsv } from "./csv.js";
import { renderTable } from "./table.js";

const PLATFORM_ICONS: Record<Platform, string> = {
  blog: "📝",
  instagram: "📸",
  youtube: "🎬",
};

function verdictLabel(judgement: Judgement): string {
  if (judgement.platforms.length === 0) return "⏭️ skip";
  const icons = judgement.platforms.map((p) => PLATFORM_ICONS[p]).join("");
  return `${icons} ${judgement.verdict}`;
}

interface CliOptions {
  keywords: string[];
  ig: boolean;
  yt: boolean;
  budget: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { keywords: [], ig: false, yt: false, budget: false };
  for (const arg of argv) {
    if (arg === "--") continue; // pnpm이 스크립트 인자 구분자를 그대로 넘긴다
    if (arg === "--ig") options.ig = true;
    else if (arg === "--yt") options.yt = true;
    else if (arg === "--budget") options.budget = true;
    else if (arg.startsWith("--")) {
      console.error(`알 수 없는 옵션: ${arg}`);
      process.exit(1);
    } else options.keywords.push(arg);
  }
  return options;
}

function printBudget(): void {
  const ig = budgetUsage();
  const yt = quotaUsage();
  console.log("\n📊 API 예산 현황");
  console.log(
    `  인스타그램: 7일 윈도우 고유 해시태그 ${ig.used.length}/${ig.limit}개 사용` +
      (ig.nextFreeAt ? ` (다음 슬롯 확보: ${new Date(ig.nextFreeAt).toLocaleString("ko-KR")})` : ""),
  );
  if (ig.used.length > 0) console.log(`    사용된 해시태그: ${ig.used.map((t) => `#${t}`).join(" ")}`);
  console.log(`  유튜브: 오늘 쿼터 사용량(추정) ${yt.usedToday}/${yt.limit} 유닛`);
}

function fmt(n: number, digits = 0): string {
  if (!Number.isFinite(n)) return "∞";
  return n.toLocaleString("ko-KR", { maximumFractionDigits: digits });
}

async function main(): Promise<void> {
  loadDotenv();
  const options = parseArgs(process.argv.slice(2));

  if (options.budget && options.keywords.length === 0) {
    printBudget();
    return;
  }
  if (options.keywords.length === 0) {
    console.log('사용법: pnpm analyze [--ig] [--yt] [--budget] "키워드1" "키워드2" ...');
    process.exit(1);
  }

  const { rows, warnings } = await analyzeKeywords(options.keywords, {
    ig: options.ig,
    yt: options.yt,
    onProgress: (m) => console.log(`🔍 ${m}`),
  });
  for (const w of warnings) console.warn(`  ⚠️ ${w}`);

  console.log(
    "\n" +
      renderTable(
        [
          { header: "키워드" },
          { header: "모바일", align: "right" },
          { header: "총검색", align: "right" },
          { header: "발행량", align: "right" },
          { header: "경쟁강도", align: "right" },
          { header: "기회점수", align: "right" },
          { header: "IG 글/h", align: "right" },
          { header: "IG 좋아요", align: "right" },
          { header: "YT 영상수", align: "right" },
          { header: "YT 중앙조회", align: "right" },
          { header: "YT 속도", align: "right" },
          { header: "판정" },
        ],
        rows.map((r) => [
          r.keyword,
          fmt(r.naver.mobileVolume),
          fmt(r.naver.totalVolume),
          fmt(r.naver.blogTotal),
          fmt(r.naver.ratio, 2),
          fmt(r.naver.opportunityScore, 1),
          r.instagram ? fmt(r.instagram.postsPerHour, 1) : "-",
          r.instagram ? fmt(r.instagram.topMedianLikes) : "-",
          r.youtube ? fmt(r.youtube.videoCount) : "-",
          r.youtube ? fmt(r.youtube.medianViews) : "-",
          r.youtube ? fmt(r.youtube.velocity, 1) : "-",
          verdictLabel(r.judgement),
        ]),
      ),
  );

  console.log("\n판정 근거:");
  for (const r of rows) {
    console.log(`  [${r.keyword}]`);
    for (const reason of r.judgement.reasons) console.log(`    - ${reason}`);
  }

  const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12);
  const csvPath = join(repoRoot(), "out", `keywords-${stamp}.csv`);
  writeCsv(
    csvPath,
    [
      "keyword",
      "mobileVolume",
      "totalVolume",
      "blogTotal",
      "ratio",
      "opportunityScore",
      "igPostsPerHour",
      "igTopMedianLikes",
      "ytVideoCount",
      "ytMedianViews",
      "ytVelocity",
      "verdict",
      "reasons",
    ],
    rows.map((r) => [
      r.keyword,
      r.naver.mobileVolume,
      r.naver.totalVolume,
      r.naver.blogTotal,
      Number.isFinite(r.naver.ratio) ? r.naver.ratio.toFixed(4) : "Infinity",
      r.naver.opportunityScore.toFixed(2),
      r.instagram ? r.instagram.postsPerHour.toFixed(2) : "",
      r.instagram ? r.instagram.topMedianLikes : "",
      r.youtube ? r.youtube.videoCount : "",
      r.youtube ? Math.round(r.youtube.medianViews) : "",
      r.youtube ? r.youtube.velocity.toFixed(1) : "",
      r.judgement.verdict,
      r.judgement.reasons.join(" | "),
    ]),
  );
  console.log(`\n💾 CSV 저장: ${csvPath}`);

  if (options.budget) printBudget();
}

main().catch((e) => {
  if (e instanceof MissingEnvError) {
    console.error(`\n❌ ${e.message}`);
  } else {
    console.error("\n❌ 실행 실패:", e instanceof Error ? e.message : e);
  }
  process.exit(1);
});
