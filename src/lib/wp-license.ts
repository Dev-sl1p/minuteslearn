/**
 * WordPress License Manager for WooCommerce (LMFWC) client.
 * Docs: https://www.licensemanager.at/docs/rest-api/
 *
 * Modes:
 * - mock: accept DEMO-* keys for local/dev without WP
 * - live: call WP REST API with consumer key/secret
 */

export type WpLicenseInfo = {
  key: string;
  status: "active" | "inactive" | "expired" | "disabled" | "unknown";
  productId?: string;
  productSku?: string;
  orderId?: string;
  /** Purchaser email from Woo order when available */
  customerEmail?: string | null;
  expiresAt?: string | null;
  timesActivated?: number;
  timesActivatedMax?: number | null;
};

export type WpActivateResult = {
  ok: boolean;
  message?: string;
  license?: WpLicenseInfo;
};

const MOCK_KEYS: Record<
  string,
  { productSku: string; productId: string; orderId: string }
> = {
  "DEMO-COURSE-001": {
    productSku: "game-tilt-course",
    productId: "1001",
    orderId: "9001",
  },
  "DEMO-COURSE-002": {
    productSku: "davinci-template",
    productId: "1002",
    orderId: "9002",
  },
};

function mode() {
  return (process.env.WP_LICENSE_MODE ?? "mock").toLowerCase();
}

function authHeader() {
  const key = process.env.WP_LM_CONSUMER_KEY ?? "";
  const secret = process.env.WP_LM_CONSUMER_SECRET ?? "";
  if (!key || !secret) return null;
  const token = Buffer.from(`${key}:${secret}`).toString("base64");
  return `Basic ${token}`;
}

function normalizeStatus(raw: unknown): WpLicenseInfo["status"] {
  const s = String(raw ?? "unknown").toLowerCase();
  if (s === "active" || s === "sold" || s === "delivered") return "active";
  if (s === "inactive") return "inactive";
  if (s === "expired") return "expired";
  if (s === "disabled") return "disabled";
  return "unknown";
}

export async function validateLicense(
  licenseKey: string,
): Promise<WpLicenseInfo | null> {
  const key = licenseKey.trim().toUpperCase();
  if (!key) return null;

  if (mode() === "mock") {
    const mock = MOCK_KEYS[key];
    if (!mock) return null;
    return {
      key,
      status: "active",
      productId: mock.productId,
      productSku: mock.productSku,
      orderId: mock.orderId,
      expiresAt: null,
      timesActivated: 0,
      timesActivatedMax: 1,
    };
  }

  const base = process.env.WP_BASE_URL?.replace(/\/$/, "");
  const auth = authHeader();
  if (!base || !auth) {
    throw new Error("WordPress license API credentials are not configured");
  }

  const url = `${base}/wp-json/lmfwc/v2/licenses/${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    headers: { Authorization: auth, Accept: "application/json" },
    cache: "no-store",
  });

  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`WP validate failed: ${res.status}`);
  }

  const json = (await res.json()) as {
    data?: {
      license_key?: string;
      status?: string;
      product_id?: string | number;
      order_id?: string | number;
      expires_at?: string | null;
      timesActivated?: number;
      timesActivatedMax?: number | null;
      user_email?: string | null;
      email?: string | null;
    };
  };

  const data = json.data;
  if (!data) return null;

  return {
    key: String(data.license_key ?? key),
    status: normalizeStatus(data.status),
    productId: data.product_id != null ? String(data.product_id) : undefined,
    orderId: data.order_id != null ? String(data.order_id) : undefined,
    customerEmail: data.user_email ?? data.email ?? null,
    expiresAt: data.expires_at ?? null,
    timesActivated: data.timesActivated,
    timesActivatedMax: data.timesActivatedMax ?? null,
  };
}

export async function activateLicense(
  licenseKey: string,
  instance: string,
): Promise<WpActivateResult> {
  const key = licenseKey.trim().toUpperCase();

  if (mode() === "mock") {
    const info = await validateLicense(key);
    if (!info || info.status !== "active") {
      return { ok: false, message: "Invalid or inactive license key" };
    }
    return { ok: true, license: info };
  }

  const base = process.env.WP_BASE_URL?.replace(/\/$/, "");
  const auth = authHeader();
  if (!base || !auth) {
    throw new Error("WordPress license API credentials are not configured");
  }

  const url = `${base}/wp-json/lmfwc/v2/licenses/activate/${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: auth,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text();
    return {
      ok: false,
      message: `Activation failed (${res.status}): ${body.slice(0, 200)}`,
    };
  }

  const info = await validateLicense(key);
  return {
    ok: true,
    license: info ?? { key, status: "active" },
    message: `Activated instance ${instance}`,
  };
}
