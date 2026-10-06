const SUPABASE_ORIGIN = "https://anpjsztzavzawqizchul.supabase.co";
const ALLOWED_ORIGIN = "https://alisa-elizarayd.github.io";
const UPSTREAM_TIMEOUT_MS = 8000;

function setCors(res, origin) {
  if (!origin || origin === ALLOWED_ORIGIN) {
    res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  }
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Headers", "apikey, authorization, content-type, x-client-info, x-supabase-api-version, prefer");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD");
  res.setHeader("Access-Control-Expose-Headers", "content-range, x-supabase-api-version");
  res.setHeader("Cache-Control", "no-store");
}

module.exports = async function handler(req, res) {
  const origin = req.headers.origin;

  if (origin && origin !== ALLOWED_ORIGIN) {
    return res.status(403).json({ error: "forbidden_origin" });
  }

  setCors(res, origin);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  const route = Array.isArray(req.query.path)
    ? req.query.path.join("/")
    : String(req.query.path || "");

  if (route === "health") {
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

    try {
      const upstream = await fetch(SUPABASE_ORIGIN + "/auth/v1/health", {
        method: "GET",
        headers: { "user-agent": "Chunkoholic-Supabase-Proxy/1.1" },
        signal: controller.signal
      });

      return res.status(200).json({
        proxy: "ok",
        upstreamStatus: upstream.status,
        upstreamReachable: true,
        elapsedMs: Date.now() - started
      });
    } catch (error) {
      return res.status(200).json({
        proxy: "ok",
        upstreamStatus: null,
        upstreamReachable: false,
        elapsedMs: Date.now() - started,
        error: error?.name === "AbortError" ? "upstream_timeout" : "upstream_unreachable"
      });
    } finally {
      clearTimeout(timer);
    }
  }

  if (!route.startsWith("auth/v1/") && !route.startsWith("rest/v1/")) {
    return res.status(404).json({ error: "unsupported_endpoint" });
  }

  const query = req.url.includes("?") ? "?" + req.url.split("?")[1] : "";
  const target = new URL("/" + route + query, SUPABASE_ORIGIN);

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    const lower = key.toLowerCase();
    if (!["host", "content-length", "origin"].includes(lower) && value != null) {
      headers.set(key, Array.isArray(value) ? value.join(",") : value);
    }
  }

  let body;
  if (!["GET", "HEAD"].includes(req.method)) {
    if (req.body == null) {
      body = undefined;
    } else if (typeof req.body === "object" && !Buffer.isBuffer(req.body) && !(req.body instanceof Uint8Array)) {
      body = JSON.stringify(req.body);
      headers.set("content-type", "application/json");
    } else {
      body = req.body;
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body,
      redirect: "follow",
      signal: controller.signal
    });

    const contentType = upstream.headers.get("content-type");
    const contentRange = upstream.headers.get("content-range");
    const xApiVersion = upstream.headers.get("x-supabase-api-version");

    if (contentType) res.setHeader("content-type", contentType);
    if (contentRange) res.setHeader("content-range", contentRange);
    if (xApiVersion) res.setHeader("x-supabase-api-version", xApiVersion);

    const buffer = Buffer.from(await upstream.arrayBuffer());
    return res.status(upstream.status).send(buffer);
  } catch (error) {
    const timedOut = error?.name === "AbortError";
    console.error("Supabase upstream proxy error:", error);
    return res.status(502).json({
      error: timedOut ? "upstream_timeout" : "upstream_unreachable",
      message: timedOut
        ? "Supabase upstream timed out."
        : "Supabase upstream is temporarily unreachable."
    });
  } finally {
    clearTimeout(timer);
  }
};
