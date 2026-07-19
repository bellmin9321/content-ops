import type { IncomingMessage, ServerResponse } from "node:http";
import { budgetUsage, quotaUsage } from "@content-ops/core";
import { checkAuth, sendError, sendJson } from "./_auth.js";

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!checkAuth(req, res)) return;
  try {
    sendJson(res, 200, { instagram: budgetUsage(), youtube: quotaUsage() });
  } catch (e) {
    sendError(res, e);
  }
}
