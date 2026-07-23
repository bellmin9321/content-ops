import { requireEnv } from "./env.js";

/** 텔레그램 메시지 길이 제한 */
const MAX_MESSAGE_LENGTH = 4096;

export function hasTelegramEnv(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

function requireTelegramEnv() {
  return requireEnv(
    "telegram",
    ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"],
    "@BotFather로 봇 생성 → 토큰 발급, @userinfobot으로 내 chat_id 확인",
  );
}

/** 봇 토큰으로 chat_id에 텍스트 전송. 4096자 초과 시 분할 전송 */
export async function sendTelegramMessage(
  text: string,
  chatId?: string,
): Promise<void> {
  const env = requireTelegramEnv();
  const target = chatId ?? (env.TELEGRAM_CHAT_ID as string);
  const token = env.TELEGRAM_BOT_TOKEN as string;

  for (let i = 0; i < text.length; i += MAX_MESSAGE_LENGTH) {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: target,
        text: text.slice(i, i + MAX_MESSAGE_LENGTH),
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      throw new Error(`텔레그램 API ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
  }
}
