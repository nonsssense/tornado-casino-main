/**
 * Deposit view — crypto deposit + bank coming-soon, welcome bonus banner.
 * Address is requested immediately after coin/network selection.
 */

import { createElement } from '../../utils/dom.js';
import {
  getDepositDisclaimer,
  getDepositStatusLabel,
} from '../../utils/wallet.constants.js';
import { formatCryptoAmount, formatUsd } from '../../utils/format.js';
import { walletService } from '../../services/wallet.service.js';
import { balanceService } from '../../services/balance.service.js';
import { bonusService } from '../../services/bonus.service.js';
import { isAuthenticated, subscribeAuthStatus, AUTH_STATUS } from '../../services/auth-state.js';
import { t } from '../../i18n/index.js';
import { getCoinNetwork, getDefaultNetworkId } from './wallet.utils.js';
import { createDepositBonusCard } from './deposit.bonus-card.js';
import { createBonusInfoView } from './deposit.bonus-info.js';
import { Button } from '../../components/base/Button.js';
import { Card } from '../../components/base/Card.js';
import { SkeletonDepositAddress } from '../../components/base/Skeleton.js';
import { QrLightbox } from '../../components/base/QrLightbox.js';
import { Toast } from '../../components/base/Toast.js';
import { createCoinNetworkPair } from '../../components/shared/CoinNetworkPair.js';
import { MethodSelector } from '../../components/shared/MethodSelector.js';
import { createGuestLockedPanel } from '../../components/shared/GuestLock.js';

const ICON_COPY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';

const ICON_QR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3zM17 17h3v3h-3z"/></svg>';

/**
 * @param {object} [options]
 * @returns {{ element: HTMLElement, setCoinId: Function, setNetworkId: Function, destroy: Function }}
 */
