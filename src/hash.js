import crypto from "node:crypto";

export function shortHash(value, size = 12) {
  return crypto.createHash("sha1").update(value).digest("hex").slice(0, size);
}
