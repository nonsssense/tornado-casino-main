/**
 * Crash flight engine — cinematic Canvas 2D Bézier flight.
 * Visual only. Multiplier UI stays fixed/centered outside this canvas.
 */

import { createCloudsLayer } from './crash.clouds.js';
import planeSrc from '../../../../assets/crash-plane.webp';

const DPR_CAP = 2;
/** Static airplane body (propeller is drawn separately in code). */
const PLANE_SRC = planeSrc;
const PLANE_BASE_W = 144; // ~12.5% larger than prior 128px for small-screen readability
const TRAIL_WIDTH = 7.2; // ~2.8× prior trail weight
/** Solid dark red — single color, no along-path gradient */
const TRAIL_FILL = 'rgb(158, 24, 34)';
const TRAIL_OUTLINE = 'rgba(28, 4, 8, 0.72)';
/** Keep full sprite inside the field (end / cruise) */
const EDGE_MARGIN = 26;
/**
 * Trail / transform origin = lower-back of the tail (underside rear of fuselage).
 * Normalized against crash-plane.webp (opaque content calibrated).
 */
const TAIL_NX = 0.16633;
const TAIL_NY = 0.76546;
/**
 * Near-horizontal body asset — baked axis ≈ 0. Then hold a gentle 5–10° climb.
 * (Negative = nose-up in canvas coords.)
 */
const SPRITE_AXIS = 0.0064;
const SPRITE_LEVEL = -SPRITE_AXIS;
/** ~7.5° above horizontal — within the 5–10° window */
const CLIMB_PITCH = -Math.PI * (7.5 / 180);
/** Tiny residual path influence so attitude eases slightly with the curve */
const PITCH_SCALE = 0.04;
/**
 * Prop hub = dark nose-cone center in body bitmap space (normalized).
 * Seated into the cone (not past the tip) so the disc sits flush on the engine.
 * Vector propeller rotates about this point only.
 */
const PROP_NX = 0.928;
const PROP_NY = 0.5401;
/** Prop styling — flat vector, matches body */
const PROP_COLOR = 'rgb(52, 55, 60)';
const PROP_BLADE_LEN = 0.088; // fraction of plane draw width
const PROP_BLADE_HALF_W = 0.0155;
const PROP_HUB_R = 0.012;
/** Quiet continuous spin (rad/s) */
const PROP_SPIN = 4.4;
/** Rotation inertia — calm Piper glide (lower = more lag / mass) */
const ANGLE_FOLLOW = 2.6;
const ANGLE_VEL_DAMP = 5.5;
const ANGLE_SPRING = 9.0;
/** Position float follow */
const POS_FOLLOW = 3.4;
/** Seconds to reach upper-right (~18% slower than prior 2.15s takeoff) */
const CLIMB_DURATION_SEC = 2.55;
/** Crash ending — hold final pose before fly-out */
const CRASH_HOLD_SEC = 0.85;
/** Initial exit speed (px/s), then accelerate gently into the sky */
const EXIT_SPEED_START = 70;
const EXIT_ACCEL = 520;
/** Trail linger + fade after the plane leaves the frame */
const TRAIL_FADE_SEC = 0.55;

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
 * Smooth ease-in-out — gentle start, continuous climb, soft arrival.
 * @param {number} t 0..1
 */
function easeInOutCubic(t) {
  const x = Math.max(0, Math.min(1, t));
  return x < 0.5
    ? 4 * x * x * x
    : 1 - ((-2 * x + 2) ** 3) / 2;
}

/**
 * Elapsed flight time → climb progress (0→1).
 * Elegant takeoff: ease-in-out, not a launched ascent.
 * @param {number} elapsedSec
 */
