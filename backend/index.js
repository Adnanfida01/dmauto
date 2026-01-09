// index.js — main backend server

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createClient } from "redis";
import admin from "./firebase/admin.js"; // Firebase Admin initialization
import sessionRoutes from "./routes/session.js";
import automationRoutes from "./routes/automation.js";
import debugRoutes from "./routes/debug.js";
import statsRoutes from "./routes/stats.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middlewares
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "10mb" }));

// Routes
app.use("/session", sessionRoutes);
app.use("/automation", automationRoutes);
app.use("/debug", debugRoutes);
app.use("/stats", statsRoutes);

// Redis connection
let redisClient;

(async () => {
  redisClient = createClient({ url: process.env.REDIS_URL || "redis://localhost:6379" });
  redisClient.on("error", (err) => console.error("Redis Client Error", err));
  await redisClient.connect();
  console.log("✅ Connected to Redis");
})();

// Firebase Admin check
try {
  const db = admin.firestore();
  console.log("✅ Firebase Admin initialized");
} catch (err) {
  console.error("❌ Firebase Admin error:", err.message);
}

// Health check
app.get("/", (req, res) => {
  res.send("DMAuto Backend running ✅");
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

// Optionally start the worker process alongside the server for convenience during debugging.
// This will spawn a separate Node process that runs `queue/worker.js` so you don't need
// to run it manually in another terminal.
import { spawn } from 'child_process';
// Auto-start worker only when explicitly enabled via env var AUTO_START_WORKER=1
if (process.env.AUTO_START_WORKER === '1') {
  try {
    const worker = spawn(process.execPath, ["queue/worker.js"], { stdio: 'inherit', cwd: process.cwd(), env: process.env });
    worker.on('error', (e) => console.error('Worker spawn error', e));
    worker.on('exit', (code, sig) => console.log('Worker exited', code, sig));
    console.log('✅ Worker process started (attached to server process)');
  } catch (e) {
    console.error('Failed to start worker process automatically:', e);
  }
} else {
  console.log('Worker auto-start disabled. Start worker manually with: node queue/worker.js');
}
