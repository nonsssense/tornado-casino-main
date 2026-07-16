/**
 * Brand asset paths — imported so Vite fingerprints them in production.
 *
 * Branding SVGs are Figma sources with embedded raster — use as-is.
 * Do not convert/optimize logos or UI icons to WebP/PNG.
 */

import logoUrl from '../../../assets/tornado no background 13.svg';
import iconUrl from '../../../assets/ava icon tornado main.svg';

export const ASSETS = {
  logo: logoUrl,
  icon: iconUrl,
};
