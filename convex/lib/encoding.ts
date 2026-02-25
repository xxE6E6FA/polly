/**
 * V8-safe base64 encoding for ArrayBuffer / Uint8Array.
 *
 * Convex actions that don't use "use node" run in a V8 isolate where
 * `Buffer` is unavailable. This implementation works in both V8 and
 * Node.js runtimes.
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const base64chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let result = "";
  let i;

  for (i = 0; i < bytes.length - 2; i += 3) {
    const byte0 = bytes[i]!;
    const byte1 = bytes[i + 1]!;
    const byte2 = bytes[i + 2]!;
    result += base64chars[byte0 >> 2];
    result += base64chars[((byte0 & 3) << 4) | (byte1 >> 4)];
    result += base64chars[((byte1 & 15) << 2) | (byte2 >> 6)];
    result += base64chars[byte2 & 63];
  }

  if (i < bytes.length) {
    const lastByte = bytes[i]!;
    result += base64chars[lastByte >> 2];
    if (i === bytes.length - 1) {
      result += base64chars[(lastByte & 3) << 4];
      result += "==";
    } else {
      const nextByte = bytes[i + 1]!;
      result += base64chars[((lastByte & 3) << 4) | (nextByte >> 4)];
      result += base64chars[(nextByte & 15) << 2];
      result += "=";
    }
  }

  return result;
}
