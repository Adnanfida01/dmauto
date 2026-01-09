import fs from 'fs';
import path from 'path';
import safeWait from '../utils/safeWait.js';

export default async function saveScreenshot(page, prefix = 'shot') {
  try {
    const dir = path.resolve(process.cwd(), 'tmp_screenshots');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const name = `${prefix}-${Date.now()}-${Math.floor(Math.random()*10000)}.png`;
    const dest = path.join(dir, name);
    // retry screenshot once if the protocol times out
    try {
      await page.screenshot({ path: dest, fullPage: false });
    } catch (e) {
      try { await safeWait(page, 300); await page.screenshot({ path: dest, fullPage: false }); } catch (e2) { throw e2; }
    }
    return dest;
  } catch (e) {
    console.error('saveScreenshot error', e);
    return null;
  }
}