function climbProgressFromElapsed(elapsedSec) {
  if (elapsedSec <= 0) return 0;
  if (elapsedSec >= CLIMB_DURATION_SEC) return 1;
  return easeInOutCubic(elapsedSec / CLIMB_DURATION_SEC);
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
 * De Casteljau split — left segment is the curve on [0, t] as one cubic.
 * Guarantees a single continuous Bézier (C1) when stroked via bezierCurveTo.
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

  // Depth: background → clouds → plane/trail
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
    multiplier: 1,
    /** performance.now() when current flight began */
    flightStartTs: 0,
    /** Frozen elapsed at crash (sec), or -1 while live */
    crashElapsedSec: -1,
    /** Climb progress frozen at crash (0..1) */
    crashProgress: 0,
    /** Crash ending sub-phase: hold → flyout → fade → done */
    crashExit: 'none',
    crashExitElapsed: 0,
    exitDist: 0,
    exitSpeed: EXIT_SPEED_START,
    trailAlpha: 1,
    planeAlpha: 1,
    planeVisible: true,
    /** Invoked once when the exit sequence fully completes */
    onExitComplete: null,
    progress: 0,
    displayProgress: 0,
    displayAngle: 0,
    angleVel: 0,
    /** Continuous propeller phase (radians) */
    propPhase: 0,
    /** Smoothed plane / trail-tail position */
    planeX: 0,
    planeY: 0,
    planeReadyPos: false,
    /** Calm-air float + bank */
    floatPhase: 0,
    bank: 0,
    bankTarget: 0,
    rock: 0,
    /** Cruise-zone live offsets (screen px) */
    turbX: 0,
    turbY: 0,
    turbTargetX: 0,
    turbTargetY: 0,
    turbTimer: 0,
    turbNext: 0.85,
    /** Soft energy pulse along trail (0..1 repeating) */
    energyPhase: 0,
    /** Depth pulse */
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

  /**
   * @param {number} scale
   */
  function getPlaneDrawSize(scale) {
    const aspect = planeReady && planeImg.naturalWidth
      ? planeImg.naturalWidth / Math.max(1, planeImg.naturalHeight)
      : 2.15;
    const drawW = PLANE_BASE_W * scale;
    return { drawW, drawH: drawW / aspect };
  }

  /**
   * Rotated AABB of the sprite relative to the tip (trail / transform origin).
   * @param {number} angle
   * @param {number} scale
   */
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

  /**
   * Clamp tip so the entire rotated sprite stays inside the field + margin.
   * @param {number} x
   * @param {number} y
   * @param {number} angle
   * @param {number} scale
   */
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

  /**
   * Single elegant cubic: takeoff from bottom-left corner → upper-right.
   * Control points keep a shallow early climb (no kink / rocket bend).
   */
  function getControls() {
    const w = state.width;
    const h = state.height;
    const { drawW, drawH } = getPlaneDrawSize(1);

    // Exact corner takeoff (tail at field corner)
    const p0 = { x: w * 0.01, y: h * 0.99 };

    // End inset so the plane stays fully visible in the upper-right
    const endX = Math.min(w * 0.90, w - EDGE_MARGIN - drawW * (1 - TAIL_NX));
    const endY = Math.max(h * 0.12, EDGE_MARGIN + drawH * TAIL_NY);
    const p3 = { x: endX, y: endY };

    const dx = p3.x - p0.x;
    const dy = p3.y - p0.y;
    // Shallow initial tangent, then gradual altitude gain — one uninterrupted arc
    const p1 = { x: p0.x + dx * 0.30, y: p0.y + dy * 0.10 };
    const p2 = { x: p0.x + dx * 0.64, y: p0.y + dy * 0.52 };

    return { p0, p1, p2, p3 };
  }

  /**
   * @param {number} t 0..1 along climb curve
   */
  function pathAt(t) {
    const { p0, p1, p2, p3 } = getControls();
    const u = Math.max(0, Math.min(1, t));
    return cubicPoint(p0, p1, p2, p3, u);
  }

  /**
   * Path heading with reduced pitch for a natural Piper-like climb.
   * @param {number} t
   */
  function angleAt(t) {
    const { p0, p1, p2, p3 } = getControls();
    const u = Math.max(0.001, Math.min(1, t));
    const tan = cubicTangent(p0, p1, p2, p3, u);
    const pathPitch = Math.atan2(tan.y, tan.x);
    // Level the baked nose-up sprite, hold a soft climb, whisper-follow the path.
    return SPRITE_LEVEL + CLIMB_PITCH + pathPitch * PITCH_SCALE;
  }

  function resize() {
    const rect = mount.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));
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
   * Full climb trail — one continuous cubic ending exactly at the plane's tail.
   * Soft energy highlight travels along the same path (no particles).
   * @param {number} progress
   * @param {number} depthScale
   * @param {number} tipX Tail world X
   * @param {number} tipY Tail world Y
   * @param {number} [alpha=1]
   * @param {boolean} [extendBeyond=false] When true, trail continues from crash point to tip
   */
  function drawTrail(progress, depthScale, tipX, tipY, alpha = 1, extendBeyond = false) {
    if (alpha <= 0.01) return;

    const climbT = Math.max(0.002, Math.min(1, progress));
    const width = TRAIL_WIDTH * depthScale;
    const { p0, p1, p2, p3 } = getControls();
    const seg = splitCubicLeft(p0, p1, p2, p3, climbT);

    // Translate end handle so the cubic terminates exactly at the tail (still one cubic)
    let end = {
      p0: seg.p0,
      p1: seg.p1,
      p2: { x: seg.p2.x, y: seg.p2.y },
      p3: { x: seg.p3.x, y: seg.p3.y },
    };

    if (extendBeyond) {
      // Keep the climb cubic ending at the frozen crash point; line continues to the plane.
      const crashTip = { x: seg.p3.x, y: seg.p3.y };
      end = {
        p0: seg.p0,
        p1: seg.p1,
        p2: seg.p2,
        p3: crashTip,
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

    // Faint energy pulse drifting along the trail
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

    // Soft shimmer on the same continuous cubic — no joints
    strokeBezier();
    ctx.strokeStyle = 'rgba(255, 170, 175, 0.10)';
    ctx.lineWidth = Math.max(1.2, width * 0.38);
    ctx.setLineDash([10, 48]);
    ctx.lineDashOffset = -state.energyPhase * 58;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  /**
   * Side-view propeller only (90° profile, same as the airframe).
   * Blades stay vertical — length/opacity pulse simulates spin about the nose axis.
   * Never draws a front-facing / camera-facing rotor disc.
   * @param {number} drawW
   * @param {number} drawH
   */
  function drawPropeller(drawW, drawH) {
    const hubX = drawW * (PROP_NX - TAIL_NX);
    const hubY = drawH * (PROP_NY - TAIL_NY);
    const bladeLen = drawW * PROP_BLADE_LEN;
    const halfW = Math.max(1.1, drawW * PROP_BLADE_HALF_W);
    const hubR = Math.max(1.2, drawW * PROP_HUB_R);
    const parentAlpha = ctx.globalAlpha;
    const t = state.propPhase;

    // Side-view projection of blades spinning about the longitudinal axis:
    // on-screen they stay a vertical pair; foreshortening = |sin|.
    const foreshort = Math.abs(Math.sin(t));
    const visibleLen = bladeLen * (0.22 + 0.78 * foreshort);
    const bladeAlpha = 0.42 + 0.58 * foreshort;

    /**
     * Vertical capsule through the hub (profile silhouette).
     * @param {number} len
     */
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

    // No rotate() on blade geometry — side view stays vertical
    ctx.globalAlpha = parentAlpha * bladeAlpha;
    fillVerticalBlade(visibleLen);

    // Soft secondary flash (out-of-phase foreshortening) for spin readability
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

  /**
   * Draw plane with transform origin locked to the trail attach point
   * (lower-back of the tail). Body is static in local space; only the
   * independent propeller rotates about the nose hub.
   * @param {number} x Tail world X
   * @param {number} y Tail world Y
   * @param {number} angle
   * @param {number} scale
   * @param {number} [alpha=1]
   */
  function drawPlane(x, y, angle, scale, alpha = 1) {
    if (!planeReady || !planeImg.naturalWidth || alpha <= 0.01) return;

    const { drawW, drawH } = getPlaneDrawSize(scale);

    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.translate(x, y);
    ctx.rotate(angle);
    // Prop behind body so the nose cone occludes the hub center
    drawPropeller(drawW, drawH);
    ctx.drawImage(
      planeImg,
      -drawW * TAIL_NX,
      -drawH * TAIL_NY,
      drawW,
      drawH,
    );
    ctx.restore();
  }

  /**
   * Unit climb tangent at the frozen crash progress (exit heading).
   */
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

  /**
   * Crash-point world position on the climb curve.
   */
  function getCrashPoint() {
    return pathAt(Math.min(1, Math.max(0.02, state.crashProgress || 0)));
  }

  /**
   * True when the entire sprite is clear of the visible field.
   */
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
    if (typeof cb === 'function') {
      cb();
    }
  }

  /**
   * @param {number} dt
   */
  function updateCrashExit(dt) {
    state.crashExitElapsed += dt;

    if (state.crashExit === 'hold') {
      // Soft settle — no exit motion yet
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
      state.planeReadyPos = true;
      state.planeVisible = true;
      state.planeAlpha = 1;
      state.trailAlpha = 1;

      if (isPlaneOffscreen(
        state.planeX,
        state.planeY,
        state.displayAngle,
        state.depthScale,
      )) {
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
      // exitDist already frozen at off-screen tip — trail shape stays put while alpha fades
      const crashPt = getCrashPoint();
      const heading = getCrashExitHeading();
      state.planeX = crashPt.x + heading.nx * state.exitDist;
      state.planeY = crashPt.y + heading.ny * state.exitDist;
      if (t >= 1) {
        finishCrashExit();
      }
    }
  }

  /**
   * @param {number} dt
   */
  function updateDepth(dt) {
    if (state.phase !== 'flying') return;

    if (!state.depthActive) {
      state.depthTimer += dt;
      if (state.depthTimer >= state.depthNext) {
        state.depthActive = true;
        state.depthPulse = 0;
        state.depthTimer = 0;
        state.depthNext = 3.0 + Math.random() * 2.2;
      }
      state.depthScale = lerp(state.depthScale, 1, 1 - Math.exp(-dt * 4));
      return;
    }

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

  /**
   * Calm-air float, bank, and cruise turbulence — always soft & interpolated.
   * @param {number} dt
   * @param {boolean} cruising
   */
  function updateAirMotion(dt, cruising) {
    state.floatPhase += dt * 0.78;
    state.energyPhase += dt * 0.28;

    // Slow natural rocking / banking (whole flight)
    const rockTarget = Math.sin(state.floatPhase * 0.95) * 0.028
      + Math.sin(state.floatPhase * 0.41 + 1.1) * 0.014;
    const bankWave = Math.sin(state.floatPhase * 0.62 + 0.4) * 0.04
      + Math.sin(state.floatPhase * 1.15) * 0.018;

    if (cruising && state.phase === 'flying') {
      state.turbTimer += dt;
      if (state.turbTimer >= state.turbNext) {
        state.turbTimer = 0;
        state.turbNext = 0.7 + Math.random() * 1.1;
        const ampX = state.width * (0.008 + Math.random() * 0.012);
        const ampY = state.height * (0.01 + Math.random() * 0.014);
        state.turbTargetX = (Math.random() * 2 - 1) * ampX;
        state.turbTargetY = (Math.random() * 2 - 1) * ampY;
        state.bankTarget = (Math.random() * 2 - 1) * 0.05;
      }
    } else {
      state.turbTargetX = 0;
      state.turbTargetY = 0;
      state.bankTarget = 0;
    }

    const floatX = Math.sin(state.floatPhase * 0.55 + 0.8) * state.width * 0.0035;
    const floatY = Math.sin(state.floatPhase * 0.72) * state.height * 0.0055
      + Math.sin(state.floatPhase * 0.33 + 2) * state.height * 0.0025;

    state.turbX = lerp(
      state.turbX,
      state.turbTargetX + floatX,
      1 - Math.exp(-dt * 1.8),
    );
    state.turbY = lerp(
      state.turbY,
      state.turbTargetY + floatY,
      1 - Math.exp(-dt * 1.6),
    );
    state.bank = lerp(
      state.bank,
      bankWave + state.bankTarget,
      1 - Math.exp(-dt * 2.0),
    );
    state.rock = lerp(state.rock, rockTarget, 1 - Math.exp(-dt * 2.2));
  }

  /**
   * Spring-damper angle so the plane has mass and lags the curve.
   * @param {number} target
   * @param {number} dt
   * @param {boolean} hard
   */
  function integrateAngle(target, dt, hard) {
    if (hard) {
      state.displayAngle = target;
      state.angleVel = 0;
      return;
    }
    let err = target - state.displayAngle;
    while (err > Math.PI) err -= Math.PI * 2;
    while (err < -Math.PI) err += Math.PI * 2;
    state.angleVel += err * ANGLE_SPRING * dt;
    state.angleVel *= Math.exp(-ANGLE_VEL_DAMP * dt);
    state.displayAngle += state.angleVel * dt;
    // Soft absolute pull so it never drifts forever
    state.displayAngle = lerpAngle(
      state.displayAngle,
      target,
      1 - Math.exp(-dt * ANGLE_FOLLOW),
    );
  }

  function renderFrame(ts) {
    if (!state.lastTs) state.lastTs = ts;
    const dt = Math.min(0.048, (ts - state.lastTs) / 1000);
    state.lastTs = ts;

    resize();
    clearFlight();

    const flying = state.phase === 'flying'
      || (state.phase === 'crashed' && state.crashExit !== 'done');
    cloudsLayer.setActive(flying);

    if (state.phase === 'idle' || (state.phase === 'crashed' && state.crashExit === 'done')) {
      state.raf = requestAnimationFrame(renderFrame);
      return;
    }

    if (state.phase === 'crashed') {
      updateCrashExit(dt);
      state.energyPhase += dt * 0.22;
      state.propPhase += dt * PROP_SPIN;
      cloudsLayer.update(dt);

      const depth = 1;
      state.depthScale = depth;
      const exiting = state.crashExit === 'flyout' || state.crashExit === 'fade';
      const progress = Math.min(1, Math.max(0.02, state.crashProgress || state.progress));

      if (state.crashExit === 'hold') {
        // Stay locked on the frozen crash pose
        const tip = clampPlaneTip(
          state.planeX,
          state.planeY,
          state.displayAngle,
          depth,
        );
        state.planeX = tip.x;
        state.planeY = tip.y;
        cloudsLayer.draw();
        drawTrail(progress, depth, state.planeX, state.planeY, 1, false);
        drawPlane(state.planeX, state.planeY, state.displayAngle, depth, 1);
      } else if (exiting) {
        cloudsLayer.draw();
        // Climb path frozen at crash; trail stays attached and extends to the plane tip.
        // After flyout, planeX/Y hold the last exit tip so the trail freezes once off-screen.
        drawTrail(
          progress,
          depth,
          state.planeX,
          state.planeY,
          state.trailAlpha,
          true,
        );
        if (state.planeVisible) {
          drawPlane(
            state.planeX,
            state.planeY,
            state.displayAngle,
            depth,
            state.planeAlpha,
          );
        }
      }

      state.raf = requestAnimationFrame(renderFrame);
      return;
    }

    const elapsedSec = state.flightStartTs
      ? (ts - state.flightStartTs) / 1000
      : 0;

    const targetProgress = climbProgressFromElapsed(elapsedSec);
    // Heavier progress lag — plane eases along the path, never snaps
    const followRate = 4.2;
    state.displayProgress = lerp(
      state.displayProgress,
      targetProgress,
      1 - Math.exp(-dt * followRate),
    );
    state.progress = state.displayProgress;

    const cruising = state.progress >= 0.995;
    updateDepth(dt);
    updateAirMotion(dt, cruising);
    state.propPhase += dt * PROP_SPIN;
    cloudsLayer.update(dt);

    const guide = pathAt(Math.min(1, state.progress));
    const targetX = guide.x + state.turbX;
    const targetY = guide.y + state.turbY;

    if (!state.planeReadyPos) {
      state.planeX = targetX;
      state.planeY = targetY;
      state.planeReadyPos = true;
    } else {
      state.planeX = lerp(state.planeX, targetX, 1 - Math.exp(-dt * POS_FOLLOW));
      state.planeY = lerp(state.planeY, targetY, 1 - Math.exp(-dt * POS_FOLLOW));
    }

    const climbHeading = angleAt(Math.max(0.001, Math.min(1, state.progress)));
    const targetAngle = climbHeading + state.bank + state.rock;
    integrateAngle(targetAngle, dt, false);

    const depth = state.depthScale;
    const tip = clampPlaneTip(state.planeX, state.planeY, state.displayAngle, depth);
    state.planeX = tip.x;
    state.planeY = tip.y;

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

  function resetMotion() {
    state.progress = 0;
    state.displayProgress = 0;
    state.displayAngle = angleAt(0.02);
    state.angleVel = 0;
    state.propPhase = 0;
    state.planeX = 0;
    state.planeY = 0;
    state.planeReadyPos = false;
    state.floatPhase = 0;
    state.bank = 0;
    state.bankTarget = 0;
    state.rock = 0;
    state.flightStartTs = 0;
    state.crashElapsedSec = -1;
    state.crashProgress = 0;
    state.crashExit = 'none';
    state.crashExitElapsed = 0;
    state.exitDist = 0;
    state.exitSpeed = EXIT_SPEED_START;
    state.trailAlpha = 1;
    state.planeAlpha = 1;
    state.planeVisible = true;
    state.onExitComplete = null;
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
  }

  const ro = typeof ResizeObserver !== 'undefined'
    ? new ResizeObserver(() => resize())
    : null;
  ro?.observe(mount);
  resize();
  ensureLoop();

  return {
    /**
     * @param {number} multiplier
     */
    setFlying(multiplier) {
      const next = Math.max(1, Number(multiplier) || 1);
      if (state.phase !== 'flying') {
        state.phase = 'flying';
        state.multiplier = next;
        resetMotion();
        state.flightStartTs = performance.now();
        state.displayProgress = 0;
        state.progress = 0;
        state.displayAngle = angleAt(0.02);
      } else {
        state.multiplier = next;
      }
      ensureLoop();
    },

    /**
     * @param {number|null} multiplier
     * @param {{ onExitComplete?: () => void }} [options]
     */
    setCrashed(multiplier, options = {}) {
      state.phase = 'crashed';
      state.depthActive = false;
      state.depthScale = 1;
      state.angleVel = 0;
      state.onExitComplete = typeof options.onExitComplete === 'function'
        ? options.onExitComplete
        : null;

      if (state.flightStartTs) {
        state.crashElapsedSec = (performance.now() - state.flightStartTs) / 1000;
      } else if (state.crashElapsedSec < 0) {
        state.crashElapsedSec = CLIMB_DURATION_SEC;
      }

      if (multiplier != null && Number.isFinite(Number(multiplier))) {
        state.multiplier = Math.max(1, Number(multiplier));
      }

      state.crashProgress = climbProgressFromElapsed(state.crashElapsedSec);
      state.displayProgress = state.crashProgress;
      state.progress = state.crashProgress;
      state.crashExit = 'hold';
      state.crashExitElapsed = 0;
      state.exitDist = 0;
      state.exitSpeed = EXIT_SPEED_START;
      state.trailAlpha = 1;
      state.planeAlpha = 1;
      state.planeVisible = true;

      const tip = pathAt(Math.min(1, Math.max(0.02, state.crashProgress)));
      const clamped = clampPlaneTip(
        tip.x,
        tip.y,
        angleAt(Math.min(1, Math.max(0.02, state.crashProgress))),
        1,
      );
      state.planeX = clamped.x;
      state.planeY = clamped.y;
      state.planeReadyPos = true;
      state.displayAngle = angleAt(Math.min(1, Math.max(0.02, state.crashProgress)));
      state.turbX = 0;
      state.turbY = 0;
      state.bank = 0;
      state.rock = 0;
      ensureLoop();
    },

    /**
     * Softly prepare for the next round without a hard visual cut mid-exit.
     * If an exit is still playing, finish it first then idle.
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
          resetMotion();
          clearFlight();
          cloudsLayer.setActive(false);
          // Park next takeoff off-screen at the path start (not drawn while idle)
          const start = pathAt(0.001);
          state.planeX = start.x;
          state.planeY = start.y;
          state.displayAngle = angleAt(0.02);
          state.planeReadyPos = true;
          state.planeVisible = false;
          ensureLoop();
          if (onReady) onReady();
        };
        ensureLoop();
        return;
      }

      state.phase = 'idle';
      state.multiplier = 1;
      resetMotion();
      clearFlight();
      cloudsLayer.setActive(false);
      const start = pathAt(0.001);
      state.planeX = start.x;
      state.planeY = start.y;
      state.displayAngle = angleAt(0.02);
      state.planeReadyPos = true;
      state.planeVisible = false;
      ensureLoop();
      if (onReady) onReady();
    },

    setIdle() {
      state.phase = 'idle';
      state.multiplier = 1;
      resetMotion();
      clearFlight();
      cloudsLayer.setActive(false);
      ensureLoop();
    },

    destroy() {
      stopLoop();
      cloudsLayer.destroy();
      ro?.disconnect();
      mount.replaceChildren();
    },
  };
}
