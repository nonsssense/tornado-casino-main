/**
 * TEMP local reproduction of launch-param timing.
 *
 * Simulates two Telegram WebView scenarios against a running server:
 * A) Open Mini App URL with NO tgWebAppData (empty launch)
 * B) Open with NO hash, then inject #tgWebAppData=... after SDK eval (late injection)
 *
 * Requires: server on :8080 serving dist/, and playwright.
 * Usage: node scripts/repro-launch-timing.mjs
 */

import { chromium } from 'playwright';

const BASE = process.env.REPRO_BASE || 'http://127.0.0.1:8080';
const FAKE_INIT =
  'user=' +
  encodeURIComponent(JSON.stringify({ id: 999001, first_name: 'Repro' })) +
  '&auth_date=1700000000&hash=repro_fake_hash';

async function collectLaunchLogs(page) {
  return page.evaluate(() => window.__tornadoLaunchLog || []);
}

async function runScenario(name, setup) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const serverLogs = [];

  page.on('console', (msg) => {
    const text = msg.text();
    if (text.includes('[TG-LAUNCH]')) serverLogs.push(text);
  });

  await setup(page);
  // Allow diagnostic watch (5s) + bootstrap
  await page.waitForTimeout(5500);
  const log = await collectLaunchLogs(page);
  await browser.close();

  console.log('\n==========', name, '==========');
  for (const row of log) {
    console.log(
      `${row.t_ms.toFixed(0)}ms\t${row.phase}\thashHas=${row.has_tg_web_app_data_in_hash}\t` +
        `hashDataLen=${row.tg_web_app_data_len_from_hash}\tinitDataLen=${row.init_data_len}\t` +
        `webapp=${row.webapp_exists}\tnote=${row.note || ''}`,
    );
  }
  return log;
}

async function main() {
  // A: never has tgWebAppData
  const empty = await runScenario('A: launch without tgWebAppData', async (page) => {
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  });

  // B: inject hash AFTER sdk-after-eval (late Telegram injection simulation)
  const late = await runScenario('B: tgWebAppData injected after SDK eval', async (page) => {
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    // Wait one macrotask so inline sdk-after-eval has fired
    await page.waitForTimeout(50);
    await page.evaluate((initData) => {
      location.hash =
        'tgWebAppData=' + encodeURIComponent(initData) + '&tgWebAppVersion=8.0&tgWebAppPlatform=repro';
    }, FAKE_INIT);
  });

  const emptySdk = empty.find((r) => r.phase === 'sdk-after-eval');
  const lateSdk = late.find((r) => r.phase === 'sdk-after-eval');
  const lateHashEvt = late.find((r) => r.phase === 'hashchange' || r.phase === 'LATE-HASH-SDK-EMPTY');
  const lateAfter = late.filter((r) => r.has_tg_web_app_data_in_hash && r.init_data_len === 0);

  console.log('\n========== CONCLUSIONS ==========');
  console.log(
    'A sdk-after-eval: hashHas=',
    emptySdk?.has_tg_web_app_data_in_hash,
    'initDataLen=',
    emptySdk?.init_data_len,
  );
  console.log(
    'B sdk-after-eval: hashHas=',
    lateSdk?.has_tg_web_app_data_in_hash,
    'initDataLen=',
    lateSdk?.init_data_len,
  );
  console.log('B saw LATE-HASH-SDK-EMPTY or hashchange with empty initData:', lateAfter.length > 0);
  console.log('B late event phases:', late.filter((r) => r.phase.includes('LATE') || r.phase === 'hashchange').map((r) => r.phase));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
