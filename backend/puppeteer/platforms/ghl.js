import { launchBrowser } from "../browser.js";
import injectSession from "../injectSession.js";
import extractSession from "../extractSession.js";
import { getSession, saveSession, logAutomation } from "../../firebase/firestore.js";

export default async function runGHL({ userId }) {
  const browser = await launchBrowser();
  const page = await browser.newPage();

  const session = await getSession(userId, "ghl");
  if (session) await injectSession(page, session);

  await page.goto("https://app.gohighlevel.com");

  const newSession = await extractSession(page);
  await saveSession(userId, "ghl", newSession);

  await logAutomation(userId, "ghl", "GHL automation completed.");
  await browser.close();
}
