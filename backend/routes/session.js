import express from "express";
import { saveSession, getSession } from "../firebase/firestore.js";
import { verifyFirebaseToken } from "../middleware/auth.js";
import auth from "../middleware/auth.js";
import { launchBrowser } from "../puppeteer/browser.js";
import extractSession from "../puppeteer/extractSession.js";



const router = express.Router();

// Save session endpoint
router.post("/save", verifyFirebaseToken, async (req, res) => {
  try {
    const { platform, sessionData } = req.body;
    const userId = req.user.uid;
    await saveSession(userId, platform, sessionData);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get session endpoint
router.get("/:platform", verifyFirebaseToken, async (req, res) => {
  try {
    const userId = req.user.uid;
    const platform = req.params.platform;
    const session = await getSession(userId, platform);
    res.json({ session });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start an interactive login flow for a platform and save session cookies.
router.post("/login/:platform", verifyFirebaseToken, async (req, res) => {
  try {
    const userId = req.user.uid;
    const platform = req.params.platform;

    // Map platform to login URL and cookie name to detect login
    const platformConfig = {
      instagram: {
        url: "https://www.instagram.com/accounts/login/",
        cookieName: "sessionid",
      },
      linkedin: {
        url: "https://www.linkedin.com/login",
        cookieName: "li_at",
      },
    };

    const config = platformConfig[platform];
    if (!config) return res.status(400).json({ error: "Unsupported platform" });

    const browser = await launchBrowser();
    const page = await browser.newPage();
    try {
      await page.goto(config.url, { waitUntil: "domcontentloaded", timeout: 120000 });
    } catch (navErr) {
      // Don't fail immediately on navigation timeout — the page may still be interactive.
      console.warn(`interactive login: initial navigation warning for ${platform}:`, navErr.message);
    }

    // Inform developer via console log — user should login in the opened browser window
    console.log(`Please complete login for ${platform} in the opened browser window.`);

    // Poll for the expected cookie up to timeout. We continue even if initial navigation timed out.
    const timeoutMs = 120000; // 2 minutes
    const pollInterval = 1500;
    const start = Date.now();
    let found = false;
    while (Date.now() - start < timeoutMs) {
      const cookies = await page.cookies();
      if (cookies.some((c) => c.name === config.cookieName)) {
        found = true;
        break;
      }
      await new Promise((r) => setTimeout(r, pollInterval));
    }

    if (!found) {
      await browser.close();
      return res.status(408).json({ error: "Login timeout or cookie not found" });
    }

    const session = await extractSession(page);
    await saveSession(userId, platform, session);
    await browser.close();
    return res.json({ success: true });
  } catch (err) {
    console.error("Error in interactive login:", err);
    return res.status(500).json({ error: err.message });
  }
});

export default router;
