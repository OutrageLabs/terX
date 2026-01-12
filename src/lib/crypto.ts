/**
 * E2E Encryption for terX
 *
 * Uses Web Crypto API:
 * - PBKDF2 for key derivation from master password
 * - AES-256-GCM for encryption/decryption
 *
 * Data is encrypted client-side before sending to Supabase.
 * Supabase never sees plaintext credentials.
 */

// PBKDF2 configuration
const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_HASH = "SHA-256";
const SALT_LENGTH = 16; // 128 bits
const KEY_LENGTH = 256; // AES-256

// AES-GCM configuration
const NONCE_LENGTH = 12; // 96 bits (recommended for GCM)
const TAG_LENGTH = 128; // 128 bits

// Storage key for encrypted master key test
const STORAGE_KEY = "terx-encryption-test";

let derivedKey: CryptoKey | null = null;
let currentSalt: Uint8Array | null = null;

/**
 * Convert ArrayBuffer or Uint8Array to hex string
 */
function bufferToHex(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Convert hex string to Uint8Array
 */
function hexToBuffer(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

/**
 * Generate cryptographically secure random bytes
 */
function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

/**
 * Derive AES-256 key from master password using PBKDF2
 */
async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(password);

  // Import password as raw key material
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    passwordBuffer,
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  // Derive AES-GCM key
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt.buffer as ArrayBuffer,
      iterations: PBKDF2_ITERATIONS,
      hash: PBKDF2_HASH,
    },
    keyMaterial,
    { name: "AES-GCM", length: KEY_LENGTH },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Initialize encryption session with master password
 *
 * If salt is provided, uses it (for existing sessions).
 * Otherwise generates new salt (for new sessions).
 *
 * Returns the salt (hex) to be stored for future sessions.
 */
export async function initEncryption(
  masterPassword: string,
  existingSaltHex?: string
): Promise<string> {
  if (existingSaltHex) {
    currentSalt = hexToBuffer(existingSaltHex);
  } else {
    currentSalt = randomBytes(SALT_LENGTH);
  }

  derivedKey = await deriveKey(masterPassword, currentSalt);

  // Verify encryption works by encrypting/decrypting test value
  const testPlaintext = "terx-encryption-test-" + Date.now();
  const encrypted = await encrypt(testPlaintext);
  const decrypted = await decrypt(encrypted);

  if (decrypted !== testPlaintext) {
    derivedKey = null;
    currentSalt = null;
    throw new Error("Encryption verification failed");
  }

  return bufferToHex(currentSalt);
}

/**
 * Check if encryption is initialized
 */
export function isEncryptionReady(): boolean {
  return derivedKey !== null;
}

/**
 * Get current salt (hex) for storage
 */
export function getSalt(): string | null {
  return currentSalt ? bufferToHex(currentSalt) : null;
}

/**
 * Clear encryption session
 */
export function clearEncryption(): void {
  derivedKey = null;
  currentSalt = null;
}

/**
 * Encrypt plaintext string
 *
 * Returns hex string: nonce (12 bytes) + ciphertext + tag
 */
export async function encrypt(plaintext: string): Promise<string> {
  if (!derivedKey) {
    throw new Error("Encryption not initialized. Call initEncryption() first.");
  }

  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);
  const nonce = randomBytes(NONCE_LENGTH);

  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: nonce.buffer as ArrayBuffer,
      tagLength: TAG_LENGTH,
    },
    derivedKey,
    data.buffer as ArrayBuffer
  );

  // Concatenate nonce + ciphertext (includes auth tag)
  const result = new Uint8Array(nonce.length + ciphertext.byteLength);
  result.set(nonce);
  result.set(new Uint8Array(ciphertext), nonce.length);

  return bufferToHex(result);
}

/**
 * Decrypt hex-encoded ciphertext
 *
 * Input format: nonce (12 bytes) + ciphertext + tag
 */
