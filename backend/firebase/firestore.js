// firebase/firestore.js
import admin from "./admin.js";
import fs from 'fs';
import path from 'path';

const db = admin.firestore();

// In-memory cache for sessions to allow reads when Firestore is temporarily unavailable.
const sessionsCache = new Map(); // key: `${userId}:${platform}` -> session

// Local JSON DB files (used when USE_LOCAL_DB=1)
const LOCAL_DIR = path.resolve(process.cwd(), 'backend', 'local_db');
// Enable local DB either via env flag or if the local_dir already exists (helps when env wasn't set)
const USE_LOCAL = (process.env.USE_LOCAL_DB === '1' || process.env.LOCAL_DB === '1' || (fs.existsSync && fs.existsSync(LOCAL_DIR)));

// Log mode for easier troubleshooting
try { console.log('firestore.js: USE_LOCAL_DB =', USE_LOCAL); } catch (e) {}
const SESSIONS_FILE = path.join(LOCAL_DIR, 'sessions.json');
const LOGS_FILE = path.join(LOCAL_DIR, 'logs.json');

async function ensureLocalDir() {
  try {
    if (!fs.existsSync(LOCAL_DIR)) fs.mkdirSync(LOCAL_DIR, { recursive: true });
    if (!fs.existsSync(SESSIONS_FILE)) fs.writeFileSync(SESSIONS_FILE, JSON.stringify({}), 'utf8');
    if (!fs.existsSync(LOGS_FILE)) fs.writeFileSync(LOGS_FILE, JSON.stringify([]), 'utf8');
  } catch (e) {
    console.warn('ensureLocalDir error', e && e.message);
  }
}

async function readLocalSessions() {
  try {
    await ensureLocalDir();
    const txt = fs.readFileSync(SESSIONS_FILE, 'utf8');
    return JSON.parse(txt || '{}');
  } catch (e) {
    console.warn('readLocalSessions error', e && e.message);
    return {};
  }
}

async function writeLocalSessions(data) {
  try {
    await ensureLocalDir();
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.warn('writeLocalSessions error', e && e.message);
  }
}

async function appendLocalLog(entry) {
  try {
    await ensureLocalDir();
    const txt = fs.readFileSync(LOGS_FILE, 'utf8');
    let arr = [];
    try {
      arr = JSON.parse(txt || '[]');
      if (!Array.isArray(arr)) arr = [];
    } catch (parseErr) {
      // Try to salvage trailing partial JSON by trimming to last closing bracket
      try {
        const idx = (txt || '').lastIndexOf(']');
        if (idx !== -1) {
          const trimmed = txt.slice(0, idx + 1);
          arr = JSON.parse(trimmed || '[]');
          if (!Array.isArray(arr)) arr = [];
        } else {
          arr = [];
        }
      } catch (salvErr) {
        arr = [];
      }
    }
    arr.push(entry);
    fs.writeFileSync(LOGS_FILE, JSON.stringify(arr, null, 2), 'utf8');
  } catch (e) {
    console.warn('appendLocalLog error', e && e.message);
  }
}

// Save user session to Firestore
export async function saveSession(userId, platform, sessionData) {
  if (!userId || !platform) throw new Error("Missing userId or platform");
  const ref = db.collection("sessions").doc(userId);
  // Remove any undefined values from session data to avoid Firestore errors.
  const removeUndefined = (value) => {
    if (Array.isArray(value)) {
      return value.map((v) => removeUndefined(v));
    }
    if (value && typeof value === "object") {
      const out = {};
      for (const [k, v] of Object.entries(value)) {
        if (v === undefined) continue;
        out[k] = removeUndefined(v);
      }
      return out;
    }
    return value;
  };

  const cleaned = removeUndefined(sessionData);
  if (USE_LOCAL) {
    const sessions = await readLocalSessions();
    sessions[userId] = sessions[userId] || {};
    sessions[userId][platform] = cleaned;
    await writeLocalSessions(sessions);
    try { sessionsCache.set(`${userId}:${platform}`, cleaned); } catch (_) {}
    return;
  }

  await ref.set({ [platform]: cleaned }, { merge: true });
  try {
    sessionsCache.set(`${userId}:${platform}`, cleaned);
  } catch (_) {}
}

// Get user session from Firestore
export async function getSession(userId, platform) {
  if (!userId || !platform) throw new Error("Missing userId or platform");
  const ref = db.collection("sessions").doc(userId);
  if (USE_LOCAL) {
    const sessions = await readLocalSessions();
    const user = sessions[userId] || null;
    const val = user ? (user[platform] || null) : null;
    try { if (val) sessionsCache.set(`${userId}:${platform}`, val); } catch (_) {}
    return val;
  }

  try {
    const doc = await ref.get();
    if (!doc.exists) return null;
    const val = doc.data()[platform] || null;
    // update cache
    try { if (val) sessionsCache.set(`${userId}:${platform}`, val); } catch (_) {}
    return val;
  } catch (err) {
    console.warn('getSession: Firestore read failed, returning cached session if available', err && err.message);
    const cached = sessionsCache.get(`${userId}:${platform}`) || null;
    return cached;
  }
}

// Log automation actions/results for a user
export async function logAutomation(userId, platform, data) {
  if (!userId || !platform) throw new Error("Missing userId or platform");
  const ref = db.collection("logs");
  if (USE_LOCAL) {
    // append to local logs file
    const entry = { userId, platform, ...data };
    await appendLocalLog(entry);
    return;
  }
  await ref.add({ userId, platform, ...data });
}
