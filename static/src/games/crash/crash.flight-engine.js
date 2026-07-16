/**
 * Crash flight engine — synchronized cinematic renderer.
 *
 * Layer 1 (authoritative): round elapsed = now - start_time
 *   → climb progress completes in ~CLIMB_DURATION_SEC, then CRUISE.
 *   Mid-round join / restore seeks immediately (no replay from 1.00x).
 *
 * Layer 2 (visual): smooth Bézier takeoff, then natural upper-area cruise
 *   with cosmetic turbulence / bank / float only.
 *
 * HUD multiplier stays on the growth formula; path is NOT 1−1/m.
 */

import { createCloudsLayer } from './crash.clouds.js';
import { CRASH_GROWTH_RATE, CRASH_GROWTH_POWER } from './crash.constants.js';

const DPR_CAP = 2;
const PLANE_SRC = '/assets/crash-plane.webp';
const PLANE_BASE_W = 144;
const TRAIL_WIDTH = 7.2;
const TRAIL_FILL = 'rgb(158, 24, 34)';
const TRAIL_OUTLINE = 'rgba(28, 4, 8, 0.72)';
const EDGE_MARGIN = 26;
const TAIL_NX = 0.16633;
const TAIL_NY = 0.76546;
const SPRITE_AXIS = 0.0064;
const SPRITE_LEVEL = -SPRITE_AXIS;
const CLIMB_PITCH = -Math.PI * (7.5 / 180);
const PITCH_SCALE = 0.04;
const PROP_NX = 0.928;
const PROP_NY = 0.5401;
const PROP_COLOR = 'rgb(52, 55, 60)';
const PROP_BLADE_LEN = 0.088;
const PROP_BLADE_HALF_W = 0.0155;
const PROP_HUB_R = 0.012;
const PROP_SPIN = 4.4;
const ANGLE_FOLLOW = 5.5;
const ANGLE_VEL_DAMP = 7.0;
const ANGLE_SPRING = 6.0;
/** Cinematic takeoff duration in *round* seconds (from start_time). */
const CLIMB_DURATION_SEC = 2.55;
const CRASH_HOLD_SEC = 0.85;
const EXIT_SPEED_START = 70;
const EXIT_ACCEL = 520;
const TRAIL_FADE_SEC = 0.55;

/**
 * Smooth ease-in-out — gentle takeoff acceleration.
 * @param {number} t 0..1
 */
function easeInOutCubic(t) {
  const x = Math.max(0, Math.min(1, t));
  return x < 0.5
    ? 4 * x * x * x
    : 1 - ((-2 * x + 2) ** 3) / 2;
}

/**
 * Authoritative path progress from round elapsed time.
 * Takeoff 0→1 over CLIMB_DURATION_SEC, then stays at 1 (cruise).
 * @param {number} elapsedSec
 * @returns {number} 0..1
 */
export function climbProgressFromElapsed(elapsedSec) {
  if (elapsedSec <= 0) return 0;
  if (elapsedSec >= CLIMB_DURATION_SEC) return 1;
  return easeInOutCubic(elapsedSec / CLIMB_DURATION_SEC);
}

/**
 * Inverse of the shared growth formula → elapsed seconds.
 * @param {number} multiplier
 * @returns {number}
 */
export function elapsedFromMultiplier(multiplier) {
  const m = Math.max(1, Number(multiplier) || 1);
  if (m <= 1) return 0;
  const elapsedMs = (Math.log(m) / CRASH_GROWTH_RATE) ** (1 / CRASH_GROWTH_POWER);
  return elapsedMs / 1000;
}

/**
 * @deprecated Prefer climbProgressFromElapsed(start_time). Kept for callers.
 * @param {number} multiplier
 */
export function progressFromMultiplier(multiplier) {
  return climbProgressFromElapsed(elapsedFromMultiplier(multiplier));
}

/**
 * @param {number} current
 * @param {number} target
 * @param {number} t
 */
function lerp(current, target, t) {
  return current + (target - current) * t;
}

/**
 * @param {number} a
 * @param {number} b
 * @param {number} t
 */
