import { chromium } from 'playwright';
import fs from 'fs';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();

const logs = [];
const network = [];
const failures = [];

page.on('console', (msg) => {
  logs.push({ type: msg.type(), text: msg.text(), t: Date.now() });
});
page.on('pageerror', (err) => {
  logs.push({ type: 'pageerror', text: String(err), t: Date.now() });
});
page.on('requestfailed', (req) => {
  failures.push({
    url: req.url(),
    error: req.failure()?.errorText,
    method: req.method(),
  });
});
page.on('response', async (res) => {
  const url = res.url();
  if (!/\/(api|assets|static|src)\//.test(url) && !url.includes('main.js') && !url.includes('telegram')) {
    return;
  }
  let bodyPreview = '';
  try {
    if (url.includes('/api/')) {
      bodyPreview = (await res.text()).slice(0, 500);
    }
  } catch {}
  network.push({
    status: res.status(),
    url: url.replace(/^https?:\/\/[^/]+/, ''),
    ct: res.headers()['content-type'] || '',
    bodyPreview,
  });
});

const t0 = Date.now();
await page.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded', timeout: 60000 });

// Wait up to 12s for either home or auth error or splash dismiss
for (let i = 0; i < 24; i++) {
  await page.waitForTimeout(500);
  const state = await page.evaluate(() => ({
    splashVisible: !!document.querySelector('.app-splash--visible'),
    splashCount: document.querySelectorAll('.app-splash').length,
    splashReady: window.__tornadoSplash?.ready ?? null,
    hasHome: !!document.querySelector('.home-page'),
    hasAuthError: !!document.querySelector('[class*="auth-error"]'),
    bodyText: (document.body?.innerText || '').slice(0, 200),
  }));
  if (state.hasHome || state.hasAuthError || (!state.splashVisible && state.splashReady)) {
    break;
  }
}

await page.waitForTimeout(1000);

const final = await page.evaluate(() => {
  const cookies = document.cookie;
  return {
    splashVisible: !!document.querySelector('.app-splash--visible'),
    splashCount: document.querySelectorAll('.app-splash').length,
    splashReady: window.__tornadoSplash?.ready ?? null,
    hasHome: !!document.querySelector('.home-page'),
    hasShell: !!document.querySelector('.app-shell, [class*="app-shell"]'),
    hasAuthError: !!document.querySelector('[class*="auth-error"]'),
    cookies,
    telegram: {
      present: !!window.Telegram?.WebApp,
      initDataLen: window.Telegram?.WebApp?.initData?.length ?? 0,
      initData: window.Telegram?.WebApp?.initData ?? '',
    },
    appRootSnippet: (document.getElementById('app-root')?.innerHTML || '').slice(0, 400),
  };
});

const cookies = await context.cookies();
const report = {
  elapsedMs: Date.now() - t0,
  final,
  cookies: cookies.map((c) => ({ name: c.name, value: c.value.slice(0, 20) + '…', path: c.path })),
  mimeErrors: logs.filter((l) => l.text.includes('MIME') || l.type === 'pageerror'),
  errors: logs.filter((l) => l.type === 'error' || l.type === 'pageerror'),
  authLogs: logs.filter((l) => /auth|Telegram|getTelegram|session|MIME|Failed/i.test(l.text)),
  network,
  failures,
};

fs.writeFileSync('scripts/startup-trace.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
