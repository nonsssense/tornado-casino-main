/**
 * Sound Manager — low-latency SFX for Telegram Mini App games.
 *
 * Uses Web Audio (decoded buffers) so:
 * - each play() is an independent overlapping voice
 * - no single-element restart / cancel / queue
 * - decode happens on game open / unlock, not during app startup
 *
 * Falls back to pooled HTMLAudioElement when AudioContext is unavailable.
 * Never preloads while sound is disabled in user settings.
 */

/** @type {Record<string, string>} */
const SOUND_URLS = {
  diceWin: '/soundeffects/dicewineffect.wav',
  plinkoBasket: '/soundeffects/plincobasketeffect.wav',
};

/** Max concurrent HTMLAudio voices per key (fallback path only). */
const HTML_POOL_SIZE = {
  diceWin: 2,
  plinkoBasket: 12,
};

/** @type {boolean} */
let soundEnabled = true;

/** @type {boolean} */
let preloadStarted = false;

/** @type {Promise<void>|null} */
let preloadPromise = null;

/** @type {AudioContext|null} */
let audioContext = null;

/** @type {Map<string, AudioBuffer>} */
const buffersByKey = new Map();

/** @type {Map<string, HTMLAudioElement[]>} */
const htmlPoolsByKey = new Map();

/** @type {Map<string, number>} */
const htmlPoolIndexByKey = new Map();

/**
 * @returns {AudioContext|null}
 */
function getAudioContext() {
  if (audioContext) return audioContext;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  audioContext = new Ctx();
  return audioContext;
}

/**
 * Resume suspended context (required after browser autoplay policies).
 * @returns {Promise<void>}
 */
async function ensureContextRunning() {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch {
      // Ignore — play() will no-op until a gesture unlocks audio.
    }
  }
}

/**
 * @param {string} key
 * @param {string} url
 * @returns {Promise<void>}
 */
async function decodeIntoBuffer(key, url) {
  const ctx = getAudioContext();
  if (!ctx) return;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch sound ${key}: ${response.status}`);
  }
  const raw = await response.arrayBuffer();
  const buffer = await ctx.decodeAudioData(raw.slice(0));
  buffersByKey.set(key, buffer);
}

/**
 * HTMLAudio fallback pool — one element cannot overlap; pool rotates voices.
 * @param {string} key
 */
function ensureHtmlPool(key) {
  if (htmlPoolsByKey.has(key)) return;

  const url = SOUND_URLS[key];
  if (!url) return;

  const size = HTML_POOL_SIZE[key] ?? 4;
  /** @type {HTMLAudioElement[]} */
  const pool = [];
  for (let i = 0; i < size; i += 1) {
    const audio = new Audio(url);
    audio.preload = 'auto';
    try {
      audio.load();
    } catch {
      // Ignore load errors — play will no-op.
    }
    pool.push(audio);
  }
  htmlPoolsByKey.set(key, pool);
  htmlPoolIndexByKey.set(key, 0);
}

/**
 * @param {string} key
 */
function playHtml(key) {
  ensureHtmlPool(key);
  const pool = htmlPoolsByKey.get(key);
  if (!pool?.length) return;

  const index = htmlPoolIndexByKey.get(key) ?? 0;
  htmlPoolIndexByKey.set(key, index + 1);
  const audio = pool[index % pool.length];

  try {
    audio.pause();
    audio.currentTime = 0;
    const playResult = audio.play();
    if (playResult && typeof playResult.catch === 'function') {
      playResult.catch(() => {});
    }
  } catch {
    // Unsupported / refused — silent no-op.
  }
}

/**
 * @param {string} key
 */
function playWebAudio(key) {
  const ctx = getAudioContext();
  const buffer = buffersByKey.get(key);
  if (!ctx || !buffer) return false;

  try {
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);
    return true;
  } catch {
    return false;
  }
}

export const soundManager = {
  /**
   * Decode / warm every known SFX (idempotent).
   * No-op when sound is disabled — never fetch/decode audio on startup.
   * Call from Dice/Plinko mount (or unlock) only.
   * @returns {Promise<void>}
   */
  preload() {
    if (!soundEnabled) {
      return Promise.resolve();
    }
    if (preloadPromise) return preloadPromise;
    preloadStarted = true;

    preloadPromise = (async () => {
      const ctx = getAudioContext();
      if (ctx) {
        await ensureContextRunning();
        await Promise.all(
          Object.entries(SOUND_URLS).map(async ([key, url]) => {
            try {
              await decodeIntoBuffer(key, url);
            } catch {
              ensureHtmlPool(key);
            }
          }),
        );
        return;
      }

      Object.keys(SOUND_URLS).forEach((key) => ensureHtmlPool(key));
    })().catch(() => {
      Object.keys(SOUND_URLS).forEach((key) => ensureHtmlPool(key));
    });

    return preloadPromise;
  },

  /**
   * @param {boolean} enabled
   */
  setEnabled(enabled) {
    soundEnabled = Boolean(enabled);
    if (!soundEnabled) {
      // Allow a later enable + game open to preload cleanly.
      preloadStarted = false;
      preloadPromise = null;
    }
  },

  /**
   * @returns {boolean}
   */
  isEnabled() {
    return soundEnabled;
  },

  /**
   * Resume AudioContext from a user gesture (e.g. Play tap).
   * Call before async game work so later play() stays synchronous.
   */
  unlock() {
    if (!soundEnabled) return;
    void ensureContextRunning();
    if (!preloadStarted) {
      void this.preload();
    }
  },

  /**
   * Play one independent voice. Overlapping calls do not cancel each other.
   * Synchronous when the AudioContext is running and the buffer is decoded.
   * @param {keyof typeof SOUND_URLS | string} key
   */
  play(key) {
    if (!soundEnabled) return;

    const name = String(key);
    if (!SOUND_URLS[name]) return;

    if (!preloadStarted) {
      void this.preload();
    }

    const ctx = getAudioContext();
    const buffer = buffersByKey.get(name);

    if (ctx && buffer) {
      if (ctx.state === 'running') {
        playWebAudio(name);
        return;
      }
      // First unlock after a user gesture — resume then fire immediately.
      void ctx.resume().then(() => {
        playWebAudio(name);
      }).catch(() => {
        playHtml(name);
      });
      return;
    }

    playHtml(name);
  },

  /** @returns {typeof SOUND_URLS} */
  getCatalog() {
    return { ...SOUND_URLS };
  },
};
