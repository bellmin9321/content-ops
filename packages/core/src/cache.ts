import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { repoRoot } from "./env";

/**
 * 캐시 디렉토리: <repo root>/.cache (CONTENT_OPS_CACHE_DIR로 재정의 가능).
 * Vercel 등 서버리스에서는 쓰기 가능한 /tmp를 사용한다 — 인스턴스가 내려가면
 * 사라지는 best-effort 캐시이므로 인스타 예산·유튜브 쿼터 추적은 근사치가 된다.
 */
export function cacheDir(): string {
  if (process.env.CONTENT_OPS_CACHE_DIR) return process.env.CONTENT_OPS_CACHE_DIR;
  if (process.env.VERCEL) return "/tmp/content-ops-cache";
  return join(repoRoot(), ".cache");
}

export function loadCache<T>(fileName: string, fallback: T): T {
  const path = join(cacheDir(), fileName);
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return fallback;
  }
}

export function saveCache<T>(fileName: string, data: T): void {
  const path = join(cacheDir(), fileName);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2), "utf8");
}

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;

export function isFresh(fetchedAt: number, ttlMs: number, now = Date.now()): boolean {
  return now - fetchedAt < ttlMs;
}
