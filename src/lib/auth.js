import crypto from "crypto";
import dbConnect, { AdminSettings } from "./db";

const PASSWORD_SALT = process.env.PASSWORD_SALT || "humtum_ultra_premium_salt_987";
const JWT_SECRET = process.env.JWT_SECRET || "humtum_jwt_super_secret_key_2026_xyz";

/**
 * Hash password securely using HMAC-SHA256 with a salt.
 */
export function hashPassword(password) {
  return crypto.createHmac("sha256", PASSWORD_SALT).update(password).digest("hex");
}

/**
 * Sign standard JWT token with HS256 algorithm and expiration.
 */
export function signToken(payload, expiresInSeconds = 86400) {
  const header = {
    alg: "HS256",
    typ: "JWT"
  };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = {
    ...payload,
    iat: now,
    exp: now + expiresInSeconds
  };

  const base64UrlEncode = (obj) => {
    const str = JSON.stringify(obj);
    return Buffer.from(str)
      .toString("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
  };

  const encodedHeader = base64UrlEncode(header);
  const encodedPayload = base64UrlEncode(fullPayload);

  const signatureInput = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(signatureInput)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  return `${signatureInput}.${signature}`;
}

/**
 * Verify JWT token validity and expiry. Returns payload or null.
 */
export function verifyToken(token) {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [encodedHeader, encodedPayload, signature] = parts;
  const signatureInput = `${encodedHeader}.${encodedPayload}`;

  const expectedSignature = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(signatureInput)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  if (signature !== expectedSignature) {
    return null;
  }

  try {
    const payloadStr = Buffer.from(encodedPayload, "base64").toString("utf8");
    const payload = JSON.parse(payloadStr);

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && now > payload.exp) {
      return null;
    }

    return payload;
  } catch (e) {
    return null;
  }
}

/**
 * Retrieve admin settings document, or create it using process.env.ADMIN_PASSWORD if missing.
 */
export async function getAdminSettings() {
  await dbConnect();
  let settings = await AdminSettings.findOne({ email: "shubhampriy11@gmail.com" });
  if (!settings) {
    const defaultPassword = process.env.ADMIN_PASSWORD || "admin123";
    const passwordHash = hashPassword(defaultPassword);
    settings = await AdminSettings.create({
      email: "shubhampriy11@gmail.com",
      passwordHash: passwordHash
    });
  }
  return settings;
}

/**
 * Validate incoming password against the database hash.
 */
export async function checkCredentials(password) {
  const settings = await getAdminSettings();
  const inputHash = hashPassword(password);
  return settings.passwordHash === inputHash;
}

/**
 * Unified verification checking JWT in header/body or password in body/query.
 */
export async function verifyAdmin(req) {
  // 1. Try to read token from authorization header
  const authHeader = req.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    const decoded = verifyToken(token);
    if (decoded) return true;
  }

  // 2. Try to read from request body
  try {
    const clonedReq = req.clone();
    const body = await clonedReq.json();
    if (body && body.token) {
      const decoded = verifyToken(body.token);
      if (decoded) return true;
    }
    if (body && body.password) {
      const isValid = await checkCredentials(body.password);
      if (isValid) return true;
    }
  } catch (e) {
    // Ignore JSON parsing or body reading error
  }

  // 3. Try to read from URL query parameters (useful for quick links)
  try {
    const url = new URL(req.url);
    const password = url.searchParams.get("password");
    if (password) {
      const isValid = await checkCredentials(password);
      if (isValid) return true;
    }
    const token = url.searchParams.get("token");
    if (token) {
      const decoded = verifyToken(token);
      if (decoded) return true;
    }
  } catch (e) {
    // Ignore
  }

  return false;
}

/**
 * Verify JWT token validity for check-in staff. Returns check-in user payload or null.
 */
export async function verifyCheckIn(req) {
  const authHeader = req.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    const decoded = verifyToken(token);
    if (decoded && decoded.role === "checkin") {
      return decoded;
    }
  }
  return null;
}

