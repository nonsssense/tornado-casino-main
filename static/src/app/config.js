/**
 * Application configuration.
 *
 * Responsibility:
 * - Centralize frontend constants (API base path, feature flags, defaults).
 * - Read environment-specific values without scattering magic strings.
 *
 * No runtime logic yet — values will be defined when screens are implemented.
 */

export const APP_CONFIG = {
  // API requests are same-origin; FastAPI serves index.html and /api/* routes.
  apiBasePath: '/api',
};
