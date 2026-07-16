/**
 * Brand asset paths — served from FastAPI `/assets` (no Vite `?import`).
 * Using plain URLs avoids MIME failures when requests hit StaticFiles directly.
 */

export const ASSETS = {
  logo: '/assets/tornado%20no%20background%20main.webp',
  icon: '/assets/ava%20icon%20tornado%20main.webp',
};
