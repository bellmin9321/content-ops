import type { IncomingMessage, ServerResponse } from "node:http";
import { analyzeKeywords } from "@content-ops/core";
import { checkAuth, requestUrl, sendError, sendJson } from "./_auth.js";

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!checkAuth(req, res)) return;

  const url = requestUrl(req);
  const keywords = (url.searchParams.get("keywords") ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  if (keywords.length === 0) {
    sendJson(res, 400, { error: "키워드를 1개 이상 입력해주세요." });
    return;
  }

  try {
    const result = await analyzeKeywords(keywords, {
      ig: url.searchParams.get("ig") === "1",
      yt: url.searchParams.get("yt") === "1",
    });
    sendJson(res, 200, result);
  } catch (e) {
    sendError(res, e);
  }
}
