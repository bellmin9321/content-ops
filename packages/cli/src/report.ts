import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MissingEnvError,
  analyzeKeywords,
  formatDailyReport,
  getTrendSpikes,
  hasTelegramEnv,
  loadDotenv,
  repoRoot,
  sendTelegramMessage,
} from "@content-ops/core";

/** 급등 판정 기준: 최근 7일 평균이 직전 7일 평균의 1.5배 이상 */
const SPIKE_THRESHOLD = 1.5;
/** 리포트에 담을 최대 키워드 수 (API 예산 보호) */
const REPORT_TOP_N = 10;

function loadKeywordPool(): string[] {
  const path = join(repoRoot(), "keywords.txt");
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    throw new Error(
      `키워드 풀 파일이 없습니다: ${path}\n한 줄에 키워드 하나씩 적어주세요 (#으로 주석 가능).`,
    );
  }
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
}

async function main(): Promise<void> {
  loadDotenv();
  const args = process.argv.slice(2);
  const dry = args.includes("--dry");
  const ig = args.includes("--ig");
  const yt = args.includes("--yt");

  const pool = loadKeywordPool();
  console.log(`🔍 키워드 풀 ${pool.length}개 급등 감지 중... (데이터랩 최근 7일 vs 직전 7일)`);
  const spikes = await getTrendSpikes(pool);
  const spiking = spikes
    .filter((s) => s.spikeRatio >= SPIKE_THRESHOLD)
    .sort((a, b) => b.spikeRatio - a.spikeRatio)
    .slice(0, REPORT_TOP_N);
  console.log(`🔥 급등 키워드: ${spiking.length}개`);

  let rows: Awaited<ReturnType<typeof analyzeKeywords>>["rows"] = [];
  let warnings: string[] = [];
  if (spiking.length > 0) {
    const result = await analyzeKeywords(
      spiking.map((s) => s.keyword),
      { ig, yt, onProgress: (m) => console.log(`   ${m}`) },
    );
    rows = result.rows;
    warnings = result.warnings;
  }

  const dateLabel = new Date().toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    weekday: "short",
  });
  const report = formatDailyReport(dateLabel, pool.length, spiking, SPIKE_THRESHOLD, rows, warnings);

  console.log("\n" + report);
  if (!dry && hasTelegramEnv()) {
    await sendTelegramMessage(report);
    console.log("\n✉️ 텔레그램 전송 완료");
  } else if (!dry) {
    console.log("\n(TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID가 없어 콘솔 출력만 했습니다)");
  }
}

main().catch((e) => {
  console.error(`\n❌ ${e instanceof MissingEnvError ? e.message : e instanceof Error ? e.message : e}`);
  process.exit(1);
});
