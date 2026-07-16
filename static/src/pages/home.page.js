/**
 * Home page — Native mobile application layout
 *
 * Vertical distribution: Promotions | Games | Flexible Spacer | Footer
 * Always fills entire mobile viewport height
 */

import { createElement } from '../utils/dom.js';
import { ASSETS } from '../utils/assets.js';
import { ROUTE_NAMES } from '../router/route-names.js';
import { Skeleton } from '../components/base/Skeleton.js';
import { toggleLocale, getLocale, LOCALES, t } from '../i18n/index.js';
import depositBonusBanner from '../../../banners/deposit-bonus-banner.webp';
import diceGameBanner from '../../../banners/dice-game.webp';
import plinkoGameBanner from '../../../banners/plinko-game.webp';
import crashGameBanner from '../../../banners/crash-game.webp';
import supportAsset from '../../../assets/tornado support main.svg';

const DEPOSIT_BONUS_BANNER = depositBonusBanner;

const GAMES = [
  { id: 'dice', nameKey: 'games.dice.name', route: ROUTE_NAMES.DICE, banner: diceGameBanner },
  { id: 'plinko', nameKey: 'games.plinko.name', route: ROUTE_NAMES.PLINKO, banner: plinkoGameBanner },
  { id: 'crash', nameKey: 'games.crash.name', route: ROUTE_NAMES.CRASH, banner: crashGameBanner },
];

const SUPPORT_ASSET = supportAsset;

const ICON_MOON = '<svg class="home-page__theme-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';

const ICON_SUN = '<svg class="home-page__theme-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>';

/**
 * Label for the language switch control — always the *other* locale.
 * @returns {string}
 */
function switchToLocaleLabel() {
  return getLocale() === LOCALES.ru ? t('home.lang.en') : t('home.lang.ru');
}

/**
 * @param {object} options
 * @param {string} options.src
 * @param {string} options.className
 * @param {string} [options.alt]
 * @param {boolean} [options.ariaHidden]
 * @returns {HTMLElement}
 */
function createMediaWithSkeleton(options) {
  const { src, className, alt = '', ariaHidden = false } = options;

  const skeleton = Skeleton({ className: 'home-page__media-skeleton' });

  const img = createElement('img', {
    className: `home-page__media-img ${className}`,
    attrs: {
      src,
      alt,
      draggable: false,
      'aria-hidden': ariaHidden ? 'true' : undefined,
      onLoad: () => {
        img.classList.add('home-page__media-img--loaded');
        skeleton.classList.add('home-page__media-skeleton--hidden');
      },
      onError: () => {
        skeleton.classList.add('home-page__media-skeleton--hidden');
      },
    },
  });

  return createElement('div', {
    className: 'home-page__media',
    children: [skeleton, img],
  });
}

/**
 * @param {object} game
 * @returns {HTMLElement}
 */
function createGameCard(game) {
  const skeleton = Skeleton({ className: 'home-page__game-skeleton' });

  const banner = createElement('img', {
    className: 'home-page__game-banner',
    attrs: {
      src: game.banner,
      alt: '',
      'aria-hidden': 'true',
      draggable: false,
      onLoad: () => {
        banner.classList.add('home-page__game-banner--loaded');
        skeleton.classList.add('home-page__game-skeleton--hidden');
      },
    },
  });

  return createElement('button', {
    className: 'home-page__game',
    attrs: {
      type: 'button',
      'aria-label': t(game.nameKey),
      onClick: () => {
        void import('../router/index.js').then(({ router }) => router.navigate(game.route));
      },
    },
    children: [skeleton, banner],
  });
}

/**
 * @param {HTMLElement} button
 */
function toggleFooterThemeIcon(button) {
  const isSun = button.classList.toggle('home-page__theme--sun');
  button.setAttribute('aria-label', isSun ? t('home.theme.light') : t('home.theme.dark'));
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
              createMediaWithSkeleton({
                src: DEPOSIT_BONUS_BANNER,
                className: 'home-page__promo home-page__promo--banner',
                alt: t('home.promo.depositBonus.alt'),
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
                attrs: { 'aria-label': t('home.games.ariaLabel') },
                children: GAMES.map((game) => createGameCard(game)),
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
                attrs: { src: ASSETS.logo, alt: t('brand.name'), draggable: false },
              }),
              createElement('button', {
                className: 'home-page__footer-support',
                attrs: { type: 'button', 'aria-label': t('home.support.ariaLabel') },
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
                      'aria-label': t('home.theme.dark'),
                      onClick: (event) => toggleFooterThemeIcon(event.currentTarget),
                    },
                    html: `<span class="home-page__theme-icon-wrap home-page__theme-icon-wrap--moon">${ICON_MOON}</span><span class="home-page__theme-icon-wrap home-page__theme-icon-wrap--sun">${ICON_SUN}</span>`,
                  }),
                  createElement('button', {
                    className: 'home-page__footer-control home-page__footer-control--lang',
                    attrs: {
                      type: 'button',
                      'aria-label': t('home.lang.ariaLabel'),
                      onClick: (event) => {
                        toggleLocale();
                        event.currentTarget.textContent = switchToLocaleLabel();
                      },
                    },
                    text: switchToLocaleLabel(),
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
