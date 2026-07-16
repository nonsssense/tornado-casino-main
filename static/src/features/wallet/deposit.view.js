/**
 * Deposit view — deposit panel content for the wallet modal.
 */

import { createElement } from '../../utils/dom.js';
import {
  getDepositDisclaimer,
  getDepositStatusLabel,
} from '../../utils/wallet.constants.js';
import { formatCryptoAmount } from '../../utils/format.js';
import { walletService } from '../../services/wallet.service.js';
import { balanceService } from '../../services/balance.service.js';
import { bonusService } from '../../services/bonus.service.js';
import { t } from '../../i18n/index.js';
import { getCoinNetwork, getDefaultNetworkId } from './wallet.utils.js';
import { createDepositBonusSelector } from './deposit.bonus-selector.js';
import { Button } from '../../components/base/Button.js';
import { Card } from '../../components/base/Card.js';
import { SkeletonDepositAddress } from '../../components/base/Skeleton.js';
import { QrLightbox } from '../../components/base/QrLightbox.js';
import { Toast } from '../../components/base/Toast.js';
import { CoinSelector } from '../../components/shared/CoinSelector.js';
import { NetworkSelector } from '../../components/shared/NetworkSelector.js';

const ICON_COPY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';

const ICON_QR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3zM17 17h3v3h-3z"/></svg>';

/**
 * @param {Array<object>} networks
 * @returns {Array<object>}
 */
function resolveNetworkOptions(networks) {
  return networks.map((option) => ({
    ...option,
    label: t(option.labelKey),
    networkLabel: t(option.networkKey),
  }));
}

/**
 * @param {object} [options]
 * @param {function} [options.getCoinId]
 * @param {function} [options.getNetworkId]
 * @param {function} [options.onCoinSelect]
 * @param {function} [options.onNetworkSelect]
 * @returns {{ element: HTMLElement, setCoinId: (coinId: string) => void, setNetworkId: (networkId: string) => void }}
 */
export function createDepositView(options = {}) {
  const {
    getCoinId = () => 'usdt',
    getNetworkId = () => getDefaultNetworkId(getCoinId()),
    onCoinSelect,
    onNetworkSelect,
  } = options;

  const state = {
    deposit: null,
    loading: true,
    error: null,
    status: 'pending',
    completionHandled: false,
  };

  let stopPolling = null;
  /** @type {{ element: HTMLElement, open: () => void, close: () => Promise<void> }|null} */
  let qrLightbox = null;

  const coinGridMount = createElement('div');
  const networkMount = createElement('div');
  const addressMount = createElement('div');
  const infoMount = createElement('div');
  const statusMount = createElement('div');

  function currentContext() {
    return getCoinNetwork(getCoinId(), getNetworkId());
  }

  function updateCoinGrid() {
    coinGridMount.replaceChildren(
      CoinSelector({
        activeId: getCoinId(),
        onSelect: (coinId) => {
          if (getCoinId() === coinId) return;
          if (onCoinSelect) onCoinSelect(coinId);
        },
      }),
    );
  }

  function updateNetwork() {
    const ctx = currentContext();

    if (!ctx) {
      networkMount.replaceChildren();
      return;
    }

    const multiNetwork = ctx.networks.length > 1;

    networkMount.replaceChildren(
      NetworkSelector({
        networkLabel: t(ctx.network.networkKey),
        label: t(ctx.network.labelKey),
        iconSrc: ctx.network.icon,
        className: 'wallet-view__network',
        options: resolveNetworkOptions(ctx.networks),
        activeId: ctx.network.id,
        onSelect: multiNetwork
          ? (networkId) => {
            if (getNetworkId() === networkId) return;
            if (onNetworkSelect) onNetworkSelect(networkId);
          }
          : undefined,
        disabled: !multiNetwork,
      }),
    );
  }

  function renderAddressLoading() {
    addressMount.replaceChildren(SkeletonDepositAddress());
  }

  function renderAddressError() {
    addressMount.replaceChildren(
      createElement('div', {
        className: 'wallet-view__address-error',
        children: [
          createElement('p', {
            className: 'wallet-view__address-error-text',
            text: state.error || t('wallet.deposit.error.load'),
          }),
          Button({
            label: t('common.retry'),
            variant: 'secondary',
            size: 'sm',
            onClick: loadDeposit,
          }),
        ],
      }),
    );
  }

  function renderAddressCard() {
    const ctx = currentContext();

    if (!ctx || !state.deposit?.address) {
      return;
    }

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
    const ctx = currentContext();
    const minimum = state.deposit?.minimum;
    const coinLabel = ctx?.coin.symbol
      || (ctx?.coin?.labelKey ? t(ctx.coin.labelKey) : null)
      || 'USDT';
    const formattedMin = minimum != null
      ? formatCryptoAmount(minimum, { symbol: coinLabel })
      : null;

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
      onComplete: async () => {
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
          // Balance/bonus refresh failures should not block completion UX.
        }

        Toast({ message: t('wallet.deposit.toast.completed'), type: 'success', duration: 3000 });
      },
    });
  }

  async function loadDeposit() {
    const ctx = currentContext();

    if (!ctx) {
      state.loading = false;
      state.error = t('wallet.deposit.error.unsupported');
      renderAddressError();
      return;
    }

    stopStatusPolling();
    state.loading = true;
    state.error = null;
    state.deposit = null;
    state.status = 'pending';
    renderAddressLoading();
    updateInfo();
    updateStatus();

    try {
      const data = await walletService.createDeposit(ctx.network.ticker);
      state.deposit = data;
      state.status = 'pending';
      renderAddressCard();

      if (data.deposit_id) {
        startStatusPolling(data.deposit_id);
      }
    } catch (error) {
      if (error?.status === 404 || error?.status === 501) {
        state.error = t('wallet.deposit.error.unavailable');
      } else if (error?.status === 400) {
        state.error = t('wallet.deposit.error.network');
      } else if (error?.status === 502) {
        state.error = t('wallet.deposit.error.addressUnavailable');
      } else {
        state.error = t('wallet.deposit.error.retry');
      }
      renderAddressError();
    } finally {
      state.loading = false;
      updateInfo();
      updateStatus();
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

  function setCoinId(coinId) {
    void coinId;
    updateCoinGrid();
    updateNetwork();
    loadDeposit();
  }

  function setNetworkId(networkId) {
    void networkId;
    updateNetwork();
    loadDeposit();
  }

  updateCoinGrid();
  updateNetwork();
  renderAddressLoading();
  updateInfo();
  updateStatus();
  loadDeposit();

  const bonusSelector = createDepositBonusSelector();
  const bonusMount = createElement('div', {
    className: 'wallet-view__bonus-slot',
    children: [bonusSelector.element],
  });

  const element = createElement('div', {
    className: 'wallet-view wallet-view--deposit',
    attrs: { 'data-view': 'deposit' },
    children: [
      coinGridMount,
      networkMount,
      addressMount,
      infoMount,
      statusMount,
      bonusMount,
    ],
  });

  return {
    element,
    setCoinId,
    setNetworkId,
    destroy() {
      state.completionHandled = true;
      stopStatusPolling();
      void closeQrLightbox();
      bonusSelector.destroy?.();
    },
  };
}
