/**
 * Crash cloud layer — small minimalist silhouettes, parallax altitude feel.
 * Monochrome, low opacity. Never the visual focus.
 */

const CLOUD_COUNT_MIN = 7; // ~15–20% more than prior 6
const CLOUD_COUNT_MAX = 12; // ~15–20% more than prior 10

/** @type {const} */
const LAYERS = {
  far: {
    id: 'far',
    scale: [0.62, 0.85], // ~12% larger scale range
    speed: [16, 29], // ~60% faster than prior [10, 18]
    opacity: [0.055, 0.09], // slightly more defined, still low
    weight: 0.4,
  },
  mid: {
    id: 'mid',
    scale: [0.9, 1.18],
    speed: [34, 54], // ~60% faster than prior [21, 34]
    opacity: [0.07, 0.11],
    weight: 0.35,
  },
  near: {
    id: 'near',
    scale: [1.18, 1.48],
    speed: [58, 88], // ~60% faster than prior [36, 55]
    opacity: [0.085, 0.13],
    weight: 0.25,
  },
};

const BASE_W = 40; // ~12–15% larger than prior 35
const BASE_H = 17; // ~12–15% larger than prior 15

/**
 * @param {number} min
 * @param {number} max
 */
function randRange(min, max) {
  return min + Math.random() * (max - min);
}

/**
 * Pick a depth layer by weight.
 */
function pickLayer() {
  const roll = Math.random();
  if (roll < LAYERS.far.weight) return LAYERS.far;
  if (roll < LAYERS.far.weight + LAYERS.mid.weight) return LAYERS.mid;
  return LAYERS.near;
}

/**
 * Minimal cloud silhouette: 3 soft overlapping ellipses (no outline / detail).
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx
 * @param {number} cy
 * @param {number} scale
 * @param {number} alpha
 */
