import { launchBrowser } from "../browser.js";
import injectSession from "../injectSession.js";
import extractSession from "../extractSession.js";
import saveScreenshot from "../saveScreenshot.js";
import generateMessage from "../../utils/generateMessage.js";
import { getSession, saveSession, logAutomation } from "../../firebase/firestore.js";
import safeWait from '../../utils/safeWait.js';

export default async function runLinkedin(job, browserOrPage) {
  const { userId, leads, template, fromName, openaiKey } = job;
  let browser = null;
  let page = null;
  let createdBrowser = false;
  let createdPage = false;

  if (browserOrPage) {
    if (typeof browserOrPage.newPage === 'function') {
      browser = browserOrPage;
      page = await browser.newPage();
      createdPage = true;
    } else if (typeof browserOrPage.goto === 'function') {
      page = browserOrPage;
    }
  }

  if (!page) {
    browser = await launchBrowser({ headless: false });
    createdBrowser = true;
    page = await browser.newPage();
    createdPage = true;
  }

  // increase timeouts for slow pages
  page.setDefaultNavigationTimeout(60000);
  page.setDefaultTimeout(60000);
  await page.setViewport({ width: 1200, height: 800 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0 Safari/537.36');
  let isLoggedIn = false;

  // Only inject cookies and navigate if we created the page/browser here
  if (createdPage) {
    const session = await getSession(userId, "linkedin");
    if (session) {
      try {
        const res = await injectSession(page, session, { platform: 'linkedin' });
        console.log('linkedin inject result:', res);
        if (!res || !res.verified) {
          console.warn('injectSession did not verify linkedin session');
          await logAutomation(userId, 'linkedin', { status: 'inject_unverified', timestamp: Date.now(), details: res });
        }
      } catch (e) {
        console.error('injectSession error', e);
        await logAutomation(userId, 'linkedin', { status: 'inject_error', error: e.message, timestamp: Date.now() });
      }
    }

    // Robust navigation: try feed, fallback to homepage, with retries and longer timeouts
    const tryNavigate = async () => {
      const targets = [
        { url: 'https://www.linkedin.com/feed/', opts: { waitUntil: 'networkidle2', timeout: 60000 } },
        { url: 'https://www.linkedin.com/', opts: { waitUntil: 'domcontentloaded', timeout: 120000 } }
      ];
      for (const t of targets) {
        try {
          await page.goto(t.url, t.opts);
          return { ok: true, url: t.url };
        } catch (e) {
          console.warn('LinkedIn initial navigation to', t.url, 'failed:', e && e.message);
          // small wait before next attempt
          try { await safeWait(page, 1200); } catch(e){}
        }
      }
      return { ok: false };
    };

    const navResult = await tryNavigate();
    if (!navResult.ok) {
      console.warn('[LinkedIn] Initial navigation failed for all targets; continuing but login detection may fail');
      await logAutomation(userId, 'linkedin', { status: 'nav_failed', timestamp: Date.now() });
    }

    // If LinkedIn shows an account chooser (user tile), try clicking the shown account to complete login.
    // Use in-page JS to find the best match (masked email or tile with image + short text) and click it.
    const tryClickAccountTile = async (pg) => {
      try {
        // first, try a direct in-page click for any element containing an @ (masked email like d*****@gmail.com)
        const clicked = await pg.evaluate(() => {
          const els = Array.from(document.querySelectorAll('button, a, div, span'));
          for (const el of els) {
            try {
              const txt = (el.innerText || '').trim();
              if (!txt) continue;
              // likely account chooser shows a masked or full email containing '@'
              if (txt.indexOf('@') !== -1) { el.click(); return { ok: true, reason: 'email_match', txt: txt.slice(0,80) }; }
              // small tile with an img and short name/email
              if (el.querySelector && el.querySelector('img') && txt.length > 0 && txt.length < 60) { el.click(); return { ok: true, reason: 'img_tile', txt: txt.slice(0,80) }; }
            } catch (e) { /* ignore element errors */ }
          }
          return { ok: false };
        }).catch(()=>({ok:false}));
        if (clicked && clicked.ok) {
          try { await safeWait(pg, 1200); } catch(e){}
          try { await saveScreenshot(pg, `linkedin-account-chooser-${Date.now()}`); } catch(e){}
          return true;
        }

        // fallback: try searching for text nodes with 'Sign in using another account' and click nearby
        const fallbackClicked = await pg.evaluate(() => {
          const nodes = Array.from(document.querySelectorAll('button, a, div'));
          for (const n of nodes) {
            try {
              const t = (n.innerText || '').toLowerCase();
              if (t.includes('sign in using another') || t.includes('choose an account') || t.includes('continue as')) { n.click(); return true; }
            } catch(e){}
          }
          return false;
        }).catch(()=>false);
        if (fallbackClicked) {
          try { await safeWait(pg, 1000); } catch(e){}
          try { await saveScreenshot(pg, `linkedin-account-chooser-fallback-${Date.now()}`); } catch(e){}
          return true;
        }
      } catch(e){}
      return false;
    };

    try { await tryClickAccountTile(page); } catch(e) { console.warn('tryClickAccountTile error', e && e.message); }

    const isLoggedIn = await page.evaluate(() => {
      return !!document.querySelector("img.global-nav__me-photo");
    });

    if (!isLoggedIn) {
      console.log("⚠️ LinkedIn: Not logged in — manual login required.");
      await logAutomation(userId, 'linkedin', { status: 'not_logged_in', timestamp: Date.now() });
    }

    // Save new session
    const newSession = await extractSession(page);
    await saveSession(userId, "linkedin", newSession);
  } else {
    console.log('LinkedIn runner: page provided by worker — skipping injection/navigation');
    // If the worker provided a page, it may be on a login chooser page (redirected).
    // Detect common login-redirect URL and try to click the displayed account tile to complete login.
    try {
      let currentUrl = '';
      try { currentUrl = page.url(); } catch (e) { currentUrl = ''; }
      if (currentUrl && currentUrl.includes('/uas/login')) {
        console.log('LinkedIn runner: detected login chooser URL — attempting to click account tile');
        const clicked = await page.evaluate(() => {
          const els = Array.from(document.querySelectorAll('button, a, div, span'));
          for (const el of els) {
            try {
              const txt = (el.innerText || '').trim();
              if (!txt) continue;
              if (txt.indexOf('@') !== -1) { el.click(); return true; }
              if (el.querySelector && el.querySelector('img') && txt.length > 0 && txt.length < 120) { el.click(); return true; }
            } catch (e) {}
          }
          // also try clickable list items
          const lis = Array.from(document.querySelectorAll('li'));
          for (const l of lis) {
            try { const t = (l.innerText || '').trim(); if (t.indexOf('@') !== -1) { l.click(); return true; } } catch(e){}
          }
          return false;
        }).catch(()=>false);
        if (clicked) {
          console.log('LinkedIn runner: clicked chooser tile, waiting for navigation');
          try { await safeWait(page, 1500); } catch(e){}
          try { await page.reload({ waitUntil: 'networkidle2', timeout: 60000 }); } catch(e){}
        } else {
          console.log('LinkedIn runner: chooser tile not found on page');
        }
      }
    } catch (e) { console.warn('LinkedIn chooser click attempt error', e && e.message); }
  }

  if (Array.isArray(leads) && leads.length > 0) {
    for (const lead of leads) {
      console.log('LinkedIn: processing lead', lead && (lead.profileUrl || lead.username));
      try {
        // skip leads that aren't for this platform (if lead specifies platform)
        if (lead && lead.platform && String(lead.platform).toLowerCase() !== 'linkedin') {
          await logAutomation(userId, 'linkedin', { status: 'skipped', reason: 'platform_mismatch', lead, timestamp: Date.now() });
          continue;
        }
        if (!lead) throw new Error('Missing lead data');
        // Normalize profileUrl or build from username
        let profileUrlRaw = lead.profileUrl || lead.username || (lead.raw && (lead.raw.profileUrl || lead.raw.url));
        if (!profileUrlRaw) throw new Error('No profile URL/username for lead');
        let profileUrl = String(profileUrlRaw).trim();
        // remove accidental leading slashes that make URL relative to current origin
        while (profileUrl.startsWith('/')) profileUrl = profileUrl.slice(1);
        if (!/^https?:\/\//i.test(profileUrl)) {
          // not absolute — assume linkedin username
          profileUrl = `https://www.linkedin.com/in/${String(profileUrl).replace(/^@/, '')}`;
        }
        // If this lead only provided a username (no linkedin domain in profileUrl),
        // prefer opening the messaging compose dialog and selecting the recipient by name.
        const usernameOnly = !!lead.username && !(lead.profileUrl && /linkedin\.com/i.test(String(lead.profileUrl)));
        if (usernameOnly) {
          try {
            console.log('LinkedIn: username-only lead — opening compose and selecting recipient', lead.username);
            await page.goto('https://www.linkedin.com/messaging/compose/', { waitUntil: 'networkidle2' });
            await safeWait(page, 800);
            // try several selectors for the recipient search box
            const recipientSelectors = [
              'input[placeholder*="Type a name"]',
              'input[placeholder*="Type a name or multiple names"]',
              'input[placeholder*="Search"]',
              'input[aria-label*="Search"]',
              'input[role="combobox"]',
              'input[type="text"]',
              'input[name="recipients"]',
              '.msg-connections-typeahead__search-field',
              '.msg-connections-typeahead__input'
            ];
            let rec = null;
            for (const s of recipientSelectors) {
              try { rec = await page.$(s); if (rec) break; } catch(e) {}
            }
            if (!rec) throw new Error('Compose recipient input not found');
            await rec.click({ clickCount: 3 }).catch(()=>{});
            await rec.focus();
            await page.keyboard.type(String(lead.username), { delay: 60 });
            await safeWait(page, 1000);
            // try to select the first suggestion: prefer clicking suggestion list, fallback to keyboard
            let picked = false;
            try {
              const suggestionSelectors = ['div[role="listbox"] li', 'div[role="option"]', '.msg-connections-typeahead__suggestion', '.send-to-picker__item'];
              for (const ss of suggestionSelectors) {
                const sEl = await page.$(ss).catch(()=>null);
                if (sEl) { try { await sEl.click(); picked = true; break; } catch(e){} }
              }
            } catch(e){}
            if (!picked) {
              try { await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter'); await safeWait(page, 800); } catch(e){}
            }

            // now find message input and send
            const findMsg = async () => {
              const sels = ['[contenteditable="true"]', 'textarea', '[role="textbox"]', 'div.msg-form__contenteditable', 'div.msg-form__textarea'];
              for (const s of sels) { try { const el = await page.$(s); if (el) return el; } catch(e) {} }
              return null;
            };
            const editor = await findMsg();
            const msg = await generateMessage(lead, template, openaiKey);
            if (!editor) throw new Error('Message editor not found in compose');
            await editor.focus();
            await page.keyboard.type(msg || '', { delay: 30 });
            // try send button or press Enter
            try {
              const sendSel = await page.$('button.msg-form__send-button, button[aria-label="Send"]');
              if (sendSel) await sendSel.click();
              else await page.keyboard.press('Enter');
            } catch(e) { try { await page.keyboard.press('Enter'); } catch(e){} }
            await safeWait(page, 800);
            await logAutomation(userId, 'linkedin', { status: 'sent', lead, message: msg || '', timestamp: Date.now() });
            continue; // next lead
          } catch (e) {
            console.warn('LinkedIn compose flow for username-only lead failed', e && e.message);
            // fall through to profile navigation attempt below
          }
        }

        // helper: retry navigation a few times for flaky network
        let navOk = false;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
            navOk = true;
            break;
          } catch (e) {
            console.warn('linkedin goto attempt', attempt + 1, 'failed', e.message);
            if (attempt === 2) throw e;
            await safeWait(page, 1500);
          }
        }
        if (!navOk) throw new Error('Navigation failed');
        // Wait for profile to be ready: check for Message button or profile name
        const waitForProfileReady = async (pg) => {
          for (let i = 0; i < 20; i++) {
            const hasBtn = await pg.evaluate(() => {
              const btns = Array.from(document.querySelectorAll('button'));
              return btns.some(b => /message/i.test((b.innerText || '').trim()));
            }).catch(() => false);
            const name = await pg.$('h1, h2, .text-body-medium, .pv-top-card--list').catch(() => null);
            if (hasBtn || name) return true;
            await safeWait(pg, 700);
          }
          // try a reload once and wait again
          try { await pg.reload({ waitUntil: 'domcontentloaded', timeout: 60000 }); } catch (e) {}
          for (let i = 0; i < 15; i++) {
            const hasBtn = await pg.evaluate(() => {
              const btns = Array.from(document.querySelectorAll('button'));
              return btns.some(b => /message/i.test((b.innerText || '').trim()));
            }).catch(() => false);
            const name = await pg.$('h1, h2, .text-body-medium, .pv-top-card--list').catch(() => null);
            if (hasBtn || name) return true;
            await safeWait(pg, 700);
          }
          return false;
        };

        const ready = await waitForProfileReady(page);
        if (!ready) {
          const shot = await saveScreenshot(page, `linkedin-ready-${userId}`);
          const pageHtml = await page.content().catch(() => null);
          await logAutomation(userId, 'linkedin', { status: 'profile_not_ready', profileUrl, screenshot: shot, pageHtml: pageHtml ? pageHtml.slice(0,10000) : null, timestamp: Date.now() });
          throw new Error('Profile UI not ready');
        }

        // click Message button on profile
        console.log('LinkedIn: searching for Message button on profile');
        // try clicking a visible Message button (match by text)
        const btns = await page.$$('button');
        let clicked = false;
        for (const b of btns) {
          try {
            const txt = await page.evaluate(el => (el.innerText || '').trim(), b).catch(() => '');
            if (/message/i.test(txt)) { await b.click().catch(() => {}); clicked = true; break; }
          } catch(e){}
        }
        if (clicked) console.log('LinkedIn: clicked Message button');
        if (clicked) {
          await safeWait(page, 800);
        } else {
          // go to compose messaging as a fallback
          console.log('LinkedIn: Message button not found, opening compose URL fallback');
          await page.goto('https://www.linkedin.com/messaging/compose/', { waitUntil: 'networkidle2' });
          await safeWait(page, 800);
        }

        // message editor: try multiple selectors
        const findMessageInput = async (pg) => {
          const selectors = ['[contenteditable="true"]', 'textarea', '[role="textbox"]', 'div.msg-form__contenteditable', 'div.msg-form__textarea', '.msg-form__contenteditable'];
          for (const s of selectors) {
            const el = await pg.$(s).catch(() => null);
            if (el) return { el, sel: s };
          }
          // final fallback: simple selectors are already checked; return null if none
          return null;
        };

        const foundEditor = await findMessageInput(page);
        const msg = await generateMessage(lead, template, openaiKey);
        if (!foundEditor) throw new Error('Message editor not found');
        await foundEditor.el.focus();
        await page.keyboard.type(msg || '', { delay: 30 });
        // Prefer clicking a visible Send button; otherwise try keyboard shortcut
        const clickSendIfExists = async (pg) => {
          const sendSelectors = [
            'button.msg-form__send-button',
            'button[aria-label="Send"]'
          ];
          for (const s of sendSelectors) {
            try {
              const el = await pg.$(s).catch(()=>null);
              if (el) { await el.click().catch(()=>{}); return true; }
            } catch (e) {}
          }
          // fallback: find a button with text "Send" and click it
          const allBtns = await pg.$$('button');
          for (const b of allBtns) {
            try {
              const t = await pg.evaluate(el => (el.innerText || '').trim(), b).catch(()=>'');
              if (/^send$/i.test(t) || /send/i.test(t)) { await b.click().catch(()=>{}); return true; }
            } catch(e){}
          }
          return false;
        };

        let sent = false;
        try {
          sent = await clickSendIfExists(page);
          console.log('LinkedIn: attempted to click send, sent flag:', sent);
          if (!sent) {
            // try keyboard shortcut for send: Ctrl+Enter (Windows) or Meta+Enter (Mac)
            try { await page.keyboard.down('Control'); await page.keyboard.press('Enter'); await page.keyboard.up('Control'); } catch(e){ }
            await safeWait(page, 400);
          }
          // Verify message appears in conversation history (retry a few times)
          const verifySent = async (pg, text) => {
            for (let i=0;i<8;i++) {
              try {
                const html = await pg.evaluate(() => document.body.innerText).catch(()=>'');
                if (html && text && html.indexOf(text) !== -1) return true;
              } catch(e){}
              await safeWait(pg, 600);
            }
            return false;
          };
          const ok = await verifySent(page, msg || '');
          if (!ok) {
            // final fallback: try pressing Enter once more and wait
            try { await page.keyboard.press('Enter'); } catch(e){}
            await safeWait(page, 800);
          }

          await logAutomation(userId, "linkedin", {
            status: ok ? "sent" : "sent_unverified",
            lead,
            message: msg || "",
            fromName: fromName || "",
            timestamp: Date.now(),
          });
        } catch (e) {
          throw new Error('Failed to send message: ' + (e && e.message ? e.message : String(e)));
        }
      } catch (err) {
        const shot = await saveScreenshot(page, `linkedin-${userId}`);
        const pageHtml = await page.content().catch(() => null);
        await logAutomation(userId, "linkedin", {
          status: "error",
          lead,
          error: err.message,
          screenshot: shot,
          pageHtml: pageHtml ? pageHtml.slice(0, 10000) : null,
          timestamp: Date.now(),
        });
      }
    }
  } else {
    await logAutomation(userId, "linkedin", {
      status: "completed",
      loggedIn: isLoggedIn,
      timestamp: Date.now(),
    });
  }

  if (createdBrowser) {
    await browser.close();
  }
}
