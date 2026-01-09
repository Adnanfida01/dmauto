import express from "express";
import auth from "../middleware/auth.js";
import admin from "../firebase/admin.js";

const router = express.Router();
const db = admin.firestore();

// Simple in-memory cache to reduce Firestore reads when quota is tight
const statsCache = new Map(); // userId -> { ts, data }
const CACHE_TTL_MS = 10 * 1000; // 10 seconds

async function fetchLogsWithRetry(userId) {
  const MAX_ATTEMPTS = 3;
  let attempt = 0;
  let lastErr = null;
  while (attempt < MAX_ATTEMPTS) {
    try {
      const logsSnapshot = await db.collection("logs")
        .where("userId", "==", userId)
        .limit(200)
        .get();

      const logs = [];
      logsSnapshot.forEach((doc) => logs.push(doc.data()));
      return logs;
    } catch (err) {
      lastErr = err;
      attempt += 1;
      // If quota exhausted, wait a bit longer before retrying
      const waitMs = 200 * Math.pow(2, attempt); // 400, 800, ...
      console.warn(`stats fetch attempt ${attempt} failed: ${err.code || err.message}. retrying in ${waitMs}ms`);
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  throw lastErr;
}

router.get("/", auth, async (req, res) => {
  try {
    const userId = req.user && (req.user.uid || req.user.id);
    if (!userId) {
      return res.status(400).json({ error: "Missing user id" });
    }

    // Serve from short cache if available
    const cached = statsCache.get(userId);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      return res.json(cached.data);
    }

    let logs;
    try {
      logs = await fetchLogsWithRetry(userId);
    } catch (err) {
      console.error("Error fetching stats after retries:", err);
      // If Firestore quota is exhausted, return an empty payload (avoid 429)
      if (err && (err.code === 8 || String(err).toLowerCase().includes('quota'))) {
        console.warn('Firestore quota exceeded — returning empty stats payload to keep UI functional');
        const payload = { count: 0, logs: [] };
        try { statsCache.set(userId, { ts: Date.now(), data: payload }); } catch (_) {}
        return res.json(payload);
      }
      return res.status(500).json({ error: 'Failed to fetch stats' });
    }

    // sort by timestamp desc and limit to 50
    logs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    const limited = logs.slice(0, 50);

    const payload = { count: limited.length, logs: limited };

    // cache result briefly
    try { statsCache.set(userId, { ts: Date.now(), data: payload }); } catch (_) {}

    return res.json(payload);
  } catch (err) {
    console.error("Error in /stats handler:", err);
    return res.status(500).json({ error: "Failed to fetch stats" });
  }
});

export default router;
