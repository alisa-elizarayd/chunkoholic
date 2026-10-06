const SUPABASE_ORIGIN = "https://anpjsztzavzawqizchul.supabase.co";
const ALLOWED_ORIGIN = "https://alisa-elizarayd.github.io";

module.exports = async function handler(req, res) {
  const origin = req.headers.origin;

  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Headers", "apikey, authorization, content-type, x-client-info, x-supabase-api-version, prefer");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Expose-Headers", "content-range, x-supabase-api-version");

  if (req.method === "OPTIONS") {
    if (origin && origin !== ALLOWED_ORIGIN) return res.status(403).send("Forbidden");
    return res.status(204).end();
  }

  if (origin && origin !== ALLOWED_ORIGIN) return res.status(403).send("Forbidden");

  const route = Array.isArray(req.query.path)
    ? req.query.path.join("/")
    : String(req.query.path || "");

  if (!route.startsWith("auth/v1/") && !route.startsWith("rest/v1/")) {
    return res.status(404).json({ error: "Chunkoholic proxy: unsupported endpoint" });
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

  try {
    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body,
      redirect: "follow"
    });

    const contentType = upstream.headers.get("content-type");
    const contentRange = upstream.headers.get("content-range");
    if (contentType) res.setHeader("content-type", contentType);
    if (contentRange) res.setHeader("content-range", contentRange);

    const buffer = Buffer.from(await upstream.arrayBuffer());
    return res.status(upstream.status).send(buffer);
  } catch (error) {
    console.error("Supabase upstream proxy error:", error);
    return res.status(502).json({
      error: "upstream_unreachable",
      message: "Supabase upstream is temporarily unreachable."
    });
  }
};