export function createDepositView(options = {}) {
  const {
    getCoinId = () => 'usdt',
    getNetworkId = () => getDefaultNetworkId(getCoinId()),
    onCoinSelect,
    onNetworkSelect,
  } = options;

  const state = {
    method: 'crypto',
    panel: 'main',
    deposit: null,
    minimum: null,
    minimumUsd: null,
    loading: true,
    error: null,
    status: 'pending',
    completionHandled: false,
    bonusInfo: null,
  };

  let loadGeneration = 0;
  let stopPolling = null;
  /** @type {{ element: HTMLElement, open: () => void, close: () => Promise<void> }|null} */
  let qrLightbox = null;
  /** @type {{ element: HTMLElement, destroy?: () => void }|null} */
  let bonusCard = null;
  /** @type {{ element: HTMLElement, destroy?: () => void }|null} */
  let bonusInfoView = null;
  /** @type {{ element: HTMLElement, setCoinId: Function, setNetworkId: Function, destroy: Function }|null} */
  let coinNetworkPair = null;

  const methodMount = createElement('div', { className: 'wallet-view__method-slot' });
  const mainMount = createElement('div', { className: 'wallet-view__main' });
  const panelMount = createElement('div', { className: 'wallet-view__panel-slot' });

  const pairMount = createElement('div', { className: 'wallet-view__pair-slot' });
  const addressMount = createElement('div');
  const infoMount = createElement('div');
  const statusMount = createElement('div');
  const bonusMount = createElement('div', { className: 'wallet-view__bonus-slot' });

  function currentContext() {
    return getCoinNetwork(getCoinId(), getNetworkId());
  }

  function formatMinimumLabel() {
    const ctx = currentContext();
    const coinLabel = ctx?.coin.symbol
      || (ctx?.coin?.labelKey ? t(ctx.coin.labelKey) : null)
      || 'USDT';

    if (state.minimumUsd != null) {
      return formatUsd(state.minimumUsd);
    }
    if (state.minimum != null) {
      return formatCryptoAmount(state.minimum, { symbol: coinLabel });
    }
    return null;
  }

  function updateMethodSelector() {
    methodMount.replaceChildren(
      MethodSelector({
        activeId: state.method,
        onSelect: (methodId) => {
          if (state.method === methodId) return;
          state.method = methodId;
          updateMethodSelector();
          renderMain();
          if (methodId === 'crypto') void loadDeposit();
        },
      }),
    );
  }

  function mountCoinNetworkPair() {
    coinNetworkPair?.destroy?.();
    coinNetworkPair = createCoinNetworkPair({
      coinId: getCoinId(),
      networkId: getNetworkId(),
      onCoinSelect: (coinId) => {
        if (getCoinId() === coinId) return;
        onCoinSelect?.(coinId);
      },
      onNetworkSelect: (networkId) => {
        if (getNetworkId() === networkId) return;
        onNetworkSelect?.(networkId);
      },
    });
    pairMount.replaceChildren(coinNetworkPair.element);
  }

  function renderAddressGuest() {
    addressMount.replaceChildren(
      createGuestLockedPanel({
        message: t('guest.deposit.message'),
        className: 'wallet-view__address-guest',
      }),
    );
    statusMount.replaceChildren();
  }

  function renderAddressLoading() {
    addressMount.replaceChildren(SkeletonDepositAddress());
    statusMount.replaceChildren();
  }

  function renderAddressError() {
    addressMount.replaceChildren(
      createElement('div', {
        className: 'wallet-view__address-error',
        text: state.error || t('wallet.deposit.error.retry'),
      }),
    );
    statusMount.replaceChildren();
  }

  function renderAddressCard() {
    const ctx = currentContext();
    if (!ctx || !state.deposit?.address) return;

    const address = state.deposit.address;
    addressMount.replaceChildren(
      Card({
        variant: 'default',
        className: 'wallet-view__address-card hydrate-fade',
        children: [
          createElement('p', {
            className: 'wallet-view__address-label',
            text: t(ctx.network.addressKey),
          }),
          createElement('p', {
            className: 'wallet-view__address-value',
            text: address,
          }),
          createElement('div', {
            className: 'wallet-view__address-actions',
            children: [
              Button({
                label: t('wallet.deposit.copy'),
                variant: 'primary',
                size: 'sm',
                className: 'wallet-view__action-btn',
                icon: ICON_COPY,
                onClick: () => copyAddress(address),
              }),
              Button({
                label: t('wallet.deposit.qr'),
                variant: 'primary',
                size: 'sm',
                className: 'wallet-view__action-btn',
                icon: ICON_QR,
                onClick: () => showQrCode(),
              }),
            ],
          }),
        ],
      }),
    );
    const card = addressMount.querySelector('.wallet-view__address-card');
    if (card) {
      requestAnimationFrame(() => card.classList.add('hydrate-fade--visible'));
    }
  }

  function updateInfo() {
    const formattedMin = formatMinimumLabel();

    infoMount.replaceChildren(
      createElement('p', {
        className: 'wallet-view__min-sum',
        html: formattedMin
          ? t('wallet.deposit.minSum', { amount: `<strong>${formattedMin}</strong>` })
          : t('wallet.deposit.minSumEmpty').replace(
            t('common.emDash'),
            `<span class="wallet-view__min-sum-pending">${t('common.emDash')}</span>`,
          ),
      }),
      createElement('p', {
        className: 'wallet-view__disclaimer',
        text: getDepositDisclaimer(),
      }),
    );
  }

  function updateStatus() {
    if (!state.deposit?.address) {
      statusMount.replaceChildren();
      return;
    }
    const label = getDepositStatusLabel(state.status) || getDepositStatusLabel('pending');
    statusMount.replaceChildren(
      createElement('p', {
        className: 'wallet-view__status',
        html: t('wallet.deposit.statusPrefix', {
          status: `<span class="wallet-view__status-value">${label}</span>`,
        }),
      }),
    );
  }

  function stopStatusPolling() {
    if (stopPolling) {
      stopPolling();
      stopPolling = null;
    }
  }

  function startStatusPolling(depositId) {
    stopStatusPolling();
    state.completionHandled = false;

    stopPolling = walletService.pollDepositStatus(depositId, {
      onStatus: (status) => {
        state.status = status;
        updateStatus();
      },
      onComplete: async (depositData) => {
        if (state.completionHandled) return;
        state.completionHandled = true;
        state.status = 'completed';
        updateStatus();
        stopStatusPolling();

        try {
          await Promise.all([
            balanceService.fetchBalances(),
            bonusService.fetchOffers(),
            bonusService.fetchActiveBonuses().catch(() => []),
          ]);
        } catch {
          // non-blocking
        }

        Toast({ message: t('wallet.deposit.toast.completed'), type: 'success', duration: 3000 });
        if (depositData?.bonus_skipped_reason === 'active_welcome') {
          Toast({
            message: t('wallet.deposit.bonusSkippedActive'),
            type: 'info',
            duration: 5500,
          });
        }
      },
      onBelowMinimum: () => {
        if (state.completionHandled) return;
        state.completionHandled = true;
        state.status = 'below_minimum';
        updateStatus();
        stopStatusPolling();
        Toast({
          message: t('wallet.deposit.belowMinimumToast'),
          type: 'warning',
          duration: 4500,
        });
      },
    });
  }

  async function loadDeposit() {
    const generation = ++loadGeneration;
    const ctx = currentContext();

    stopStatusPolling();
    state.deposit = null;
    state.status = 'pending';
    state.completionHandled = false;
    state.error = null;
    state.minimum = null;
    state.minimumUsd = null;

    if (!isAuthenticated()) {
      state.loading = false;
      renderAddressGuest();
      updateInfo();
      updateStatus();
      return;
    }

    if (!ctx) {
      state.loading = false;
      state.error = t('wallet.deposit.error.unsupported');
      renderAddressError();
      updateInfo();
      return;
    }

    state.loading = true;
    renderAddressLoading();
    updateInfo();
    updateStatus();

    try {
      const data = await walletService.createDeposit(ctx.network.ticker);
      if (generation !== loadGeneration) return;

      state.deposit = data;
      state.minimum = data?.minimum ?? null;
      state.minimumUsd = data?.minimum_usd ?? null;
      state.status = 'pending';
      state.error = null;
      state.loading = false;
      renderAddressCard();
      updateInfo();
      updateStatus();
      if (data.deposit_id) startStatusPolling(data.deposit_id);
    } catch (error) {
      if (generation !== loadGeneration) return;

      // Guest / missing session — never show raw Unauthorized toasts.
      if (error?.status === 401 || !isAuthenticated()) {
        state.loading = false;
        state.deposit = null;
        state.error = null;
        renderAddressGuest();
        updateInfo();
        updateStatus();
        return;
      }

      state.loading = false;
      state.deposit = null;
      if (error?.status === 404 || error?.status === 501) {
        state.error = t('wallet.deposit.error.unavailable');
      } else if (error?.status === 502) {
        state.error = t('wallet.deposit.error.addressUnavailable');
      } else if (error?.status === 400) {
        state.error = t('wallet.deposit.error.network');
      } else {
        state.error = t('wallet.deposit.error.retry');
      }
      renderAddressError();
      updateInfo();
      updateStatus();
      Toast({ message: state.error, type: 'error', duration: 3000 });
    }
  }

  function copyAddress(address) {
    if (!address) return;
    navigator.clipboard.writeText(address)
      .then(() => {
        Toast({ message: t('wallet.deposit.toast.addressCopied'), type: 'success', duration: 2000 });
      })
      .catch(() => {
        Toast({ message: t('wallet.deposit.toast.copyFailed'), type: 'error', duration: 2500 });
      });
  }

  function closeQrLightbox() {
    if (!qrLightbox) return Promise.resolve();
    const active = qrLightbox;
    qrLightbox = null;
    return active.close();
  }

  function showQrCode() {
    const qr = state.deposit?.qr_code;
    const address = state.deposit?.address;
    if (!qr && !address) {
      Toast({ message: t('wallet.deposit.toast.qrUnavailable'), type: 'info', duration: 2500 });
      return;
    }

    const qrUrl = qr || (
      'https://api.qrserver.com/v1/create-qr-code/?size=280x280&data='
      + encodeURIComponent(address)
    );

    void closeQrLightbox().then(() => {
      qrLightbox = QrLightbox({
        src: qrUrl,
        alt: t('wallet.deposit.qrAlt'),
        onClose: () => {
          qrLightbox = null;
        },
      });
      document.body.appendChild(qrLightbox.element);
      qrLightbox.open();
    });
  }

  function openBonusInfo(payload) {
    state.panel = 'bonus-info';
    state.bonusInfo = payload;
    renderPanel();
  }

  function closeBonusInfo() {
    state.panel = 'main';
    state.bonusInfo = null;
    bonusInfoView?.destroy?.();
    bonusInfoView = null;
    renderPanel();
  }

  function mountBonusCard() {
    bonusCard?.destroy?.();
    bonusCard = createDepositBonusCard({
      onLearnMore: openBonusInfo,
    });
    bonusMount.replaceChildren(bonusCard.element);
  }

  function renderBankComingSoon() {
    mainMount.replaceChildren(
      createElement('div', {
        className: 'wallet-view__coming-soon',
        children: [
          createElement('p', {
            className: 'wallet-view__coming-soon-title',
            text: t('wallet.method.comingSoon'),
          }),
          createElement('p', {
            className: 'wallet-view__coming-soon-text',
            text: t('wallet.method.comingSoonHint'),
          }),
        ],
      }),
    );
  }

  function renderCryptoMain() {
    mainMount.replaceChildren(
      pairMount,
      addressMount,
      infoMount,
      statusMount,
      bonusMount,
    );
  }

  function renderMain() {
    if (state.method === 'bank') {
      renderBankComingSoon();
      return;
    }
    renderCryptoMain();
  }

  function renderPanel() {
    const showingInfo = state.panel === 'bonus-info';
    methodMount.hidden = showingInfo;
    mainMount.hidden = showingInfo;
    panelMount.hidden = !showingInfo;
    element.classList.toggle('wallet-view--subpage', showingInfo);

    if (!showingInfo) {
      panelMount.replaceChildren();
      return;
    }

    bonusInfoView?.destroy?.();
    bonusInfoView = createBonusInfoView({
      offer: state.bonusInfo?.offer,
      mode: state.bonusInfo?.mode || 'available',
      rules: state.bonusInfo?.rules || null,
      onBack: closeBonusInfo,
    });
    panelMount.replaceChildren(bonusInfoView.element);
  }

  function setCoinId(coinId) {
    coinNetworkPair?.setCoinId(coinId);
    coinNetworkPair?.setNetworkId(getNetworkId());
    if (state.method === 'crypto') void loadDeposit();
  }

  function setNetworkId(networkId) {
    coinNetworkPair?.setNetworkId(networkId);
    if (state.method === 'crypto') void loadDeposit();
  }

  updateMethodSelector();
  mountCoinNetworkPair();
  mountBonusCard();
  renderMain();
  void loadDeposit();

  const unsubscribeAuth = subscribeAuthStatus((status) => {
    if (status === AUTH_STATUS.AUTHENTICATED && state.method === 'crypto') {
      void loadDeposit();
    } else if (status === AUTH_STATUS.GUEST && state.method === 'crypto') {
      stopStatusPolling();
      state.deposit = null;
      renderAddressGuest();
      updateInfo();
      updateStatus();
    }
  });

  const element = createElement('div', {
    className: 'wallet-view wallet-view--deposit',
    attrs: { 'data-view': 'deposit' },
    children: [methodMount, mainMount, panelMount],
  });

  renderPanel();

  return {
    element,
    setCoinId,
    setNetworkId,
    destroy() {
      loadGeneration += 1;
      state.completionHandled = true;
      unsubscribeAuth();
      stopStatusPolling();
      void closeQrLightbox();
      coinNetworkPair?.destroy?.();
      bonusCard?.destroy?.();
      bonusInfoView?.destroy?.();
    },
  };
}
