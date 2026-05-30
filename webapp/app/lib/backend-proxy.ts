import { NextResponse } from "next/server";

const backendUrl = (
  process.env.EXERPT_API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  (process.env.NODE_ENV === "development" ? "http://localhost:8000" : "")
).replace(/\/$/, "");

const hopByHopHeaders = new Set([
  "connection",
  "content-encoding",
  "content-length",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade"
]);

export async function proxyBackendRequest(request: Request, path: string) {
  if (!backendUrl) {
    return NextResponse.json(
      {
        detail:
          "Backend URL is not configured. Set EXERPT_API_URL for the Next.js server or NEXT_PUBLIC_API_URL for direct browser calls."
      },
      { status: 503 }
    );
  }

  const target = new URL(path, `${backendUrl}/`);
  target.search = new URL(request.url).search;

  try {
    const response = await fetch(target, {
      method: request.method,
      headers: requestHeaders(request),
      body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer(),
      cache: "no-store"
    });

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders(response)
    });
  } catch {
    return NextResponse.json(
      { detail: `Unable to reach Exerpt API at ${backendUrl}.` },
      { status: 503 }
    );
  }
}

function requestHeaders(request: Request) {
  const headers = new Headers(request.headers);
  for (const header of hopByHopHeaders) {
    headers.delete(header);
  }
  return headers;
}

function responseHeaders(response: Response) {
  const headers = new Headers(response.headers);
  for (const header of hopByHopHeaders) {
    headers.delete(header);
  }
  headers.set("Cache-Control", "no-store");
  return headers;
}
