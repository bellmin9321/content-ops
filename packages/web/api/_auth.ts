/**
 * 공개 배포 보호: DASHBOARD_TOKEN 환경변수가 설정돼 있으면
 * x-dashboard-token 헤더(또는 ?token=)가 일치해야 API를 호출할 수 있다.
 * 미설정이면 검사 없이 통과 (로컬/개인 프리뷰용).
 * 파일명이 _로 시작하므로 Vercel 라우트로 노출되지 않는다.
 */
export function checkAuth(request: Request): Response | null {
  const required = process.env.DASHBOARD_TOKEN;
  if (!required) return null;
  const url = new URL(request.url);
  const given = request.headers.get("x-dashboard-token") ?? url.searchParams.get("token");
  if (given === required) return null;
  return Response.json({ error: "인증 토큰이 필요합니다.", needToken: true }, { status: 401 });
}

export function errorResponse(e: unknown): Response {
  const message = e instanceof Error ? e.message : String(e);
  // MissingEnvError 등 사용자에게 보여줄 에러는 400으로
  const status = e instanceof Error && e.name === "MissingEnvError" ? 400 : 500;
  return Response.json({ error: message }, { status });
}
