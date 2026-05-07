/**
 * cryptoUtils.js
 * Zero-Knowledge Cryptography Module + Pengukur Waktu (untuk penelitian)
 *
 * CARA PENGUKURAN WAKTU:
 * - performance.now() → presisi tinggi (sub-milidetik, ~5 mikrodetik)
 * - Diukur HANYA untuk operasi AES-GCM (enkripsi & dekripsi)
 * - PBKDF2 adalah derivasi kunci, diukur terpisah jika dibutuhkan
 *
 * TIMELINE PENGUKURAN:
 *  [t0] ──── AES-GCM encrypt(plaintext) ──── [t1]
 *   encryptTimeMs = t1 - t0
 *
 *  [t2] ──── AES-GCM decrypt(ciphertext) ──── [t3]
 *   decryptTimeMs = t3 - t2
 */

const PBKDF2_ITERATIONS = 600_000;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const KEY_LENGTH = 256;

// =============================================================================
// UTILITAS: Konversi ArrayBuffer ↔ Base64
// =============================================================================
export function bufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// =============================================================================
// UTILITAS: Hitung ukuran teks
// =============================================================================
/**
 * Hitung ukuran string dalam bytes & KB (akurat UTF-8).
 * @param {string} text
 * @returns {{ bytes: number, kb: number, displayKB: string }}
 */
export function getTextSize(text) {
  const bytes = new TextEncoder().encode(text).byteLength;
  const kb = bytes / 1024;
  return {
    bytes,
    kb: parseFloat(kb.toFixed(4)),
    displayKB: kb < 1 ? `${bytes} B` : `${kb.toFixed(2)} KB`,
  };
}

/**
 * Generate teks dummy dengan ukuran target dalam KB.
 * Berguna untuk pengujian performa.
 * @param {number} targetKB - Ukuran target dalam KB
 * @returns {string} Teks dengan ukuran mendekati targetKB
 */
export function generateTextOfSize(targetKB) {
  const targetBytes = targetKB * 1024;
  // Setiap karakter ASCII = 1 byte
  const chunk = 'Ini adalah teks pengujian enkripsi AES-GCM 256-bit untuk penelitian keamanan data. ';
  let result = '';
  while (new TextEncoder().encode(result).byteLength < targetBytes) {
    result += chunk;
  }
  // Trim tepat ke target
  while (new TextEncoder().encode(result).byteLength > targetBytes) {
    result = result.slice(0, -1);
  }
  return result;
}

// =============================================================================
// DERIVASI KUNCI PBKDF2
// =============================================================================
export async function deriveKey(masterPassword, salt) {
  const encoder = new TextEncoder();
  const passwordBytes = encoder.encode(masterPassword);

  const rawKeyMaterial = await window.crypto.subtle.importKey(
    'raw', passwordBytes, { name: 'PBKDF2' }, false, ['deriveKey']
  );

  return window.crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    rawKeyMaterial,
    { name: 'AES-GCM', length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
}

// =============================================================================
// ENKRIPSI AES-GCM + PENGUKUR WAKTU
// =============================================================================
/**
 * Enkripsi plaintext dengan AES-GCM dan ukur waktu eksekusi.
 *
 * @returns {Promise<{
 *   ciphertext: string,
 *   iv: string,
 *   salt: string,
 *   metrics: {
 *     encryptTimeMs: number,   ← Waktu enkripsi (ms, presisi 4 desimal)
 *     plaintextBytes: number,  ← Ukuran teks asli (bytes)
 *     plaintextKB: number,     ← Ukuran teks asli (KB)
 *     ciphertextBytes: number, ← Ukuran hasil enkripsi (bytes)
 *     throughputMBps: number,  ← Throughput enkripsi (MB/detik)
 *   }
 * }>}
 */
export async function encryptNote(aesKey, plaintext, existingSalt = null) {
  const encoder = new TextEncoder();
  const plaintextBytes = encoder.encode(plaintext);
  const iv = window.crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const salt = existingSalt || window.crypto.getRandomValues(new Uint8Array(SALT_LENGTH));

  // ══════════════════════════════════════
  // MULAI TIMER ENKRIPSI
  const t0 = performance.now();

  const ciphertextBuffer = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    plaintextBytes
  );

  const t1 = performance.now();
  // SELESAI TIMER ENKRIPSI
  // ══════════════════════════════════════

  const encryptTimeMs = t1 - t0;
  const inputBytes = plaintextBytes.byteLength;
  const inputKB = inputBytes / 1024;
  const inputMB = inputBytes / (1024 * 1024);

  return {
    ciphertext: bufferToBase64(ciphertextBuffer),
    iv: bufferToBase64(iv.buffer),
    salt: bufferToBase64(salt.buffer),
    metrics: {
      encryptTimeMs: parseFloat(encryptTimeMs.toFixed(4)),
      plaintextBytes: inputBytes,
      plaintextKB: parseFloat(inputKB.toFixed(4)),
      ciphertextBytes: ciphertextBuffer.byteLength,
      throughputMBps: parseFloat((inputMB / (encryptTimeMs / 1000)).toFixed(4)),
    },
  };
}

