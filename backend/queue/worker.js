import redis from "./redis.js";
import logger from "../utils/logger.js";
import runGHL from "../puppeteer/platforms/ghl.js";
import runInstagram from "../puppeteer/platforms/instagram.js";
import runLinkedin from "../puppeteer/platforms/linkedin.js";
import { launchBrowser } from "../puppeteer/browser.js";
import { logAutomation, getSession } from "../firebase/firestore.js";
import safeWait from '../utils/safeWait.js';
import injectSession from "../puppeteer/injectSession.js";

logger.info("Worker started...");

async function processQueue() {
  while (true) {
    const job = await redis.blpop("automation_queue", 0);

    if (!job) continue;

    const data = JSON.parse(job[1]);

    logger.info("Processing job: " + data.platform);
    // write a processing-start log
    try {
      await logAutomation(data.userId, data.platform, {
        status: 'processing',
        timestamp: Date.now(),
        queuedCount: Array.isArray(data.leads) ? data.leads.length : 0,
      });
    } catch (e) {
      console.error('logAutomation processing error', e);
    }

    try {
      // If leads contain multiple platforms, prefer running them sequentially in a single browser
      const leads = Array.isArray(data.leads) ? data.leads : [];
      const detected = new Set(leads.map(l => (l && l.platform ? String(l.platform).toLowerCase() : null)).filter(Boolean));
      // Also detect platform from lead profileUrl or username patterns
      for (const l of leads) {
        try {
          const url = (l && (l.profileUrl || l.url || l.raw && (l.raw.profileUrl || l.raw.url) || l.username) || '') + '';
          if (/linkedin\.com/i.test(url)) detected.add('linkedin');
          if (/instagram\.com/i.test(url)) detected.add('instagram');
        } catch (e) {}
      }
      // Allow job-level platform hint like 'instagram,linkedin' or 'both'
      let jobPlatforms = new Set();
      if (data.platform && typeof data.platform === 'string') {
        const parts = data.platform.split(/[ ,|]+/).map(s=>s.toLowerCase().trim()).filter(Boolean);
        for (const p of parts) {
          if (p === 'both' || p === 'all') { detected.add('instagram'); detected.add('linkedin'); jobPlatforms.add('instagram'); jobPlatforms.add('linkedin'); }
          else if (p) { detected.add(p); jobPlatforms.add(p); }
        }
      }

      if (detected.size > 1) {
        // run both in one browser: instagram then linkedin. open two pages (tabs)
        const browser = await launchBrowser({ headless: false });
        const instagramPage = await browser.newPage();
        const linkedinPage = await browser.newPage();

          // inject saved sessions into both pages before navigating
        try {
          try {
            const igSession = await getSession(data.userId, 'instagram');
            if (igSession) {
              const resIg = await injectSession(instagramPage, igSession, { platform: 'instagram' });
              const c = await instagramPage.cookies();
              console.log('Injected instagram cookies:', c.length, 'names:', c.map(x=>x.name), 'applied:', resIg?.applied || [], 'verified:', !!resIg?.verified);
            }
          } catch (e) {
            console.warn('failed to inject instagram session', e.message);
          }
          try {
            const liSession = await getSession(data.userId, 'linkedin');
            if (liSession) {
              const resLi = await injectSession(linkedinPage, liSession, { platform: 'linkedin' });
              const c2 = await linkedinPage.cookies();
              console.log('Injected linkedin cookies:', c2.length, 'names:', c2.map(x=>x.name), 'applied:', resLi?.applied || [], 'verified:', !!resLi?.verified);
              // check for common auth cookies
              const liNames = (c2 || []).map(x=>x.name);
              if (!liNames.includes('li_at') && !liNames.includes('JSESSIONID')) {
                console.warn('LinkedIn auth cookie not present after injection (li_at/JSESSIONID). Session may be invalid.');
              }
              // If verification failed, retry injection once (sometimes domain mismatch occurs)
              if (!resLi?.verified) {
                console.warn('LinkedIn injection not verified — retrying injection+reload');
                try {
                  await injectSession(linkedinPage, liSession, { platform: 'linkedin' });
                  await linkedinPage.reload({ waitUntil: 'networkidle2', timeout: 60000 }).catch(()=>{});
                  await safeWait(linkedinPage, 2000);
                  const c3 = await linkedinPage.cookies();
                  console.log('Post-retry linkedin cookies:', c3.map(x=>x.name));
                  const liNames2 = (c3 || []).map(x=>x.name);
                  if (!liNames2.includes('li_at') && !liNames2.includes('JSESSIONID')) {
                    console.warn('LinkedIn still missing auth cookies after retry');
                  } else {
                    console.log('LinkedIn cookies present after retry');
                  }
                } catch (re) { console.warn('LinkedIn retry inject failed', re && re.message); }
              }
            }
          } catch (e) {
            console.warn('failed to inject linkedin session', e.message);
          }
          
          // navigate both to their home pages and wait for load so sessions take effect
          try { await instagramPage.goto('https://www.instagram.com', { waitUntil: 'networkidle2', timeout: 60000 }); } catch(e){ console.warn('instagram home goto failed', e.message); }
          await safeWait(instagramPage, 2500);

          // verify instagram logged-in; if not, retry injection+reload once
          try {
            const igLogged = await instagramPage.evaluate(() => {
              return !!document.querySelector("img[alt*='profile']") || !!document.querySelector('nav');
            });
            let igLoggedFinal = false;
            try {
              igLoggedFinal = !!igLogged;
            } catch(e) { igLoggedFinal = false; }
            if (!igLoggedFinal) {
              // check cookies as an additional verification (some pages timeout but cookies exist)
              try {
                const c = await instagramPage.cookies();
                const names = (c || []).map(x => x.name);
                if (names.includes('sessionid') && names.includes('ds_user_id')) {
                  console.log('Instagram cookies present after injection — treating as logged in');
                  igLoggedFinal = true;
                }
              } catch(e) {}
            }
            if (!igLoggedFinal) {
              console.warn('Instagram appears not logged in after injection — retrying injection');
              const igSessionRetry = await getSession(data.userId, 'instagram');
              if (igSessionRetry) {
                try { await injectSession(instagramPage, igSessionRetry, { platform: 'instagram' }); } catch(e){ console.warn('retry inject instagram failed', e.message); }
                try { await instagramPage.reload({ waitUntil: 'networkidle2', timeout: 60000 }); } catch(e){}
                await safeWait(instagramPage, 2000);
              }
            }
          } catch(e) { console.warn('instagram logged-in verify error', e.message); }

          try { await linkedinPage.goto('https://www.linkedin.com/feed/', { waitUntil: 'networkidle2', timeout: 60000 }); } catch(e){ console.warn('linkedin home goto failed', e.message); }
          await safeWait(linkedinPage, 2500);

          // verify linkedin logged-in; if not, retry injection+reload once
          try {
            const liLogged = await linkedinPage.evaluate(() => {
              return !!document.querySelector('img.global-nav__me-photo') || !!document.querySelector('header');
            });
            let liLoggedFinal = false;
            try { liLoggedFinal = !!liLogged; } catch(e) { liLoggedFinal = false; }
            if (!liLoggedFinal) {
              try {
                const c2 = await linkedinPage.cookies();
                const names2 = (c2 || []).map(x => x.name);
                if (names2.includes('li_at') || names2.includes('JSESSIONID')) {
                  console.log('LinkedIn cookies present after injection — treating as logged in');
                  liLoggedFinal = true;
                }
              } catch(e) {}
            }
            if (!liLoggedFinal) {
              console.warn('LinkedIn appears not logged in after injection — attempting account-chooser click before retry');
              // try to click account chooser elements (masked email or profile tile)
              try {
                const clicked = await linkedinPage.evaluate(() => {
                  const els = Array.from(document.querySelectorAll('button, a, div'));
                  for (const el of els) {
                    try {
                      const txt = (el.innerText || '').trim().toLowerCase();
                      if (!txt) continue;
                      if (txt.indexOf('@') !== -1) { el.click(); return { ok: true, reason: 'email' }; }
                      if (el.querySelector && el.querySelector('img') && txt.length > 0 && txt.length < 60) { el.click(); return { ok: true, reason: 'img_tile' }; }
                    } catch(e){}
                  }
                  return { ok: false };
                }).catch(()=>({ ok: false }));
                if (clicked && clicked.ok) {
                  console.log('Clicked LinkedIn chooser element:', clicked.reason || 'unknown');
                  try { await safeWait(linkedinPage, 1500); } catch(e){}
                }
              } catch(e) { console.warn('LinkedIn chooser click attempt failed', e && e.message); }

              // re-evaluate login; if still not, retry injection+reload once
              const liSessionRetry = await getSession(data.userId, 'linkedin');
              let recheck = false;
              try { recheck = await linkedinPage.evaluate(() => !!document.querySelector('img.global-nav__me-photo') || !!document.querySelector('header')).catch(()=>false); } catch(e) { recheck = false; }
              if (!recheck) {
                try {
                  const c3 = await linkedinPage.cookies();
                  const names3 = (c3 || []).map(x => x.name);
                  if (names3.includes('li_at') || names3.includes('JSESSIONID')) {
                    console.log('LinkedIn cookies present after chooser click — treating as logged in');
                    recheck = true;
                  }
                } catch(e) {}
              }
              if (!recheck && liSessionRetry) {
                console.warn('Retrying LinkedIn injection+reload');
                try { await injectSession(linkedinPage, liSessionRetry, { platform: 'linkedin' }); } catch(e){ console.warn('retry inject linkedin failed', e.message); }
                try { await linkedinPage.reload({ waitUntil: 'networkidle2', timeout: 60000 }); } catch(e){}
                await safeWait(linkedinPage, 2000);
              }
            }
          } catch(e) { console.warn('linkedin logged-in verify error', e.message); }

          // Pass only the leads relevant to each platform so runners don't open other-platform profiles
          const igLeads = leads.filter(l => {
            if (!l) return false;
            if (l.platform) return String(l.platform).toLowerCase() === 'instagram';
            const url = String(l.profileUrl || l.url || l.username || '').toLowerCase();
            if (url.includes('instagram.com')) return true;
            // if the lead has only a username (no domain), only include it for instagram
            // when the job explicitly targets instagram in data.platform
            if (l.username && !url.includes('linkedin.com')) return jobPlatforms.has('instagram');
            return false;
          });
          const liLeads = leads.filter(l => {
            if (!l) return false;
            if (l.platform) return String(l.platform).toLowerCase() === 'linkedin';
            const url = String(l.profileUrl || l.url || l.username || '').toLowerCase();
            if (url.includes('linkedin.com')) return true;
            // if the lead has only a username (no domain), only include it for linkedin
            // when the job explicitly targets linkedin in data.platform
            if (l.username && !url.includes('instagram.com')) return jobPlatforms.has('linkedin');
            return false;
          });

          const shouldRetryOnTargetClose = (err) => {
            if (!err) return false;
            const m = String(err && (err.message || err.stack || ''));
            return /TargetCloseError|Target closed|Protocol error/.test(m);
          };

          if (detected.has('instagram')) {
            try {
              await runInstagram({ ...data, leads: igLeads }, instagramPage);
            } catch (e) {
              console.warn('Instagram runner failed, will retry once if target closed:', e && e.message);
              if (shouldRetryOnTargetClose(e)) {
                try {
                  try { await instagramPage.close(); } catch(_){ }
                  const newPg = await browser.newPage();
                  const igSession = await getSession(data.userId, 'instagram');
                  if (igSession) await injectSession(newPg, igSession, { platform: 'instagram' }).catch(()=>{});
                  await runInstagram({ ...data, leads: igLeads }, newPg);
                } catch (re) { console.error('Instagram retry failed', re); }
              } else throw e;
            }
          }

          if (detected.has('linkedin')) {
            try {
              await runLinkedin({ ...data, leads: liLeads }, linkedinPage);
            } catch (e) {
              console.warn('LinkedIn runner failed, will retry once if target closed:', e && e.message);
              if (shouldRetryOnTargetClose(e)) {
                try {
                  try { await linkedinPage.close(); } catch(_){ }
                  const newPg = await browser.newPage();
                  const liSession = await getSession(data.userId, 'linkedin');
                  if (liSession) await injectSession(newPg, liSession, { platform: 'linkedin' }).catch(()=>{});
                  await runLinkedin({ ...data, leads: liLeads }, newPg);
                } catch (re) { console.error('LinkedIn retry failed', re); }
              } else throw e;
            }
          }
        } finally {
          try { await browser.close(); } catch (e) {}
        }
      } else {
        // single-platform job: respect explicit data.platform or detected platform
        const target = (data.platform || Array.from(detected)[0] || '').toLowerCase();
        if (target === 'ghl') await runGHL(data);
        else if (target === 'instagram') await runInstagram(data);
        else if (target === 'linkedin') await runLinkedin(data);
      }
    } catch (e) {
      console.error('Platform runner error', e);
      try {
        await logAutomation(data.userId, data.platform, { status: 'runner_error', error: e.message, timestamp: Date.now() });
      } catch (le) {
        console.error('Failed to log runner error', le);
      }
    }
  }
}

processQueue();
