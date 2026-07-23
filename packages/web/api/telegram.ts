import type { IncomingMessage, ServerResponse } from "node:http";
import {
  MissingEnvError,
  analyzeKeywords,
  formatAnalysisMessage,
  sendTelegramMessage,
} from "@content-ops/core";
import { sendJson } from "./_auth.js";

/** 채팅 한 번에 분석할 최대 키워드 수 (함수 실행시간·쿼터 보호) */
const MAX_KEYWORDS_PER_CHAT = 5;

const HELP = [
  "키워드를 보내면 분석해드립니다.",
  "",
  "사용법:",
  "  선풍기",
  "  캠핑의자, 차박 매트",
  "  제주 애월 카페 --yt   (유튜브 포함)",
  "  선풍기 --ig --yt      (인스타·유튜브 포함)",
  `한 번에 최대 ${MAX_KEYWORDS_PER_CHAT}개까지.`,
].join("\n");

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

interface TelegramUpdate {
  message?: {
    text?: string;
    chat?: { id?: number | string };
  };
}

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  // 텔레그램 웹훅 검증: setWebhook 시 등록한 secret_token 헤더 확인
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret && req.headers["x-telegram-bot-api-secret-token"] !== secret) {
    sendJson(res, 401, { error: "unauthorized" });
    return;
  }

  let update: TelegramUpdate;
  try {
    update = JSON.parse(await readBody(req)) as TelegramUpdate;
  } catch {
    sendJson(res, 400, { error: "invalid body" });
    return;
  }

  const chatId = update.message?.chat?.id;
  const text = update.message?.text?.trim();
  // 내 채팅만 응답 (다른 사람이 봇을 찾아도 무시)
  const allowed = process.env.TELEGRAM_CHAT_ID;
  if (!chatId || !text || (allowed && String(chatId) !== allowed)) {
    sendJson(res, 200, { ok: true });
    return;
  }

  try {
    if (text === "/start" || text === "/help" || text === "help") {
      await sendTelegramMessage(HELP, String(chatId));
      sendJson(res, 200, { ok: true });
      return;
    }

    const ig = /(^|\s)--ig(\s|$)/.test(text);
    const yt = /(^|\s)--yt(\s|$)/.test(text);
    const keywords = text
      .replace(/(^|\s)--(ig|yt)(?=\s|$)/g, " ")
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean)
      .slice(0, MAX_KEYWORDS_PER_CHAT);

    if (keywords.length === 0) {
      await sendTelegramMessage(HELP, String(chatId));
    } else {
      const { rows, warnings } = await analyzeKeywords(keywords, { ig, yt });
      await sendTelegramMessage(formatAnalysisMessage(rows, warnings), String(chatId));
    }
    sendJson(res, 200, { ok: true });
  } catch (e) {
    // 에러도 채팅으로 알려주고 200을 반환해 텔레그램 재전송(중복 분석)을 막는다
    const message =
      e instanceof MissingEnvError ? e.message : e instanceof Error ? e.message : String(e);
    try {
      await sendTelegramMessage(`❌ ${message}`, String(chatId));
    } catch {
      /* 전송 실패는 무시 */
    }
    sendJson(res, 200, { ok: true });
  }
}
