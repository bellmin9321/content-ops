import { analyzeKeywords } from "@content-ops/core";
import { checkAuth, errorResponse } from "./_auth.js";

export async function GET(request: Request): Promise<Response> {
  const denied = checkAuth(request);
  if (denied) return denied;

  const url = new URL(request.url);
  const keywords = (url.searchParams.get("keywords") ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  if (keywords.length === 0) {
    return Response.json({ error: "키워드를 1개 이상 입력해주세요." }, { status: 400 });
  }

  try {
    const result = await analyzeKeywords(keywords, {
      ig: url.searchParams.get("ig") === "1",
      yt: url.searchParams.get("yt") === "1",
    });
    return Response.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
