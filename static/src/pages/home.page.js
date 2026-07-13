/**
 * Home page — Native mobile application layout
 *
 * Vertical distribution: Promotions | Games | Flexible Spacer | Footer
 * Always fills entire mobile viewport height
 */

import { createElement } from '../utils/dom.js';
import { ASSETS } from '../utils/assets.js';
import { ROUTE_NAMES } from '../router/route-names.js';

const BONUS_BANNER_ALT = 'бонус на депозит';

const DEPOSIT_BONUS_BANNER = '/banners/depost_bonus_banenr.png';

const GAMES = [
  { id: 'dice', title: 'Dice', route: ROUTE_NAMES.DICE, banner: '/banners/dice-game.png' },
  { id: 'plinko', title: 'Plinko', route: ROUTE_NAMES.PLINKO, banner: '/banners/plinko-game.png' },
  { id: 'crash', title: 'Crash', route: ROUTE_NAMES.CRASH, banner: '/banners/crash-game.png' },
];

const SUPPORT_ASSET = '/assets/tornado%20support%20MAIN.svg';

const ICON_MOON = '<svg class="home-page__theme-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';

const ICON_SUN = '<svg class="home-page__theme-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>';

/**
 * @param {HTMLElement} button
 */
function toggleFooterThemeIcon(button) {
  const isSun = button.classList.toggle('home-page__theme--sun');
  button.setAttribute('aria-label', isSun ? 'Light theme (placeholder)' : 'Dark theme (placeholder)');
}

/**
 * @returns {HTMLElement}
 */
export function renderHomePage() {
  return createElement('div', {
    className: 'home-page',
    attrs: { 'data-page': 'home' },
    children: [
      // Promotions Section: Natural height
      createElement('section', {
        className: 'home-page__section home-page__promotions home-page__surface',
        children: [
          createElement('div', {
            className: 'home-page__promos',
            children: [
              createElement('img', {
                className: 'home-page__promo home-page__promo--banner',
                attrs: {
                  src: DEPOSIT_BONUS_BANNER,
                  alt: BONUS_BANNER_ALT,
                  draggable: false,
                },
              }),
            ],
          }),
        ],
      }),
      // Games Section
      createElement('section', {
        className: 'home-page__section home-page__games-section',
        children: [
          createElement('div', {
            className: 'home-page__surface home-page__games-panel',
            children: [
              createElement('div', {
                className: 'home-page__games',
                attrs: { 'aria-label': 'Games' },
                children: GAMES.map((game) =>
                  createElement('button', {
                    className: 'home-page__game',
                    attrs: {
                      type: 'button',
                      'aria-label': game.title,
                      onClick: () => {
                        void import('../router/index.js').then(({ router }) => router.navigate(game.route));
                      },
                    },
                    children: [
                      createElement('img', {
                        className: 'home-page__game-banner',
                        attrs: {
                          src: game.banner,
                          alt: '',
                          'aria-hidden': 'true',
                          draggable: false,
                        },
                      }),
                    ],
                  }),
                ),
              }),
            ],
          }),
        ],
      }),
      // Flexible Spacer: Absorbs extra height
      createElement('div', {
        className: 'home-page__spacer',
        attrs: { 'aria-hidden': 'true' },
      }),
      // Footer Section: Natural height, stays at bottom
      createElement('section', {
        className: 'home-page__section home-page__footer-section',
        children: [
          createElement('div', {
            className: 'home-page__footer',
            children: [
              createElement('img', {
                className: 'home-page__footer-logo',
                attrs: { src: ASSETS.logo, alt: 'Tornado', draggable: false },
              }),
              createElement('button', {
                className: 'home-page__footer-support',
                attrs: { type: 'button', 'aria-label': 'Tornado Support' },
                children: [
                  createElement('img', {
                    className: 'home-page__footer-support-img',
                    attrs: {
                      src: SUPPORT_ASSET,
                      alt: '',
                      draggable: false,
                      'aria-hidden': 'true',
                    },
                  }),
                ],
              }),
              createElement('div', {
                className: 'home-page__footer-controls',
                children: [
                  createElement('button', {
                    className: 'home-page__footer-control home-page__footer-control--icon home-page__theme',
                    attrs: {
                      type: 'button',
                      'aria-label': 'Dark theme (placeholder)',
                      onClick: (event) => toggleFooterThemeIcon(event.currentTarget),
                    },
                    html: `<span class="home-page__theme-icon-wrap home-page__theme-icon-wrap--moon">${ICON_MOON}</span><span class="home-page__theme-icon-wrap home-page__theme-icon-wrap--sun">${ICON_SUN}</span>`,
                  }),
                  createElement('button', {
                    className: 'home-page__footer-control home-page__footer-control--lang',
                    attrs: { type: 'button', 'aria-label': 'Language' },
                    text: 'Eng',
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  });
}
