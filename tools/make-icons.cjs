// Renders public/icons/icon.svg to the PNG sizes iPhones and Android need for the home-screen icon.
// Run with `node tools/make-icons.cjs` on a machine that has Playwright and Chromium installed.
const { chromium } = require("playwright");
const { readFileSync } = require("node:fs");
const path = require("node:path");

const dir = path.join(__dirname, "../public/icons");
const svg = readFileSync(path.join(dir, "icon.svg"), "utf8");
const SIZES = { "apple-touch-icon.png": 180, "icon-192.png": 192, "icon-512.png": 512 };

(async () => {
  const browser = await chromium.launch();
  for (const [file, size] of Object.entries(SIZES)) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(`<style>*{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
    await page.screenshot({ path: path.join(dir, file) });
    await page.close();
  }
  await browser.close();
})();
