import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

function escapeCell(value: string | number): string {
  const text = String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

/** 엑셀에서 한글이 깨지지 않도록 BOM(U+FEFF)을 붙여 저장 */
export function writeCsv(
  filePath: string,
  header: string[],
  rows: (string | number)[][],
): void {
  const body = [header, ...rows].map((row) => row.map(escapeCell).join(",")).join("\n");
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, "\uFEFF" + body, "utf8");
}
