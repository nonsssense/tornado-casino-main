/**
 * Plinko path animation — gravity, bounce, peg collisions along backend path.
 */

import { buildCollisionPath, toViewCoords } from './plinko.geometry.js';

/** @type {number} */
let activeRaf = 0;

/** @type {boolean} */
let cancelled = false;

/**
 * @param {number} t
 */
function easeInQuad(t) {
  return t * t;
}

/**
 * @param {number} t
 */
function easeOutQuad(t) {
  return 1 - (1 - t) ** 2;
}

/**
 * @param {SVGElement} ball
 * @param {number} cx
 * @param {number} cy
 * @param {number} [scale]
 */
function setBallSvg(ball, cx, cy, scale = 1) {
  ball.setAttribute('cx', String(cx));
  ball.setAttribute('cy', String(cy));
  const baseR = Number(ball.dataset.baseR) || 7;
  ball.setAttribute('r', String(baseR * scale));
}

/**
 * Stop any in-flight path animation.
 */
export function cancelPlinkoPathAnimation() {
  cancelled = true;
  if (activeRaf) {
    cancelAnimationFrame(activeRaf);
    activeRaf = 0;
  }
}

/**
 * @param {object} options
 * @param {number[]} options.path
 * @param {ReturnType<import('./plinko.board.js').createPlinkoBoard>} options.board
 * @returns {Promise<{ basketIndex: number }>}
 */
export function animatePlinkoPath({ path, board }) {
  const bits = Array.isArray(path) ? path.map((v) => (v ? 1 : 0)) : [];
  const layout = board.getLayout();
  const { ball } = board.getGeometry();

  if (!bits.length || bits.length !== layout.rows || !ball) {
    return Promise.resolve({ basketIndex: 0 });
  }

  cancelPlinkoPathAnimation();
  cancelled = false;

  const baseR = Math.max(5, 9.5 - layout.rows * 0.28);
  ball.dataset.baseR = String(baseR);

  const { points, basketIndex } = buildCollisionPath(bits, layout);
  const fallDuration = Math.max(220, 480 - layout.rows * 14);
  const bounceDuration = 85;

  board.setPlaying(true);
  board.clearBasketHighlight();
  board.showBall();

  return new Promise((resolve) => {
    let pointIndex = 0;

    function finish(result) {
      activeRaf = 0;
      board.setPlaying(false);
      resolve(result);
    }

    function animateFall(from, to, onDone) {
      const fromView = toViewCoords(from.x, from.y);
      const toView = toViewCoords(to.x, to.y);
      const start = performance.now();
      const isPeg = to.kind === 'peg';
      const duration = isPeg ? fallDuration : fallDuration * 0.9;

      function frame(now) {
        activeRaf = 0;
        if (cancelled) {
          finish({ basketIndex });
          return;
        }

        const t = Math.min((now - start) / duration, 1);
        const xProg = easeOutQuad(t);
        const yProg = easeInQuad(t);

        const cx = fromView.cx + (toView.cx - fromView.cx) * xProg;
        const cy = fromView.cy + (toView.cy - fromView.cy) * yProg;

        if (isPeg && t > 0.9) {
          const squash = 1 - (1 - t) * 0.22;
          setBallSvg(ball, cx, cy, squash);
          ball.classList.add('plinko-board__ball-svg--bounce');
        } else {
          setBallSvg(ball, cx, cy, 1);
          ball.classList.remove('plinko-board__ball-svg--bounce');
        }

        if (t < 1) {
          activeRaf = requestAnimationFrame(frame);
          return;
        }

        if (isPeg && to.row != null && to.col != null) {
          board.flashPeg(to.row, to.col);
          animateBounce(toView, onDone);
          return;
        }

        onDone();
      }

      activeRaf = requestAnimationFrame(frame);
    }

    function animateBounce(atView, onDone) {
      const start = performance.now();
      const lift = 6;

      function frame(now) {
        activeRaf = 0;
        if (cancelled) {
          finish({ basketIndex });
          return;
        }

        const t = Math.min((now - start) / bounceDuration, 1);
        const up = Math.sin(t * Math.PI) * lift * (1 - t * 0.3);
        setBallSvg(ball, atView.cx, atView.cy - up, 1 + (1 - t) * 0.06);
        if (t < 1) {
          activeRaf = requestAnimationFrame(frame);
          return;
        }
        setBallSvg(ball, atView.cx, atView.cy, 1);
        onDone();
      }

      activeRaf = requestAnimationFrame(frame);
    }

    function nextSegment() {
      if (cancelled) {
        finish({ basketIndex });
        return;
      }

      if (pointIndex >= points.length - 1) {
        ball.classList.add('plinko-board__ball-svg--landed');
        finish({ basketIndex });
        return;
      }

      const from = points[pointIndex];
      const to = points[pointIndex + 1];
      pointIndex += 1;

      animateFall(from, to, nextSegment);
    }

    nextSegment();
  });
}
