import express from "express";
import redis from "../queue/redis.js";
import auth from "../middleware/auth.js"; // works now
import { logAutomation } from "../firebase/firestore.js";


const router = express.Router();

router.post("/run", auth, async (req, res) => {
  redis.rpush("automation_queue", JSON.stringify({
    userId: req.user.uid || req.user.id,
    platform: req.body.platform
  }));
  res.json({ queued: true });
});
 
// Start a full automation job with leads and message template
router.post("/start", auth, async (req, res) => {
  try {
    const userId = req.user.uid || req.user.id;
    const { platform, leads, template, fromName, openaiKey } = req.body;
    // Debug: log incoming payload so we can verify frontend requests
    console.log('/automation/start received payload for user:', userId, 'payload keys:', Object.keys(req.body || {}));
    console.log('/automation/start full body:', JSON.stringify(req.body || {}));
    if (!platform) return res.status(400).json({ error: "Missing platform" });

    const job = { userId, platform, leads: leads || [], template: template || "", fromName: fromName || "", openaiKey: openaiKey || null };
    redis.rpush("automation_queue", JSON.stringify(job));
    // log queued event so frontend shows something immediately
    try {
      await logAutomation(userId, platform, {
        status: "queued",
        queuedCount: (leads || []).length,
        timestamp: Date.now(),
      });
    } catch (e) {
      console.error('logAutomation enqueue error', e);
    }
    return res.json({ queued: true });
  } catch (err) {
    console.error("/automation/start error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// Debug helper: unauthenticated enqueue endpoint for local testing only
router.post("/debug-start", async (req, res) => {
  try {
    console.log('/automation/debug-start received payload keys:', Object.keys(req.body || {}));
    console.log('/automation/debug-start full body:', JSON.stringify(req.body || {}));
    const job = { userId: req.body.userId || 'debug', platform: req.body.platform || 'instagram', leads: req.body.leads || [] };
    await redis.rpush("automation_queue", JSON.stringify(job));
    return res.json({ queued: true, debug: true });
  } catch (err) {
    console.error('/automation/debug-start error', err && err.stack ? err.stack : err);
    return res.status(500).json({ error: err && err.message });
  }
});

export default router;
