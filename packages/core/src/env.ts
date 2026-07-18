import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/** cwd에서 위로 올라가며 파일을 찾는다 (모노레포 어느 위치에서 실행해도 동작) */
export function findUp(fileName: string, from = process.cwd()): string | null {
  let dir = resolve(from);
  for (;;) {
    const candidate = join(dir, fileName);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** 레포 루트 (pnpm-workspace.yaml 기준). 못 찾으면 cwd */
export function repoRoot(): string {
  const ws = findUp("pnpm-workspace.yaml");
  return ws ? dirname(ws) : process.cwd();
}

/** 의존성 없는 .env 로더. 이미 설정된 환경변수는 덮어쓰지 않는다 */
export function loadDotenv(): void {
  const envPath = findUp(".env");
  if (!envPath) return;
  const text = readFileSync(envPath, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

export class MissingEnvError extends Error {
  constructor(
    public readonly provider: string,
    public readonly missing: string[],
    public readonly hint: string,
  ) {
    super(
      `[${provider}] 환경변수가 없습니다: ${missing.join(", ")}\n` +
        `  발급 방법: ${hint}\n` +
        `  .env.example을 .env로 복사한 뒤 값을 채워주세요.`,
    );
    this.name = "MissingEnvError";
  }
}

/** 필요한 env를 모두 검증하고 반환. 하나라도 없으면 MissingEnvError */
export function requireEnv(
  provider: string,
  keys: string[],
  hint: string,
): Record<string, string> {
  const missing = keys.filter((k) => !process.env[k]);
  if (missing.length > 0) throw new MissingEnvError(provider, missing, hint);
  return Object.fromEntries(keys.map((k) => [k, process.env[k] as string]));
}
