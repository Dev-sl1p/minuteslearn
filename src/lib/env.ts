/** True on Vercel production deployments */
export function isProductionRuntime() {
  return (
    process.env.VERCEL_ENV === "production" ||
    (process.env.NODE_ENV === "production" &&
      process.env.VERCEL_ENV !== "preview" &&
      process.env.VERCEL_ENV !== "development")
  );
}

function hasWpLicenseCredentials() {
  return Boolean(
    process.env.WP_BASE_URL &&
      process.env.WP_LM_CONSUMER_KEY &&
      process.env.WP_LM_CONSUMER_SECRET,
  );
}

export function licenseMode(): "mock" | "live" {
  const raw = (process.env.WP_LICENSE_MODE ?? "mock").toLowerCase();
  const allowMock = process.env.ALLOW_MOCK_LICENSES === "true";
  const onVercel =
    process.env.VERCEL_ENV === "production" ||
    process.env.VERCEL_ENV === "preview" ||
    Boolean(process.env.VERCEL);

  // Preview shares the same shop keys as production — never mock there.
  if (
    !allowMock &&
    (isProductionRuntime() || (onVercel && hasWpLicenseCredentials()))
  ) {
    return "live";
  }
  return raw === "live" ? "live" : "mock";
}
