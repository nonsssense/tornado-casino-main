/**
 * Plinko board — SVG peg grid, baskets, ball (layout from geometry).
 */

import { createElement } from '../../utils/dom.js';
import {
  computePlinkoLayout,
  toViewCoords,
  formatMultiplierLabel,
  PLINKO_VIEW,
  PLINKO_VIEW_PAD_X,
} from './plinko.geometry.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * @param {string} tag
 * @param {object} [attrs]
 */
function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs).forEach(([key, value]) => {
    if (value != null) el.setAttribute(key, String(value));
  });
  return el;
}

/**
 * Shared gradients / filters for board depth, pegs, ball, and slots.
 * @returns {SVGDefsElement}
 */
function createBoardDefs() {
  const defs = svgEl('defs');

  const pegGrad = svgEl('radialGradient', {
    id: 'plinko-peg-gradient',
    cx: '35%',
    cy: '32%',
    r: '68%',
  });
  pegGrad.appendChild(svgEl('stop', { offset: '0%', 'stop-color': '#ffffff' }));
  pegGrad.appendChild(svgEl('stop', { offset: '55%', 'stop-color': '#f2f2f4' }));
  pegGrad.appendChild(svgEl('stop', { offset: '100%', 'stop-color': '#d8d8de' }));
  defs.appendChild(pegGrad);

  const pegHitGrad = svgEl('radialGradient', {
    id: 'plinko-peg-hit-gradient',
    cx: '35%',
    cy: '32%',
    r: '68%',
  });
  pegHitGrad.appendChild(svgEl('stop', { offset: '0%', 'stop-color': '#fff8e0' }));
  pegHitGrad.appendChild(svgEl('stop', { offset: '55%', 'stop-color': '#f5e08a' }));
  pegHitGrad.appendChild(svgEl('stop', { offset: '100%', 'stop-color': '#e0c84a' }));
  defs.appendChild(pegHitGrad);

  // Soft contact shadow only — matte, not metallic chrome
  const pegFloat = svgEl('filter', {
    id: 'plinko-peg-float',
    x: '-50%',
    y: '-50%',
    width: '200%',
    height: '220%',
  });
  pegFloat.appendChild(svgEl('feOffset', {
    in: 'SourceAlpha',
    dx: '0',
    dy: '1.2',
    result: 'shadowOffset',
  }));
  pegFloat.appendChild(svgEl('feGaussianBlur', {
    in: 'shadowOffset',
    stdDeviation: '1.1',
    result: 'shadowBlur',
  }));
  pegFloat.appendChild(svgEl('feFlood', {
    'flood-color': '#000000',
    'flood-opacity': '0.28',
    result: 'shadowColor',
  }));
  pegFloat.appendChild(svgEl('feComposite', {
    in: 'shadowColor',
    in2: 'shadowBlur',
    operator: 'in',
    result: 'ambientShadow',
  }));
  const pegMerge = svgEl('feMerge');
  pegMerge.appendChild(svgEl('feMergeNode', { in: 'ambientShadow' }));
  pegMerge.appendChild(svgEl('feMergeNode', { in: 'SourceGraphic' }));
  pegFloat.appendChild(pegMerge);
  defs.appendChild(pegFloat);

  const ballGrad = svgEl('radialGradient', {
    id: 'plinko-ball-gradient',
    cx: '34%',
    cy: '30%',
    r: '70%',
  });
  ballGrad.appendChild(svgEl('stop', { offset: '0%', 'stop-color': '#fff4b0' }));
  ballGrad.appendChild(svgEl('stop', { offset: '40%', 'stop-color': '#fcd312' }));
  ballGrad.appendChild(svgEl('stop', { offset: '100%', 'stop-color': '#b8860b' }));
  defs.appendChild(ballGrad);

  return defs;
}

