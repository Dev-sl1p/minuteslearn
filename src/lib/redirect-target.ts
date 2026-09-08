export function safeReturnPath(input: unknown, fallback = "/library") {
  if (typeof input !== "string" || !input.startsWith("/") || input.startsWith("//") || /[\\\u0000-\u001f]/.test(input)) return fallback;
  try {
    const base = "https://local.invalid";
    const target = new URL(input, base);
    if (target.origin !== base || /^\/(?:api|login)(?:\/|$)/.test(target.pathname) || target.pathname === "/admin/login") return fallback;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch { return fallback; }
}
