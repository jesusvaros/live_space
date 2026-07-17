export const jsonResponse = (body: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });

const defaultOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "capacitor://localhost",
  "http://localhost",
];

export const corsHeaders = (request: Request): HeadersInit => {
  const configured = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const origins = configured.length > 0 ? configured : defaultOrigins;
  const origin = request.headers.get("origin");
  const allowedOrigin = origin && origins.includes(origin) ? origin : origins[0];

  return {
    "access-control-allow-origin": allowedOrigin,
    "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
    "access-control-allow-methods": "POST, OPTIONS",
    vary: "Origin",
  };
};

export const requireJsonPost = (request: Request): Response | null => {
  if (request.method === "POST") return null;
  return jsonResponse({ error: "Method not allowed" }, 405, { allow: "POST, OPTIONS" });
};
