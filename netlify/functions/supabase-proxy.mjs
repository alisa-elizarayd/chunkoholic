const SUPABASE_ORIGIN = "https://anpjsztzavzawqizchul.supabase.co";
const ALLOWED_ORIGIN = "https://alisa-elizarayd.github.io";
const UPSTREAM_TIMEOUT_MS = 8000;

function corsHeaders(origin) {
  const allowed = !origin || origin === ALLOWED_ORIGIN;
  return {
    "access-control-allow-origin": allowed ? ALLOWED_ORIGIN : "null",
    "access-control-allow-credentials": "true",
    "access-control-allow-headers": "apikey, authorization, content-type, x-client-info, x-supabase-api-version, prefer",
    "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD",
    "access-control-expose-headers": "content-range, x-supabase-api-version",
    "cache-control": "no-store"
  };
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...corsHeaders(origin)
    }
  });
}

export default async (req) => {
  const url = new URL(req.url);
  const origin = req.headers.get("origin");

  if (origin && origin !== ALLOWED_ORIGIN) {
    return json({ error: "forbidden_origin" }, 403, origin);
  }

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  const prefix = "/api/supabase";
  const route = url.pathname.startsWith(prefix)
    ? url.pathname.slice(prefix.length).replace(/^\/+/, "")
    : "";

  if (route === "health") {
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

    try {
      const upstream = await fetch(new URL("/auth/v1/health", SUPABASE_ORIGIN), {
        method: "GET",
        headers: { "user-agent": "Chunkoholic-Supabase-Proxy/1.0" },
        signal: controller.signal
      });

      return json({
        proxy: "ok",
        upstreamStatus: upstream.status,
        upstreamReachable: true,
        elapsedMs: Date.now() - started
      }, 200, origin);
    } catch (error) {
      return json({
        proxy: "ok",
        upstreamStatus: null,
        upstreamReachable: false,
        elapsedMs: Date.now() - started,
        error: error?.name === "AbortError" ? "upstream_timeout" : "upstream_unreachable"
      }, 200, origin);
    } finally {
      clearTimeout(timer);
    }
  }

  if (!route.startsWith("auth/v1/") && !route.startsWith("rest/v1/")) {
    return json({ error: "unsupported_endpoint" }, 404, origin);
  }

  const target = new URL("/" + route + url.search);

  const headers = new Headers();
  for (const [key, value] of req.headers.entries()) {
    const lower = key.toLowerCase();
    if (!["host", "content-length", "origin"].includes(lower)) {
      headers.set(key, value);
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const upstream = await fetch(target.toString().replace(
      /^https:\/\/[^/]+/,
      SUPABASE_ORIGIN
    ), {
      method: req.method,
      headers,
      body: ["GET", "HEAD"].includes(req.method) ? undefined : await req.arrayBuffer(),
      redirect: "follow",
      signal: controller.signal
    });

    const responseHeaders = {
      ...corsHeaders(origin)
    };

    const contentType = upstream.headers.get("content-type");
    const contentRange = upstream.headers.get("content-range");
    const xApiVersion = upstream.headers.get("x-supabase-api-version");

    if (contentType) responseHeaders["content-type"] = contentType;
    if (contentRange) responseHeaders["content-range"] = contentRange;
    if (xApiVersion) responseHeaders["x-supabase-api-version"] = xApiVersion;

    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders
    });
  } catch (error) {
    const timedOut = error?.name === "AbortError";
    return json({
      error: timedOut ? "upstream_timeout" : "upstream_unreachable",
      message: timedOut
        ? "Supabase upstream timed out."
        : "Supabase upstream is temporarily unreachable."
    }, 502, origin);
  } finally {
    clearTimeout(timer);
  }
};

export const config = {
  path: ["/api/supabase/*", "/api/supabase"]
};