function drawCloudSilhouette(ctx, cx, cy, scale, alpha) {
  const w = BASE_W * scale;
  const h = BASE_H * scale;

  ctx.save();
  ctx.fillStyle = `rgba(10, 12, 16, ${alpha})`;
  // Soft edges, slightly tighter blur so the silhouette reads while moving
  ctx.shadowColor = `rgba(10, 12, 16, ${alpha * 0.9})`;
  ctx.shadowBlur = 2.5 + scale * 1.4;

  ctx.beginPath();
  // Left lobe
  ctx.ellipse(cx - w * 0.28, cy + h * 0.08, w * 0.32, h * 0.42, 0, 0, Math.PI * 2);
  // Center body
  ctx.ellipse(cx, cy, w * 0.42, h * 0.5, 0, 0, Math.PI * 2);
  // Right lobe
  ctx.ellipse(cx + w * 0.3, cy + h * 0.06, w * 0.3, h * 0.4, 0, 0, Math.PI * 2);
  // Soft top bump
  ctx.ellipse(cx - w * 0.02, cy - h * 0.22, w * 0.26, h * 0.36, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/**
 * @param {HTMLCanvasElement} canvas
 */
export function createCloudsLayer(canvas) {
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) {
    return {
      resize() {},
      update() {},
      draw() {},
      clear() {},
      setActive() {},
      destroy() {},
    };
  }

  /**
   * @typedef {{
   *   x: number,
   *   y: number,
   *   scale: number,
   *   speed: number,
   *   baseOpacity: number,
   *   life: number,
   *   maxLife: number,
   *   layer: string,
   * }} Cloud
   */
  /** @type {Cloud[]} */
  const clouds = [];
  let width = 0;
  let height = 0;
  let dpr = 1;
  let active = false;
  let targetCount = CLOUD_COUNT_MIN;

  /**
   * Avoid stacking clouds on top of each other.
   * @param {number} x
   * @param {number} y
   * @param {number} scale
   */
  function isTooClose(x, y, scale) {
    const minDist = 62 + scale * 32;
    for (let i = 0; i < clouds.length; i += 1) {
      const c = clouds[i];
      const dx = c.x - x;
      const dy = c.y - y;
      if (dx * dx + dy * dy < minDist * minDist) return true;
    }
    return false;
  }

  /**
   * @param {boolean} [fromTop]
   * @returns {Cloud|null}
   */
  function spawnCloud(fromTop = true) {
    const layer = pickLayer();
    const scale = randRange(layer.scale[0], layer.scale[1]);
    let x = 0;
    let y = 0;
    let placed = false;

    for (let attempt = 0; attempt < 12; attempt += 1) {
      x = randRange(width * 0.06, width * 0.94);
      y = fromTop
        ? -randRange(16, 70)
        : randRange(height * 0.05, height * 0.9);
      if (!isTooClose(x, y, scale)) {
        placed = true;
        break;
      }
    }
    if (!placed && clouds.length > 0) return null;

    return {
      x,
      y,
      scale,
      speed: randRange(layer.speed[0], layer.speed[1]),
      baseOpacity: randRange(layer.opacity[0], layer.opacity[1]),
      life: fromTop ? 0 : randRange(0.2, 0.6) * (8 + Math.random() * 10),
      maxLife: 8 + Math.random() * 12,
      layer: layer.id,
    };
  }

  function ensureClouds() {
    targetCount = CLOUD_COUNT_MIN
      + Math.floor(Math.random() * (CLOUD_COUNT_MAX - CLOUD_COUNT_MIN + 1));
    let guard = 0;
    while (clouds.length < CLOUD_COUNT_MIN && guard < 20) {
      const cloud = spawnCloud(clouds.length > 0);
      if (cloud) clouds.push(cloud);
      guard += 1;
    }
  }

  return {
    /**
     * @param {number} w
     * @param {number} h
     * @param {number} nextDpr
     */
    resize(w, h, nextDpr) {
      if (w === width && h === height && nextDpr === dpr) return;
      width = Math.max(1, w);
      height = Math.max(1, h);
      dpr = nextDpr;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = true;
    },

    /** @param {boolean} isActive */
    setActive(isActive) {
      if (!isActive) {
        if (active) {
          active = false;
          clouds.length = 0;
          this.clear();
        }
        return;
      }
      active = true;
      ensureClouds();
    },

    /**
     * @param {number} dt
     */
    update(dt) {
      if (!active || width < 1 || height < 1) return;

      if (clouds.length < CLOUD_COUNT_MIN) {
        const cloud = spawnCloud(true);
        if (cloud) clouds.push(cloud);
      } else if (
        clouds.length < targetCount
        && clouds.length < CLOUD_COUNT_MAX
        && Math.random() < dt * 0.35
      ) {
        const cloud = spawnCloud(true);
        if (cloud) clouds.push(cloud);
      }

      for (let i = clouds.length - 1; i >= 0; i -= 1) {
        const cloud = clouds[i];
        cloud.life += dt;
        cloud.y += cloud.speed * dt;

        const expired = cloud.life >= cloud.maxLife || cloud.y > height + 40;
        if (expired) {
          clouds.splice(i, 1);
          if (clouds.length < CLOUD_COUNT_MAX) {
            const next = spawnCloud(true);
            if (next) clouds.push(next);
          }
        }
      }
    },

    draw() {
      ctx.clearRect(0, 0, width, height);
      if (!active || !clouds.length) return;

      // Far → mid → near so nearer silhouettes sit slightly above
      const order = { far: 0, mid: 1, near: 2 };
      const sorted = clouds.slice().sort((a, b) => order[a.layer] - order[b.layer]);

      for (let i = 0; i < sorted.length; i += 1) {
        const cloud = sorted[i];
        const fadeIn = Math.min(1, cloud.life / 1.1);
        const fadeOut = Math.min(1, (cloud.maxLife - cloud.life) / 1.4);
        const alpha = cloud.baseOpacity * fadeIn * fadeOut;
        if (alpha < 0.012) continue;
        drawCloudSilhouette(ctx, cloud.x, cloud.y, cloud.scale, alpha);
      }
    },

    clear() {
      ctx.clearRect(0, 0, width, height);
    },

    destroy() {
      clouds.length = 0;
      active = false;
    },
  };
}
