/**
 * WordPress License Manager for WooCommerce (LMFWC) client.
 * Docs: https://www.licensemanager.at/docs/rest-api/
 *
 * Modes:
 * - mock: accept DEMO-* keys for local/dev without WP
 * - live: call WP REST API with consumer key/secret
 *
 * On Vercel production, mock is forced off unless ALLOW_MOCK_LICENSES=true.
 *
 * LMFWC v2 responses use camelCase and numeric status:
 * 1 = sold, 2 = delivered, 3 = active, 4 = inactive.
 */
import { licenseMode } from "@/lib/env";

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
    productSku: "davinci-course",
    productId: "119",
    orderId: "9001",
  },
  "DEMO-COURSE-002": {
    productSku: "davinci-course",
    productId: "119",
    orderId: "9002",
  },
};

/** LMFWC LicenseStatus enum */
type LmfwcNumericStatus = 1 | 2 | 3 | 4;

function mode() {
  return licenseMode();
}

function authHeader() {
  const key = process.env.WP_LM_CONSUMER_KEY ?? "";
  const secret = process.env.WP_LM_CONSUMER_SECRET ?? "";
  if (!key || !secret) return null;
  const token = Buffer.from(`${key}:${secret}`).toString("base64");
  return `Basic ${token}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function pickScalar(
  record: Record<string, unknown>,
  keys: string[],
): unknown {
  for (const key of keys) {
    if (key in record && record[key] != null && record[key] !== "") {
      return record[key];
    }
  }
  return undefined;
}

function scalarToString(value: unknown): string | undefined {
  if (value == null || value === "") return undefined;
  if (typeof value === "object") {
    const nested = asRecord(value);
    if (!nested) return undefined;
    return pickString(nested, ["id", "productId", "product_id", "sku"]);
  }
  const text = String(value).trim();
  if (!text || text === "[object Object]") return undefined;
  return text;
}

function pickString(
  record: Record<string, unknown>,
  keys: string[],
): string | undefined {
  return scalarToString(pickScalar(record, keys));
}

function pickNumber(
  record: Record<string, unknown>,
  keys: string[],
): number | undefined {
  const value = pickScalar(record, keys);
  if (value == null || value === "") return undefined;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function asNumericStatus(raw: unknown): LmfwcNumericStatus | null {
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (n === 1 || n === 2 || n === 3 || n === 4) return n;
  return null;
}

function normalizeStatus(raw: unknown): WpLicenseInfo["status"] {
  const numeric = asNumericStatus(raw);
  if (numeric != null) {
    switch (numeric) {
      case 1: // sold
      case 2: // delivered
      case 3: // active
        return "active";
      case 4: // inactive
        return "inactive";
      default: {
        const _exhaustive: never = numeric;
        return _exhaustive;
      }
    }
  }

  const s = String(raw ?? "")
    .toLowerCase()
    .trim();
  switch (s) {
    case "active":
    case "sold":
    case "delivered":
      return "active";
    case "inactive":
      return "inactive";
    case "expired":
      return "expired";
    case "disabled":
      return "disabled";
    default:
      return "unknown";
  }
}

function applyExpiry(
  status: WpLicenseInfo["status"],
  expiresAt: string | null,
): WpLicenseInfo["status"] {
  if (!expiresAt || status === "inactive" || status === "disabled") {
    return status;
  }
  const exp = Date.parse(expiresAt.replace(" ", "T"));
  if (!Number.isNaN(exp) && exp < Date.now()) return "expired";
  return status;
}

/** Parse an LMFWC retrieve/validate/activate payload (camelCase or snake_case). */
export function parseWpLicenseData(
  payload: unknown,
  fallbackKey: string,
): WpLicenseInfo | null {
  const root = asRecord(payload);
  if (!root) return null;
  const nested = asRecord(root.data);
  const data = nested ?? root;
  if (
    !("status" in data) &&
    !("licenseKey" in data) &&
    !("license_key" in data) &&
    !("productId" in data) &&
    !("product_id" in data)
  ) {
    return null;
  }

  const expiresAt =
    pickString(data, ["expiresAt", "expires_at"]) ?? null;
  const status = applyExpiry(normalizeStatus(data.status), expiresAt);

  if (status === "unknown") {
    console.warn("Unrecognized LMFWC license status", {
      status: data.status,
      fields: Object.keys(data),
    });
  }

  const product = asRecord(data.product) ?? asRecord(data.productData);
  return {
    key: pickString(data, ["licenseKey", "license_key"]) ?? fallbackKey,
    status,
    productId:
      pickString(data, ["productId", "product_id"]) ??
      (product
        ? pickString(product, ["id", "productId", "product_id"])
        : undefined),
    productSku:
      pickString(data, ["productSku", "product_sku", "sku"]) ??
      (product
        ? pickString(product, ["sku", "productSku", "product_sku"])
        : undefined),
    orderId: pickString(data, ["orderId", "order_id"]),
    customerEmail:
      pickString(data, ["userEmail", "user_email", "email"]) ?? null,
    expiresAt,
    timesActivated: pickNumber(data, ["timesActivated", "times_activated"]),
    timesActivatedMax:
      pickNumber(data, ["timesActivatedMax", "times_activated_max"]) ?? null,
  };
}

export async function validateLicense(
  licenseKey: string,
): Promise<WpLicenseInfo | null> {
  const key = licenseKey.trim();
  if (!key) return null;

  if (mode() === "mock") {
    const mock = MOCK_KEYS[key.toUpperCase()];
    if (!mock) return null;
    return {
      key: key.toUpperCase(),
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
    signal: AbortSignal.timeout(8000),
  });

  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`WP validate failed: ${res.status}`);
  }

  return parseWpLicenseData(await res.json(), key);
}

export async function activateLicense(
  licenseKey: string,
  instance: string,
): Promise<WpActivateResult> {
  const key = licenseKey.trim();

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
    signal: AbortSignal.timeout(8000),
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

  const fromActivate = parseWpLicenseData(await res.json(), key);
  const info = fromActivate ?? (await validateLicense(key));
  return {
    ok: true,
    license: info ?? { key, status: "active" },
    message: `Activated instance ${instance}`,
  };
}
