/** 한글(전각) 폭을 고려한 콘솔 표 렌더러 */

function charWidth(codePoint: number): number {
  // 한글·CJK·전각 기호·이모지는 터미널에서 2칸
  if (
    (codePoint >= 0x1100 && codePoint <= 0x115f) ||
    (codePoint >= 0x2e80 && codePoint <= 0xa4cf) ||
    (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0xfe30 && codePoint <= 0xfe4f) ||
    (codePoint >= 0xff00 && codePoint <= 0xff60) ||
    (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
    codePoint >= 0x1f300
  ) {
    return 2;
  }
  return 1;
}

export function displayWidth(text: string): number {
  let width = 0;
  for (const ch of text) width += charWidth(ch.codePointAt(0) ?? 0);
  return width;
}

function pad(text: string, width: number, align: "left" | "right"): string {
  const gap = Math.max(0, width - displayWidth(text));
  return align === "left" ? text + " ".repeat(gap) : " ".repeat(gap) + text;
}

export interface Column {
  header: string;
  align?: "left" | "right";
}

export function renderTable(columns: Column[], rows: string[][]): string {
  const widths = columns.map((c, i) =>
    Math.max(displayWidth(c.header), ...rows.map((r) => displayWidth(r[i] ?? ""))),
  );
  const line = (cells: string[]) =>
    "| " +
    cells
      .map((cell, i) => pad(cell, widths[i] ?? 0, columns[i]?.align ?? "left"))
      .join(" | ") +
    " |";
  const divider = "|" + widths.map((w) => "-".repeat(w + 2)).join("|") + "|";
  return [line(columns.map((c) => c.header)), divider, ...rows.map(line)].join("\n");
}