/* Deep luxury palette — edge emerald → center burnt amber (symmetrical) */
const BUCKET_COLOR_STOPS = [
  { t: 0, rgb: [176, 98, 36] },
  { t: 0.22, rgb: [188, 138, 42] },
  { t: 0.42, rgb: [156, 158, 48] },
  { t: 0.62, rgb: [88, 148, 62] },
  { t: 0.8, rgb: [42, 132, 78] },
  { t: 1, rgb: [24, 118, 86] },
];

/**
 * @param {number} a
 * @param {number} b
 * @param {number} t
 */
function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * @param {{ r: number, g: number, b: number }} a
 * @param {{ r: number, g: number, b: number }} b
 * @param {number} t
 */
function mixRgb(a, b, t) {
  return {
    r: Math.round(lerp(a.r, b.r, t)),
    g: Math.round(lerp(a.g, b.g, t)),
    b: Math.round(lerp(a.b, b.b, t)),
  };
}

/**
 * Multi-tone luxury material tones for a bucket body gradient.
 * @param {{ r: number, g: number, b: number }} rgb
 */
function bucketMaterialTones(rgb) {
  const champagne = { r: 236, g: 224, b: 188 };
  const deepShadow = {
    r: Math.round(rgb.r * 0.42),
    g: Math.round(rgb.g * 0.44),
    b: Math.round(rgb.b * 0.4),
  };
  return {
    gloss: mixRgb(rgb, champagne, 0.55),
    highlight: mixRgb(rgb, champagne, 0.28),
    mid: rgb,
    shade: {
      r: Math.round(rgb.r * 0.72),
      g: Math.round(rgb.g * 0.74),
      b: Math.round(rgb.b * 0.7),
    },
    deep: deepShadow,
  };
}

/**
 * Color by board position — continuous, symmetrical left↔right.
 * @param {number} index
 * @param {number} count
 * @returns {{ r: number, g: number, b: number }}
 */
function colorForBucketIndex(index, count) {
  if (count <= 1) {
    const [r, g, b] = BUCKET_COLOR_STOPS[0].rgb;
    return { r, g, b };
  }

  const mid = (count - 1) / 2;
  const edgeT = Math.min(1, Math.abs(index - mid) / mid);
  const stops = BUCKET_COLOR_STOPS;

  for (let i = 0; i < stops.length - 1; i += 1) {
    const a = stops[i];
    const b = stops[i + 1];
    if (edgeT >= a.t && edgeT <= b.t) {
      const u = (edgeT - a.t) / (b.t - a.t || 1);
      const s = u * u * (3 - 2 * u);
      return {
        r: Math.round(lerp(a.rgb[0], b.rgb[0], s)),
        g: Math.round(lerp(a.rgb[1], b.rgb[1], s)),
        b: Math.round(lerp(a.rgb[2], b.rgb[2], s)),
      };
    }
  }

  const last = stops[stops.length - 1].rgb;
  return { r: last[0], g: last[1], b: last[2] };
}

/**
 * @param {{ r: number, g: number, b: number }} rgb
 * @param {number} alpha
 */
