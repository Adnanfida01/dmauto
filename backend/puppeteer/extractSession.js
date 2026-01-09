export default async function extractSession(page) {
  const cookies = await page.cookies();
  return { cookies };
}