function lerpAngle(a, b, t) {
  let diff = b - a;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

/**
 * @param {number} t 0..1
 */
function smoothstep(t) {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

/**
 * @param {{x:number,y:number}} p0
 * @param {{x:number,y:number}} p1
 * @param {{x:number,y:number}} p2
 * @param {{x:number,y:number}} p3
 * @param {number} t
 */
function cubicPoint(p0, p1, p2, p3, t) {
  const u = 1 - t;
  const tt = t * t;
  const uu = u * u;
  return {
    x: uu * u * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + tt * t * p3.x,
    y: uu * u * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + tt * t * p3.y,
  };
}

/**
 * @param {{x:number,y:number}} p0
 * @param {{x:number,y:number}} p1
 * @param {{x:number,y:number}} p2
 * @param {{x:number,y:number}} p3
 * @param {number} t
 */
function cubicTangent(p0, p1, p2, p3, t) {
  const u = 1 - t;
  return {
    x: 3 * u * u * (p1.x - p0.x) + 6 * u * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x),
    y: 3 * u * u * (p1.y - p0.y) + 6 * u * t * (p2.y - p1.y) + 3 * t * t * (p3.y - p2.y),
  };
}

/**
 * @param {{x:number,y:number}} a
 * @param {{x:number,y:number}} b
 * @param {number} t
 */
function lerpPoint(a, b, t) {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  };
}

/**
 * @param {{x:number,y:number}} p0
 * @param {{x:number,y:number}} p1
 * @param {{x:number,y:number}} p2
 * @param {{x:number,y:number}} p3
 * @param {number} t
 */
function splitCubicLeft(p0, p1, p2, p3, t) {
  const u = Math.max(0, Math.min(1, t));
  const p01 = lerpPoint(p0, p1, u);
  const p12 = lerpPoint(p1, p2, u);
  const p23 = lerpPoint(p2, p3, u);
  const p012 = lerpPoint(p01, p12, u);
  const p123 = lerpPoint(p12, p23, u);
  const p0123 = lerpPoint(p012, p123, u);
  return { p0, p1: p01, p2: p012, p3: p0123 };
}

/**
 * @param {HTMLElement} mount
 */
