/**
 * Inline SVG icons for the referrals VIP program.
 * Keep as vectors — never bake into banner images.
 */

/** Neon green used across reward / partner icons. */
export const REFERRAL_ICON_GREEN = '#3DDC84';

/**
 * @param {string} pathHtml
 * @param {{ size?: number, color?: string, className?: string }} [options]
 * @returns {string}
 */
function svgShell(pathHtml, options = {}) {
  const size = options.size ?? 20;
  const color = options.color ?? REFERRAL_ICON_GREEN;
  const className = options.className ? ` class="${options.className}"` : '';
  return `<svg${className} viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" aria-hidden="true">${pathHtml.replaceAll('{color}', color)}</svg>`;
}

/** @type {Record<string, (opts?: object) => string>} */
const ICONS = {
  percent: (o) =>
    svgShell(
      `<circle cx="12" cy="12" r="10" stroke="{color}" stroke-width="1.6"/>`
      + `<path d="M8.2 15.8 L15.8 8.2" stroke="{color}" stroke-width="1.8" stroke-linecap="round"/>`
      + `<circle cx="9" cy="9" r="1.35" fill="{color}"/>`
      + `<circle cx="15" cy="15" r="1.35" fill="{color}"/>`,
      o,
    ),
  gift: (o) =>
    svgShell(
      `<rect x="4" y="10" width="16" height="10" rx="1.5" stroke="{color}" stroke-width="1.6"/>`
      + `<path d="M4 13.5h16M12 10v10" stroke="{color}" stroke-width="1.6"/>`
      + `<path d="M12 10c-1.8-2.8-4.8-3.2-5.8-1.6C5 10.2 7.2 12 12 10zM12 10c1.8-2.8 4.8-3.2 5.8-1.6C19 10.2 16.8 12 12 10z" stroke="{color}" stroke-width="1.5" stroke-linejoin="round"/>`,
      o,
    ),
  star: (o) =>
    svgShell(
      `<path d="M12 3.4l2.2 4.5 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L4.8 8.6l5-.7L12 3.4z" stroke="{color}" stroke-width="1.5" stroke-linejoin="round"/>`,
      o,
    ),
  user: (o) =>
    svgShell(
      `<circle cx="12" cy="8" r="3.2" stroke="{color}" stroke-width="1.6"/>`
      + `<path d="M5.5 19c1.6-3.2 4-4.8 6.5-4.8S17 15.8 18.5 19" stroke="{color}" stroke-width="1.6" stroke-linecap="round"/>`,
      o,
    ),
  monitor: (o) =>
    svgShell(
      `<rect x="3.5" y="4.5" width="17" height="11.5" rx="1.6" stroke="{color}" stroke-width="1.6"/>`
      + `<path d="M9 19h6M12 16v3" stroke="{color}" stroke-width="1.6" stroke-linecap="round"/>`,
      o,
    ),
  headset: (o) =>
    svgShell(
      `<path d="M4.5 13.5v-1a7.5 7.5 0 0 1 15 0v1" stroke="{color}" stroke-width="1.6" stroke-linecap="round"/>`
      + `<rect x="3.2" y="12.5" width="3.4" height="5.2" rx="1.2" stroke="{color}" stroke-width="1.5"/>`
      + `<rect x="17.4" y="12.5" width="3.4" height="5.2" rx="1.2" stroke="{color}" stroke-width="1.5"/>`
      + `<path d="M20.8 16.5v1.2a2.2 2.2 0 0 1-2.2 2.2h-3" stroke="{color}" stroke-width="1.5" stroke-linecap="round"/>`,
      o,
    ),
  handshake: (o) =>
    svgShell(
      `<path d="M8 13.5l2.2 2.2a2.2 2.2 0 0 0 3.1 0L17 12" stroke="{color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`
      + `<path d="M4.5 12.2l3.2-3.2a2 2 0 0 1 2.8 0l1.2 1.2M19.5 12.2l-2.4-2.4a2 2 0 0 0-2.5-.2" stroke="{color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`
      + `<path d="M9.2 16.8l-1.4 1.4M11.2 18l-1 1" stroke="{color}" stroke-width="1.5" stroke-linecap="round"/>`,
      { ...o, size: o?.size ?? 28 },
    ),
};

/**
 * @param {string} name
 * @param {{ size?: number, color?: string, className?: string }} [options]
 * @returns {string}
 */
export function referralIconHtml(name, options = {}) {
  const factory = ICONS[name];
  if (!factory) return '';
  return factory(options);
}

/**
 * Hexagonal tier medal (SVG) — letter + metallic fill by tier.
 * @param {'bronze'|'silver'|'gold'|string} tierKey
 * @param {string} letter
 * @returns {string}
 */
export function tierMedalHtml(tierKey, letter) {
  const key = String(tierKey || '').toLowerCase();
  const fills = {
    bronze: { a: '#9a5a2a', b: '#d4a574', c: '#6b3d18' },
    silver: { a: '#8b919a', b: '#e8eaed', c: '#5c6168' },
    gold: { a: '#c9a227', b: '#f5e6a3', c: '#8a6d12' },
  };
  const fill = fills[key] || fills.bronze;
  const id = `tm-${key}-${letter}`;
  const ch = String(letter || '?').charAt(0).toUpperCase();

  return `
<svg class="referrals-medal" viewBox="0 0 64 64" width="52" height="52" aria-hidden="true">
  <defs>
    <linearGradient id="${id}" x1="12" y1="6" x2="52" y2="58" gradientUnits="userSpaceOnUse">
      <stop stop-color="${fill.b}"/>
      <stop offset="0.45" stop-color="${fill.a}"/>
      <stop offset="1" stop-color="${fill.c}"/>
    </linearGradient>
  </defs>
  <path fill="url(#${id})" stroke="rgba(255,255,255,0.28)" stroke-width="1.2"
    d="M32 4 L54 17 V41 L32 54 L10 41 V17 Z"/>
  <path fill="rgba(255,255,255,0.12)"
    d="M32 10 L48 19.5 V37.5 L32 47 L16 37.5 V19.5 Z"/>
  <text x="32" y="38" text-anchor="middle"
    font-family="Inter, system-ui, sans-serif" font-size="22" font-weight="800"
    fill="#111">${ch}</text>
</svg>`.trim();
}
