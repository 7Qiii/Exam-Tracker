export default async function handler(request, response) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    response.status(500).json({ error: "Supabase environment variables are missing" });
    return;
  }

  if (request.method === "OPTIONS") {
    response.status(204).end();
    return;
  }

  const targetPath = getTargetPath(request.url);
  const targetUrl = `${supabaseUrl.replace(/\/$/, "")}${targetPath}`;
  const headers = buildForwardHeaders(request.headers, supabaseAnonKey);

  const upstream = await fetch(targetUrl, {
    method: request.method,
    headers,
    body: shouldForwardBody(request.method) ? normalizeBody(request.body) : undefined
  });

  response.status(upstream.status);
  copyResponseHeaders(upstream.headers, response);
  response.send(Buffer.from(await upstream.arrayBuffer()));
}

function getTargetPath(url = "") {
  const parsed = new URL(url, "http://localhost");
  return `${parsed.pathname.replace(/^\/api\/supabase-proxy/, "") || "/"}${parsed.search}`;
}

function buildForwardHeaders(sourceHeaders, anonKey) {
  const headers = new Headers();
  Object.entries(sourceHeaders || {}).forEach(([key, value]) => {
    const lower = key.toLowerCase();
    if (["host", "connection", "content-length", "x-forwarded-host", "x-forwarded-proto"].includes(lower)) return;
    if (Array.isArray(value)) {
      headers.set(key, value.join(", "));
      return;
    }
    if (value != null) headers.set(key, String(value));
  });
  if (!headers.has("apikey")) headers.set("apikey", anonKey);
  return headers;
}

function normalizeBody(body) {
  if (body == null) return undefined;
  if (typeof body === "string" || Buffer.isBuffer(body)) return body;
  return JSON.stringify(body);
}

function shouldForwardBody(method) {
  return !["GET", "HEAD"].includes(String(method || "").toUpperCase());
}

function copyResponseHeaders(headers, response) {
  headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (["content-encoding", "content-length", "transfer-encoding", "connection"].includes(lower)) return;
    response.setHeader(key, value);
  });
}
