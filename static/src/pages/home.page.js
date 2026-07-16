/**
 * Home route controller — static page, cached DOM, soft lifecycle.
 */

import { createElement } from '../utils/dom.js';
import { ASSETS } from '../utils/assets.js';
import { ROUTE_NAMES } from '../router/route-names.js';
import { Skeleton } from '../components/base/Skeleton.js';
import { toggleLocale, getLocale, LOCALES, t } from '../i18n/index.js';
import {
  createRouteController,
  defineRoutePolicy,
} from '../router/route-controller.js';

const DEPOSIT_BONUS_BANNER = '/banners/deposit-bonus-banner.webp';
const SUPPORT_ASSET = '/assets/tornado%20support%20main.webp';

const GAMES = [
  { id: 'dice', nameKey: 'games.dice.name', route: ROUTE_NAMES.DICE, banner: '/banners/dice-game.webp' },
  { id: 'plinko', nameKey: 'games.plinko.name', route: ROUTE_NAMES.PLINKO, banner: '/banners/plinko-game.webp' },
  { id: 'crash', nameKey: 'games.crash.name', route: ROUTE_NAMES.CRASH, banner: '/banners/crash-game.webp' },
];

const ICON_MOON = '<svg class="home-page__theme-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';

const ICON_SUN = '<svg class="home-page__theme-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>';

/**
 * @returns {string}
 */
function switchToLocaleLabel() {
  return getLocale() === LOCALES.ru ? t('home.lang.en') : t('home.lang.ru');
}

/**
 * @param {HTMLImageElement} img
 * @param {HTMLElement} skeleton
 */
function bindImageLoad(img, skeleton) {
  const markLoaded = () => {
    img.classList.add('home-page__media-img--loaded');
    skeleton.classList.add('home-page__media-skeleton--hidden');
  };
  const markError = () => {
    skeleton.classList.add('home-page__media-skeleton--hidden');
  };

  img.addEventListener('load', markLoaded);
  img.addEventListener('error', markError);

  if (img.complete && img.naturalWidth > 0) {
    markLoaded();
  } else if (img.complete) {
    markError();
  }
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
      alt,
      draggable: false,
      'aria-hidden': ariaHidden ? 'true' : undefined,
    },
  });

  bindImageLoad(img, skeleton);
  img.src = src;

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
      alt: '',
      'aria-hidden': 'true',
      draggable: false,
    },
  });

  const markLoaded = () => {
    banner.classList.add('home-page__game-banner--loaded');
    skeleton.classList.add('home-page__game-skeleton--hidden');
  };
  banner.addEventListener('load', markLoaded);
  banner.addEventListener('error', () => {
    skeleton.classList.add('home-page__game-skeleton--hidden');
  });
  banner.src = game.banner;
  if (banner.complete && banner.naturalWidth > 0) {
    markLoaded();
  }

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
function buildHomeDom() {
  return createElement('div', {
    className: 'home-page',
    attrs: { 'data-page': 'home' },
    children: [
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
      createElement('div', {
        className: 'home-page__spacer',
        attrs: { 'aria-hidden': 'true' },
      }),
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

/**
 * @returns {import('../router/route-controller.js').RouteController}
 */
export function createHomeController() {
  /** @type {HTMLElement|null} */
  let page = null;

  return createRouteController({
    name: ROUTE_NAMES.HOME,
    policy: defineRoutePolicy({
      retainController: true,
      retainDom: true,
      immersive: false,
      showRouteSkeleton: false,
    }),
    createRoot() {
      return createElement('div', {
        className: 'route-root route-root--home',
        attrs: { 'data-route': ROUTE_NAMES.HOME },
      });
    },
    load(root) {
      if (!page) {
        page = buildHomeDom();
      }
      if (page.parentElement !== root) {
        root.replaceChildren(page);
      }
    },
    activate() {
      // Static page — DOM already built in load().
    },
    deactivate() {
      // Soft lifecycle — no runtime to stop.
    },
    destroy(root) {
      page = null;
      root.replaceChildren();
    },
  });
}

/**
 * @deprecated Use createHomeController — kept for barrel compatibility.
 * @returns {HTMLElement}
 */
export function renderHomePage() {
  const controller = createHomeController();
  void controller.load();
  void controller.activate({
    reason: 'navigate',
    fromRoute: null,
    signal: new AbortController().signal,
  });
  return controller.getRoot();
}
