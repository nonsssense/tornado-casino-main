import { createElement } from '../utils/dom.js';
import { ROUTE_NAMES } from '../router/route-names.js';
import { createRouteController, defineRoutePolicy } from '../router/route-controller.js';
import { personalDataService } from '../services/personal-data.service.js';
import { appState } from '../services/app-state.js';
import { createPersonalDataStatCard } from '../features/personal-data/personal-data.stat-card.js';
import { formatUsd } from '../utils/format.js';
import { t } from '../i18n/index.js';
import '../../styles/pages/personal-data.css';

const WALLET_CARD_CONFIG = [
  { key: 'real_balance', titleKey: 'personalData.wallet.realBalance', assetPath: '/personal_data_assets/balanceiconforprofile%201.png' },
  { key: 'bonus_balance', titleKey: 'personalData.wallet.bonusBalance', assetPath: '/personal_data_assets/bonusbalance.png' },
  { key: 'withdrawable_balance', titleKey: 'personalData.wallet.withdrawableBalance', assetPath: '/personal_data_assets/withdrawable.png' },
  { key: 'remaining_wager', titleKey: 'personalData.wallet.remainingWager', assetPath: '/personal_data_assets/remainingwager.png' },
];

const STAT_CONFIG = [
  { key: 'total_deposits', labelKey: 'personalData.statistics.totalDeposits', format: (v) => String(v ?? 0) },
  { key: 'total_deposit_amount', labelKey: 'personalData.statistics.totalDepositAmount', format: formatUsd },
  { key: 'total_withdrawals', labelKey: 'personalData.statistics.totalWithdrawals', format: (v) => String(v ?? 0) },
  { key: 'total_withdrawal_amount', labelKey: 'personalData.statistics.totalWithdrawalAmount', format: formatUsd },
  { key: 'total_bets', labelKey: 'personalData.statistics.totalBets', format: (v) => String(v ?? 0) },
  { key: 'total_wager', labelKey: 'personalData.statistics.totalWager', format: formatUsd },
  { key: 'total_wins', labelKey: 'personalData.statistics.totalWins', format: formatUsd },
  { key: 'total_losses', labelKey: 'personalData.statistics.totalLosses', format: formatUsd },
  { key: 'favorite_game', labelKey: 'personalData.statistics.favoriteGame', format: (v) => (v ? t(`games.${v}.name`) : t('common.emDash')) },
  { key: 'average_bet', labelKey: 'personalData.statistics.averageBet', format: formatUsd },
  {
    key: 'total_play_time_seconds',
    labelKey: 'personalData.statistics.totalPlayTime',
    format: (v) => (v == null ? t('common.emDash') : formatDuration(v)),
  },
];

const STATS_FRAME_ASSET_PATH = '/personal_data_assets/frameformertics.png';