function rgba({ r, g, b }, alpha) {
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Fixed label size for every bucket — never scale per label. */
const BIN_LABEL_FONT_SIZE = 7;

/**
 * @param {object} options
 * @param {number} options.rows
 * @param {string} options.riskMode
 * @param {number[]|null} [options.multipliers]
 */
export function createPlinkoBoard(options = {}) {
  const state = {
    rows: options.rows ?? 12,
    riskMode: options.riskMode ?? 'medium',
    multipliers: options.multipliers ?? null,
  };

  let layout = computePlinkoLayout(state.rows);

  const atmosphereGroup = svgEl('g', { class: 'plinko-board__atmosphere-svg' });
  const trayGroup = svgEl('g', { class: 'plinko-board__tray-svg' });
  const pegsGroup = svgEl('g', { class: 'plinko-board__pegs-svg' });
  const binsGroup = svgEl('g', { class: 'plinko-board__bins-svg' });

  function createBallElement() {
    return svgEl('circle', {
      class: 'plinko-board__ball-svg',
      r: '7',
      cx: String(PLINKO_VIEW.width / 2),
      cy: String(PLINKO_VIEW.height * 0.018),
      visibility: 'hidden',
    });
  }

  const ballsGroup = svgEl('g', { class: 'plinko-board__balls-svg' });
  const ball = createBallElement();
  ballsGroup.appendChild(ball);
  const ballPool = [ball];
  let activeBallAnimations = 0;

  const svg = svgEl('svg', {
    class: 'plinko-board__svg',
    viewBox: `${-PLINKO_VIEW_PAD_X} 0 ${PLINKO_VIEW.width + PLINKO_VIEW_PAD_X * 2} ${PLINKO_VIEW.height}`,
    preserveAspectRatio: 'xMidYMid meet',
    'aria-hidden': 'true',
  });
  svg.appendChild(createBoardDefs());
  svg.appendChild(atmosphereGroup);
  svg.appendChild(trayGroup);
  svg.appendChild(pegsGroup);
  svg.appendChild(binsGroup);
  svg.appendChild(ballsGroup);

  const canvas = createElement('div', {
    className: 'plinko-board__canvas',
    children: [svg],
  });

  const root = createElement('div', {
    className: 'plinko-board',
    attrs: { 'data-game': 'plinko-board' },
    children: [canvas],
  });

  /** @type {Map<string, SVGElement>} */
  const pegElements = new Map();

  /** @type {Map<number, SVGGElement>} */
  const binElements = new Map();
  const binPulseTimers = new Map();

  function pegRadius() {
    return Math.max(4.5, 9.5 - state.rows * 0.28);
  }

  function applyRiskTheme() {
    root.dataset.risk = state.riskMode;
    root.dataset.rows = String(state.rows);
  }

  function renderAtmosphere() {
    atmosphereGroup.replaceChildren();
  }

  function renderPegs() {
    pegsGroup.replaceChildren();
    pegElements.clear();

    const r = pegRadius();

    layout.pegs.forEach((peg) => {
      const { cx, cy } = toViewCoords(peg.x, peg.y);

      const g = svgEl('g', {
        class: 'plinko-board__peg-svg',
        'data-row': String(peg.row),
        'data-col': String(peg.col),
        transform: `translate(${cx} ${cy})`,
      });

      const shadow = svgEl('ellipse', {
        class: 'plinko-board__peg-shadow',
        cx: '0',
        cy: String(r * 0.88),
        rx: String(r * 1.05),
        ry: String(r * 0.3),
      });

      const sphere = svgEl('circle', {
        class: 'plinko-board__peg-sphere',
        cx: '0',
        cy: '0',
        r: String(r),
      });

      const highlight = svgEl('ellipse', {
        class: 'plinko-board__peg-highlight',
        cx: String(-r * 0.26),
        cy: String(-r * 0.3),
        rx: String(r * 0.28),
        ry: String(r * 0.2),
      });

      g.appendChild(shadow);
      g.appendChild(sphere);
      g.appendChild(highlight);
      pegsGroup.appendChild(g);
      pegElements.set(`${peg.row}:${peg.col}`, g);
    });
  }

  /**
   * Premium satin UI buttons — animation-ready landing slots.
   */
  function renderBins() {
    binsGroup.replaceChildren();
    trayGroup.replaceChildren();
    binElements.clear();

    const defs = svg.querySelector('defs');
    defs?.querySelectorAll('[data-bin-grad]').forEach((el) => el.remove());

    const baskets = layout.baskets;
    if (!baskets.length) return;

    const mults = state.multipliers ?? [];
    const gapPx = layout.gapX * PLINKO_VIEW.width;
    const gap = Math.max(0.5, Math.min(1, gapPx * 0.02));
    const slotW = Math.max(20, gapPx - gap);
    const slotH = 44;
    const radius = 10;
    const count = baskets.length;

    if (defs) {
      const hi = svgEl('linearGradient', {
        id: 'plinko-bin-highlight',
        x1: '0%',
        y1: '0%',
        x2: '0%',
        y2: '100%',
        'data-bin-grad': '1',
      });
      hi.appendChild(svgEl('stop', { offset: '0%', 'stop-color': 'rgba(255,248,230,0.28)' }));
      hi.appendChild(svgEl('stop', { offset: '40%', 'stop-color': 'rgba(255,240,210,0.08)' }));
      hi.appendChild(svgEl('stop', { offset: '100%', 'stop-color': 'rgba(255,255,255,0)' }));
      defs.appendChild(hi);

      const gloss = svgEl('linearGradient', {
        id: 'plinko-bin-gloss',
        x1: '0%',
        y1: '0%',
        x2: '0%',
        y2: '100%',
        'data-bin-grad': '1',
      });
      gloss.appendChild(svgEl('stop', { offset: '0%', 'stop-color': 'rgba(255,250,235,0.55)' }));
      gloss.appendChild(svgEl('stop', { offset: '100%', 'stop-color': 'rgba(255,245,220,0)' }));
      defs.appendChild(gloss);

      const shade = svgEl('linearGradient', {
        id: 'plinko-bin-shade',
        x1: '0%',
        y1: '0%',
        x2: '0%',
        y2: '100%',
        'data-bin-grad': '1',
      });
      shade.appendChild(svgEl('stop', { offset: '0%', 'stop-color': 'rgba(0,0,0,0)' }));
      shade.appendChild(svgEl('stop', { offset: '48%', 'stop-color': 'rgba(0,0,0,0.04)' }));
      shade.appendChild(svgEl('stop', { offset: '100%', 'stop-color': 'rgba(0,0,0,0.28)' }));
      defs.appendChild(shade);
    }

    baskets.forEach((basket) => {
      const { cx, cy } = toViewCoords(basket.x, basket.y);
      const mult = mults[basket.index];
      const label = mult != null ? formatMultiplierLabel(mult) : '…';
      const rgb = colorForBucketIndex(basket.index, count);
      const tones = bucketMaterialTones(rgb);
      const x0 = cx - slotW / 2;
      const y0 = cy - slotH / 2;
      const gradId = 'plinko-bin-grad-' + basket.index;

      if (defs) {
        const grad = svgEl('linearGradient', {
          id: gradId,
          x1: '0%',
          y1: '0%',
          x2: '0%',
          y2: '100%',
          'data-bin-grad': '1',
        });
        grad.appendChild(svgEl('stop', { offset: '0%', 'stop-color': rgba(tones.gloss, 1) }));
        grad.appendChild(svgEl('stop', { offset: '18%', 'stop-color': rgba(tones.highlight, 1) }));
        grad.appendChild(svgEl('stop', { offset: '46%', 'stop-color': rgba(tones.mid, 1) }));
        grad.appendChild(svgEl('stop', { offset: '74%', 'stop-color': rgba(tones.shade, 1) }));
        grad.appendChild(svgEl('stop', { offset: '100%', 'stop-color': rgba(tones.deep, 1) }));
        defs.appendChild(grad);
      }

      const g = svgEl('g', {
        class: 'plinko-board__bin-svg',
        'data-basket': String(basket.index),
        transform: 'translate(' + x0 + ' ' + y0 + ')',
      });

      const lift = svgEl('g', { class: 'plinko-board__bin-lift' });

      lift.appendChild(svgEl('ellipse', {
        class: 'plinko-board__bin-glow',
        cx: String(slotW / 2),
        cy: String(slotH * 0.55),
        rx: String(slotW * 0.58),
        ry: String(slotH * 0.55),
        fill: rgba(rgb, 0.35),
      }));

      lift.appendChild(svgEl('ellipse', {
        class: 'plinko-board__bin-shadow',
        cx: String(slotW / 2),
        cy: String(slotH + 2.2),
        rx: String(slotW * 0.48),
        ry: '3',
        fill: 'rgba(0, 0, 0, 0.4)',
      }));

      lift.appendChild(svgEl('rect', {
        class: 'plinko-board__bin-body',
        width: String(slotW),
        height: String(slotH),
        rx: String(radius),
        ry: String(radius),
        fill: 'url(#' + gradId + ')',
      }));

      lift.appendChild(svgEl('rect', {
        class: 'plinko-board__bin-highlight',
        x: '1.5',
        y: '1.5',
        width: String(Math.max(0, slotW - 3)),
        height: String(slotH * 0.34),
        rx: String(radius - 2),
        ry: String(radius - 2),
        fill: 'url(#plinko-bin-highlight)',
      }));

      lift.appendChild(svgEl('rect', {
        class: 'plinko-board__bin-gloss',
        x: String(slotW * 0.12),
        y: '2',
        width: String(slotW * 0.76),
        height: String(Math.max(2.2, slotH * 0.08)),
        rx: '2',
        ry: '2',
        fill: 'url(#plinko-bin-gloss)',
      }));

      lift.appendChild(svgEl('rect', {
        class: 'plinko-board__bin-inset',
        width: String(slotW),
        height: String(slotH),
        rx: String(radius),
        ry: String(radius),
        fill: 'url(#plinko-bin-shade)',
      }));

      lift.appendChild(svgEl('rect', {
        class: 'plinko-board__bin-rise',
        x: String(slotW * 0.14),
        y: String(slotH * 0.58),
        width: String(slotW * 0.72),
        height: String(slotH * 0.24),
        rx: '5',
        ry: '5',
        fill: 'rgba(255, 248, 230, 0.3)',
      }));

      lift.appendChild(svgEl('rect', {
        class: 'plinko-board__bin-impact',
        width: String(slotW),
        height: String(slotH),
        rx: String(radius),
        ry: String(radius),
        fill: rgba(rgb, 0.45),
      }));

      const text = svgEl('text', {
        class: 'plinko-board__bin-label',
        x: String(slotW / 2),
        y: String(slotH / 2),
        'text-anchor': 'middle',
        'dominant-baseline': 'middle',
        'font-size': String(BIN_LABEL_FONT_SIZE),
        'font-weight': '600',
        'letter-spacing': '0',
        fill: '#ffffff',
      });
      text.textContent = label;
      lift.appendChild(text);

      g.appendChild(lift);
      binsGroup.appendChild(g);
      binElements.set(basket.index, g);
    });
  }

  function buildBoard() {
    layout = computePlinkoLayout(state.rows);
    renderAtmosphere();
    renderPegs();
    renderBins();
    hideBall();
    applyRiskTheme();
  }

  /** Place ball at spawn and make it visible (start of a round). */
  function showBall(targetBall = ball) {
    const { cx, cy } = toViewCoords(layout.start.x, layout.start.y);
    const r = pegRadius() + 1;
    targetBall.setAttribute('cx', String(cx));
    targetBall.setAttribute('cy', String(cy));
    targetBall.setAttribute('r', String(r));
    targetBall.dataset.baseR = String(r);
    targetBall.classList.remove(
      'plinko-board__ball-svg--bounce',
      'plinko-board__ball-svg--landed',
    );
    targetBall.setAttribute('visibility', 'visible');
  }

  /** Idle / post-round — board has no visible ball. */
  function hideBall(targetBall = ball) {
    targetBall.setAttribute('visibility', 'hidden');
    targetBall.classList.remove(
      'plinko-board__ball-svg--bounce',
      'plinko-board__ball-svg--landed',
      'plinko-board__ball-svg--active',
    );
    if (targetBall === ball && activeBallAnimations === 0) {
      root.classList.remove('plinko-board--playing');
    }
  }

  function resetBall() {
    hideBall();
  }

  function getGeometry() {
    return {
      layout,
      ball,
      pegElements,
      binElements,
      root,
      svg,
    };
  }

  function highlightBasket(index, { premium = false } = {}) {
    binElements.forEach((el, i) => {
      el.classList.toggle('plinko-board__bin-svg--active', i === index);
      el.classList.toggle('plinko-board__bin-svg--premium', i === index && premium);
    });

    if (premium) {
      root.classList.add('plinko-board--premium-win');
      window.setTimeout(() => root.classList.remove('plinko-board--premium-win'), 1400);
    }
  }

  function clearBasketHighlight() {
    binPulseTimers.forEach((timer) => window.clearTimeout(timer));
    binPulseTimers.clear();
    binElements.forEach((el) => {
      el.classList.remove('plinko-board__bin-svg--active', 'plinko-board__bin-svg--premium');
    });
  }

  function pulseBasket(index, { premium = false } = {}) {
    const target = binElements.get(index);
    if (!target) return;
    const previousTimer = binPulseTimers.get(index);
    if (previousTimer) window.clearTimeout(previousTimer);

    target.classList.remove('plinko-board__bin-svg--active', 'plinko-board__bin-svg--premium');
    void target.getBoundingClientRect();
    target.classList.add('plinko-board__bin-svg--active');
    target.classList.toggle('plinko-board__bin-svg--premium', premium);

    const timer = window.setTimeout(() => {
      target.classList.remove('plinko-board__bin-svg--active', 'plinko-board__bin-svg--premium');
      binPulseTimers.delete(index);
    }, 400);
    binPulseTimers.set(index, timer);
  }

  function setPlaying(playing) {
    root.classList.toggle('plinko-board--playing', playing);
    ball.classList.toggle('plinko-board__ball-svg--active', playing);
  }

  function acquireBall() {
    let targetBall = ballPool.find((candidate) => candidate.dataset.inUse !== 'true');
    if (!targetBall) {
      targetBall = createBallElement();
      ballPool.push(targetBall);
      ballsGroup.appendChild(targetBall);
    }
    targetBall.dataset.inUse = 'true';
    showBall(targetBall);
    return targetBall;
  }

  function releaseBall(targetBall) {
    if (!targetBall) return;
    hideBall(targetBall);
    targetBall.dataset.inUse = 'false';
  }

  function beginBallAnimation(targetBall) {
    activeBallAnimations += 1;
    root.classList.add('plinko-board--playing');
    targetBall?.classList.add('plinko-board__ball-svg--active');
  }

  function endBallAnimation(targetBall) {
    activeBallAnimations = Math.max(0, activeBallAnimations - 1);
    targetBall?.classList.remove('plinko-board__ball-svg--active');
    root.classList.toggle('plinko-board--playing', activeBallAnimations > 0);
  }

  function releaseAllBalls() {
    ballPool.forEach((targetBall) => {
      hideBall(targetBall);
      targetBall.dataset.inUse = 'false';
    });
    activeBallAnimations = 0;
    root.classList.remove('plinko-board--playing');
  }

  function flashPeg(row, col) {
    const peg = pegElements.get(`${row}:${col}`);
    peg?.classList.add('plinko-board__peg-svg--hit');
    window.setTimeout(() => peg?.classList.remove('plinko-board__peg-svg--hit'), 240);
  }

  function setMultipliers(multipliers) {
    state.multipliers = multipliers;
    renderBins();
  }

  buildBoard();

  return {
    element: root,
    ball,
    getGeometry,
    getLayout: () => layout,
    showBall,
    hideBall,
    resetBall,
    highlightBasket,
    pulseBasket,
    clearBasketHighlight,
    setPlaying,
    acquireBall,
    releaseBall,
    releaseAllBalls,
    beginBallAnimation,
    endBallAnimation,
    flashPeg,
    setMultipliers,

    updateSettings(rows, riskMode, multipliers = state.multipliers) {
      state.rows = rows;
      state.riskMode = riskMode;
      // Always replace — never keep a previous risk/rows table when lookup fails.
      state.multipliers = Array.isArray(multipliers) ? multipliers : null;
      buildBoard();
    },
  };
}
