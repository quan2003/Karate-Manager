/* global require, module */
const crypto = require("crypto");

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const hmac = (key, value, encoding) => crypto.createHmac("sha256", key).update(value).digest(encoding);
const encodeR2Key = (key) => key.split("/").map(encodeURIComponent).join("/");

function getR2Config() {
  const accountId = String(process.env.R2_ACCOUNT_ID || "").trim();
  const bucket = String(process.env.R2_BUCKET || "").trim();
  const accessKeyId = String(process.env.R2_ACCESS_KEY_ID || "").trim();
  const secretAccessKey = String(process.env.R2_SECRET_ACCESS_KEY || "").trim();
  if (!accountId || !bucket || !accessKeyId || !secretAccessKey) return null;
  return { accountId, bucket, accessKeyId, secretAccessKey };
}

function amzDate(date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function signingKey(secret, dateStamp) {
  const dateKey = hmac(`AWS4${secret}`, dateStamp);
  const regionKey = hmac(dateKey, "auto");
  const serviceKey = hmac(regionKey, "s3");
  return hmac(serviceKey, "aws4_request");
}

function presignR2({ method, key, expiresSeconds = 300, now = new Date() }) {
  const config = getR2Config();
  if (!config) throw new Error("R2 chưa được cấu hình trên server");
  const expires = Math.max(1, Math.min(Number(expiresSeconds) || 300, 900));
  const timestamp = amzDate(now);
  const dateStamp = timestamp.slice(0, 8);
  const host = `${config.accountId}.r2.cloudflarestorage.com`;
  const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
  const canonicalUri = `/${config.bucket}/${encodeR2Key(key)}`;
  const query = new URLSearchParams({
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${config.accessKeyId}/${credentialScope}`,
    "X-Amz-Date": timestamp,
    "X-Amz-Expires": String(expires),
    "X-Amz-SignedHeaders": "host",
  });
  const canonicalQuery = [...query.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(value)}`)
    .join("&");
  const canonicalRequest = [method, canonicalUri, canonicalQuery, `host:${host}\n`, "host", "UNSIGNED-PAYLOAD"].join("\n");
  const stringToSign = ["AWS4-HMAC-SHA256", timestamp, credentialScope, sha256(canonicalRequest)].join("\n");
  const signature = hmac(signingKey(config.secretAccessKey, dateStamp), stringToSign, "hex");
  query.set("X-Amz-Signature", signature);
  return `https://${host}${canonicalUri}?${query.toString()}`;
}

module.exports = { getR2Config, presignR2 };
