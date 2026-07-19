import { createServer, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MissingEnvError,
  analyzeKeywords,
  budgetUsage,
  loadDotenv,
  quotaUsage,
} from "@content-ops/core";

loadDotenv();

const PORT = Number(process.env.PORT ?? 3000);
const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

  try {
    if (url.pathname === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(readFileSync(join(PUBLIC_DIR, "index.html")));
      return;
    }

    if (url.pathname === "/api/budget") {
      sendJson(res, 200, { instagram: budgetUsage(), youtube: quotaUsage() });
      return;
    }

    if (url.pathname === "/api/analyze") {
      const keywords = (url.searchParams.get("keywords") ?? "")
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean);
      if (keywords.length === 0) {
        sendJson(res, 400, { error: "키워드를 1개 이상 입력해주세요." });
        return;
      }
      const result = await analyzeKeywords(keywords, {
        ig: url.searchParams.get("ig") === "1",
        yt: url.searchParams.get("yt") === "1",
        onProgress: (m) => console.log(`[analyze] ${m}`),
      });
      sendJson(res, 200, result);
      return;
    }

    sendJson(res, 404, { error: "not found" });
  } catch (e) {
    if (e instanceof MissingEnvError) {
      sendJson(res, 400, { error: e.message, missing: e.missing, provider: e.provider });
      return;
    }
    console.error(e);
    sendJson(res, 500, { error: e instanceof Error ? e.message : String(e) });
  }
});

server.listen(PORT, () => {
  console.log(`content-ops 대시보드: http://localhost:${PORT}`);
});
