export default async function safeWait(pg, ms) {
  if (!ms || ms <= 0) return;
  try {
    if (pg && typeof pg.waitForTimeout === 'function') {
      await pg.waitForTimeout(ms);
      return;
    }
    if (pg && typeof pg.waitFor === 'function') {
      // some libs might expose waitFor
      await pg.waitFor(ms);
      return;
    }
  } catch (e) {}
  await new Promise((r) => setTimeout(r, ms));
}
