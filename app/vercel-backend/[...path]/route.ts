import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "edge";

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

function configurationError(message: string) {
  return Response.json(
    {
      error: "vercel_backend_unavailable",
      message,
    },
    { status: 503 },
  );
}

async function proxyToDueviaBackend(
  request: NextRequest,
  context: RouteContext,
) {
  const backendValue = process.env.DUEVIA_BACKEND_URL;
  const bearerToken = process.env.DUEVIA_BACKEND_BEARER_TOKEN;
  if (!backendValue || !bearerToken) {
    return configurationError("The Duevia backend bridge is not configured.");
  }

  let backendOrigin: URL;
  try {
    backendOrigin = new URL(backendValue);
  } catch {
    return configurationError("The Duevia backend URL is invalid.");
  }
  if (backendOrigin.protocol !== "https:") {
    return configurationError("The Duevia backend must use HTTPS.");
  }

  const { path } = await context.params;
  const encodedPath = path.map(encodeURIComponent).join("/");
  const destination = new URL(`/api/${encodedPath}`, backendOrigin);
  destination.search = request.nextUrl.search;

  const headers = new Headers(request.headers);
  for (const name of [
    "authorization",
    "connection",
    "content-length",
    "host",
    "oai-sites-authorization",
    "transfer-encoding",
  ]) {
    headers.delete(name);
  }
  headers.set("OAI-Sites-Authorization", `Bearer ${bearerToken}`);
  headers.set(
    "x-forwarded-host",
    request.headers.get("x-forwarded-host") ??
      request.headers.get("host") ??
      request.nextUrl.host,
  );
  headers.set("x-forwarded-proto", "https");

  const hasBody = !["GET", "HEAD"].includes(request.method);
  const upstream = await fetch(destination, {
    method: request.method,
    headers,
    body: hasBody ? await request.arrayBuffer() : undefined,
    redirect: "manual",
    cache: "no-store",
  });

  const responseHeaders = new Headers(upstream.headers);
  for (const name of [
    "content-encoding",
    "content-length",
    "transfer-encoding",
  ]) {
    responseHeaders.delete(name);
  }

  const contentType = upstream.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const upstreamText = await upstream.text();
    const visibleHost =
      request.headers.get("x-forwarded-host") ??
      request.headers.get("host") ??
      request.nextUrl.host;
    const visibleOrigin = `https://${visibleHost}`;
    return new Response(
      upstreamText.replaceAll(backendOrigin.origin, visibleOrigin),
      {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: responseHeaders,
      },
    );
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

export const GET = proxyToDueviaBackend;
export const POST = proxyToDueviaBackend;
export const PUT = proxyToDueviaBackend;
export const PATCH = proxyToDueviaBackend;
export const DELETE = proxyToDueviaBackend;
export const OPTIONS = proxyToDueviaBackend;
export const HEAD = proxyToDueviaBackend;
