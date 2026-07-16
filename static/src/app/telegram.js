/**
 * Telegram Mini App bridge.
 *
 * Responsibility:
 * - Wrap window.Telegram.WebApp (ready, expand, fullscreen, swipe).
 * - Expose initData and user info for auth.service.js.
 * - Native BackButton helpers for game chrome.
 * - Keep Telegram-specific code out of pages and components.
 */

/** @type {(() => void)|null} */
let telegramBackClickHandler = null;

/** @returns {any} */
function getWebApp() {
  return window.Telegram?.WebApp ?? null;
}

/**
 * @param {any} tg
 * @returns {boolean}
 */
function hasRealTelegramSession(tg) {
  return Boolean(tg && typeof tg.initData === 'string' && tg.initData);
}

/**
 * @param {any} tg
 * @param {string} version
 * @returns {boolean}
 */
function isAtLeast(tg, version) {
  return typeof tg?.isVersionAtLeast === 'function' && tg.isVersionAtLeast(version);
}

/**
 * Official Fullscreen API — Bot API 8.0+.
 * @param {any} tg
 */
function tryRequestFullscreen(tg) {
  if (typeof tg.requestFullscreen !== 'function') return;
  if (!isAtLeast(tg, '8.0')) return;

  try {
    tg.requestFullscreen();
  } catch {
    // Unsupported / refused — keep expanded non-fullscreen experience.
  }
}

/**
 * Disable Telegram swipe-to-dismiss globally — Bot API 7.7+.
 * In-page scrolling remains app-controlled; users can still close via header.
 * @param {any} tg
 */
function tryDisableVerticalSwipes(tg) {
  if (typeof tg.disableVerticalSwipes !== 'function') return;
  if (!isAtLeast(tg, '7.7')) return;

  try {
    tg.disableVerticalSwipes();
  } catch {
    // Older / partial clients — no-op.
  }
}

/**
 * Signal Mini App readiness when a real Telegram session is present.
 * Order: ready → expand → requestFullscreen (if supported) → disableVerticalSwipes (if supported).
 * Safe to call more than once. Never throws.
 */
export function ensureTelegramReady() {
  const tg = getWebApp();
  if (!hasRealTelegramSession(tg)) return;

  try {
    tg.ready();
  } catch (error) {
    console.warn('[telegram] ready failed:', error);
    return;
  }

  try {
    tg.expand();
  } catch (error) {
    console.warn('[telegram] expand failed:', error);
  }

  tryRequestFullscreen(tg);
  tryDisableVerticalSwipes(tg);
}

/**
 * Real Telegram session with Bot API BackButton (6.1+).
 * Browser stubs (telegram-web-app.js without initData) are treated as unsupported.
 * @returns {boolean}
 */
export function isTelegramBackButtonSupported() {
  ensureTelegramReady();

  const tg = getWebApp();
  if (!hasRealTelegramSession(tg)) return false;

  if (!isAtLeast(tg, '6.1')) return false;

  const backButton = tg.BackButton;
  if (
    !backButton
    || typeof backButton.show !== 'function'
    || typeof backButton.hide !== 'function'
    || typeof backButton.onClick !== 'function'
  ) {
    return false;
  }

  return true;
}

/**
 * Wire a single click handler for the native BackButton.
 * @param {() => void} handler
 * @returns {boolean} true if native BackButton is available and bound
 */
export function bindTelegramBackButton(handler) {
  if (!isTelegramBackButtonSupported()) return false;

  const backButton = getWebApp().BackButton;

  try {
    if (telegramBackClickHandler && typeof backButton.offClick === 'function') {
      backButton.offClick(telegramBackClickHandler);
    }
    telegramBackClickHandler = handler;
    backButton.onClick(handler);
  } catch (error) {
    console.warn('[telegram] BackButton onClick failed:', error);
    return false;
  }

  return true;
}

/**
 * Show or hide the native Telegram BackButton.
 * No-op when unsupported — never closes the Mini App.
 * @param {boolean} visible
 * @returns {boolean} true if the call was applied
 */
export function setTelegramBackButtonVisible(visible) {
  if (!isTelegramBackButtonSupported()) return false;

  const backButton = getWebApp().BackButton;

  try {
    if (visible) backButton.show();
    else backButton.hide();
  } catch (error) {
    console.warn('[telegram] BackButton show/hide failed:', error);
    return false;
  }

  return true;
}

export function getTelegramContext() {
  const telegram = window.Telegram;
  const tg = telegram?.WebApp;
  const initData = tg?.initData;
  const initDataUnsafe = tg?.initDataUnsafe;
  const unsafeUser = initDataUnsafe?.user;

  console.log('[getTelegramContext] window.Telegram:', telegram ? 'present' : null);
  console.log('[getTelegramContext] window.Telegram?.WebApp:', tg ? 'present' : null);
  console.log('[getTelegramContext] Telegram.WebApp.initData:', {
    present: Boolean(initData),
    length: initData?.length ?? 0,
  });
  console.log('[getTelegramContext] Telegram.WebApp.initDataUnsafe:', initDataUnsafe ?? null);
  console.log('[getTelegramContext] Telegram WebApp detected:', Boolean(tg));
  console.log('[getTelegramContext] InitData present:', Boolean(initData));
  console.log('[getTelegramContext] InitData length:', initData?.length ?? 0);
  console.log('[getTelegramContext] Telegram ID:', unsafeUser?.id ?? null);
  console.log('[getTelegramContext] Username:', unsafeUser?.username ?? null);

  if (!tg) {
    console.log('[getTelegramContext] returned:', null);
    return null;
  }

  // telegram-web-app.js still creates WebApp in a normal browser, usually with
  // empty initData. That is NOT a Telegram session — return null so /api/auth
  // can use the WEB_DEFENCE=False development user (ensureDevBrowserUser).
  const resolvedInitData = typeof initData === 'string' ? initData : '';
  if (!resolvedInitData) {
    console.log('[getTelegramContext] returned: null (browser stub, no initData)');
    return null;
  }

  // ready → expand → fullscreen → disable vertical swipes (feature-detected).
  ensureTelegramReady();

  const user = tg.initDataUnsafe?.user ?? null;

  const context = {
    initData: resolvedInitData,
    user,
    telegramId: user?.id ?? null,
  };

  console.log('[getTelegramContext] returned:', {
    initDataPresent: Boolean(context.initData),
    initDataLength: context.initData?.length ?? 0,
    telegramId: context.telegramId,
    username: context.user?.username ?? null,
    user: context.user,
  });

  return context;
}
