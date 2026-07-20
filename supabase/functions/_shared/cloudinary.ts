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

export const verifyWebhookSignature = async (
  rawBody: string,
  timestamp: string,
  receivedSignature: string,
  apiSecret: string,
) => {
  const expected = await digestHex("SHA-256", `${rawBody}${timestamp}${apiSecret}`);
  if (expected.length !== receivedSignature.length) return false;

  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= expected.charCodeAt(index) ^ receivedSignature.charCodeAt(index);
  }
  return difference === 0;
};

export const requiredEnv = (name: string): string => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};