function formatDuration(seconds) {
  const total = Math.max(0, Number(seconds) || 0);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours <= 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

function createImageBackground(className, assetPath) {
  const img = createElement('img', {
    className,
    attrs: { src: assetPath, alt: '', 'aria-hidden': 'true', draggable: false },
  });
  img.addEventListener('error', () => {
    img.remove();
  });
  return img;
}

function createWalletCard(title, value, assetPath, valueKey) {
  const card = createElement('article', {
    className: 'personal-data__wallet-card',
    attrs: { 'data-wallet-key': valueKey },
    children: [
      createElement('div', {
        className: 'personal-data__wallet-content',
        children: [
          createElement('span', { className: 'personal-data__wallet-title', text: title }),
          createElement('strong', {
            className: 'personal-data__wallet-value',
            attrs: { 'data-value': valueKey },
            text: value,
          }),
        ],
      }),
    ],
  });
  card.prepend(createImageBackground('personal-data__wallet-bg', assetPath));
  return card;
}

function renderError(root) {
  root.replaceChildren(
    createElement('div', {
      className: 'personal-data__error',
      text: t('personalData.loadError'),
    }),
  );
}

function progressPercentOf(overview) {
  const progressCurrent = Number(overview.progress_current) || 0;
  const progressRequired = Number(overview.progress_required) || 0;
  if (progressRequired > 0) {
    return Math.max(0, Math.min(100, Math.round((progressCurrent / progressRequired) * 100)));
  }
  return 100;
}

/**
 * Update text/progress values in place — keep images and card DOM.
 * @param {HTMLElement} root
 * @param {object} payload
 * @returns {boolean}
 */
function updatePageValues(root, payload) {
  const page = root.querySelector('.personal-data[data-personal-data-ready="true"]');
  if (!page) return false;

  const overview = payload?.overview || {};
  const wallet = payload?.wallet || {};
  const statistics = payload?.statistics || {};

  const username = page.querySelector('.personal-data__username');
  if (username) username.textContent = overview.username || t('common.player');

  const statusEls = page.querySelectorAll('.personal-data__status, .personal-data__progress-top > span:first-child');
  statusEls.forEach((el) => {
    el.textContent = overview.status || t('common.emDash');
  });

  const nextEl = page.querySelector('.personal-data__progress-top > span:last-child');
  if (nextEl) {
    nextEl.textContent = overview.next_status
      ? `${t('personalData.nextStatus')}: ${overview.next_status}`
      : t('personalData.maxStatus');
  }

  const fill = page.querySelector('.personal-data__progress-fill');
  if (fill) {
    fill.style.width = `${progressPercentOf(overview)}%`;
  }

  const caption = page.querySelector('.personal-data__progress-caption');
  if (caption) {
    const progressCurrent = Number(overview.progress_current) || 0;
    const progressRequired = Number(overview.progress_required) || 0;
    caption.textContent = progressRequired > 0
      ? `${progressCurrent} / ${progressRequired} ${overview.progress_unit || 'FTD'}`
      : t('personalData.maxStatusReached');
  }

  WALLET_CARD_CONFIG.forEach((item) => {
    const valueEl = page.querySelector(`[data-value="${item.key}"]`);
    if (valueEl) valueEl.textContent = formatUsd(wallet[item.key] || 0);
  });

  STAT_CONFIG.forEach((item) => {
    const valueEl = page.querySelector(`[data-stat="${item.key}"]`);
    if (valueEl) valueEl.textContent = item.format(statistics[item.key]);
  });

  return true;
}

function renderPage(root, payload) {
  const overview = payload?.overview || {};
  const wallet = payload?.wallet || {};
  const statistics = payload?.statistics || {};

  const progressCurrent = Number(overview.progress_current) || 0;
  const progressRequired = Number(overview.progress_required) || 0;
  const progressPercent = progressPercentOf(overview);

  const walletCards = WALLET_CARD_CONFIG.map((item) => createWalletCard(
    t(item.titleKey),
    formatUsd(wallet[item.key] || 0),
    item.assetPath,
    item.key,
  ));

  const statCards = STAT_CONFIG.map((item) => {
    const card = createPersonalDataStatCard({
      label: t(item.labelKey),
      value: item.format(statistics[item.key]),
      assetPath: STATS_FRAME_ASSET_PATH,
    });
    const valueEl = card.querySelector('.personal-data__stat-value');
    if (valueEl) valueEl.setAttribute('data-stat', item.key);
    return card;
  });

  root.replaceChildren(
    createElement('div', {
      className: 'personal-data',
      attrs: { 'data-personal-data-ready': 'true' },
      children: [
        createElement('section', {
          className: 'personal-data__overview',
          children: [
            createElement('div', {
              className: 'personal-data__overview-meta',
              children: [
                createElement('strong', {
                  className: 'personal-data__username',
                  text: overview.username || t('common.player'),
                }),
                createElement('span', {
                  className: 'personal-data__status',
                  text: overview.status || t('common.emDash'),
                }),
              ],
            }),
            createElement('div', {
              className: 'personal-data__progress',
              children: [
                createElement('div', {
                  className: 'personal-data__progress-top',
                  children: [
                    createElement('span', { text: overview.status || t('common.emDash') }),
                    createElement('span', {
                      text: overview.next_status
                        ? `${t('personalData.nextStatus')}: ${overview.next_status}`
                        : t('personalData.maxStatus'),
                    }),
                  ],
                }),
                createElement('div', {
                  className: 'personal-data__progress-track',
                  children: [
                    createElement('span', {
                      className: 'personal-data__progress-fill',
                      attrs: { style: `width:${progressPercent}%;` },
                    }),
                  ],
                }),
                createElement('span', {
                  className: 'personal-data__progress-caption',
                  text: progressRequired > 0
                    ? `${progressCurrent} / ${progressRequired} ${overview.progress_unit || 'FTD'}`
                    : t('personalData.maxStatusReached'),
                }),
              ],
            }),
          ],
        }),
        createElement('section', {
          className: 'personal-data__section',
          children: [
            createElement('h2', { className: 'personal-data__title', text: t('personalData.walletOverview') }),
            createElement('div', {
              className: 'personal-data__wallet-carousel',
              attrs: { 'aria-label': t('personalData.walletOverview') },
              children: walletCards,
            }),
          ],
        }),
        createElement('section', {
          className: 'personal-data__section',
          children: [
            createElement('h2', { className: 'personal-data__title', text: t('personalData.statisticsTitle') }),
            createElement('div', {
              className: 'personal-data__stats-grid',
              children: statCards,
            }),
          ],
        }),
      ],
    }),
  );
}

/**
 * Paint from cache when possible; fetch only when stale/missing.
 * @param {HTMLElement} root
 */
async function hydratePersonalData(root) {
  appState.init();

  const cached = personalDataService.getCached();
  const fresh = personalDataService.isFresh();

  if (cached) {
    if (!updatePageValues(root, cached)) {
      renderPage(root, cached);
    }
    if (fresh) return;
  } else if (!root.querySelector('.personal-data')) {
    root.replaceChildren(createElement('div', { className: 'personal-data personal-data--loading' }));
  }

  try {
    const payload = await appState.ensurePersonalData();
    if (!updatePageValues(root, payload)) {
      renderPage(root, payload);
    }
  } catch {
    if (!cached) renderError(root);
  }
}

export function createPersonalDataController() {
  let initialized = false;
  /** @type {HTMLElement|null} */
  let routeRoot = null;

  return createRouteController({
    name: ROUTE_NAMES.PERSONAL_DATA,
    policy: defineRoutePolicy({
      retainController: true,
      retainDom: true,
      screenType: 'standalone',
      showRouteSkeleton: false,
    }),
    createRoot() {
      routeRoot = createElement('div', {
        className: 'route-root route-root--personal-data',
        attrs: { 'data-route': ROUTE_NAMES.PERSONAL_DATA },
      });
      return routeRoot;
    },
    async load(root) {
      if (initialized) return;
      initialized = true;
      await hydratePersonalData(root);
    },
    async activate() {
      const root = routeRoot;
      if (!root) return;
      await hydratePersonalData(root);
    },
    deactivate() {},
    destroy(root) {
      initialized = false;
      routeRoot = null;
      root.replaceChildren();
    },
  });
}
