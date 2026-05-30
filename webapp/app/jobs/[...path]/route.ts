import { proxyBackendRequest } from "../../lib/backend-proxy";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    path?: string[];
  }>;
};

export async function GET(request: Request, context: RouteContext) {
  const { path = [] } = await context.params;
  return proxyBackendRequest(request, `/jobs/${path.map(encodeURIComponent).join("/")}`);
}
