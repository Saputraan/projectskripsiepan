/**
 * supabaseClient.js
 * Konfigurasi Supabase + Fungsi CRUD untuk catatan terenkripsi
 *
 * PENTING: Buat file .env di root project dengan variabel berikut:
 *   REACT_APP_SUPABASE_URL=https://xxxxx.supabase.co
 *   REACT_APP_SUPABASE_ANON_KEY=eyJhbGci...
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// =============================================================================
// SCHEMA SQL — Jalankan di Supabase SQL Editor
// =============================================================================
/*
-- Tabel utama untuk menyimpan catatan terenkripsi
CREATE TABLE notes (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- Data terenkripsi (semua dalam Base64)
  ciphertext  TEXT NOT NULL,   -- Konten catatan yang terenkripsi + auth tag
  iv          TEXT NOT NULL,   -- Initialization Vector AES-GCM (12 bytes → Base64)
  salt        TEXT NOT NULL,   -- PBKDF2 salt (16 bytes → Base64)

  -- Metadata (tidak terenkripsi — pertimbangkan untuk enkripsi juga)
  title_encrypted TEXT,        -- Opsional: judul juga bisa dienkripsi
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Row Level Security: setiap user hanya bisa akses catatannya sendiri
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_notes" ON notes
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Auto-update timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER notes_updated_at
  BEFORE UPDATE ON notes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
*/

// =============================================================================
// CRUD OPERATIONS
// =============================================================================

/**
 * Ambil semua catatan milik user yang sedang login.
 * Server hanya mengembalikan ciphertext — tidak ada plaintext.
 *
 * @returns {Promise<Array>} Array of encrypted note objects
 */
export async function fetchNotes() {
  const { data, error } = await supabase
    .from('notes')
    .select('id, ciphertext, iv, salt, title_encrypted, created_at, updated_at')
    .order('updated_at', { ascending: false });

  if (error) throw new Error(`Gagal mengambil catatan: ${error.message}`);
  return data;
}

/**
 * Simpan catatan baru ke database.
 * Hanya menerima data terenkripsi — plaintext tidak pernah menyentuh server.
 *
 * @param {object} encryptedNote - { ciphertext, iv, salt, title_encrypted? }
 * @returns {Promise<object>} Catatan yang baru dibuat
 */
export async function createNote(encryptedNote) {
  const { data: { user } } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from('notes')
    .insert({
      user_id: user.id,
      ciphertext: encryptedNote.ciphertext,
      iv: encryptedNote.iv,
      salt: encryptedNote.salt,
      title_encrypted: encryptedNote.title_encrypted || null,
    })
    .select()
    .single();

  if (error) throw new Error(`Gagal menyimpan catatan: ${error.message}`);
  return data;
}

/**
 * Update catatan yang sudah ada.
 * IV baru harus dihasilkan saat re-enkripsi (wajib untuk keamanan AES-GCM).
 *
 * @param {string} noteId - UUID catatan
 * @param {object} encryptedNote - { ciphertext, iv, salt, title_encrypted? }
 * @returns {Promise<object>} Catatan yang sudah diupdate
 */
export async function updateNote(noteId, encryptedNote) {
  const { data, error } = await supabase
    .from('notes')
    .update({
      ciphertext: encryptedNote.ciphertext,
      iv: encryptedNote.iv,
      salt: encryptedNote.salt,
      title_encrypted: encryptedNote.title_encrypted || null,
    })
    .eq('id', noteId)
    .select()
    .single();

  if (error) throw new Error(`Gagal mengupdate catatan: ${error.message}`);
  return data;
}

/**
 * Hapus catatan dari database.
 * RLS di Supabase memastikan user hanya bisa hapus miliknya sendiri.
 *
 * @param {string} noteId - UUID catatan
 */
export async function deleteNote(noteId) {
  const { error } = await supabase
    .from('notes')
    .delete()
    .eq('id', noteId);

  if (error) throw new Error(`Gagal menghapus catatan: ${error.message}`);
}