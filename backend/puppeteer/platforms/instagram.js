import { launchBrowser } from "../browser.js";
import injectSession from "../injectSession.js";
import extractSession from "../extractSession.js";
import saveScreenshot from "../saveScreenshot.js";
import generateMessage from "../../utils/generateMessage.js";
import { getSession, saveSession, logAutomation } from "../../firebase/firestore.js";
import safeWait from "../../utils/safeWait.js";

function extractUsername(str) {
  if (!str) return null;
  const s = String(str).trim();
  try {
    const u = new URL(s);
    const parts = u.pathname.replace(/\/+$/, '').split('/');
    return parts[parts.length - 1] || null;
  } catch (_) {
    return s.replace(/^@/, '').trim();
  }
}

export default async function runInstagram(job, browserOrPage) {
  const { userId, leads, template, fromName, openaiKey } = job;
  let browser = null;
  let page = null;
  let createdBrowser = false;

  try {
    // Setup browser and page
    if (browserOrPage) {
      if (typeof browserOrPage.newPage === "function") {
        browser = browserOrPage;
        page = await browser.newPage();
      } else {
        page = browserOrPage;
      }
    }

    if (!page) {
      browser = await launchBrowser({ headless: false });
      createdBrowser = true;
      page = await browser.newPage();
    }

    page.setDefaultNavigationTimeout(60000);
    page.setDefaultTimeout(60000);
    await page.setViewport({ width: 1200, height: 800 });

    // Inject cookies from database
    const session = await getSession(userId, "instagram");
    if (session) {
      try {
        console.log("[Instagram] Injecting cookies for user:", userId);
        await injectSession(page, session, { platform: "instagram" });
        await page.goto("https://www.instagram.com", { waitUntil: "networkidle2" });
        await safeWait(page, 3000);
        
        // Verify we're logged in
        const isLoggedIn = await page.evaluate(() => {
          return !document.querySelector('input[type="password"]');
        });
        
        console.log("[Instagram] Session check - logged in:", isLoggedIn);
        
        const updatedSession = await extractSession(page);
        await saveSession(userId, "instagram", updatedSession);
        console.log("[Instagram] Cookies injected and saved");
      } catch (err) {
        console.error("[Instagram] Cookie injection error:", err.message);
      }
    }

    // Validate leads
    if (!Array.isArray(leads) || leads.length === 0) {
      console.log("[Instagram] No leads provided");
      if (createdBrowser && browser) await browser.close();
      return;
    }

    console.log(`[Instagram] Starting DM automation for ${leads.length} leads`);

    // Process each lead
    for (let i = 0; i < leads.length; i++) {
      const lead = leads[i];
      if (!lead) continue;

      const raw = lead.username || lead.profileUrl || '';
      const username = extractUsername(raw) || String(raw).trim();
      
      if (!username) {
        console.warn(`[Instagram] Lead ${i}: missing username, skipping`);
        continue;
      }

      const message = await generateMessage(lead, template, openaiKey);
      console.log(`[Instagram] [${i + 1}/${leads.length}] Sending DM to: ${username}`);

      try {
        // Step 1: Open inbox
        console.log(`[Instagram] [${i + 1}/${leads.length}] Opening inbox...`);
        await page.goto("https://www.instagram.com/direct/inbox/?hl=en", { waitUntil: "networkidle2", timeout: 60000 });
        await safeWait(page, 2000);

        // Step 2: Find search input
        console.log(`[Instagram] [${i + 1}/${leads.length}] Finding search input...`);
        const searchInput = await page.$('input[name="searchInput"]');
        if (!searchInput) {
          await saveScreenshot(page, `insta-no-search-${i}-${Date.now()}`);
          throw new Error("Search input not found");
        }

        // Step 3: Type username and wait for results
        console.log(`[Instagram] [${i + 1}/${leads.length}] Typing username: ${username}`);
        await searchInput.click();
        await safeWait(page, 300);
        await searchInput.focus();
        await page.evaluate(el => el.value = "", searchInput);
        await page.keyboard.type(String(username).trim(), { delay: 50 });
        await safeWait(page, 2500);

        // Step 4: Click first profile result
        console.log(`[Instagram] [${i + 1}/${leads.length}] Clicking first profile...`);
        const clicked = await page.evaluate((uname) => {
          const target = String(uname || '').toLowerCase().replace(/^@/, '').trim();
          // Prefer buttons that contain the exact username text
          const buttons = Array.from(document.querySelectorAll('div[role="button"]'));
          for (const btn of buttons) {
            const txt = (btn.innerText || '').trim().toLowerCase();
            if (!txt) continue;
            // check lines and spans for exact username match
            const lines = txt.split('\n').map(l => l.trim()).filter(Boolean);
            if (lines.includes(target)) {
              btn.click();
              return true;
            }
            const spans = Array.from(btn.querySelectorAll('span'));
            for (const s of spans) {
              const sText = (s.innerText || '').trim().toLowerCase();
              if (sText === target || sText.includes(target)) {
                btn.click();
                return true;
              }
            }
          }
          // fallback: click first non-empty, non-search button
          for (const btn of buttons) {
            const text = (btn.innerText || '').trim();
            if (text && !text.toLowerCase().includes('search')) {
              btn.click();
              return true;
            }
          }
          return false;
        }, username);

        if (!clicked) {
          await saveScreenshot(page, `insta-no-profile-${i}-${Date.now()}`);
          throw new Error("Could not click profile result");
        }
        await safeWait(page, 2000);
        
        // Check for login modal (DOM-safe: check for password inputs and button text)
        const hasLoginModal = await page.evaluate(() => {
          if (document.querySelector('input[type="password"]')) return true;
          const btns = Array.from(document.querySelectorAll('button, div[role="button"]'));
          for (const b of btns) {
            const t = (b.innerText || b.textContent || '').trim().toLowerCase();
            if (t.includes('log in') || t.includes('log in')) return true;
          }
          return false;
        });

        if (hasLoginModal) {
          console.warn(`[Instagram] [${i + 1}/${leads.length}] Login modal detected - session expired, attempting one retry`);
          await saveScreenshot(page, `insta-login-modal-${i}-${Date.now()}`);

          // Try re-injecting session and retry flow once
          try {
            const sessionRetry = await getSession(userId, "instagram");
            if (sessionRetry) {
              await injectSession(page, sessionRetry, { platform: "instagram" });
              await page.goto("https://www.instagram.com/direct/inbox/?hl=en", { waitUntil: "networkidle2" });
              await safeWait(page, 2500);

              // verify logged in
              const stillLoggedIn = await page.evaluate(() => !document.querySelector('input[type="password"]'));
              console.log(`[Instagram] Retry session check - logged in:`, stillLoggedIn);
              if (!stillLoggedIn) throw new Error('Retry session invalid');

              // redo search + click first profile
              const searchInput2 = await page.$('input[name="searchInput"]');
              if (!searchInput2) throw new Error('Search input not found on retry');
              await searchInput2.click();
              await safeWait(page, 300);
              await searchInput2.focus();
              await page.evaluate(el => el.value = "", searchInput2);
              await page.keyboard.type(String(username).trim(), { delay: 50 });
              await safeWait(page, 2500);

              const clickedRetry = await page.evaluate((uname) => {
                const target = String(uname || '').toLowerCase().replace(/^@/, '').trim();
                const buttons = Array.from(document.querySelectorAll('div[role="button"]'));
                for (const btn of buttons) {
                  const txt = (btn.innerText || '').trim().toLowerCase();
                  if (!txt) continue;
                  const lines = txt.split('\n').map(l => l.trim()).filter(Boolean);
                  if (lines.includes(target)) {
                    btn.click();
                    return true;
                  }
                  const spans = Array.from(btn.querySelectorAll('span'));
                  for (const s of spans) {
                    const sText = (s.innerText || '').trim().toLowerCase();
                    if (sText === target || sText.includes(target)) {
                      btn.click();
                      return true;
                    }
                  }
                }
                for (const btn of buttons) {
                  const text = (btn.innerText || '').trim();
                  if (text && !text.toLowerCase().includes('search')) {
                    btn.click();
                    return true;
                  }
                }
                return false;
              }, username);

              if (!clickedRetry) throw new Error('Could not click profile result on retry');

              await safeWait(page, 2000);
              // continue normal flow (will look for message input next)
            } else {
              throw new Error('No session available for retry');
            }
          } catch (retryErr) {
            console.error(`[Instagram] Retry failed: ${retryErr.message}`);
            throw new Error('Session expired - login required');
          }
        }

        // Step 5: Find message input
        console.log(`[Instagram] [${i + 1}/${leads.length}] Finding message input...`);
        const msgInput = await page.$('div[aria-label="Message"][contenteditable="true"]');
        if (!msgInput) {
          await saveScreenshot(page, `insta-no-msg-${i}-${Date.now()}`);
          throw new Error("Message input not found");
        }

        // Step 6: Type message
        console.log(`[Instagram] [${i + 1}/${leads.length}] Typing message...`);
        await msgInput.click();
        await safeWait(page, 300);
        await msgInput.focus();
        await page.keyboard.type(String(message || "").trim(), { delay: 25 });
        await safeWait(page, 1000);

        // Step 7: Find and click Send button (use document.evaluate via page.evaluate to avoid page.$x)
        console.log(`[Instagram] [${i + 1}/${leads.length}] Finding Send button...`);
        const sendXpath = "//div[(translate(normalize-space(.),'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz')='send' or contains(translate(normalize-space(.),'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),' send') or contains(translate(normalize-space(.),'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'send ')) and (@role='button' or name()='button')]";
        const sendXpath2 = "//div[@role='button' and contains(translate(normalize-space(.),'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'send')]";

        const clickedSend = await page.evaluate((xp1, xp2) => {
          function clickFirst(xpath) {
            try {
              const it = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
              const node = it && it.singleNodeValue;
              if (node) { node.click(); return true; }
            } catch (e) {}
            return false;
          }
          if (clickFirst(xp1)) return true;
          if (clickFirst(xp2)) return true;
          // fallback: find any role=button div with exact 'Send' text
          const btns = Array.from(document.querySelectorAll('div[role="button"]'));
          for (const b of btns) {
            if ((b.innerText || '').trim() === 'Send') { b.click(); return true; }
          }
          return false;
        }, sendXpath, sendXpath2);

        if (clickedSend) {
          await safeWait(page, 1200);
          console.log(`[Instagram] [${i + 1}/${leads.length}] Clicked Send button`);
        } else {
          console.log(`[Instagram] [${i + 1}/${leads.length}] Send button not found, pressing Enter as fallback`);
          await page.keyboard.press('Enter');
          await safeWait(page, 1200);
        }

        // Log success
        await logAutomation(userId, "instagram", {
          status: "sent",
          lead: username,
          message: message || "",
          index: i + 1,
          timestamp: Date.now()
        });

        console.log(`[Instagram] [${i + 1}/${leads.length}] ✅ DM sent successfully`);

      } catch (err) {
        console.error(`[Instagram] [${i + 1}/${leads.length}] ❌ Error: ${err.message}`);
        await saveScreenshot(page, `insta-error-${i}-${Date.now()}`).catch(() => null);

        await logAutomation(userId, "instagram", {
          status: "error",
          lead: username,
          error: err.message,
          index: i + 1,
          timestamp: Date.now()
        });
      }
    }

    console.log("[Instagram] Automation completed");

  } catch (fatalErr) {
    console.error("[Instagram] Fatal error:", fatalErr.message);
  } finally {
    if (createdBrowser && browser) {
      try {
        await browser.close();
      } catch (e) {
        console.warn("[Instagram] Browser close error:", e.message);
      }
    }
  }
}