export async function decrypt(encryptedHex: string): Promise<string> {
  if (!derivedKey) {
    throw new Error("Encryption not initialized. Call initEncryption() first.");
  }

  const data = hexToBuffer(encryptedHex);

  // Extract nonce and ciphertext
  const nonce = data.slice(0, NONCE_LENGTH);
  const ciphertext = data.slice(NONCE_LENGTH);

  const decrypted = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: nonce.buffer as ArrayBuffer,
      tagLength: TAG_LENGTH,
    },
    derivedKey,
    ciphertext.buffer as ArrayBuffer
  );

  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}

/**
 * Encrypt multiple fields in an object
 *
 * @param obj - Object with string values
 * @param fields - Array of field names to encrypt
 * @returns New object with specified fields encrypted
 */
export async function encryptFields<T extends Record<string, unknown>>(
  obj: T,
  fields: (keyof T)[]
): Promise<T> {
  const result = { ...obj };

  for (const field of fields) {
    const value = obj[field];
    if (typeof value === "string" && value.length > 0) {
      (result as Record<string, unknown>)[field as string] = await encrypt(value);
    }
  }

  return result;
}

/**
 * Decrypt multiple fields in an object
 *
 * @param obj - Object with encrypted string values
 * @param fields - Array of field names to decrypt
 * @returns New object with specified fields decrypted
 */
export async function decryptFields<T extends Record<string, unknown>>(
  obj: T,
  fields: (keyof T)[]
): Promise<T> {
  const result = { ...obj };

  for (const field of fields) {
    const value = obj[field];
    if (typeof value === "string" && value.length > 0) {
      try {
        (result as Record<string, unknown>)[field as string] = await decrypt(value);
      } catch {
        // If decryption fails, keep original value (might not be encrypted)
        console.warn(`Failed to decrypt field: ${String(field)}`);
      }
    }
  }

  return result;
}

/**
 * Validate master password by attempting to decrypt test data
 */
export async function validatePassword(
  masterPassword: string,
  saltHex: string,
  testEncrypted: string
): Promise<boolean> {
  try {
    const salt = hexToBuffer(saltHex);
    const key = await deriveKey(masterPassword, salt);

    const data = hexToBuffer(testEncrypted);
    const nonce = data.slice(0, NONCE_LENGTH);
    const ciphertext = data.slice(NONCE_LENGTH);

    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: nonce.buffer as ArrayBuffer, tagLength: TAG_LENGTH },
      key,
      ciphertext.buffer as ArrayBuffer
    );

    return true;
  } catch {
    return false;
  }
}

/**
 * Generate encryption test data for password validation
 *
 * Returns { salt, testEncrypted } to be stored in user profile
 */
export async function generateTestData(masterPassword: string): Promise<{
  salt: string;
  testEncrypted: string;
}> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await deriveKey(masterPassword, salt);

  // Store key temporarily
  const prevKey = derivedKey;
  const prevSalt = currentSalt;
  derivedKey = key;
  currentSalt = salt;

  const testEncrypted = await encrypt("terx-password-test");

  // Restore previous state
  derivedKey = prevKey;
  currentSalt = prevSalt;

  return {
    salt: bufferToHex(salt),
    testEncrypted,
  };
}

// =============================================================================
// Field definitions for each entity type
// ALL user-entered fields must be encrypted - we don't know what user puts there
// =============================================================================

export const ENCRYPTED_FIELDS = {
  // Host: ALL user-visible fields
  host: ["name", "description", "ip", "port", "login"] as const,
  // Password: name is also user-entered, must be encrypted
  password: ["name", "password"] as const,
  // Key: name is also user-entered, must be encrypted
  key: ["name", "key_data", "passphrase"] as const,
  // Tag: name and color are user-entered
  tag: ["name", "color"] as const,
} as const;

export type EncryptedHostFields = (typeof ENCRYPTED_FIELDS.host)[number];
export type EncryptedPasswordFields = (typeof ENCRYPTED_FIELDS.password)[number];
export type EncryptedKeyFields = (typeof ENCRYPTED_FIELDS.key)[number];
export type EncryptedTagFields = (typeof ENCRYPTED_FIELDS.tag)[number];
