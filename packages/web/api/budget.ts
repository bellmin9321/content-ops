import { budgetUsage, quotaUsage } from "@content-ops/core";
import { checkAuth, errorResponse } from "./_auth";

export async function GET(request: Request): Promise<Response> {
  const denied = checkAuth(request);
  if (denied) return denied;
  try {
    return Response.json({ instagram: budgetUsage(), youtube: quotaUsage() });
  } catch (e) {
    return errorResponse(e);
  }
}
