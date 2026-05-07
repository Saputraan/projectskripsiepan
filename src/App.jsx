/**
 * App.jsx — Zero-Knowledge Notes SPA
 * Versi penelitian: menampilkan ukuran catatan, waktu enkripsi & dekripsi
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, fetchNotes, createNote, updateNote, deleteNote } from './supabaseClient';
import {
  deriveKey,
  encryptNote,
  decryptNote,
  base64ToBuffer,
  getTextSize,
  generateTextOfSize,
} from './cryptoUtils';

const AUTO_LOCK_MS = 15 * 60 * 1000;

// Ukuran target untuk benchmark (KB)
const BENCHMARK_SIZES = [1, 10, 100, 500, 1000];

function sanitizeText(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

// =============================================================================
// LOADING
// =============================================================================
function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center"
         style={{ background: 'linear-gradient(135deg, #0f0c29, #302b63, #24243e)' }}>
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-indigo-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-indigo-300 text-sm font-mono tracking-widest">MEMUAT...</p>
      </div>
    </div>
  );
}

// =============================================================================
// LOGIN
// =============================================================================
function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleSubmit = async () => {
    setError(''); setSuccessMsg(''); setLoading(true);
    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setSuccessMsg('Akun dibuat! Cek email untuk konfirmasi.');
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        onLogin(data.session);
      }
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4"
         style={{ background: 'linear-gradient(135deg, #0f0c29, #302b63, #24243e)' }}>
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-indigo-600 rounded-full opacity-10 blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-600 rounded-full opacity-10 blur-3xl" />
      </div>
      <div className="relative z-10 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
               style={{ background: 'linear-gradient(135deg, #667eea, #764ba2)' }}>
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-white mb-1" style={{ fontFamily: 'Georgia, serif' }}>ZeroVault</h1>
          <p className="text-indigo-300 text-sm">Catatan pribadi dengan enkripsi end-to-end</p>
        </div>
        <div className="rounded-2xl p-8"
             style={{ background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.1)' }}>
          <h2 className="text-xl font-semibold text-white mb-6">{isSignUp ? 'Buat Akun Baru' : 'Masuk ke Akun'}</h2>
          {error && <div className="mb-4 p-3 rounded-lg bg-red-500/20 border border-red-500/40"><p className="text-red-300 text-sm">{sanitizeText(error)}</p></div>}
          {successMsg && <div className="mb-4 p-3 rounded-lg bg-green-500/20 border border-green-500/40"><p className="text-green-300 text-sm">{sanitizeText(successMsg)}</p></div>}
          <div className="space-y-4">
            <div>
              <label className="block text-indigo-200 text-sm mb-1.5 font-medium">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="nama@email.com" onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                className="w-full px-4 py-3 rounded-xl text-white placeholder-gray-500 outline-none focus:ring-2 focus:ring-indigo-500"
                style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)' }} />
            </div>
            <div>
              <label className="block text-indigo-200 text-sm mb-1.5 font-medium">Password Akun</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="Min. 8 karakter" onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                className="w-full px-4 py-3 rounded-xl text-white placeholder-gray-500 outline-none focus:ring-2 focus:ring-indigo-500"
                style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)' }} />
            </div>
          </div>
          <button onClick={handleSubmit} disabled={loading || !email || !password}
            className="w-full mt-6 py-3 rounded-xl font-semibold text-white disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #667eea, #764ba2)' }}>
            {loading ? 'Memproses...' : (isSignUp ? 'Daftar' : 'Masuk')}
          </button>
          <p className="text-center mt-4 text-indigo-300 text-sm">
            {isSignUp ? 'Sudah punya akun?' : 'Belum punya akun?'}{' '}
            <button onClick={() => setIsSignUp(!isSignUp)} className="text-indigo-400 hover:text-white font-medium underline">
              {isSignUp ? 'Masuk' : 'Daftar'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// UNLOCK VAULT
// =============================================================================
function UnlockVaultScreen({ session, onUnlock, onLogout }) {
  const [masterPassword, setMasterPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleUnlock = async () => {
    if (!masterPassword.trim()) return;
    setError(''); setLoading(true);
    try {
      const notes = await fetchNotes();
      let aesKey;
      if (notes.length === 0) {
        const salt = window.crypto.getRandomValues(new Uint8Array(16));
        aesKey = await deriveKey(masterPassword, salt);
        const encrypted = await encryptNote(aesKey, '__zk_sentinel__', salt);
        await createNote({ ciphertext: encrypted.ciphertext, iv: encrypted.iv, salt: encrypted.salt });
      } else {
        const firstNote = notes[0];
        const salt = new Uint8Array(base64ToBuffer(firstNote.salt));
        aesKey = await deriveKey(masterPassword, salt);
        await decryptNote(aesKey, firstNote.ciphertext, firstNote.iv);
      }
      onUnlock(aesKey, masterPassword);
    } catch (err) {
      setError(err.message.includes('Dekripsi gagal') ? 'Master Password salah.' : err.message);
    } finally { setLoading(false); setMasterPassword(''); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4"
         style={{ background: 'linear-gradient(135deg, #0f0c29, #302b63, #24243e)' }}>
      <div className="relative z-10 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full mb-4"
               style={{ background: 'rgba(99,102,241,0.2)', border: '2px solid rgba(99,102,241,0.5)' }}>
            <svg className="w-10 h-10 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white mb-1">Buka Vault</h1>
          <p className="text-indigo-300 text-sm">{sanitizeText(session?.user?.email || '')}</p>
        </div>
        <div className="rounded-2xl p-8"
             style={{ background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.1)' }}>
          {error && <div className="mb-4 p-3 rounded-lg bg-red-500/20 border border-red-500/40"><p className="text-red-300 text-sm">{sanitizeText(error)}</p></div>}
          <div className="mb-4 p-4 rounded-xl" style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)' }}>
            <p className="text-indigo-200 text-sm">🔑 <strong>Master Password Enkripsi</strong> — berbeda dari password akun. Tidak pernah dikirim ke server.</p>
          </div>
          <label className="block text-indigo-200 text-sm mb-1.5 font-medium">Master Password</label>
          <input ref={inputRef} type="password" value={masterPassword}
            onChange={e => setMasterPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleUnlock()}
            placeholder="Password enkripsi Anda..." autoComplete="new-password"
            className="w-full px-4 py-3 rounded-xl text-white placeholder-gray-500 outline-none focus:ring-2 focus:ring-indigo-500 mb-4"
            style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)' }} />
          {loading && (
            <div className="mb-4 p-3 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center gap-3">
              <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
              <p className="text-indigo-300 text-sm">PBKDF2 × 600.000 iterasi...</p>
            </div>
          )}
          <button onClick={handleUnlock} disabled={loading || !masterPassword}
            className="w-full py-3 rounded-xl font-semibold text-white disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #667eea, #764ba2)' }}>
            {loading ? 'Memproses Kunci...' : 'Buka Vault'}
          </button>
          <button onClick={onLogout} className="w-full mt-3 py-2 text-indigo-400 text-sm">Logout</button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// NOTE EDITOR — dengan indikator ukuran real-time
// =============================================================================
function NoteEditor({ note, onSave, onClose }) {
  const [content, setContent] = useState(note?.plaintext || '');
  const [saving, setSaving] = useState(false);
  const [lastMetrics, setLastMetrics] = useState(null);

  const size = getTextSize(content);

  const handleSave = async () => {
    if (!content.trim()) return;
    setSaving(true);
    const metrics = await onSave(note?.id, content);
    if (metrics) setLastMetrics(metrics);
    setSaving(false);
    if (!metrics?.error) onClose();
  };

  // Warna indikator ukuran
  const sizeColor =
    size.kb > 500 ? 'text-red-400' :
    size.kb > 100 ? 'text-yellow-400' :
    size.kb > 10  ? 'text-blue-400' : 'text-green-400';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}>
      <div className="w-full max-w-2xl rounded-2xl overflow-hidden"
           style={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4"
             style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <h3 className="text-white font-semibold">{note?.id ? 'Edit Catatan' : 'Catatan Baru'}</h3>
          <div className="flex items-center gap-3">
            <span className="text-xs text-green-400 font-mono">🔒 AES-GCM-256</span>
            <button onClick={onClose} className="text-gray-400 hover:text-white">✕</button>
          </div>
        </div>

        {/* Textarea */}
        <textarea value={content} onChange={e => setContent(e.target.value)}
          placeholder="Tulis catatan rahasia Anda di sini..."
          className="w-full px-6 py-4 text-gray-200 placeholder-gray-600 resize-none outline-none"
          style={{ background: '#1a1a2e', minHeight: '260px', fontFamily: 'monospace', fontSize: '14px' }}
          autoFocus />

        {/* Indikator Ukuran Real-time */}
        <div className="px-6 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className={`text-sm font-mono font-bold ${sizeColor}`}>
                📦 {size.displayKB}
              </span>
              <span className="text-gray-500 text-xs">{size.bytes.toLocaleString()} bytes</span>
              <span className="text-gray-500 text-xs">{content.length} karakter</span>
            </div>
            {/* Badge ukuran target */}
            <div className="flex gap-1">
              {BENCHMARK_SIZES.map(kb => (
                <span key={kb}
                  className={`text-xs px-2 py-0.5 rounded font-mono ${
                    Math.abs(size.kb - kb) < kb * 0.05
                      ? 'bg-green-500/30 text-green-300 border border-green-500/50'
                      : 'bg-gray-800 text-gray-600'
                  }`}>
                  {kb}KB
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4"
             style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          <button onClick={onClose} className="px-4 py-2 text-gray-400 hover:text-white text-sm">Batal</button>
          <button onClick={handleSave} disabled={saving || !content.trim()}
            className="px-5 py-2 rounded-lg font-medium text-white text-sm disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #667eea, #764ba2)' }}>
            {saving ? 'Mengenkripsi...' : '🔐 Simpan Terenkripsi'}
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// NOTE CARD — tampilkan ukuran + waktu enkripsi/dekripsi
// =============================================================================
function NoteCard({ note, onEdit, onDelete }) {
  const size = getTextSize(note.plaintext || '');

  const sizeColor =
    size.kb > 500 ? 'text-red-400' :
    size.kb > 100 ? 'text-yellow-400' :
    size.kb > 10  ? 'text-blue-400' : 'text-green-400';

  return (
    <div className="rounded-xl p-5 cursor-pointer group transition-all hover:scale-[1.02]"
         style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
         onClick={() => onEdit(note)}>
      {/* Baris atas: status + ukuran */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-green-400 font-mono">🔓 Terdekripsi</span>
        <span className={`text-xs font-mono font-bold ${sizeColor}`}>
          {size.displayKB}
        </span>
      </div>

      {/* Preview isi */}
      <p className="text-gray-300 text-sm leading-relaxed line-clamp-3 whitespace-pre-wrap">
        {note.plaintext?.slice(0, 120)}{note.plaintext?.length > 120 ? '...' : ''}
      </p>

      {/* Metrik enkripsi/dekripsi */}
      {note.encryptMetrics && (
        <div className="mt-3 grid grid-cols-2 gap-1">
          <div className="rounded-lg px-2 py-1 text-center"
               style={{ background: 'rgba(99,102,241,0.15)' }}>
            <p className="text-indigo-300 text-xs font-mono">⏱ Enkripsi</p>
            <p className="text-white text-xs font-bold">{note.encryptMetrics.encryptTimeMs} ms</p>
          </div>
          <div className="rounded-lg px-2 py-1 text-center"
               style={{ background: 'rgba(16,185,129,0.15)' }}>
            <p className="text-green-300 text-xs font-mono">⏱ Dekripsi</p>
            <p className="text-white text-xs font-bold">{note.decryptMetrics?.decryptTimeMs ?? '-'} ms</p>
          </div>
        </div>
      )}

      {/* Tanggal + aksi */}
      <div className="flex items-center justify-between mt-3">
        <span className="text-xs text-gray-500">
          {new Date(note.updated_at).toLocaleDateString('id-ID')}
        </span>
        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={e => { e.stopPropagation(); onEdit(note); }}
            className="px-2 py-1 rounded text-xs text-indigo-300 hover:bg-indigo-500/20">Edit</button>
          <button onClick={e => { e.stopPropagation(); onDelete(note.id); }}
            className="px-2 py-1 rounded text-xs text-red-400 hover:bg-red-500/20">Hapus</button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// PANEL BENCHMARK — pengujian ukuran 1, 10, 100, 500, 1000 KB
// =============================================================================
function BenchmarkPanel({ masterPassword }) {
  const [results, setResults] = useState([]);
  const [running, setRunning] = useState(false);
  const [currentSize, setCurrentSize] = useState(null);

  const runBenchmark = async () => {
    setRunning(true);
    setResults([]);
    const newResults = [];

    for (const targetKB of BENCHMARK_SIZES) {
      setCurrentSize(targetKB);

      // Generate teks sesuai ukuran target
      const text = generateTextOfSize(targetKB);
      const actualSize = getTextSize(text);

      // Derive key dengan salt baru
      const salt = window.crypto.getRandomValues(new Uint8Array(16));
      const aesKey = await deriveKey(masterPassword, salt);

      // ENKRIPSI + ukur waktu
      const encrypted = await encryptNote(aesKey, text, salt);

      // DEKRIPSI + ukur waktu
      const decrypted = await decryptNote(aesKey, encrypted.ciphertext, encrypted.iv);

      newResults.push({
        targetKB,
        actualKB: actualSize.kb.toFixed(2),
        actualBytes: actualSize.bytes,
        encryptTimeMs: encrypted.metrics.encryptTimeMs,
        decryptTimeMs: decrypted.metrics.decryptTimeMs,
        ciphertextBytes: encrypted.metrics.ciphertextBytes,
        throughputEncMBps: encrypted.metrics.throughputMBps,
        throughputDecMBps: decrypted.metrics.throughputMBps,
      });

      setResults([...newResults]);
    }

    setRunning(false);
    setCurrentSize(null);
  };

  const exportCSV = () => {
    const header = 'Target KB,Aktual KB,Bytes,Enkripsi (ms),Dekripsi (ms),Ciphertext Bytes,Throughput Enc (MB/s),Throughput Dec (MB/s)';
    const rows = results.map(r =>
      `${r.targetKB},${r.actualKB},${r.actualBytes},${r.encryptTimeMs},${r.decryptTimeMs},${r.ciphertextBytes},${r.throughputEncMBps},${r.throughputDecMBps}`
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'benchmark_aes_gcm.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mt-8 rounded-2xl overflow-hidden"
         style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
      {/* Header panel */}
      <div className="px-6 py-4 flex items-center justify-between"
           style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', background: 'rgba(99,102,241,0.1)' }}>
        <div>
          <h3 className="text-white font-semibold">🧪 Panel Pengujian Performa Enkripsi</h3>
          <p className="text-indigo-300 text-xs mt-0.5">AES-GCM 256-bit — Ukuran: 1, 10, 100, 500, 1000 KB</p>
        </div>
        <div className="flex gap-2">
          {results.length > 0 && (
            <button onClick={exportCSV}
              className="px-4 py-2 rounded-lg text-sm text-green-300 hover:text-white transition-colors"
              style={{ border: '1px solid rgba(16,185,129,0.3)', background: 'rgba(16,185,129,0.1)' }}>
              📥 Export CSV
            </button>
          )}
          <button onClick={runBenchmark} disabled={running}
            className="px-5 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50 transition-all"
            style={{ background: running ? '#4c1d95' : 'linear-gradient(135deg, #667eea, #764ba2)' }}>
            {running ? `Menguji ${currentSize} KB...` : '▶ Mulai Benchmark'}
          </button>
        </div>
      </div>

      {/* Progress indikator saat running */}
      {running && (
        <div className="px-6 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="flex items-center gap-3">
            <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-indigo-300 text-sm">
              Mengenkripsi & mendekripsi teks {currentSize} KB...
            </span>
          </div>
          <div className="flex gap-2 mt-2">
            {BENCHMARK_SIZES.map(kb => (
              <div key={kb} className={`h-1.5 flex-1 rounded-full transition-all ${
                results.find(r => r.targetKB === kb) ? 'bg-green-500' :
                kb === currentSize ? 'bg-indigo-400 animate-pulse' : 'bg-gray-700'
              }`} />
            ))}
          </div>
        </div>
      )}

      {/* Tabel hasil */}
      {results.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.04)' }}>
                {['Target', 'Aktual', 'Enkripsi ⏱', 'Dekripsi ⏱', 'Ciphertext Size', 'Throughput Enc', 'Throughput Dec'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-indigo-300 text-xs font-semibold font-mono">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={r.targetKB}
                    style={{ borderTop: '1px solid rgba(255,255,255,0.05)',
                             background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                  <td className="px-4 py-3 text-indigo-300 font-mono font-bold">{r.targetKB} KB</td>
                  <td className="px-4 py-3 text-gray-300 font-mono">{r.actualKB} KB</td>
                  <td className="px-4 py-3">
                    <span className="text-yellow-300 font-mono font-bold">{r.encryptTimeMs} ms</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-green-300 font-mono font-bold">{r.decryptTimeMs} ms</span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 font-mono text-xs">
                    {(r.ciphertextBytes / 1024).toFixed(2)} KB
                  </td>
                  <td className="px-4 py-3 text-blue-300 font-mono text-xs">{r.throughputEncMBps} MB/s</td>
                  <td className="px-4 py-3 text-purple-300 font-mono text-xs">{r.throughputDecMBps} MB/s</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="px-6 py-8 text-center text-gray-500 text-sm">
          Klik "Mulai Benchmark" untuk menguji performa enkripsi AES-GCM berdasarkan ukuran file.
        </div>
      )}

      {/* Penjelasan metrik */}
      {results.length > 0 && (
        <div className="px-6 py-4 grid grid-cols-2 sm:grid-cols-4 gap-3"
             style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          {[
            { label: 'Metode Pengukuran', value: 'performance.now()' },
            { label: 'Presisi', value: 'Sub-milidetik (~5μs)' },
            { label: 'Algoritma', value: 'AES-GCM 256-bit' },
            { label: 'Termasuk', value: 'Hanya AES (bukan PBKDF2)' },
          ].map(item => (
            <div key={item.label} className="rounded-lg p-3 text-center"
                 style={{ background: 'rgba(99,102,241,0.08)' }}>
              <p className="text-indigo-400 text-xs mb-1">{item.label}</p>
              <p className="text-white text-xs font-mono">{item.value}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// DASHBOARD
// =============================================================================
function Dashboard({ session, aesKey, masterPassword, onLock, onLogout }) {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingNote, setEditingNote] = useState(null);
  const [showNewNote, setShowNewNote] = useState(false);
  const [showBenchmark, setShowBenchmark] = useState(false);
  const lockTimerRef = useRef(null);

  const resetLockTimer = useCallback(() => {
    if (lockTimerRef.current) clearTimeout(lockTimerRef.current);
    lockTimerRef.current = setTimeout(onLock, AUTO_LOCK_MS);
  }, [onLock]);

  useEffect(() => {
    resetLockTimer();
    const events = ['mousedown', 'keydown', 'touchstart'];
    events.forEach(e => window.addEventListener(e, resetLockTimer));
    return () => {
      events.forEach(e => window.removeEventListener(e, resetLockTimer));
      if (lockTimerRef.current) clearTimeout(lockTimerRef.current);
    };
  }, [resetLockTimer]);

  const loadNotes = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const encryptedNotes = await fetchNotes();
      const decryptedNotes = await Promise.all(
        encryptedNotes.map(async (note) => {
          try {
            const salt = new Uint8Array(base64ToBuffer(note.salt));
            const noteKey = await deriveKey(masterPassword, salt);
            const result = await decryptNote(noteKey, note.ciphertext, note.iv);
            return { ...note, plaintext: result.plaintext, decryptMetrics: result.metrics, decryptError: false };
          } catch {
            return { ...note, plaintext: '[Gagal mendekripsi]', decryptError: true };
          }
        })
      );
      setNotes(decryptedNotes);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [masterPassword]);

  useEffect(() => { loadNotes(); }, [loadNotes]);

  const handleSaveNote = async (noteId, content) => {
    try {
      const salt = window.crypto.getRandomValues(new Uint8Array(16));
      const noteKey = await deriveKey(masterPassword, salt);
      const encrypted = await encryptNote(noteKey, content, salt);

      if (noteId) {
        await updateNote(noteId, { ciphertext: encrypted.ciphertext, iv: encrypted.iv, salt: encrypted.salt });
      } else {
        await createNote({ ciphertext: encrypted.ciphertext, iv: encrypted.iv, salt: encrypted.salt });
      }
      await loadNotes();
      return encrypted.metrics;
    } catch (err) { setError(err.message); }
  };

  const handleDeleteNote = async (noteId) => {
    if (!window.confirm('Hapus catatan ini secara permanen?')) return;
    try {
      await deleteNote(noteId);
      setNotes(prev => prev.filter(n => n.id !== noteId));
    } catch (err) { setError(err.message); }
  };

  // Filter catatan bukan sentinel
  const visibleNotes = notes.filter(n => n.plaintext !== '__zk_sentinel__');

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #0f0c29, #302b63, #24243e)' }}>
      {/* Navbar */}
      <nav className="sticky top-0 z-40 px-6 py-4"
           style={{ background: 'rgba(15,12,41,0.85)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl">🔐</span>
            <div>
              <h1 className="text-white font-bold" style={{ fontFamily: 'Georgia, serif' }}>ZeroVault</h1>
              <p className="text-indigo-400 text-xs">{sanitizeText(session?.user?.email || '')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowBenchmark(!showBenchmark)}
              className={`text-sm px-3 py-1.5 rounded-lg transition-colors ${showBenchmark ? 'text-yellow-300 bg-yellow-500/10' : 'text-indigo-300'}`}
              style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
              🧪 Benchmark
            </button>
            <span className="hidden sm:flex items-center gap-1.5 text-xs text-green-400 px-3 py-1.5 rounded-full"
                  style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)' }}>
              <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" /> Vault Terbuka
            </span>
            <button onClick={onLock} className="text-indigo-300 hover:text-white text-sm px-3 py-1.5 rounded-lg"
                    style={{ border: '1px solid rgba(255,255,255,0.1)' }}>🔒 Kunci</button>
            <button onClick={onLogout} className="text-gray-400 hover:text-red-400 text-sm">Logout</button>
          </div>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-white">Catatan Anda</h2>
            <p className="text-indigo-400 text-sm">{visibleNotes.length} catatan terenkripsi</p>
          </div>
          <button onClick={() => setShowNewNote(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-white hover:scale-105 transition-all"
            style={{ background: 'linear-gradient(135deg, #667eea, #764ba2)' }}>
            + Catatan Baru
          </button>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-500/20 border border-red-500/40">
            <p className="text-red-300 text-sm">{sanitizeText(error)}</p>
          </div>
        )}

        {loading ? (
          <div className="text-center py-20">
            <div className="w-8 h-8 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-indigo-300 text-sm">Mendekripsi catatan...</p>
          </div>
        ) : visibleNotes.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">📝</div>
            <h3 className="text-white text-xl font-semibold mb-2">Belum ada catatan</h3>
            <p className="text-indigo-300 text-sm mb-6">Buat catatan pertama — dienkripsi AES-256 di browser</p>
            <button onClick={() => setShowNewNote(true)}
              className="px-6 py-3 rounded-xl font-medium text-white"
              style={{ background: 'linear-gradient(135deg, #667eea, #764ba2)' }}>
              Buat Catatan Pertama
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {visibleNotes.map(note => (
              <NoteCard key={note.id} note={note} onEdit={setEditingNote} onDelete={handleDeleteNote} />
            ))}
          </div>
        )}

        {/* Panel Benchmark */}
        {showBenchmark && <BenchmarkPanel masterPassword={masterPassword} />}

        {/* Info keamanan */}
        <div className="mt-8 p-5 rounded-2xl"
             style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <h3 className="text-indigo-300 text-sm font-semibold mb-3">🛡️ Arsitektur Zero-Knowledge</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { icon: '🔑', label: 'PBKDF2', value: '600K iterasi' },
              { icon: '🔐', label: 'Enkripsi', value: 'AES-GCM 256' },
              { icon: '⏱', label: 'Timer', value: 'performance.now()' },
              { icon: '🚫', label: 'Server', value: 'Tanpa plaintext' },
            ].map(item => (
              <div key={item.label} className="text-center p-3 rounded-xl" style={{ background: 'rgba(99,102,241,0.1)' }}>
                <div className="text-xl mb-1">{item.icon}</div>
                <div className="text-indigo-400 text-xs font-medium">{item.label}</div>
                <div className="text-white text-xs mt-0.5">{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Modal editor */}
      {(showNewNote || editingNote) && (
        <NoteEditor note={editingNote} onSave={handleSaveNote}
          onClose={() => { setShowNewNote(false); setEditingNote(null); }} />
      )}
    </div>
  );
}

// =============================================================================
// APP ROOT — STATE MACHINE
// =============================================================================
export default function App() {
  const [appState, setAppState] = useState('loading');
  const [session, setSession] = useState(null);
  const [aesKey, setAesKey] = useState(null);
  const [masterPassword, setMasterPassword] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAppState(session ? 'unlock' : 'login');
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      if (!session) { setAesKey(null); setMasterPassword(''); setAppState('login'); }
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleLock = useCallback(() => {
    setAesKey(null); setMasterPassword(''); setAppState('unlock');
  }, []);

  const handleLogout = async () => {
    setAesKey(null); setMasterPassword('');
    await supabase.auth.signOut();
    setAppState('login');
  };

  switch (appState) {
    case 'loading': return <LoadingScreen />;
    case 'login':   return <LoginScreen onLogin={s => { setSession(s); setAppState('unlock'); }} />;
    case 'unlock':  return <UnlockVaultScreen session={session} onUnlock={(k, p) => { setAesKey(k); setMasterPassword(p); setAppState('dashboard'); }} onLogout={handleLogout} />;
    case 'dashboard': return <Dashboard session={session} aesKey={aesKey} masterPassword={masterPassword} onLock={handleLock} onLogout={handleLogout} />;
    default: return <LoadingScreen />;
  }
}