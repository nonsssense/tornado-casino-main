/**
 * Pages barrel.
 *
 * Responsibility:
 * - Export screen composers / route controllers registered in router/routes.js.
 */

export { createHomeController, renderHomePage } from './home.page.js';
export { renderProfilePage } from './profile.page.js';
export { createDiceController, renderDicePage } from './dice.page.js';
export { createPlinkoController, renderPlinkoPage } from './plinko.page.js';
export { createCrashController, renderCrashPage } from './crash.page.js';
export { createBonusesController } from './bonuses.page.js';
export { createBonusDetailController } from './bonus-detail.page.js';
