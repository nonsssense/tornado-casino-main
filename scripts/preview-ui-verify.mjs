import { chromium } from 'playwright';
import fs from 'fs';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

const imgLog = [];
page.on('response', async (res) => {
  const u = res.url();
  if (!/\/assets\//i.test(u)) return;
  const status = res.status();
  const ct = res.headers()['content-type'] || '';
  let size = Number(res.headers()['content-length'] || 0);
  if (!size) {
    try {
      size = (await res.body()).length;
    } catch {
      size = 0;
    }
  }
  imgLog.push({ url: u.split('?')[0], status, ct, size });
});

await page.addInitScript(() => {
  // Minimal Telegram WebApp stub so auth can proceed or fail fast without hanging UI forever
  window.Telegram = {
    WebApp: {
      initData: '',
      initDataUnsafe: { user: { id: 1, first_name: 'Preview' } },
      ready() {},
      expand() {},
      themeParams: {},
      colorScheme: 'dark',
      viewportHeight: 844,
      viewportStableHeight: 844,
      platform: 'web',
      version: '8.0',
      HapticFeedback: { impactOccurred() {}, notificationOccurred() {}, selectionChanged() {} },
      BackButton: { show() {}, hide() {}, onClick() {}, offClick() {} },
      MainButton: { show() {}, hide() {}, setText() {}, onClick() {}, offClick() {} },
      setHeaderColor() {},
      setBackgroundColor() {},
      disableVerticalSwipes() {},
      enableClosingConfirmation() {},
    },
  };
});

await page.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(4000);

// Force-dismiss splash if still covering
await page.evaluate(() => {
  document.querySelectorAll('.app-splash').forEach((el) => {
    el.classList.add('app-splash--dismissed');
    el.style.display = 'none';
  });
});

await page.waitForTimeout(1500);
await page.screenshot({ path: 'scripts/preview-home-ui.png', fullPage: true });

// Collect bottom-nav background images currently in use
const navIcons = await page.evaluate(() => {
  const out = [];
  document.querySelectorAll('[class*="bottom-nav__icon"]').forEach((el) => {
    out.push({
      className: el.className,
      bg: getComputedStyle(el).backgroundImage,
    });
  });
  return out;
});

// Trigger background image loads by reading them
for (const icon of navIcons) {
  const m = icon.bg && icon.bg.match(/url\("?([^")]+)"?\)/);
  if (m) {
    try {
      await page.request.get(m[1].startsWith('http') ? m[1] : `http://127.0.0.1:3000${m[1]}`);
    } catch {}
  }
}

await page.waitForTimeout(1000);
await page.screenshot({ path: 'scripts/preview-home-ui.png', fullPage: true });

const unique = new Map();
for (const r of imgLog) {
  if (!unique.has(r.url)) unique.set(r.url, r);
}

const assets = [...unique.values()].map((r) => ({
  path: r.url.replace(/^https?:\/\/[^/]+/, ''),
  status: r.status,
  ct: r.ct,
  size: r.size,
}));

const report = {
  navIcons,
  assets,
  svgCount: assets.filter((a) => /\.svg/i.test(a.path)).length,
  webpCount: assets.filter((a) => /\.webp/i.test(a.path)).length,
  pngCount: assets.filter((a) => /\.png/i.test(a.path)).length,
  failed: assets.filter((a) => a.status >= 400),
  totalAssetKB: +((assets.reduce((s, a) => s + (a.size || 0), 0)) / 1024).toFixed(1),
};

fs.writeFileSync('scripts/preview-ui-report.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
