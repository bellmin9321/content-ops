import type { IncomingMessage, ServerResponse } from "node:http";

/** 파일명이 _로 시작하므로 Vercel 라우트로 노출되지 않는 공용 유틸 */

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

export function requestUrl(req: IncomingMessage): URL {
  return new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
}

/**
 * 공개 배포 보호: DASHBOARD_TOKEN 환경변수가 설정돼 있으면
 * x-dashboard-token 헤더(또는 ?token=)가 일치해야 API를 호출할 수 있다.
 * 미설정이면 검사 없이 통과. 거부 시 401을 보내고 false를 반환한다.
 */
export function checkAuth(req: IncomingMessage, res: ServerResponse): boolean {
  const required = process.env.DASHBOARD_TOKEN;
  if (!required) return true;
  const given =
    (req.headers["x-dashboard-token"] as string | undefined) ??
    requestUrl(req).searchParams.get("token");
  if (given === required) return true;
  sendJson(res, 401, { error: "인증 토큰이 필요합니다.", needToken: true });
  return false;
}

export function sendError(res: ServerResponse, e: unknown): void {
  const message = e instanceof Error ? e.message : String(e);
  // MissingEnvError 등 사용자에게 그대로 보여줄 에러는 400으로
  const status = e instanceof Error && e.name === "MissingEnvError" ? 400 : 500;
  sendJson(res, status, { error: message });
}
