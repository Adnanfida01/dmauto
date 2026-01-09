// queue/redis.js
import IORedis from "ioredis";

const redisClient = new IORedis(process.env.REDIS_URL || "redis://localhost:6379");

redisClient.on("connect", () => console.log("✅ Redis connected"));
redisClient.on("error", (err) => console.error("❌ Redis error:", err));

export default redisClient; // ✅ default export
