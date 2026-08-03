import { chromium } from 'playwright';
import fs from 'fs';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

const responses = [];
const failed = [];

page.on('response', (res) => {
  const u = res.url();
  if (/\/(assets|banners)\//i.test(u) || /\.(webp|png|svg)(\?|$)/i.test(u)) {
    const status = res.status();
    const headers = res.headers();
    const len = headers['content-length'] ? Number(headers['content-length']) : null;
    if (status >= 400) failed.push({ u, status });
    responses.push({
      url: u,
      status,
      len,
      ct: headers['content-type'] || '',
    });
  }
});

await page.goto('http://127.0.0.1:3000/', { waitUntil: 'networkidle', timeout: 60000 });

// Wait for home UI
await page.waitForTimeout(5000);

// Force-load bottom-nav icon URLs from computed CSS if present
const cssUrls = await page.evaluate(() => {
  const urls = new Set();
  for (const sheet of document.styleSheets) {
    let rules;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    for (const rule of rules) {
      const text = rule.cssText || '';
      const matches = text.matchAll(/url\((['"]?)([^)'"]+)\1\)/g);
      for (const m of matches) {
        if (/assets\/|banners\//.test(m[2]) || /\.(webp|png|svg)/i.test(m[2])) {
          urls.add(m[2]);
        }
      }
    }
  }
  // Also check bottom-nav elements
  document.querySelectorAll('[class*="bottom-nav__icon"], [class*="profile-menu__icon"]').forEach((el) => {
    const bg = getComputedStyle(el).backgroundImage;
    const m = bg && bg.match(/url\((['"]?)([^)'"]+)\1\)/);
    if (m) urls.add(m[2]);
  });
  return [...urls];
});

// Resolve and fetch any CSS-referenced assets that weren't requested yet
for (const raw of cssUrls) {
  const abs = new URL(raw, 'http://127.0.0.1:3000/').href;
  try {
    const res = await page.request.get(abs);
    const buf = await res.body();
    responses.push({
      url: abs,
      status: res.status(),
      len: buf.length,
      ct: res.headers()['content-type'] || '',
      via: 'css-probe',
    });
    if (res.status() >= 400) failed.push({ u: abs, status: res.status() });
  } catch (e) {
    failed.push({ u: abs, status: 'err', error: String(e) });
  }
}

// Probe wallet icons too (loaded only on wallet route via /assets absolute paths)
const walletIcons = [
  '/assets/tether.webp',
  '/assets/btc%20icon.webp',
  '/assets/eth%20icon.webp',
  '/assets/tron%20icon.webp',
  '/assets/solana%20icon.webp',
  '/assets/usdc%20icon.webp',
  '/assets/menu_bar_wallet.webp',
  '/assets/menu_bar_referals.webp',
  '/assets/menu_bar_casino.webp',
  '/assets/menu_bar_profile.webp',
  '/assets/personal_info_profile_page.webp',
  '/assets/profile_page_bonuses_page.webp',
];

for (const path of walletIcons) {
  const abs = `http://127.0.0.1:3000${path}`;
  const res = await page.request.get(abs);
  const buf = await res.body();
  responses.push({
    url: abs,
    status: res.status(),
    len: buf.length,
    ct: res.headers()['content-type'] || '',
    via: 'probe',
  });
  if (res.status() >= 400) failed.push({ u: abs, status: res.status() });
}

await page.screenshot({ path: 'scripts/preview-home.png', fullPage: true });

const unique = new Map();
for (const r of responses) {
  const key = r.url.split('?')[0];
  // Prefer first real page response over probe if both exist
  if (!unique.has(key) || (r.via == null && unique.get(key).via)) {
    unique.set(key, r);
  }
}

let total = 0;
const rows = [];
for (const [url, r] of unique) {
  const size = r.len || 0;
  total += size;
  rows.push({
    path: url.replace(/^https?:\/\/[^/]+/, ''),
    status: r.status,
    size,
    ct: r.ct,
    via: r.via || 'page',
  });
}

const optimizedSet = rows.filter((r) => /\/assets\//.test(r.path));
const oldSvg = optimizedSet.filter((r) => /\.svg/i.test(r.path));
const webp = optimizedSet.filter((r) => /\.webp/i.test(r.path));
const png = optimizedSet.filter((r) => /\.png/i.test(r.path));

const report = {
  cssUrlsFound: cssUrls,
  failed,
  assets: rows.sort((a, b) => a.path.localeCompare(b.path)),
  summary: {
    pageTransferredEstimateKB: +((rows.filter((r) => r.via === 'page').reduce((s, r) => s + r.size, 0)) / 1024).toFixed(1),
    allProbedAssetsKB: +((optimizedSet.reduce((s, r) => s + r.size, 0)) / 1024).toFixed(1),
    webpAssets: webp.length,
    pngAssets: png.length,
    svgAssets: oldSvg.length,
    svgPaths: oldSvg.map((r) => r.path),
    pngPaths: png.map((r) => r.path),
    failures: failed.length,
  },
};

fs.writeFileSync('scripts/preview-network-report.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
