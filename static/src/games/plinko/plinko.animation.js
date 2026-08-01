/**
 * Plinko path animation — gravity, bounce, peg collisions along backend path.
 */

import { buildCollisionPath, toViewCoords } from './plinko.geometry.js';

/** @type {Set<{ cancel: function(): void }>} */
const activeAnimations = new Set();

/**
 * @param {{ cx: number, cy: number }} vector
 */
function normalize(vector) {
  const length = Math.hypot(vector.cx, vector.cy) || 1;
  return { cx: vector.cx / length, cy: vector.cy / length };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * @param {number[]} bits
 */
function hashBitPath(bits) {
  let hash = 2166136261;
  bits.forEach((bit, index) => {
    hash ^= bit + index * 17;
    hash = Math.imul(hash, 16777619);
  });
  return hash >>> 0;
}

/**
 * Stable value in [-1, 1] for reproducible visual imperfections.
 */
function microVariation(seed, row, col, collisionIndex, channel) {
  let hash = seed;
  hash ^= Math.imul(row + 1, 0x45d9f3b);
  hash ^= Math.imul(col + 1, 0x27d4eb2d);
  hash ^= Math.imul(collisionIndex + 1, 0x165667b1);
  hash ^= Math.imul(channel + 1, 0x9e3779b1);
  hash = Math.imul(hash ^ (hash >>> 16), 0x21f0aaad);
  hash = Math.imul(hash ^ (hash >>> 15), 0x735a2d97);
  hash ^= hash >>> 15;
  return ((hash >>> 0) / 4294967295) * 2 - 1;
}

/**
 * First intersection between a moving point and a circle.
 * @param {{ cx: number, cy: number }} from
 * @param {{ cx: number, cy: number }} to
 * @param {{ cx: number, cy: number }} center
 * @param {number} radius
 */
function sweptCircleContact(from, to, center, radius) {
  const dx = to.cx - from.cx;
  const dy = to.cy - from.cy;
  const fx = from.cx - center.cx;
  const fy = from.cy - center.cy;
  const a = dx * dx + dy * dy;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - radius * radius;
  const discriminant = b * b - 4 * a * c;

  if (a === 0 || discriminant < 0) return null;

  const root = Math.sqrt(discriminant);
  const first = (-b - root) / (2 * a);
  const second = (-b + root) / (2 * a);
  const epsilon = 0.00001;
  const t = first > epsilon && first <= 1
    ? first
    : second > epsilon && second <= 1
      ? second
      : null;

  if (t === null) return null;
  return { cx: from.cx + dx * t, cy: from.cy + dy * t, t };
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
  [...activeAnimations].forEach((animation) => animation.cancel());
}

/**
 * @param {object} options
 * @param {number[]} options.path
 * @param {ReturnType<import('./plinko.board.js').createPlinkoBoard>} options.board
 * @param {SVGElement} [options.ball]
 * @param {boolean} [options.exclusive]
 * @param {boolean} [options.clearHighlight]
 * @param {(payload: { basketIndex: number }) => void} [options.onLand]
 *        Fired on the same frame the ball visually reaches the basket.
 * @returns {Promise<{ basketIndex: number, cancelled?: boolean }>}
 */
export function animatePlinkoPath({
  path,
  board,
  ball: providedBall = null,
  exclusive = true,
  clearHighlight = true,
  onLand = null,
}) {
  const bits = Array.isArray(path) ? path.map((v) => (v ? 1 : 0)) : [];
  const layout = board.getLayout();
  const ball = providedBall ?? board.getGeometry().ball;

  if (!bits.length || bits.length !== layout.rows || !ball) {
    return Promise.resolve({ basketIndex: 0 });
  }

  if (exclusive) cancelPlinkoPathAnimation();

  const baseR = Math.max(5, 9.5 - layout.rows * 0.28) * 0.975;
  const pegR = Math.max(4.5, 9.5 - layout.rows * 0.28);
  const contactRadius = baseR + pegR + 0.35;
  const { points, basketIndex } = buildCollisionPath(bits, layout);
  const startView = toViewCoords(points[0].x, points[0].y);
  const fallDuration = Math.max(220, 480 - layout.rows * 14);
  const bounceDuration = 85;
  const totalDuration = layout.rows * (fallDuration + bounceDuration) + fallDuration * 0.9;
  const basketPoint = points[points.length - 1];
  const basketView = toViewCoords(basketPoint.x, basketPoint.y);
  const visualSeed = hashBitPath(bits);
  const pegSolids = layout.pegs.map((peg) => ({
    ...toViewCoords(peg.x, peg.y),
    row: peg.row,
    col: peg.col,
  }));
  const pegByKey = new Map(pegSolids.map((peg) => [`${peg.row}:${peg.col}`, peg]));
  const simulationStep = 1 / 120;
  const gravity = 220;

  /** @type {Array<{ cx: number, cy: number }>} */
  const trajectory = [{ ...startView }];
  /** @type {Array<{ index: number, row: number, col: number, compressionWidth: number, recoveryOffset: number, recoveryWidth: number }>} */
  const contacts = [];
  let position = { ...startView };
  let velocity = { cx: 0, cy: 38 };
  let row = 0;
  let safetySteps = 0;
  let activeImpact = null;
  const turnBlendDuration = 18;
  let turnBlendSteps = 0;
  const collisionCooldowns = new Map();

  /**
   * Keep the ball outside recently contacted pegs while the impulse resolves.
   * @param {{ cx: number, cy: number }} next
   */
  function constrainImpact(next) {
    let adjusted = next;

    collisionCooldowns.forEach((releaseDistance, key) => {
      const peg = pegByKey.get(key);
      const dx = adjusted.cx - peg.cx;
      const dy = adjusted.cy - peg.cy;
      const distance = Math.hypot(dx, dy);
      if (distance > 0 && distance < contactRadius) {
        adjusted = {
          cx: peg.cx + (dx / distance) * contactRadius,
          cy: peg.cy + (dy / distance) * contactRadius,
        };
      }
    });

    return adjusted;
  }

  function tickCollisionCooldowns() {
    collisionCooldowns.forEach((releaseDistance, key) => {
      const peg = pegByKey.get(key);
      const distance = Math.hypot(position.cx - peg.cx, position.cy - peg.cy);
      if (distance > releaseDistance) collisionCooldowns.delete(key);
    });
  }

  /**
   * @param {{ cx: number, cy: number }} from
   * @param {{ cx: number, cy: number }} to
   */
  function findPegContact(from, to) {
    let closest = null;

    pegSolids.forEach((peg) => {
      if (collisionCooldowns.has(`${peg.row}:${peg.col}`)) return;
      const contact = sweptCircleContact(from, to, peg, contactRadius);
      if (contact && (!closest || contact.t < closest.contact.t)) {
        closest = { peg, contact };
      }
    });

    return closest;
  }

  /**
   * @param {{ peg: { cx: number, cy: number, row: number, col: number }, contact: { cx: number, cy: number } }} hit
   * @param {number} directionBias
   * @param {boolean} softenTurn
   */
  function applyPegImpact(hit, directionBias = 0, softenTurn = false) {
    const collisionIndex = contacts.length;
    const restitutionVariation = microVariation(
      visualSeed,
      hit.peg.row,
      hit.peg.col,
      collisionIndex,
      1,
    );
    const spreadVariation = microVariation(
      visualSeed,
      hit.peg.row,
      hit.peg.col,
      collisionIndex,
      2,
    );
    const tangentVariation = microVariation(
      visualSeed,
      hit.peg.row,
      hit.peg.col,
      collisionIndex,
      3,
    );
    const lingerVariation = microVariation(
      visualSeed,
      hit.peg.row,
      hit.peg.col,
      collisionIndex,
      4,
    );
    position = { cx: hit.contact.cx, cy: hit.contact.cy };
    const normal = normalize({
      cx: position.cx - hit.peg.cx,
      cy: position.cy - hit.peg.cy,
    });
    const inwardSpeed = velocity.cx * normal.cx + velocity.cy * normal.cy;

    if (inwardSpeed < 0) {
      const restitution = 0.18 + restitutionVariation * 0.025;
      const impulseMagnitude = -(1 + restitution) * inwardSpeed;
      const fullImpulse = {
        cx: normal.cx * impulseMagnitude,
        cy: normal.cy * impulseMagnitude,
      };
      const immediateShare = softenTurn
        ? 0.28 + spreadVariation * 0.025
        : 0.55 + spreadVariation * 0.035;
      const responseSteps = softenTurn
        ? lingerVariation > 0.2 ? 9 : 8
        : lingerVariation > 0.35 ? 4 : 3;
      const tangentImpulse = softenTurn
        ? 2.1 + tangentVariation * 0.45
        : 5 + tangentVariation * 1.1;
      velocity.cx = (
        velocity.cx
        + fullImpulse.cx * immediateShare
        + directionBias * tangentImpulse
      ) * 0.97;
      velocity.cy = (velocity.cy + fullImpulse.cy * immediateShare) * 0.97;
      activeImpact = {
        center: hit.peg,
        stepsLeft: responseSteps,
        impulse: {
          cx: fullImpulse.cx * (1 - immediateShare) / responseSteps,
          cy: fullImpulse.cy * (1 - immediateShare) / responseSteps,
        },
      };
    }

    trajectory.push({ ...position });
    const slideVariation = microVariation(
      visualSeed,
      hit.peg.row,
      hit.peg.col,
      collisionIndex,
      5,
    );
    collisionCooldowns.set(
      `${hit.peg.row}:${hit.peg.col}`,
      contactRadius + 3 + slideVariation * 0.9,
    );
    return {
      index: trajectory.length - 1,
      compressionWidth: 2.35 + spreadVariation * 0.3,
      recoveryOffset: 4 + lingerVariation * 0.55,
      recoveryWidth: 3.4 + restitutionVariation * 0.35,
    };
  }

  while (row < layout.rows && safetySteps < 12000) {
    safetySteps += 1;
    tickCollisionCooldowns();
    const target = points[row + 1];
    const center = pegByKey.get(`${target.row}:${target.col}`);
    const direction = bits[row] ? 1 : -1;
    const angleVariation = microVariation(visualSeed, row, target.col, row, 0) * 2.2;
    const desiredAngle = (-90 + direction * 20 + angleVariation) * (Math.PI / 180);
    const desiredContactX = center.cx + Math.cos(desiredAngle) * contactRadius;
    const verticalDistance = Math.max(1, center.cy - position.cy);
    const timeToContact = Math.max(0.12, verticalDistance / Math.max(45, velocity.cy));
    const desiredVelocityX = (desiredContactX - position.cx) / timeToContact;
    const steeringVariation = microVariation(visualSeed, row, target.col, row, 6);
    const steeringGain = (verticalDistance < 32 ? 8 : 4.5)
      * (1 + steeringVariation * 0.045);
    let steeringTarget = desiredVelocityX;
    let steeringLimit = 420;

    if (turnBlendSteps > 0) {
      const turnProgress = (turnBlendDuration - turnBlendSteps + 1) / turnBlendDuration;
      const turnWeight = turnProgress ** 2 * (3 - 2 * turnProgress);
      steeringTarget = velocity.cx + (desiredVelocityX - velocity.cx) * turnWeight;
      steeringLimit = 280;
      turnBlendSteps -= 1;
    }

    const steering = clamp((steeringTarget - velocity.cx) * steeringGain, -steeringLimit, steeringLimit);

    if (activeImpact?.stepsLeft > 0) {
      velocity.cx += activeImpact.impulse.cx;
      velocity.cy += activeImpact.impulse.cy;
      activeImpact.stepsLeft -= 1;
    }

    velocity.cx = (velocity.cx + steering * simulationStep) * 0.999;
    velocity.cy = (velocity.cy + gravity * simulationStep) * 0.999;

    let next = {
      cx: position.cx + velocity.cx * simulationStep,
      cy: position.cy + velocity.cy * simulationStep,
    };
    next = constrainImpact(next);
    if (activeImpact?.stepsLeft === 0) activeImpact = null;

    const hit = findPegContact(position, next);
    if (!hit) {
      position = next;
      trajectory.push({ ...position });
      continue;
    }

    const isRoutePeg = hit.peg.row === target.row && hit.peg.col === target.col;
    const reversesDirection = isRoutePeg && row > 0 && bits[row] !== bits[row - 1];
    const contactProfile = applyPegImpact(
      hit,
      isRoutePeg ? direction : 0,
      reversesDirection,
    );
    contacts.push({
      ...contactProfile,
      row: hit.peg.row,
      col: hit.peg.col,
    });
    if (isRoutePeg) {
      if (reversesDirection) turnBlendSteps = turnBlendDuration;
      row += 1;
    }
  }

  /*
   * The result basket is authoritative. After the last peg, proportional
   * steering gently removes residual horizontal error while gravity remains
   * active, then the final sample is pinned to the exact backend basket.
   */
  while (position.cy < basketView.cy && safetySteps < 16000) {
    safetySteps += 1;
    tickCollisionCooldowns();
    const verticalDistance = basketView.cy - position.cy;
    const timeToBasket = Math.max(0.1, verticalDistance / Math.max(45, velocity.cy));
    const desiredVelocityX = (basketView.cx - position.cx) / timeToBasket;
    const steering = clamp((desiredVelocityX - velocity.cx) * 7, -520, 520);

    if (activeImpact?.stepsLeft > 0) {
      velocity.cx += activeImpact.impulse.cx;
      velocity.cy += activeImpact.impulse.cy;
      activeImpact.stepsLeft -= 1;
    }

    velocity.cx = (velocity.cx + steering * simulationStep) * 0.999;
    velocity.cy = (velocity.cy + gravity * simulationStep) * 0.999;
    const next = constrainImpact({
      cx: position.cx + velocity.cx * simulationStep,
      cy: position.cy + velocity.cy * simulationStep,
    });
    if (activeImpact?.stepsLeft === 0) activeImpact = null;
    const hit = findPegContact(position, next);

    if (hit) {
      const contactProfile = applyPegImpact(hit);
      contacts.push({
        ...contactProfile,
        row: hit.peg.row,
        col: hit.peg.col,
      });
    } else {
      position = next;
      trajectory.push({ ...position });
    }
  }

  trajectory.push({ ...basketView });

  if (board.beginBallAnimation) board.beginBallAnimation(ball);
  else board.setPlaying(true);
  if (clearHighlight) board.clearBasketHighlight();
  board.showBall(ball);
  ball.dataset.baseR = String(baseR);
  setBallSvg(ball, startView.cx, startView.cy);

  return new Promise((resolve) => {
    const start = performance.now();
    let nextContactIndex = 0;
    let finished = false;
    const animation = {
      raf: 0,
      cancel() {
        finish({ basketIndex, cancelled: true });
      },
    };

    function finish(result) {
      if (finished) return;
      finished = true;
      if (animation.raf) cancelAnimationFrame(animation.raf);
      animation.raf = 0;
      activeAnimations.delete(animation);
      if (board.endBallAnimation) board.endBallAnimation(ball);
      else board.setPlaying(false);
      resolve(result);
    }

    function frame(now) {
      animation.raf = 0;
      if (finished) {
        return;
      }

      const elapsed = Math.min(now - start, totalDuration);
      const simulationProgress = (elapsed / totalDuration) * (trajectory.length - 1);
      const previousIndex = Math.min(
        trajectory.length - 2,
        Math.max(0, Math.floor(simulationProgress)),
      );
      const trajectoryIndex = previousIndex + 1;
      const segmentProgress = simulationProgress - previousIndex;
      const from = trajectory[previousIndex];
      const to = trajectory[trajectoryIndex];
      const cx = from.cx + (to.cx - from.cx) * segmentProgress;
      const cy = from.cy + (to.cy - from.cy) * segmentProgress;

      while (
        nextContactIndex < contacts.length
        && simulationProgress >= contacts[nextContactIndex].index
      ) {
        const contact = contacts[nextContactIndex];
        board.flashPeg(contact.row, contact.col);
        nextContactIndex += 1;
      }

      let compression = 0;
      let recovery = 0;
      contacts.forEach((contact) => {
        const offset = simulationProgress - contact.index;
        compression = Math.max(
          compression,
          Math.exp(-((offset / contact.compressionWidth) ** 2)),
        );
        recovery = Math.max(
          recovery,
          Math.exp(-(((offset - contact.recoveryOffset) / contact.recoveryWidth) ** 2)),
        );
      });
      const scale = 1 - compression * 0.025 + recovery * 0.008;
      setBallSvg(ball, cx, cy, scale);

      if (elapsed >= totalDuration) {
        setBallSvg(ball, basketView.cx, basketView.cy, 1);
        ball.classList.add('plinko-board__ball-svg--landed');
        // Sound / impact FX must fire on this frame — before promise listeners.
        try {
          onLand?.({ basketIndex });
        } catch {
          // Gameplay must continue even if a land callback throws.
        }
        finish({ basketIndex });
        return;
      }

      animation.raf = requestAnimationFrame(frame);
    }

    activeAnimations.add(animation);
    animation.raf = requestAnimationFrame(frame);
  });
}