// =============================================================================
// DEKRIPSI AES-GCM + PENGUKUR WAKTU
// =============================================================================
/**
 * Dekripsi ciphertext dengan AES-GCM dan ukur waktu eksekusi.
 *
 * @returns {Promise<{
 *   plaintext: string,
 *   metrics: {
 *     decryptTimeMs: number,
 *     ciphertextBytes: number,
 *     plaintextBytes: number,
 *     plaintextKB: number,
 *     throughputMBps: number,
 *   }
 * }>}
 */
export async function decryptNote(aesKey, ciphertextBase64, ivBase64) {
  const ciphertextBuffer = base64ToBuffer(ciphertextBase64);
  const iv = base64ToBuffer(ivBase64);

  try {
    // ══════════════════════════════════════
    // MULAI TIMER DEKRIPSI
    const t2 = performance.now();

    const plaintextBuffer = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      aesKey,
      ciphertextBuffer
    );

    const t3 = performance.now();
    // SELESAI TIMER DEKRIPSI
    // ══════════════════════════════════════

    const decryptTimeMs = t3 - t2;
    const outputBytes = plaintextBuffer.byteLength;
    const outputKB = outputBytes / 1024;
    const outputMB = outputBytes / (1024 * 1024);

    return {
      plaintext: new TextDecoder().decode(plaintextBuffer),
      metrics: {
        decryptTimeMs: parseFloat(decryptTimeMs.toFixed(4)),
        ciphertextBytes: ciphertextBuffer.byteLength,
        plaintextBytes: outputBytes,
        plaintextKB: parseFloat(outputKB.toFixed(4)),
        throughputMBps: parseFloat((outputMB / (decryptTimeMs / 1000)).toFixed(4)),
      },
    };
  } catch (err) {
    throw new Error('Dekripsi gagal: Master Password salah atau data korup.');
  }
}

// =============================================================================
// FUNGSI KOMBINASI
// =============================================================================
export async function encryptFromPassword(masterPassword, plaintext) {
  const salt = window.crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const aesKey = await deriveKey(masterPassword, salt);
  return encryptNote(aesKey, plaintext, salt);
}

export async function decryptFromPassword(masterPassword, ciphertextBase64, ivBase64, saltBase64) {
  const salt = new Uint8Array(base64ToBuffer(saltBase64));
  const aesKey = await deriveKey(masterPassword, salt);
  return decryptNote(aesKey, ciphertextBase64, ivBase64);
}

export async function verifyAndDeriveKey(masterPassword, testNote) {
  const salt = new Uint8Array(base64ToBuffer(testNote.salt));
  const aesKey = await deriveKey(masterPassword, salt);
  await decryptNote(aesKey, testNote.ciphertext, testNote.iv);
  return aesKey;
}