/**
 * Conditional startup splash — exact Loading Banner artwork.
 *
 * Base: still silhouette + circulating internal light/shade.
 * Added: regional shape flow (upper / mid / tail) at ~2–3% deformation
 * so the vortex feels fluid without moving the whole logo.
 */

const SPLASH_THRESHOLD_MS = 375;
const SPLASH_FADE_MS = 180;

const TORNADO_LAYOUT = {
  left: '38.981%',
  top: '43.854%',
  width: '21.296%',
  height: '12.917%',
};

const SPLASH_ART_URL = '/assets/loading-splash.webp';
const SPLASH_TORNADO_URL = '/assets/loading-splash-tornado.webp';

/** @type {number|null} */
let showTimer = null;

/** @type {HTMLElement|null} */
let splashEl = null;

/** @type {HTMLElement|null} */
let tornadoStack = null;

/** @type {number} */
let bootStartedAt = 0;

/** @type {number} */
let motionRaf = 0;

/** @type {number|null} */
let removeTimer = null;

/** @type {(() => void)|null} */
let stopTornadoMotion = null;

/**
 * Masked light layers + regional shape flow on a nearly-static silhouette.
 * @returns {HTMLElement}
 */
function buildTornadoStack() {
  const wrap = document.createElement('div');
  wrap.className = 'app-splash__tornado-wrap';
  wrap.style.left = TORNADO_LAYOUT.left;
  wrap.style.top = TORNADO_LAYOUT.top;
  wrap.style.width = TORNADO_LAYOUT.width;
  wrap.style.height = TORNADO_LAYOUT.height;

  const stack = document.createElement('div');
  stack.className = 'app-splash__tornado-stack';

  // Soft procedural displacement — ~1px swirl through the surface.
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'app-splash__tornado-defs');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = `
    <defs>
      <filter id="tornado-micro-warp" x="-6%" y="-6%" width="112%" height="112%" color-interpolation-filters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="0.028 0.12" numOctaves="3" seed="7" result="noise">
          <animate attributeName="baseFrequency"
            values="0.028 0.12;0.034 0.095;0.024 0.135;0.028 0.12"
            dur="5.2s" repeatCount="indefinite" calcMode="spline"
            keySplines="0.37 0 0.63 1;0.37 0 0.63 1;0.37 0 0.63 1"
            keyTimes="0;0.38;0.72;1"/>
        </feTurbulence>
        <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.35" xChannelSelector="R" yChannelSelector="G"/>
      </filter>
    </defs>
  `;

  const aura = document.createElement('div');
  aura.className = 'app-splash__tornado-aura';

  // Three overlapping spiral bands — shape flow with phase offsets.
  const mesh = document.createElement('div');
  mesh.className = 'app-splash__tornado-mesh';

  const regions = [
    { name: 'upper', className: 'app-splash__tornado app-splash__tornado--region app-splash__tornado--upper' },
    { name: 'mid', className: 'app-splash__tornado app-splash__tornado--region app-splash__tornado--mid' },
    { name: 'tail', className: 'app-splash__tornado app-splash__tornado--region app-splash__tornado--tail' },
  ];

  regions.forEach(({ className }) => {
    const img = document.createElement('img');
    img.className = className;
    img.src = SPLASH_TORNADO_URL;
    img.alt = '';
    img.draggable = false;
    img.decoding = 'async';
    mesh.appendChild(img);
  });

  const maskStyle = (el) => {
    el.style.webkitMaskImage = `url("${SPLASH_TORNADO_URL}")`;
    el.style.maskImage = `url("${SPLASH_TORNADO_URL}")`;
  };

  const vortex = document.createElement('div');
  vortex.className = 'app-splash__tornado-light app-splash__tornado-light--vortex';
  maskStyle(vortex);

  const specular = document.createElement('div');
  specular.className = 'app-splash__tornado-light app-splash__tornado-light--specular';
  maskStyle(specular);

  const shade = document.createElement('div');
  shade.className = 'app-splash__tornado-light app-splash__tornado-light--shade';
  maskStyle(shade);

  stack.append(svg, aura, mesh, vortex, shade, specular);
  wrap.appendChild(stack);

  tornadoStack = stack;
  return wrap;
}

/**
 * Lighting (unchanged base) + subtle regional shape flow.
 * Position of the whole tornado stays still — only local form changes.
 * @param {HTMLElement} stack
 * @param {number} t
 */
