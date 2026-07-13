/**
 * Pages barrel.
 *
 * Responsibility:
 * - Export screen composers registered in router/routes.js.
 * - Pages compose components only — no direct fetch(), no business logic.
 */

export { renderHomePage } from './home.page.js';
export { renderProfilePage } from './profile.page.js';
export { renderDicePage } from './dice.page.js';
export { renderPlinkoPage } from './plinko.page.js';
export { renderCrashPage } from './crash.page.js';
