export default async function injectSession(page, session, opts = {}) {
  // returns { applied: string[], verified: boolean, details: object }
  if (!session || !session.cookies) return { applied: [], verified: false, details: {} };

  const platform = opts.platform || null;

  // Normalize cookies: ensure a `url` exists so puppeteer can set them reliably
  const cookies = (session.cookies || []).map((c) => {
    const cookie = { ...c };
    // sanitize value: remove surrounding quotes that can appear when reading from JSON
    if (typeof cookie.value === 'string') {
      const v = cookie.value.trim();
      if (v.length >= 2 && v.startsWith('"') && v.endsWith('"')) cookie.value = v.slice(1, -1);
      else cookie.value = v;
    }
    if (!cookie.url && cookie.domain) {
      const d = cookie.domain.startsWith('.') ? cookie.domain.slice(1) : cookie.domain;
      cookie.url = `https://${d}`;
    }
    return cookie;
  });

  // Group cookies by origin (url) so we can navigate to each domain before setting its cookies.
  const byOrigin = {};
  for (const ck of cookies) {
    const origin = ck.url || (ck.domain ? `https://${ck.domain.replace(/^\./, '')}` : 'https://');
    if (!byOrigin[origin]) byOrigin[origin] = [];
    byOrigin[origin].push(ck);
  }

  const applied = [];
  const details = {};

  for (const origin of Object.keys(byOrigin)) {
    const domainCookies = byOrigin[origin];
    try {
      // Navigate to the origin so cookies can be set in the right context
      try {
        await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 15000 });
      } catch (navErr) {
        // Navigation can fail (e.g., if already on different origin), continue
        // but still attempt to set cookies.
      }

      // attempt bulk set first
      try {
        await page.setCookie(...domainCookies);
        domainCookies.forEach(dc => applied.push(dc.name));
        console.log('injectSession: set cookies for', origin, domainCookies.map(d => d.name));
      } catch (e) {
        console.warn('injectSession: bulk setCookie failed for', origin, e.message);
        // fallback to setting individually
        for (const ck of domainCookies) {
          try { await page.setCookie(ck); applied.push(ck.name); } catch (ee) { console.warn('injectSession cookie failed', ee.message); }
        }
      }

      // small pause to let cookies take effect
      try { await (import('../utils/safeWait.js').then(m=>m.default(page,700))); } catch (_) {}
    } catch (e) {
      console.warn('injectSession: error for origin', origin, e.message);
    }
  }

  // Special handling: some sites (LinkedIn) require cookies set for both linkedin.com and www.linkedin.com
  if (platform === 'linkedin') {
    try {
      const all = cookies.filter(c => c.domain && c.domain.includes('linkedin'));
      if (all && all.length) {
        // ensure we attempted to set cookies for both hosts
        const hosts = ['https://www.linkedin.com', 'https://linkedin.com'];
        for (const h of hosts) {
          try {
            await page.goto(h, { waitUntil: 'domcontentloaded', timeout: 8000 }).catch(()=>{});
            for (const ck of all) {
              const copy = { ...ck, url: h };
              try { await page.setCookie(copy); if (!applied.includes(copy.name)) applied.push(copy.name); } catch(e){}
            }
            try { await (import('../utils/safeWait.js').then(m=>m.default(page,500))); } catch(_){}
          } catch(e){}
        }
      }
    } catch (e) {
      console.warn('injectSession: linkedin dual-origin set failed', e && e.message);
    }
  }

  // After setting cookies, try to activate session: reload and verify presence of auth cookie or logged-in selector
  let verified = false;
  try {
    // Try to navigate to a known authenticated page for verification based on platform
    try {
      if (platform === 'linkedin') {
        try { await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 8000 }); } catch(e) {
          try { await page.goto('https://linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 8000 }); } catch(e2) {}
        }
      } else if (platform === 'instagram') {
        try { await page.goto('https://www.instagram.com', { waitUntil: 'domcontentloaded', timeout: 8000 }); } catch(e) {
          try { await page.goto('https://instagram.com', { waitUntil: 'domcontentloaded', timeout: 8000 }); } catch(e2) {}
        }
      } else {
        // if unknown platform, do a light reload to pick up cookies
        try { await page.reload({ waitUntil: 'domcontentloaded', timeout: 8000 }); } catch(e){}
      }
    } catch (e) {}
    try { await (import('../utils/safeWait.js').then(m=>m.default(page,1200))); } catch (_) {}

    const currentCookies = await page.cookies();
    const cookieNames = currentCookies.map(c => c.name || '');
    details.cookies = cookieNames;
    console.log('injectSession: current cookies after reload', cookieNames);

    if (platform === 'instagram') {
      if (cookieNames.includes('sessionid')) verified = true;
      else {
        const isLogged = await page.evaluate(() => !!document.querySelector("img[alt*='profile']"));
        if (isLogged) verified = true;
      }
    } else if (platform === 'linkedin') {
      // check for auth cookies
      if (cookieNames.includes('li_at') || cookieNames.includes('JSESSIONID')) verified = true;
      else {
        // check multiple selectors that indicate logged-in state
        const selectors = ['img.global-nav__me-photo', 'img.profile-rail-card__actor-img', 'header.global-nav__container', 'div.feed-identity-module'];
        for (const sel of selectors) {
          try {
            const found = await page.$(sel).then(Boolean).catch(()=>false);
            if (found) { verified = true; break; }
          } catch (e) {}
        }
      }
    } else {
      verified = cookieNames.length > 0;
    }
    details.verified = verified;
  } catch (e) {
    console.warn('injectSession: verification step failed', e && e.message);
  }

  return { applied: Array.from(new Set(applied)), verified, details };
}
