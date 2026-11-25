const encoder = new TextEncoder();

const bytesToHex = (bytes: ArrayBuffer): string =>
  [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");

export const digestHex = async (algorithm: "SHA-1" | "SHA-256", value: string) =>
  bytesToHex(await crypto.subtle.digest(algorithm, encoder.encode(value)));

export const signUploadParameters = async (
  parameters: Record<string, string | number>,
  apiSecret: string,
) => {
  const serialized = Object.entries(parameters)
    .filter(([, value]) => value !== "" && value !== undefined && value !== null)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  // Cloudinary's signed Upload API uses a digest of the canonical parameters
  // followed by the API secret. SHA-1 is its default upload signature protocol.
  return digestHex("SHA-1", `${serialized}${apiSecret}`);
};

const safeEqual = (left: string, right: string) => {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
};

/**
 * Cloudinary signs notifications with the account's signature algorithm:
 * SHA-1 by default (40 hex chars), SHA-256 when switched (64). Only checking
 * SHA-256 rejected every photo notification with a 401, so no image ever got
 * its media asset. The digest is chosen by the length of what arrived.
 */
export const verifyWebhookSignature = async (
  rawBody: string,
  timestamp: string,
  receivedSignature: string,
  apiSecret: string,
) => {
  const algorithm = receivedSignature.length === 40 ? "SHA-1" : receivedSignature.length === 64 ? "SHA-256" : null;
  if (!algorithm) return false;
  const expected = await digestHex(algorithm, `${rawBody}${timestamp}${apiSecret}`);
  return safeEqual(expected, receivedSignature);
};

export const requiredEnv = (name: string): string => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};
