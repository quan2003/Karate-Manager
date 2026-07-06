const { app, safeStorage } = require("electron");
const fs = require("fs");
const path = require("path");

const ALLOWED_KEYS = new Set([
  "krt_active_license",
  "krt_machine_id",
  "krt_trial_used",
]);

function assertAllowedKey(key) {
  if (!ALLOWED_KEYS.has(key)) throw new Error("Unsupported secure license key");
}

function getVaultPath() {
  return path.join(app.getPath("userData"), "license-vault.dat");
}

function readVault() {
  const vaultPath = getVaultPath();
  if (!fs.existsSync(vaultPath)) return {};

  const envelope = JSON.parse(fs.readFileSync(vaultPath, "utf8"));
  let serialized;
  if (envelope.encrypted) {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error("OS secure storage is unavailable");
    }
    serialized = safeStorage.decryptString(
      Buffer.from(envelope.payload, "base64")
    );
  } else {
    serialized = Buffer.from(envelope.payload, "base64").toString("utf8");
  }
  return JSON.parse(serialized);
}

function writeVault(vault) {
  const vaultPath = getVaultPath();
  const serialized = JSON.stringify(vault);
  const encrypted = safeStorage.isEncryptionAvailable();
  const payload = encrypted
    ? safeStorage.encryptString(serialized).toString("base64")
    : Buffer.from(serialized, "utf8").toString("base64");
  const envelope = JSON.stringify({ version: 1, encrypted, payload });

  fs.mkdirSync(path.dirname(vaultPath), { recursive: true });
  fs.writeFileSync(vaultPath, envelope, { mode: 0o600 });
}

function get(key) {
  assertAllowedKey(key);
  const vault = readVault();
  return Object.prototype.hasOwnProperty.call(vault, key) ? vault[key] : null;
}

function set(key, value) {
  assertAllowedKey(key);
  const vault = readVault();
  vault[key] = value;
  writeVault(vault);
  return true;
}

function remove(key) {
  assertAllowedKey(key);
  const vault = readVault();
  delete vault[key];
  writeVault(vault);
  return true;
}

function clear() {
  writeVault({});
  return true;
}

module.exports = { get, set, remove, clear };