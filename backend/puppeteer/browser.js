import puppeteer from "puppeteer";

export const launchBrowser = async (opts = {}) => {
  const headless = typeof opts.headless === "boolean" ? opts.headless : false;
  return await puppeteer.launch({
    headless,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
};
