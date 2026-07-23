import type { KeywordReport } from "./analyze.js";
import type { TrendSpike } from "./datalab.js";

/** 텔레그램/콘솔 공용 텍스트 포맷터 (순수 함수) */

const ICONS: Record<string, string> = { blog: "📝", instagram: "📸", youtube: "🎬" };

function fmt(n: number, digits = 0): string {
  if (!Number.isFinite(n)) return "∞";
  return n.toLocaleString("ko-KR", { maximumFractionDigits: digits });
}

export function formatKeywordReport(r: KeywordReport, index?: number): string {
  const head = index !== undefined ? `${index + 1}. ` : "";
  const verdict =
    r.judgement.platforms.length > 0
      ? `${r.judgement.platforms.map((p) => ICONS[p] ?? "").join("")} ${r.judgement.verdict}`
      : "⏭ skip";
  const lines = [
    `${head}${r.keyword} — ${verdict}`,
    `   모바일 ${fmt(r.naver.mobileVolume)} · 발행량 ${fmt(r.naver.blogTotal)} · 경쟁강도 ${fmt(r.naver.ratio, 2)} · 기회점수 ${fmt(r.naver.opportunityScore, 1)}`,
  ];
  if (r.instagram) {
    lines.push(
      `   IG ${fmt(r.instagram.postsPerHour, 1)}개/h · top 좋아요 ${fmt(r.instagram.topMedianLikes)}`,
    );
  }
  if (r.youtube) {
    lines.push(
      `   YT 영상 ${fmt(r.youtube.videoCount)}개 · 중앙조회 ${fmt(r.youtube.medianViews)} · 속도 ${fmt(r.youtube.velocity, 1)}`,
    );
  }
  for (const reason of r.judgement.reasons) lines.push(`   · ${reason}`);
  return lines.join("\n");
}

/** 챗봇 응답용: 분석 결과 묶음 */
export function formatAnalysisMessage(rows: KeywordReport[], warnings: string[]): string {
  const parts = rows.map((r, i) => formatKeywordReport(r, rows.length > 1 ? i : undefined));
  if (warnings.length > 0) parts.push(warnings.map((w) => `⚠️ ${w}`).join("\n"));
  return parts.join("\n\n");
}

/** 일일 리포트용: 급등 감지 결과 + 분석 */
export function formatDailyReport(
  dateLabel: string,
  poolSize: number,
  spikes: TrendSpike[],
  threshold: number,
  rows: KeywordReport[],
  warnings: string[],
): string {
  const header = `📈 content-ops 일일 리포트 (${dateLabel})`;
  if (rows.length === 0) {
    return `${header}\n키워드 풀 ${poolSize}개 중 급등(${threshold}× 이상) 없음. 오늘은 조용하네요.`;
  }
  const spikeMap = new Map(spikes.map((s) => [s.keyword, s.spikeRatio]));
  const body = rows
    .map((r, i) => {
      const ratio = spikeMap.get(r.keyword);
      const spikeLabel =
        ratio !== undefined ? `🔥 급등 ${ratio >= 99 ? "신규" : `${ratio.toFixed(1)}×`}\n` : "";
      return spikeLabel + formatKeywordReport(r, i);
    })
    .join("\n\n");
  const warningText = warnings.length > 0 ? `\n\n${warnings.map((w) => `⚠️ ${w}`).join("\n")}` : "";
  return `${header}\n키워드 풀 ${poolSize}개 중 ${rows.length}개 급등 (기준 ${threshold}×)\n\n${body}${warningText}`;
}
