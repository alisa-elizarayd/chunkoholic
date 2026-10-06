const SUPABASE_ORIGIN = "https://anpjsztzavzawqizchul.supabase.co";
const ALLOWED_ORIGIN = "https://alisa-elizarayd.github.io";

const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Credentials": "true",
  "Access-Control-Allow-Headers": "apikey, authorization, content-type, x-client-info, x-supabase-api-version, prefer",
  "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  "Access-Control-Expose-Headers": "content-range, x-supabase-api-version"
};

function withCors(response) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders)) headers.set(key, value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function isAllowedPath(pathname) {
  return (
    pathname.startsWith("/auth/v1/") ||
    pathname.startsWith("/rest/v1/")
  );
}

export default {
  async fetch(request) {
    const origin = request.headers.get("Origin");

    if (request.method === "OPTIONS") {
      if (origin && origin !== ALLOWED_ORIGIN) {
        return new Response("Forbidden", { status: 403 });
      }
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (origin && origin !== ALLOWED_ORIGIN) {
      return new Response("Forbidden", { status: 403 });
    }

    const incoming = new URL(request.url);

    if (!isAllowedPath(incoming.pathname)) {
      return new Response(
        JSON.stringify({ error: "Chunkoholic proxy: unsupported endpoint" }),
        {
          status: 404,
          headers: {
            "content-type": "application/json; charset=utf-8",
            ...corsHeaders
          }
        }
      );
    }

    const target = new URL(incoming.pathname + incoming.search, SUPABASE_ORIGIN);

    const headers = new Headers(request.headers);
    headers.delete("host");
    headers.delete("origin");
    headers.delete("content-length");

    const upstreamRequest = new Request(target, {
      method: request.method,
      headers,
      body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
      redirect: "follow"
    });

    try {
      const upstream = await fetch(upstreamRequest);
      return withCors(upstream);
    } catch (error) {
      return new Response(
        JSON.stringify({
          error: "upstream_unreachable",
          message: "Supabase upstream is temporarily unreachable."
        }),
        {
          status: 502,
          headers: {
            "content-type": "application/json; charset=utf-8",
            ...corsHeaders
          }
        }
      );
    }
  }
};
