import express from "express";
import redis from "../queue/redis.js";
import admin from "../firebase/admin.js";

const router = express.Router();
const db = admin.firestore();

router.get("/ping", (req, res) => {
  res.json({ status: "ok", timestamp: Date.now() });
});

router.get("/sessions", async (req, res) => {
  const snapshot = await db.collection("sessions").get();
  
  const sessions = snapshot.docs.map(d => ({
    id: d.id,
    ...d.data()
  }));

  res.json({ sessions });
});

router.get("/queue", async (req, res) => {
  const jobs = await redis.lrange("automation_queue", 0, -1);
  res.json({ queue_length: jobs.length, jobs });
});

router.post("/echo", (req, res) => {
  res.json({ received: req.body });
});

export default router;
