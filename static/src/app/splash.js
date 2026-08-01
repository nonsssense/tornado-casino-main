/**
 * Conditional startup splash — static brand mark + opacity fade only.
 *
 * No SVG filters, no rAF loops, no rotating tornado animation.
 * Dismissal / timing APIs are unchanged.
 */

const SPLASH_THRESHOLD_MS = 375;
const SPLASH_FADE_MS = 180;

const SPLASH_WORDMARK_URL = '/assets/tornado%20full%20name%20logo%201.webp';
const SPLASH_LOGO_URL = '/assets/ava%20icon%20tornado%20main.webp';

/** @type {number|null} */
let showTimer = null;

/** @type {HTMLElement|null} */
let splashEl = null;

/** @type {number} */
let bootStartedAt = 0;

/** @type {number|null} */
let removeTimer = null;

function buildLogo() {
  const wrap = document.createElement('div');
  wrap.className = 'app-splash__logo-wrap';

  const img = document.createElement('img');
  img.className = 'app-splash__logo';
  img.src = SPLASH_LOGO_URL;
  img.alt = '';
  img.draggable = false;
  img.decoding = 'async';

  wrap.appendChild(img);
  return wrap;
}

function buildBrandBlock() {
  const brand = document.createElement('div');
  brand.className = 'app-splash__brand';

  const wordmark = document.createElement('img');
  wordmark.className = 'app-splash__wordmark';
  wordmark.src = SPLASH_WORDMARK_URL;
  wordmark.alt = 'Tornado';
  wordmark.draggable = false;
  wordmark.decoding = 'async';

  const subtitle = document.createElement('p');
  subtitle.className = 'app-splash__subtitle';
  subtitle.textContent = 'Kazakhstan Casino App';

  const tagline = document.createElement('p');
  tagline.className = 'app-splash__tagline';
  tagline.textContent = 'Provably Fair • Secure • Instant Crypto Deposits';

  brand.append(wordmark, subtitle, tagline);
  return brand;
}

function buildSplash() {
  const root = document.createElement('div');
  root.className = 'app-splash';
  root.setAttribute('aria-hidden', 'true');
  root.setAttribute('role', 'presentation');

  const stage = document.createElement('div');
  stage.className = 'app-splash__stage';

  const center = document.createElement('div');
  center.className = 'app-splash__center';
  center.appendChild(buildLogo());

  stage.append(center, buildBrandBlock());
  root.appendChild(stage);
  return root;
}

/**
 * @returns {boolean}
 */
function adoptEarlySplash() {
  const early = window.__tornadoSplash;
  if (!early?.el) return false;

  splashEl = early.el;
  return true;
}

export function startSplashWatch() {
  bootStartedAt = performance.now();

  if (window.__tornadoSplash?.timer) {
    clearTimeout(window.__tornadoSplash.timer);
    window.__tornadoSplash.timer = null;
  }

  if (window.__tornadoSplash) {
    window.__tornadoSplash.ready = false;
  }

  if (adoptEarlySplash()) {
    return;
  }

  if (showTimer) {
    clearTimeout(showTimer);
    showTimer = null;
  }

  if (removeTimer) {
    clearTimeout(removeTimer);
    removeTimer = null;
  }

  showTimer = window.setTimeout(() => {
    showTimer = null;

    if (window.__tornadoSplash?.ready) return;

    if (splashEl || window.__tornadoSplash?.el) {
      adoptEarlySplash();
      return;
    }

    const mount = document.getElementById('app-root');
    if (!mount) return;

    splashEl = buildSplash();
    mount.appendChild(splashEl);

    void splashEl.offsetWidth;
    splashEl.classList.add('app-splash--visible');

    if (window.__tornadoSplash) {
      window.__tornadoSplash.el = splashEl;
    }
  }, SPLASH_THRESHOLD_MS);
}

function cancelSplashScheduling() {
  if (window.__tornadoSplash) {
    window.__tornadoSplash.ready = true;
    if (window.__tornadoSplash.timer) {
      clearTimeout(window.__tornadoSplash.timer);
      window.__tornadoSplash.timer = null;
    }
  }

  if (showTimer) {
    clearTimeout(showTimer);
    showTimer = null;
  }

  if (removeTimer) {
    clearTimeout(removeTimer);
    removeTimer = null;
  }
}

function purgeSplashDom() {
  document.querySelectorAll('.app-splash').forEach((node) => {
    node.remove();
  });

  splashEl = null;

  if (window.__tornadoSplash) {
    window.__tornadoSplash.el = null;
    window.__tornadoSplash.stack = null;
    window.__tornadoSplash.tornado = null;
    window.__tornadoSplash.ready = true;
  }
}

/**
 * @param {{ immediate?: boolean }} [options]
 */
export function dismissSplash(options = {}) {
  const immediate = Boolean(options.immediate);

  cancelSplashScheduling();

  if (!splashEl) {
    adoptEarlySplash();
  }

  const nodes = Array.from(document.querySelectorAll('.app-splash'));
  if (!splashEl && nodes.length) {
    splashEl = nodes[0];
  }

  if (!splashEl && nodes.length === 0) {
    return;
  }

  if (immediate) {
    purgeSplashDom();
    return;
  }

  nodes.forEach((el) => {
    el.classList.add('app-splash--dismissed');
    el.classList.remove('app-splash--visible');
  });

  const toRemove = nodes.length ? nodes : splashEl ? [splashEl] : [];
  splashEl = null;

  if (window.__tornadoSplash) {
    window.__tornadoSplash.el = null;
    window.__tornadoSplash.stack = null;
    window.__tornadoSplash.tornado = null;
  }

  removeTimer = window.setTimeout(() => {
    removeTimer = null;
    toRemove.forEach((el) => el.remove());
    document.querySelectorAll('.app-splash').forEach((node) => node.remove());
  }, SPLASH_FADE_MS);
}

export function getBootElapsedMs() {
  return bootStartedAt ? performance.now() - bootStartedAt : 0;
}