function applyTornadoLive(stack, t) {
  const mesh = stack.querySelector('.app-splash__tornado-mesh');
  const upper = stack.querySelector('.app-splash__tornado--upper');
  const mid = stack.querySelector('.app-splash__tornado--mid');
  const tail = stack.querySelector('.app-splash__tornado--tail');
  const aura = stack.querySelector('.app-splash__tornado-aura');
  const vortex = stack.querySelector('.app-splash__tornado-light--vortex');
  const specular = stack.querySelector('.app-splash__tornado-light--specular');
  const shade = stack.querySelector('.app-splash__tornado-light--shade');

  // Mesh: brightness + surface warp only — no whole-logo translate.
  if (mesh) {
    const brightness = 1.01 + Math.sin(t * 0.85) * 0.025;
    mesh.style.filter =
      `url(#tornado-micro-warp) brightness(${brightness.toFixed(3)}) ` +
      `drop-shadow(0 0 3px rgba(255, 200, 40, 0.18))`;
  }

  // Upper spiral: tightens / loosens + micro twist (±~2.8%).
  if (upper) {
    const pulse = Math.sin(t * 1.05);
    const twist = Math.sin(t * 0.92 + 0.5);
    const sx = 1 + pulse * 0.028;
    const sy = 1 - pulse * 0.016;
    upper.style.transform =
      `rotate(${(twist * 0.65).toFixed(3)}deg) scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`;
  }

  // Middle body: vortex compress / expand, phase offset (feels like rotation).
  if (mid) {
    const pulse = Math.sin(t * 1.18 + 1.9);
    const flow = Math.sin(t * 1.55 + 0.7);
    const sx = 1 + pulse * 0.032;
    const sy = 1 - pulse * 0.02 + flow * 0.008;
    mid.style.transform =
      `scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`;
  }

  // Lower tip: soft asymmetric sway in shape space only (±~2%).
  if (tail) {
    const pulse = Math.sin(t * 1.32 + 3.1);
    const sway = Math.sin(t * 1.08 + 2.4);
    const sx = 1 + pulse * 0.02;
    const sy = 1 - pulse * 0.014;
    tail.style.transform =
      `translateX(${(sway * 0.7).toFixed(3)}px) rotate(${(sway * 0.85).toFixed(3)}deg) ` +
      `scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`;
  }

  // Tight separation glow — circulates slightly, never a cloud.
  if (aura) {
    const a = t * 0.9;
    const hx = 50 + Math.cos(a) * 6;
    const hy = 52 + Math.sin(a) * 5;
    const pulse = 0.14 + Math.sin(t * 1.05) * 0.03;
    aura.style.opacity = String(Math.max(0.1, Math.min(0.2, pulse)));
    aura.style.background =
      `radial-gradient(ellipse 42% 48% at ${hx.toFixed(1)}% ${hy.toFixed(1)}%, ` +
      `rgba(255, 210, 50, 0.45) 0%, rgba(255, 180, 0, 0.12) 35%, transparent 62%)`;
  }

  // Continuous angular swirl inside the silhouette (~full turn ~5.5s).
  if (vortex) {
    const deg = (t * 65) % 360;
    vortex.style.background =
      `conic-gradient(from ${deg.toFixed(1)}deg at 50% 46%, ` +
      `transparent 0deg, ` +
      `rgba(255, 248, 200, 0.38) 28deg, ` +
      `rgba(255, 220, 60, 0.18) 55deg, ` +
      `transparent 95deg, ` +
      `rgba(40, 20, 0, 0.22) 160deg, ` +
      `rgba(20, 10, 0, 0.28) 195deg, ` +
      `transparent 240deg, ` +
      `rgba(255, 230, 90, 0.32) 300deg, ` +
      `transparent 340deg)`;
    vortex.style.opacity = '0.85';
  }

  // Specular rides the bright sector of the vortex.
  if (specular) {
    const a = t * (Math.PI * 2 / 5.5);
    const x = 50 + Math.cos(a) * 28;
    const y = 46 + Math.sin(a) * 26;
    specular.style.background =
      `radial-gradient(circle at ${x.toFixed(1)}% ${y.toFixed(1)}%, ` +
      `rgba(255, 255, 240, 0.9) 0%, rgba(255, 235, 120, 0.4) 12%, ` +
      `transparent 32%)`;
    specular.style.opacity = String(0.55 + Math.sin(a + 0.4) * 0.1);
  }

  // Shade opposite the specular — depth cue for rotation.
  if (shade) {
    const a = t * (Math.PI * 2 / 5.5) + Math.PI;
    const x = 50 + Math.cos(a) * 26;
    const y = 48 + Math.sin(a) * 24;
    shade.style.background =
      `radial-gradient(ellipse 70% 55% at ${x.toFixed(1)}% ${y.toFixed(1)}%, ` +
      `rgba(0, 0, 0, 0.45) 0%, rgba(0, 0, 0, 0.18) 30%, transparent 58%)`;
    shade.style.opacity = '0.55';
  }
}

