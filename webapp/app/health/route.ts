import { proxyBackendRequest } from "../lib/backend-proxy";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return proxyBackendRequest(request, "/health");
}
