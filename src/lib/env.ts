/** True on Vercel production deployments */
export function isProductionRuntime() {
  return (
    process.env.VERCEL_ENV === "production" ||
    (process.env.NODE_ENV === "production" &&
      process.env.VERCEL_ENV !== "preview" &&
      process.env.VERCEL_ENV !== "development")
  );
}

export function licenseMode(): "mock" | "live" {
  const raw = (process.env.WP_LICENSE_MODE ?? "mock").toLowerCase();
  // Never run mock license keys on production unless explicitly allowed
  if (
    isProductionRuntime() &&
    raw === "mock" &&
    process.env.ALLOW_MOCK_LICENSES !== "true"
  ) {
    return "live";
  }
  return raw === "live" ? "live" : "mock";
}