/**
 * @param {HTMLElement} stack
 * @returns {() => void}
 */
function startTornadoMotion(stack) {
  const started = performance.now();
  let running = true;

  const tick = (now) => {
    if (!running) return;
    applyTornadoLive(stack, (now - started) / 1000);
    motionRaf = requestAnimationFrame(tick);
  };

  motionRaf = requestAnimationFrame(tick);

  return () => {
    running = false;
    if (motionRaf) {
      cancelAnimationFrame(motionRaf);
      motionRaf = 0;
    }
  };
}

function clearMotion() {
  if (stopTornadoMotion) {
    stopTornadoMotion();
    stopTornadoMotion = null;
  }

  if (motionRaf) {
    cancelAnimationFrame(motionRaf);
    motionRaf = 0;
  }

  const early = window.__tornadoSplash;
  if (early?.raf) {
    cancelAnimationFrame(early.raf);
    early.raf = 0;
  }
  if (typeof early?.stop === 'function') {
    early.stop();
    early.stop = null;
  }
}

function buildSplash() {
  const root = document.createElement('div');
  root.className = 'app-splash';
  root.setAttribute('aria-hidden', 'true');
  root.setAttribute('role', 'presentation');

  const stage = document.createElement('div');
  stage.className = 'app-splash__stage';

  const art = document.createElement('img');
  art.className = 'app-splash__art';
  art.src = SPLASH_ART_URL;
  art.alt = '';
  art.draggable = false;
  art.decoding = 'async';

  stage.appendChild(art);
  stage.appendChild(buildTornadoStack());
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
  tornadoStack = early.stack || early.el.querySelector('.app-splash__tornado-stack');
  return true;
}

export function startSplashWatch() {
  bootStartedAt = performance.now();

  // Ensure a fresh watch cannot be blocked by a previous dismiss flag,
  // but cancel any leftover HTML timer so we don't get duplicate splash mounts.
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

    // Startup already finished — never mount splash after a terminal state.
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

    if (tornadoStack) {
      stopTornadoMotion = startTornadoMotion(tornadoStack);
    }

    if (window.__tornadoSplash) {
      window.__tornadoSplash.el = splashEl;
      window.__tornadoSplash.stack = tornadoStack;
    }
  }, SPLASH_THRESHOLD_MS);
}

/**
 * Cancel pending splash timers and stop all motion loops.
 */
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

  clearMotion();
}

/**
 * Remove every splash node from the document (covers orphaned / early / late mounts).
 */
function purgeSplashDom() {
  document.querySelectorAll('.app-splash').forEach((node) => {
    node.remove();
  });

  splashEl = null;
  tornadoStack = null;

  if (window.__tornadoSplash) {
    window.__tornadoSplash.el = null;
    window.__tornadoSplash.stack = null;
    window.__tornadoSplash.tornado = null;
    window.__tornadoSplash.ready = true;
  }
}

/**
 * Call when startup reaches a terminal state (auth success or failure).
 * @param {{ immediate?: boolean }} [options] - skip fade when switching to auth error
 */
export function dismissSplash(options = {}) {
  const immediate = Boolean(options.immediate);

  cancelSplashScheduling();

  if (!splashEl) {
    adoptEarlySplash();
  }

  // Also catch any splash that was appended without going through local refs.
  const nodes = Array.from(document.querySelectorAll('.app-splash'));
  if (!splashEl && nodes.length) {
    splashEl = nodes[0];
  }

  if (!splashEl && nodes.length === 0) {
    return;
  }

  clearMotion();

  if (immediate) {
    purgeSplashDom();
    return;
  }

  nodes.forEach((el) => {
    el.classList.add('app-splash--dismissed');
    el.classList.remove('app-splash--visible');
  });

  const toRemove = nodes.length ? nodes : (splashEl ? [splashEl] : []);
  splashEl = null;
  tornadoStack = null;

  if (window.__tornadoSplash) {
    window.__tornadoSplash.el = null;
    window.__tornadoSplash.stack = null;
    window.__tornadoSplash.tornado = null;
  }

  removeTimer = window.setTimeout(() => {
    removeTimer = null;
    toRemove.forEach((el) => el.remove());
    // Final sweep in case another instance mounted during fade.
    document.querySelectorAll('.app-splash').forEach((node) => node.remove());
  }, SPLASH_FADE_MS);
}

export function getBootElapsedMs() {
  return bootStartedAt ? performance.now() - bootStartedAt : 0;
}
