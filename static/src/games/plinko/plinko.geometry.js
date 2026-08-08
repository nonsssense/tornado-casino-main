/**
 * Plinko board geometry — peg and basket coordinates from row count.
 * All positions are normalized 0–1 (x: left→right, y: top→bottom).
 */

/** @typedef {{ row: number, col: number, x: number, y: number }} PlinkoPeg */
/** @typedef {{ index: number, x: number, y: number }} PlinkoBasket */
/** @typedef {{ pegs: PlinkoPeg[], baskets: PlinkoBasket[], rows: number, gapX: number, start: { x: number, y: number } }} PlinkoLayout */

const VIEW_WIDTH = 400;
const VIEW_HEIGHT = 480;
/** Side bleed so outer bucket labels are never clipped by the canvas. */
export const PLINKO_VIEW_PAD_X = 16;

/**
 * @param {number} rows
 * @returns {PlinkoLayout}
 */
export function computePlinkoLayout(rows) {
  const safeRows = Math.max(8, Math.min(16, Math.round(rows)));
  const topPad = 0.055;
  const bottomReserve = 0.2;
  const playableHeight = 1 - topPad - bottomReserve;
  const rowStep = playableHeight / (safeRows + 0.35);
  /* Slightly wider column spacing for readable multiplier labels */
  const gapX = 0.92 / safeRows;

  /** @type {PlinkoPeg[]} */
  const pegs = [];

  for (let row = 0; row < safeRows; row += 1) {
    for (let col = 0; col <= row; col += 1) {
      pegs.push({
        row,
        col,
        x: 0.5 + (col - row / 2) * gapX,
        y: topPad + (row + 1) * rowStep,
      });
    }
  }

  /** @type {PlinkoBasket[]} */
  const baskets = [];
  const basketY = 1 - bottomReserve * 0.42;

  for (let i = 0; i <= safeRows; i += 1) {
    baskets.push({
      index: i,
      x: 0.5 + (i - safeRows / 2) * gapX,
      y: basketY,
    });
  }

  return {
    rows: safeRows,
    gapX,
    pegs,
    baskets,
    start: { x: 0.5, y: 0.018 },
  };
}

/**
 * @param {number} x
 * @param {number} y
 */
export function toViewCoords(x, y) {
  return { cx: x * VIEW_WIDTH, cy: y * VIEW_HEIGHT };
}

export const PLINKO_VIEW = { width: VIEW_WIDTH, height: VIEW_HEIGHT };

/**
 * Build collision waypoints from backend bit path.
 * bit=0 → left, bit=1 → right; basket = sum(bits).
 *
 * @param {number[]} bits
 * @param {PlinkoLayout} layout
 */
export function buildCollisionPath(bits, layout) {
  const normalized = bits.map((v) => (v ? 1 : 0));
  const points = [{ ...layout.start, kind: 'start' }];

  for (let row = 0; row < layout.rows; row += 1) {
    const col = row === 0 ? 0 : normalized.slice(0, row).reduce((sum, bit) => sum + bit, 0);
    const peg = layout.pegs.find((p) => p.row === row && p.col === col);
    if (peg) {
      points.push({ x: peg.x, y: peg.y, kind: 'peg', row, col });
    }
  }

  const basketIndex = normalized.reduce((sum, bit) => sum + bit, 0);
  const basket = layout.baskets.find((b) => b.index === basketIndex);
  if (basket) {
    points.push({
      x: basket.x,
      y: basket.y + 0.012,
      kind: 'basket',
      basketIndex,
    });
  }

  return { points, basketIndex };
}

/**
 * @param {number} value
 * @returns {string}
 */
export function formatMultiplierLabel(value) {
  if (!Number.isFinite(value)) return '…';
  const decimals = value >= 100 ? 0 : 2;
  // Only strip trailing zeros after a decimal point (1.50 → 1.5).
  // Never strip zeros from integers (900 must stay 900, not 9).
  let text = value.toFixed(decimals);
  if (text.includes('.')) {
    text = text.replace(/\.?0+$/, '');
  }
  return `${text}×`;
}

/**
 * @param {number} multiplier
 * @returns {boolean}
 */
export function isPremiumMultiplier(multiplier) {
  return multiplier >= 10;
}