export function createFlightEngine(mount) {
  const cloudCanvas = document.createElement('canvas');
  cloudCanvas.className = 'crash-flight__clouds';
  cloudCanvas.setAttribute('aria-hidden', 'true');

  const canvas = document.createElement('canvas');
  canvas.className = 'crash-flight__canvas';
  canvas.setAttribute('aria-hidden', 'true');

  mount.replaceChildren(cloudCanvas, canvas);

  const ctx = canvas.getContext('2d', { alpha: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const cloudsLayer = createCloudsLayer(cloudCanvas);

  const planeImg = new Image();
  planeImg.decoding = 'async';
  planeImg.src = PLANE_SRC;
  let planeReady = false;
  planeImg.onload = () => {
    planeReady = true;
  };

  const state = {
    phase: 'idle',
    /** Authoritative round start (unix seconds) */
    startTime: null,
    /** HUD multiplier (display only; path uses elapsed) */
    multiplier: 1,
    /** Deterministic path progress from round elapsed (0..1, then cruise) */
    progress: 0,
    /** Frozen progress at crash */
    crashProgress: 0,
    crashExit: 'none',
    crashExitElapsed: 0,
    exitDist: 0,
    exitSpeed: EXIT_SPEED_START,
    trailAlpha: 1,
    planeAlpha: 1,
    planeVisible: true,
    onExitComplete: null,
    displayAngle: 0,
    angleVel: 0,
    propPhase: 0,
    /** Deterministic base tip (sync) */
    baseX: 0,
    baseY: 0,
    /** Rendered tip = base + cosmetics */
    planeX: 0,
    planeY: 0,
    floatPhase: 0,
    bank: 0,
    bankTarget: 0,
    rock: 0,
    turbX: 0,
    turbY: 0,
    turbTargetX: 0,
    turbTargetY: 0,
    turbTimer: 0,
    turbNext: 0.85,
    energyPhase: 0,
    depthScale: 1,
    depthTimer: 0,
    depthNext: 3.2,
    depthPulse: 0,
    depthActive: false,
    width: 0,
    height: 0,
    dpr: 1,
    raf: 0,
    lastTs: 0,
  };

  function getPlaneDrawSize(scale) {
    const aspect = planeReady && planeImg.naturalWidth
      ? planeImg.naturalWidth / Math.max(1, planeImg.naturalHeight)
      : 2.15;
    const drawW = PLANE_BASE_W * scale;
    return { drawW, drawH: drawW / aspect };
  }

  function planeExtentsFromTip(angle, scale) {
    const { drawW, drawH } = getPlaneDrawSize(scale);
    const locals = [
      [-drawW * TAIL_NX, -drawH * TAIL_NY],
      [drawW * (1 - TAIL_NX), -drawH * TAIL_NY],
      [-drawW * TAIL_NX, drawH * (1 - TAIL_NY)],
      [drawW * (1 - TAIL_NX), drawH * (1 - TAIL_NY)],
    ];
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < locals.length; i += 1) {
      const lx = locals[i][0];
      const ly = locals[i][1];
      const rx = lx * cos - ly * sin;
      const ry = lx * sin + ly * cos;
      if (rx < minX) minX = rx;
      if (rx > maxX) maxX = rx;
      if (ry < minY) minY = ry;
      if (ry > maxY) maxY = ry;
    }
    return { minX, maxX, minY, maxY };
  }

  function clampPlaneTip(x, y, angle, scale) {
    const e = planeExtentsFromTip(angle, scale);
    const m = EDGE_MARGIN;
    let minTipX = m - e.minX;
    let maxTipX = state.width - m - e.maxX;
    let minTipY = m - e.minY;
    let maxTipY = state.height - m - e.maxY;
    if (maxTipX < minTipX) {
      const mid = (minTipX + maxTipX) / 2;
      minTipX = mid;
      maxTipX = mid;
    }
    if (maxTipY < minTipY) {
      const mid = (minTipY + maxTipY) / 2;
      minTipY = mid;
      maxTipY = mid;
    }
    return {
      x: Math.max(minTipX, Math.min(maxTipX, x)),
      y: Math.max(minTipY, Math.min(maxTipY, y)),
    };
  }

  function getControls() {
    const w = state.width;
    const h = state.height;
    const { drawW, drawH } = getPlaneDrawSize(1);
    const p0 = { x: w * 0.01, y: h * 0.99 };
    const endX = Math.min(w * 0.90, w - EDGE_MARGIN - drawW * (1 - TAIL_NX));
    const endY = Math.max(h * 0.12, EDGE_MARGIN + drawH * TAIL_NY);
    const p3 = { x: endX, y: endY };
    const dx = p3.x - p0.x;
    const dy = p3.y - p0.y;
    const p1 = { x: p0.x + dx * 0.30, y: p0.y + dy * 0.10 };
    const p2 = { x: p0.x + dx * 0.64, y: p0.y + dy * 0.52 };
    return { p0, p1, p2, p3 };
  }

  function pathAt(t) {
    const { p0, p1, p2, p3 } = getControls();
    const u = Math.max(0, Math.min(1, t));
    return cubicPoint(p0, p1, p2, p3, u);
  }

  function angleAt(t) {
    const { p0, p1, p2, p3 } = getControls();
    const u = Math.max(0.001, Math.min(1, t));
    const tan = cubicTangent(p0, p1, p2, p3, u);
    const pathPitch = Math.atan2(tan.y, tan.x);
    return SPRITE_LEVEL + CLIMB_PITCH + pathPitch * PITCH_SCALE;
  }

  function resize() {
    if (!mount.isConnected) return;
    const rect = mount.getBoundingClientRect();
    const w = Math.max(0, Math.floor(rect.width));
    const h = Math.max(0, Math.floor(rect.height));
    if (w < 2 || h < 2) return;

    const nextDpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
    if (w === state.width && h === state.height && nextDpr === state.dpr) return;

    state.width = w;
    state.height = h;
    state.dpr = nextDpr;

    canvas.width = Math.floor(w * nextDpr);
    canvas.height = Math.floor(h * nextDpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(nextDpr, 0, 0, nextDpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    cloudsLayer.resize(w, h, nextDpr);
  }

  function clearFlight() {
    ctx.clearRect(0, 0, state.width, state.height);
  }

  /**
   * Authoritative pose from round elapsed (Layer 1).
   * Takeoff then cruise at path end — never crawls the full path with multiplier.
   */
  function syncBasePoseFromTimeline() {
    let progress;
    if (state.phase === 'crashed') {
      progress = state.crashProgress;
    } else {
      const elapsed = state.startTime != null
        ? Math.max(0, Date.now() / 1000 - state.startTime)
        : elapsedFromMultiplier(state.multiplier);
      progress = climbProgressFromElapsed(elapsed);
    }
    state.progress = progress;
    const tip = pathAt(Math.min(0.9999, Math.max(0, progress)));
    state.baseX = tip.x;
    state.baseY = tip.y;
    return progress >= 0.995;
  }

  function drawTrail(progress, depthScale, tipX, tipY, alpha = 1, extendBeyond = false) {
    if (alpha <= 0.01 || state.width < 2) return;

    const climbT = Math.max(0.002, Math.min(1, progress));
    const width = TRAIL_WIDTH * depthScale;
    const { p0, p1, p2, p3 } = getControls();
    const seg = splitCubicLeft(p0, p1, p2, p3, climbT);

    let end = {
      p0: seg.p0,
      p1: seg.p1,
      p2: { x: seg.p2.x, y: seg.p2.y },
      p3: { x: seg.p3.x, y: seg.p3.y },
    };

    if (extendBeyond) {
      end = {
        p0: seg.p0,
        p1: seg.p1,
        p2: seg.p2,
        p3: { x: seg.p3.x, y: seg.p3.y },
      };
    } else {
      const dx = tipX - seg.p3.x;
      const dy = tipY - seg.p3.y;
      end = {
        p0: seg.p0,
        p1: seg.p1,
        p2: { x: seg.p2.x + dx, y: seg.p2.y + dy },
        p3: { x: tipX, y: tipY },
      };
    }

    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));

    const strokeBezier = () => {
      ctx.beginPath();
      ctx.moveTo(end.p0.x, end.p0.y);
      ctx.bezierCurveTo(end.p1.x, end.p1.y, end.p2.x, end.p2.y, end.p3.x, end.p3.y);
      if (extendBeyond) {
        ctx.lineTo(tipX, tipY);
      }
    };

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    strokeBezier();
    ctx.strokeStyle = TRAIL_OUTLINE;
    ctx.lineWidth = width + 2.8;
    ctx.stroke();

    strokeBezier();
    ctx.strokeStyle = TRAIL_FILL;
    ctx.lineWidth = width;
    ctx.stroke();

    const pulseU = ((state.energyPhase % 1) + 1) % 1;
    const glow = cubicPoint(end.p0, end.p1, end.p2, end.p3, pulseU);
    const glowR = width * 1.8;
    const grad = ctx.createRadialGradient(glow.x, glow.y, 0, glow.x, glow.y, glowR);
    grad.addColorStop(0, 'rgba(255, 150, 160, 0.14)');
    grad.addColorStop(0.45, 'rgba(220, 70, 80, 0.06)');
    grad.addColorStop(1, 'rgba(220, 70, 80, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(glow.x, glow.y, glowR, 0, Math.PI * 2);
    ctx.fill();

    strokeBezier();
    ctx.strokeStyle = 'rgba(255, 170, 175, 0.10)';
    ctx.lineWidth = Math.max(1.2, width * 0.38);
    ctx.setLineDash([10, 48]);
    ctx.lineDashOffset = -state.energyPhase * 58;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  function drawPropeller(drawW, drawH) {
    const hubX = drawW * (PROP_NX - TAIL_NX);
    const hubY = drawH * (PROP_NY - TAIL_NY);
    const bladeLen = drawW * PROP_BLADE_LEN;
    const halfW = Math.max(1.1, drawW * PROP_BLADE_HALF_W);
    const hubR = Math.max(1.2, drawW * PROP_HUB_R);
    const parentAlpha = ctx.globalAlpha;
    const t = state.propPhase;
    const foreshort = Math.abs(Math.sin(t));
    const visibleLen = bladeLen * (0.22 + 0.78 * foreshort);
    const bladeAlpha = 0.42 + 0.58 * foreshort;

    function fillVerticalBlade(len) {
      const x0 = -halfW;
      const y0 = -len;
      const bw = halfW * 2;
      const bh = len * 2;
      const r = halfW;
      ctx.beginPath();
      ctx.moveTo(x0 + r, y0);
      ctx.lineTo(x0 + bw - r, y0);
      ctx.arcTo(x0 + bw, y0, x0 + bw, y0 + r, r);
      ctx.lineTo(x0 + bw, y0 + bh - r);
      ctx.arcTo(x0 + bw, y0 + bh, x0 + bw - r, y0 + bh, r);
      ctx.lineTo(x0 + r, y0 + bh);
      ctx.arcTo(x0, y0 + bh, x0, y0 + bh - r, r);
      ctx.lineTo(x0, y0 + r);
      ctx.arcTo(x0, y0, x0 + r, y0, r);
      ctx.closePath();
      ctx.fill();
    }

    ctx.save();
    ctx.translate(hubX, hubY);
    ctx.fillStyle = PROP_COLOR;
    ctx.globalAlpha = parentAlpha * bladeAlpha;
    fillVerticalBlade(visibleLen);
    const foreshort2 = Math.abs(Math.cos(t));
    if (foreshort2 > 0.12) {
      ctx.globalAlpha = parentAlpha * (0.18 + 0.32 * foreshort2);
      fillVerticalBlade(bladeLen * (0.18 + 0.55 * foreshort2));
    }
    ctx.globalAlpha = parentAlpha;
    ctx.beginPath();
    ctx.arc(0, 0, hubR, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawPlane(x, y, angle, scale, alpha = 1) {
    if (!planeReady || !planeImg.naturalWidth || alpha <= 0.01) return;
    const { drawW, drawH } = getPlaneDrawSize(scale);
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.translate(x, y);
    ctx.rotate(angle);
    drawPropeller(drawW, drawH);
    ctx.drawImage(planeImg, -drawW * TAIL_NX, -drawH * TAIL_NY, drawW, drawH);
    ctx.restore();
  }

  function getCrashExitHeading() {
    const { p0, p1, p2, p3 } = getControls();
    const u = Math.max(0.001, Math.min(1, state.crashProgress || 0.02));
    const tan = cubicTangent(p0, p1, p2, p3, u);
    const len = Math.hypot(tan.x, tan.y) || 1;
    return {
      nx: tan.x / len,
      ny: tan.y / len,
      angle: angleAt(u),
    };
  }

  function getCrashPoint() {
    return pathAt(Math.min(1, Math.max(0.02, state.crashProgress || 0)));
  }

  function isPlaneOffscreen(x, y, angle, scale) {
    const e = planeExtentsFromTip(angle, scale);
    const pad = 8;
    return (
      x + e.maxX < -pad
      || x + e.minX > state.width + pad
      || y + e.maxY < -pad
      || y + e.minY > state.height + pad
    );
  }

  function finishCrashExit() {
    if (state.crashExit === 'done') return;
    state.crashExit = 'done';
    state.planeVisible = false;
    state.trailAlpha = 0;
    state.planeAlpha = 0;
    const cb = state.onExitComplete;
    state.onExitComplete = null;
    if (typeof cb === 'function') cb();
  }

  function updateCrashExit(dt) {
    state.crashExitElapsed += dt;

    if (state.crashExit === 'hold') {
      state.turbTargetX = 0;
      state.turbTargetY = 0;
      state.bankTarget = 0;
      if (state.crashExitElapsed >= CRASH_HOLD_SEC) {
        state.crashExit = 'flyout';
        state.exitDist = 0;
        state.exitSpeed = EXIT_SPEED_START;
        state.turbX = 0;
        state.turbY = 0;
        state.bank = 0;
        state.rock = 0;
      }
      return;
    }

    if (state.crashExit === 'flyout') {
      state.exitSpeed += EXIT_ACCEL * dt;
      state.exitDist += state.exitSpeed * dt;
      const crashPt = getCrashPoint();
      const heading = getCrashExitHeading();
      state.planeX = crashPt.x + heading.nx * state.exitDist;
      state.planeY = crashPt.y + heading.ny * state.exitDist;
      state.displayAngle = heading.angle;
      state.angleVel = 0;
      state.planeVisible = true;
      state.planeAlpha = 1;
      state.trailAlpha = 1;
      if (isPlaneOffscreen(state.planeX, state.planeY, state.displayAngle, state.depthScale)) {
        state.crashExit = 'fade';
        state.crashExitElapsed = 0;
        state.planeVisible = false;
        state.planeAlpha = 0;
      }
      return;
    }

    if (state.crashExit === 'fade') {
      const t = Math.min(1, state.crashExitElapsed / TRAIL_FADE_SEC);
      state.trailAlpha = 1 - smoothstep(t);
      state.planeVisible = false;
      state.planeAlpha = 0;
      const crashPt = getCrashPoint();
      const heading = getCrashExitHeading();
      state.planeX = crashPt.x + heading.nx * state.exitDist;
      state.planeY = crashPt.y + heading.ny * state.exitDist;
      if (t >= 1) finishCrashExit();
    }
  }

  /** Cosmetics only — never written into baseX/baseY. */
  function updateCosmetics(dt, flying, cruising) {
    state.floatPhase += dt * 0.78;
    state.energyPhase += dt * 0.28;
    state.propPhase += dt * PROP_SPIN;

    const rockTarget = Math.sin(state.floatPhase * 0.95) * 0.028
      + Math.sin(state.floatPhase * 0.41 + 1.1) * 0.014;

    if (flying) {
      state.turbTimer += dt;
      if (state.turbTimer >= state.turbNext) {
        state.turbTimer = 0;
        state.turbNext = cruising
          ? 0.55 + Math.random() * 0.85
          : 0.7 + Math.random() * 1.1;
        const ampScale = cruising ? 1.15 : 0.85;
        const ampX = state.width * (0.006 + Math.random() * 0.01) * ampScale;
        const ampY = state.height * (0.008 + Math.random() * 0.012) * ampScale;
        state.turbTargetX = (Math.random() * 2 - 1) * ampX;
        state.turbTargetY = (Math.random() * 2 - 1) * ampY;
        state.bankTarget = (Math.random() * 2 - 1) * (cruising ? 0.055 : 0.04);
      }

      if (!state.depthActive) {
        state.depthTimer += dt;
        if (state.depthTimer >= state.depthNext) {
          state.depthActive = true;
          state.depthPulse = 0;
          state.depthTimer = 0;
          state.depthNext = 3.0 + Math.random() * 2.2;
        }
        state.depthScale = lerp(state.depthScale, 1, 1 - Math.exp(-dt * 4));
      } else {
        state.depthPulse += dt / 2.4;
        const p = state.depthPulse;
        let amount = 0;
        if (p < 0.32) amount = smoothstep(p / 0.32);
        else if (p < 0.42) amount = 1;
        else if (p < 1) amount = 1 - smoothstep((p - 0.42) / 0.58);
        else {
          state.depthActive = false;
          amount = 0;
        }
        state.depthScale = 1 - 0.065 * amount;
      }
    } else {
      state.turbTargetX = 0;
      state.turbTargetY = 0;
      state.bankTarget = 0;
      state.depthScale = lerp(state.depthScale, 1, 1 - Math.exp(-dt * 4));
    }

    // Stronger calm-air float while cruising near the top
    const floatAmp = cruising ? 1.35 : 1;
    const floatX = Math.sin(state.floatPhase * 0.55 + 0.8) * state.width * 0.0035 * floatAmp;
    const floatY = (Math.sin(state.floatPhase * 0.72) * state.height * 0.0055
      + Math.sin(state.floatPhase * 0.33 + 2) * state.height * 0.0025) * floatAmp;

    // Subtle forward drift while cruising (cosmetic — does not change sync progress)
    const cruiseNudgeX = cruising
      ? Math.sin(state.floatPhase * 0.31) * state.width * 0.004
      : 0;

    state.turbX = lerp(
      state.turbX,
      state.turbTargetX + floatX + cruiseNudgeX,
      1 - Math.exp(-dt * 2.4),
    );
    state.turbY = lerp(
      state.turbY,
      state.turbTargetY + floatY,
      1 - Math.exp(-dt * 2.4),
    );
    state.bank = lerp(state.bank, state.bankTarget, 1 - Math.exp(-dt * 2.6));
    state.rock = lerp(state.rock, rockTarget, 1 - Math.exp(-dt * 2.8));
  }

  function integrateAngle(target, dt) {
    const diff = ((target - state.displayAngle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    state.angleVel += diff * ANGLE_SPRING * dt;
    state.angleVel *= Math.exp(-dt * ANGLE_VEL_DAMP);
    state.displayAngle += state.angleVel * dt;
    state.displayAngle = lerpAngle(
      state.displayAngle,
      target,
      1 - Math.exp(-dt * ANGLE_FOLLOW),
    );
  }

  function applyCosmeticOffsetToBase() {
    const angle = angleAt(Math.max(0.001, Math.min(1, state.progress)));
    const targetAngle = angle + state.bank + state.rock;
    const rawX = state.baseX + state.turbX;
    const rawY = state.baseY + state.turbY;
    const clamped = clampPlaneTip(rawX, rawY, targetAngle, state.depthScale);
    state.planeX = clamped.x;
    state.planeY = clamped.y;
    return targetAngle;
  }

  function renderFrame(ts) {
    if (!state.lastTs) state.lastTs = ts;
    const dt = Math.min(0.048, (ts - state.lastTs) / 1000);
    state.lastTs = ts;

    resize();

    if (state.width < 2 || state.height < 2) {
      if (state.phase === 'idle' && (state.crashExit === 'done' || state.crashExit === 'none')) {
        state.raf = 0;
        return;
      }
      state.raf = requestAnimationFrame(renderFrame);
      return;
    }

    clearFlight();

    const exiting = state.phase === 'crashed' && state.crashExit !== 'done';
    const flying = state.phase === 'flying';
    cloudsLayer.setActive(flying || exiting);

    if (state.phase === 'idle' && (state.crashExit === 'done' || state.crashExit === 'none')) {
      state.raf = 0;
      return;
    }

    if (state.phase === 'crashed') {
      updateCrashExit(dt);
      state.energyPhase += dt * 0.22;
      state.propPhase += dt * PROP_SPIN;
      cloudsLayer.update(dt);

      const progress = Math.min(1, Math.max(0.02, state.crashProgress || state.progress));
      const depth = 1;

      if (state.crashExit === 'hold') {
        syncBasePoseFromTimeline();
        updateCosmetics(dt, false, false);
        const targetAngle = applyCosmeticOffsetToBase();
        integrateAngle(targetAngle, dt);
        cloudsLayer.draw();
        drawTrail(progress, depth, state.planeX, state.planeY, 1, false);
        if (state.planeVisible) {
          drawPlane(state.planeX, state.planeY, state.displayAngle, depth, 1);
        }
      } else {
        cloudsLayer.draw();
        drawTrail(progress, depth, state.planeX, state.planeY, state.trailAlpha, true);
        if (state.planeVisible) {
          drawPlane(state.planeX, state.planeY, state.displayAngle, depth, state.planeAlpha);
        }
      }

      if (state.crashExit === 'done') {
        state.raf = 0;
        return;
      }
      state.raf = requestAnimationFrame(renderFrame);
      return;
    }

    // —— Flying: authoritative elapsed → takeoff then cruise ——
    const cruising = syncBasePoseFromTimeline();
    updateCosmetics(dt, true, cruising);
    cloudsLayer.update(dt);
    const targetAngle = applyCosmeticOffsetToBase();
    integrateAngle(targetAngle, dt);

    const depth = state.depthScale;
    cloudsLayer.draw();
    drawTrail(state.progress, depth, state.planeX, state.planeY, 1, false);
    drawPlane(state.planeX, state.planeY, state.displayAngle, depth, 1);

    state.raf = requestAnimationFrame(renderFrame);
  }

  function ensureLoop() {
    if (!state.raf) {
      state.lastTs = 0;
      state.raf = requestAnimationFrame(renderFrame);
    }
  }

  function stopLoop() {
    if (state.raf) {
      cancelAnimationFrame(state.raf);
      state.raf = 0;
    }
    state.lastTs = 0;
  }

  function resetCosmetics() {
    state.floatPhase = 0;
    state.bank = 0;
    state.bankTarget = 0;
    state.rock = 0;
    state.turbX = 0;
    state.turbY = 0;
    state.turbTargetX = 0;
    state.turbTargetY = 0;
    state.turbTimer = 0;
    state.turbNext = 0.85;
    state.energyPhase = 0;
    state.depthScale = 1;
    state.depthTimer = 0;
    state.depthNext = 3.2;
    state.depthPulse = 0;
    state.depthActive = false;
    state.angleVel = 0;
    state.propPhase = 0;
    state.crashExit = 'none';
    state.crashExitElapsed = 0;
    state.exitDist = 0;
    state.exitSpeed = EXIT_SPEED_START;
    state.trailAlpha = 1;
    state.planeAlpha = 1;
    state.planeVisible = true;
  }

  const ro = typeof ResizeObserver !== 'undefined'
    ? new ResizeObserver(() => {
      resize();
      if (state.phase === 'flying' || (state.phase === 'crashed' && state.crashExit === 'hold')) {
        syncBasePoseFromTimeline();
        const targetAngle = applyCosmeticOffsetToBase();
        state.displayAngle = targetAngle;
      }
    })
    : null;
  ro?.observe(mount);
  resize();

  return {
    /**
     * Live flight. Path from start_time elapsed (takeoff → cruise).
     * Seeks immediately — never replays from 1.00x.
     * @param {number} multiplier HUD value
     * @param {{ startTime?: number|null }} [options]
     */
    setFlying(multiplier, options = {}) {
      const next = Math.max(1, Number(multiplier) || 1);
      const wasFlying = state.phase === 'flying';
      state.phase = 'flying';
      state.multiplier = next;
      if (options.startTime != null && Number.isFinite(Number(options.startTime))) {
        state.startTime = Number(options.startTime);
      }
      state.planeVisible = true;
      state.planeAlpha = 1;
      state.trailAlpha = 1;
      state.crashExit = 'none';
      if (!wasFlying) {
        resetCosmetics();
      }
      resize();
      syncBasePoseFromTimeline();
      const targetAngle = applyCosmeticOffsetToBase();
      if (!wasFlying) {
        state.displayAngle = targetAngle;
        state.angleVel = 0;
      }
      ensureLoop();
    },

    /**
     * @param {number|null} multiplier
     * @param {{ onExitComplete?: () => void, startTime?: number|null }} [options]
     */
    setCrashed(multiplier, options = {}) {
      state.phase = 'crashed';
      state.depthActive = false;
      state.depthScale = 1;
      state.angleVel = 0;
      state.onExitComplete = typeof options.onExitComplete === 'function'
        ? options.onExitComplete
        : null;

      if (options.startTime != null && Number.isFinite(Number(options.startTime))) {
        state.startTime = Number(options.startTime);
      }

      if (multiplier != null && Number.isFinite(Number(multiplier))) {
        state.multiplier = Math.max(1, Number(multiplier));
      }

      // Freeze climb/cruise pose from crash multiplier → round elapsed → path
      state.crashProgress = climbProgressFromElapsed(elapsedFromMultiplier(state.multiplier));
      state.progress = state.crashProgress;
      state.crashExit = 'hold';
      state.crashExitElapsed = 0;
      state.exitDist = 0;
      state.exitSpeed = EXIT_SPEED_START;
      state.trailAlpha = 1;
      state.planeAlpha = 1;
      state.planeVisible = true;
      state.turbX = 0;
      state.turbY = 0;
      state.bank = 0;
      state.rock = 0;

      resize();
      syncBasePoseFromTimeline();
      const targetAngle = applyCosmeticOffsetToBase();
      state.displayAngle = targetAngle;
      ensureLoop();
    },

    /**
     * @param {{ onReady?: () => void }} [options]
     */
    prepareNextRound(options = {}) {
      const onReady = typeof options.onReady === 'function' ? options.onReady : null;

      if (state.phase === 'crashed' && state.crashExit !== 'done' && state.crashExit !== 'none') {
        const prev = state.onExitComplete;
        state.onExitComplete = () => {
          if (typeof prev === 'function') prev();
          state.phase = 'idle';
          state.multiplier = 1;
          state.startTime = null;
          state.progress = 0;
          resetCosmetics();
          clearFlight();
          cloudsLayer.setActive(false);
          state.planeVisible = false;
          stopLoop();
          if (onReady) onReady();
        };
        ensureLoop();
        return;
      }

      state.phase = 'idle';
      state.multiplier = 1;
      state.startTime = null;
      state.progress = 0;
      resetCosmetics();
      clearFlight();
      cloudsLayer.setActive(false);
      state.planeVisible = false;
      stopLoop();
      if (onReady) onReady();
    },

    setIdle() {
      state.phase = 'idle';
      state.multiplier = 1;
      state.startTime = null;
      state.progress = 0;
      resetCosmetics();
      clearFlight();
      cloudsLayer.setActive(false);
      state.planeVisible = false;
      stopLoop();
    },

    destroy() {
      stopLoop();
      cloudsLayer.destroy();
      ro?.disconnect();
      mount.replaceChildren();
    },
  };
}
