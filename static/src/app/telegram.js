/**
 * Telegram Mini App bridge.
 *
 * Responsibility:
 * - Wrap window.Telegram.WebApp (ready, expand, fullscreen, swipe, safe areas).
 * - Expose initData and user info for auth.service.js.
 * - Native BackButton helpers for game chrome.
 * - Safe HapticFeedback helpers for confirmed win/cashout feedback.
 * - Home Screen / hideKeyboard helpers (opt-in, no auto UI).
 * - Keep Telegram-specific code out of pages and components.
 */

/** @type {(() => void)|null} */
let telegramBackClickHandler = null;

/** @type {boolean} */
let safeAreaListenersBound = false;

/** @type {boolean} */
let telegramReadyNotified = false;

/** @returns {any} */
function getWebApp() {
  return window.Telegram?.WebApp ?? null;
}

/**
 * @param {any} tg
 * @returns {boolean}
 */
function hasRealTelegramSession(tg) {
  // Prefer live initData resolution: SDK field can stay empty after a late hash inject.
  return Boolean(tg && resolveInitData());
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
 * Sync Telegram Safe Area + Content Safe Area into CSS variables (Bot API 8.0+).
 * Defaults stay 0px so env(safe-area-inset-*) continues to work alone on older clients.
 * @param {any} [tg]
 */
function syncTelegramSafeAreaInsets(tg = getWebApp()) {
  if (!tg || !hasRealTelegramSession(tg)) return;

  try {
    const root = document.documentElement;
    const safe = tg.safeAreaInset || {};
    const content = tg.contentSafeAreaInset || {};

    /**
     * @param {string} name
     * @param {unknown} value
     */
    const setPx = (name, value) => {
      const n = Number(value);
      root.style.setProperty(name, `${Number.isFinite(n) ? n : 0}px`);
    };

    setPx('--tg-safe-area-inset-top', safe.top);
    setPx('--tg-safe-area-inset-bottom', safe.bottom);
    setPx('--tg-safe-area-inset-left', safe.left);
    setPx('--tg-safe-area-inset-right', safe.right);

    setPx('--tg-content-safe-area-inset-top', content.top);
    setPx('--tg-content-safe-area-inset-bottom', content.bottom);
    setPx('--tg-content-safe-area-inset-left', content.left);
    setPx('--tg-content-safe-area-inset-right', content.right);
  } catch {
    // Unsupported / refused — keep CSS defaults.
  }
}

/**
 * @param {any} tg
 */
function bindSafeAreaListeners(tg) {
  if (safeAreaListenersBound) return;
  if (typeof tg?.onEvent !== 'function') return;

  const sync = () => syncTelegramSafeAreaInsets(tg);

  try {
    tg.onEvent('safeAreaChanged', sync);
    tg.onEvent('contentSafeAreaChanged', sync);
    tg.onEvent('fullscreenChanged', sync);
    safeAreaListenersBound = true;
  } catch {
    // Older / partial clients — no-op.
  }
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
 * Notify Telegram that the Mini App is ready to be shown.
 * Safe to call early (splash is already in the HTML). Idempotent. Never throws.
 */
export function notifyTelegramReady() {
  if (telegramReadyNotified || window.__tornadoTelegramReady) {
    telegramReadyNotified = true;
    return;
  }

  const tg = getWebApp();
  if (!hasRealTelegramSession(tg)) return;

  try {
    tg.ready();
    telegramReadyNotified = true;
    window.__tornadoTelegramReady = true;
  } catch (error) {
    console.warn('[telegram] ready failed:', error);
  }
}

/**
 * Signal Mini App readiness when a real Telegram session is present.
 * Order: ready → expand → requestFullscreen (if supported) → disableVerticalSwipes
 * → sync safe-area insets (if supported).
 * Safe to call more than once. Never throws.
 */
export function ensureTelegramReady() {
  const tg = getWebApp();
  if (!hasRealTelegramSession(tg)) return;

  notifyTelegramReady();

  try {
    tg.expand();
  } catch (error) {
    console.warn('[telegram] expand failed:', error);
  }

  tryRequestFullscreen(tg);
  tryDisableVerticalSwipes(tg);
  syncTelegramSafeAreaInsets(tg);
  bindSafeAreaListeners(tg);
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

/** @type {(() => boolean)|null} */
let hapticEnabledResolver = null;

/**
 * Optional gate for Settings UI. When unset, haptics keep current always-on behavior.
 * @param {(() => boolean)|null} resolver
 */
export function setHapticEnabledResolver(resolver) {
  hapticEnabledResolver = typeof resolver === 'function' ? resolver : null;
}

/**
 * Win / successful-outcome haptic — Bot API 6.1+.
 * Uses notificationOccurred('success'): the official type for completed tasks.
 * impactOccurred is for UI collisions and often produces no vibration on Android.
 * No-op outside Telegram or when HapticFeedback is unavailable. Never throws.
 *
 * Prepared for haptic_enabled: when Settings UI calls setHapticEnabledResolver,
 * this respects that preference. Until then the resolver is null and behavior
 * is unchanged (always attempt in a real Telegram session).
 */
export function triggerWinHaptic() {
  try {
    if (hapticEnabledResolver && !hapticEnabledResolver()) return;
    const tg = getWebApp();
    if (!hasRealTelegramSession(tg)) return;
    if (typeof tg.HapticFeedback?.notificationOccurred !== 'function') return;
    tg.HapticFeedback.notificationOccurred('success');
  } catch {
    // Unsupported / refused — silent no-op.
  }
}

/**
 * Hide the on-screen keyboard — Bot API 9.1+.
 * Call only after a value has been confirmed/submitted. Never throws.
 */
export function hideTelegramKeyboard() {
  try {
    const tg = getWebApp();
    if (!hasRealTelegramSession(tg)) return;
    if (typeof tg.hideKeyboard !== 'function') return;
    tg.hideKeyboard();
  } catch {
    // Unsupported / refused — silent no-op.
  }
}

/**
 * Check home-screen shortcut status — Bot API 8.0+.
 * Does not show any UI or prompt. Resolves to status string or null if unavailable.
 * @returns {Promise<'unsupported'|'unknown'|'added'|'missed'|null>}
 */
export function checkHomeScreenStatus() {
  return new Promise((resolve) => {
    try {
      const tg = getWebApp();
      if (!hasRealTelegramSession(tg)) {
        resolve(null);
        return;
      }
      if (typeof tg.checkHomeScreenStatus !== 'function') {
        resolve(null);
        return;
      }
      tg.checkHomeScreenStatus((status) => {
        resolve(typeof status === 'string' ? status : null);
      });
    } catch {
      resolve(null);
    }
  });
}

/**
 * Prompt the user to add the Mini App to the home screen — Bot API 8.0+.
 * Does nothing automatically; call explicitly from UI when desired. Never throws.
 * @returns {boolean} true if the API call was attempted
 */
export function addToHomeScreen() {
  try {
    const tg = getWebApp();
    if (!hasRealTelegramSession(tg)) return false;
    if (typeof tg.addToHomeScreen !== 'function') return false;
    tg.addToHomeScreen();
    return true;
  } catch {
    return false;
  }
}

/**
 * Parse a single launch param from location.hash.
 * Telegram injects `#tgWebAppData=...&tgWebAppVersion=...` (and related keys).
 * @param {string} name
 * @returns {string}
 */
function readHashParam(name) {
  try {
    const hash = String(window.location.hash || '').replace(/^#/, '');
    if (!hash) return '';
    // Prefer URLSearchParams on the query portion of the hash.
    const query = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : hash;
    const value = new URLSearchParams(query).get(name);
    return value ? String(value) : '';
  } catch {
    return '';
  }
}

/**
 * Read tgWebAppData persisted by telegram-web-app.js (may be empty on first paint).
 * @returns {string}
 */
function readStoredTgWebAppData() {
  try {
    const raw = window.sessionStorage?.getItem('__telegram__initParams');
    if (!raw) return '';
    const parsed = JSON.parse(raw);
    const data = parsed?.tgWebAppData;
    return typeof data === 'string' && data ? data : '';
  } catch {
    return '';
  }
}

/**
 * Resolve signed initData from every Telegram launch source.
 *
 * Critical: telegram-web-app.js freezes WebApp.initData at script-load time from
 * the then-current hash. On cold Mini App opens the hash can arrive a moment
 * later — WebApp.initData stays empty forever, but location.hash becomes valid.
 * Auth must read the live location, not only the frozen SDK field.
 *
 * @returns {string}
 */
function resolveInitData() {
  const tg = getWebApp();
  const fromSdk = typeof tg?.initData === 'string' ? tg.initData : '';
  if (fromSdk) return fromSdk;

  const fromHash = readHashParam('tgWebAppData');
  if (fromHash) return fromHash;

  const fromQuery = new URLSearchParams(window.location.search).get('tgWebAppData');
  if (fromQuery) return String(fromQuery);

  return readStoredTgWebAppData();
}

/**
 * Parse user object from a signed initData query string.
 * @param {string} initData
 * @returns {object|null}
 */
function parseUserFromInitData(initData) {
  if (!initData) return null;
  try {
    const userRaw = new URLSearchParams(initData).get('user');
    if (!userRaw) return null;
    const user = JSON.parse(userRaw);
    return user && typeof user === 'object' ? user : null;
  } catch {
    return null;
  }
}

/**
 * @param {string} initData
 * @returns {string|null}
 */
function parseStartParamFromInitData(initData) {
  if (!initData) return null;
  try {
    return new URLSearchParams(initData).get('start_param') || null;
  } catch {
    return null;
  }
}

/**
 * Try to read Telegram context right now (no waiting).
 * @returns {object|null}
 */
function readTelegramContextSync() {
  const initData = resolveInitData();
  if (!initData) return null;

  const tg = getWebApp();
  // Call ready/expand when the WebApp object exists, even if SDK initData
  // was empty at script load (we may have recovered initData from the hash).
  if (tg) {
    try {
      ensureTelegramReady();
    } catch {
      // Non-fatal — auth only needs the signed initData string.
    }
  }

  const user = tg?.initDataUnsafe?.user || parseUserFromInitData(initData);
  if (!user?.id) return null;

  const startParam =
    parseStartParamFromInitData(initData)
    || tg?.initDataUnsafe?.start_param
    || readHashParam('tgWebAppStartParam')
    || new URLSearchParams(window.location.search).get('tgWebAppStartParam')
    || null;

  return {
    initData,
    user,
    telegramId: user.id,
    startParam: startParam || null,
  };
}

/**
 * True when the launch URL advertised a start_param that is not yet in initData.
 * Referral attribution needs start_param inside the signed initData body.
 * @param {string} initData
 * @returns {boolean}
 */
function initDataMissingExpectedStartParam(initData) {
  const expected =
    readHashParam('tgWebAppStartParam')
    || new URLSearchParams(window.location.search).get('tgWebAppStartParam')
    || window.Telegram?.WebApp?.initDataUnsafe?.start_param
    || '';
  if (!expected) return false;
  return !parseStartParamFromInitData(initData);
}

/**
 * Resolve Telegram context for authentication.
 *
 * Waits until signed initData (with a Telegram user id) is actually available.
 * Sources: WebApp.initData, live location.hash/search, telegram sessionStorage.
 * Also waits for start_param when the launch URL advertised one.
 *
 * Returns null only when this is clearly not a Telegram Mini App session
 * (no WebApp after wait) — browser stub. Never returns a context without
 * a Telegram user id.
 *
 * @returns {Promise<object|null>}
 */
export async function getTelegramContext() {
  // Bound for cold-start hash injection; resolves immediately when data exists.
  const MAX_WAIT_MS = 5000;
  const POLL_MS = 50;

  const tryRead = () => {
    const ctx = readTelegramContextSync();
    if (ctx && !initDataMissingExpectedStartParam(ctx.initData)) {
      return ctx;
    }
    return null;
  };

  const immediate = tryRead();
  if (immediate) return immediate;

  return new Promise((resolve) => {
    let settled = false;
    let elapsed = 0;
    /** @type {ReturnType<typeof setInterval>|null} */
    let pollId = null;

    const finish = (value) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('hashchange', onHashChange);
      if (pollId != null) clearInterval(pollId);
      resolve(value);
    };

    const onHashChange = () => {
      const ctx = tryRead();
      if (ctx) finish(ctx);
    };

    window.addEventListener('hashchange', onHashChange);

    pollId = setInterval(() => {
      elapsed += POLL_MS;
      const ctx = tryRead();
      if (ctx) {
        finish(ctx);
        return;
      }
      if (elapsed >= MAX_WAIT_MS) {
        // Outside Telegram: WebApp missing / empty forever → null.
        // Inside Telegram but still empty: null (caller must not auth).
        finish(tryRead() || readTelegramContextSync());
      }
    }, POLL_MS);
  });
}
