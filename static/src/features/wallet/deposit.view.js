/**
 * Deposit view — deposit panel content for the wallet modal.
 */

import { createElement } from '../../utils/dom.js';
import {
  DEPOSIT_STATUS_LABELS,
  DEPOSIT_DISCLAIMER,
} from '../../utils/wallet.constants.js';
import { walletService } from '../../services/wallet.service.js';
import { getCoinNetwork } from './wallet.utils.js';
import { Button } from '../../components/base/Button.js';
import { Card } from '../../components/base/Card.js';
import { Loader } from '../../components/base/Loader.js';
import { Toast } from '../../components/base/Toast.js';
import { CoinSelector } from '../../components/shared/CoinSelector.js';
import { NetworkSelector } from '../../components/shared/NetworkSelector.js';

const ICON_COPY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';

const ICON_QR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3zM17 17h3v3h-3z"/></svg>';

const ICON_CHEVRON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';

/**
 * @param {object} [options]
 * @param {function} [options.getCoinId]
 * @param {function} [options.onCoinSelect]
 * @returns {{ element: HTMLElement, setCoinId: (coinId: string) => void }}
 */
export function createDepositView(options = {}) {
  const { getCoinId = () => 'usdt', onCoinSelect } = options;

  const state = {
    deposit: null,
    loading: true,
    error: null,
    status: 'pending',
  };

  const coinGridMount = createElement('div');
  const networkMount = createElement('div');
  const addressMount = createElement('div');
  const infoMount = createElement('div');
  const statusMount = createElement('div');

  function updateCoinGrid() {
    coinGridMount.replaceChildren(
      CoinSelector({
        activeId: getCoinId(),
        onSelect: (coinId) => {
          if (getCoinId() === coinId) return;
          if (onCoinSelect) onCoinSelect(coinId);
          updateCoinGrid();
          updateNetwork();
          loadDeposit();
        },
      }),
    );
  }

  function updateNetwork() {
    const ctx = getCoinNetwork(getCoinId());

    if (!ctx) {
      networkMount.replaceChildren();
      return;
    }

    networkMount.replaceChildren(
      NetworkSelector({
        networkLabel: ctx.network.networkLabel,
        label: ctx.network.label,
        iconSrc: ctx.network.icon,
        className: 'wallet-view__network',
        // TODO: open network picker when multiple networks per coin are supported
        onClick: undefined,
      }),
    );
  }

  function renderAddressLoading() {
    addressMount.replaceChildren(
      createElement('div', {
        className: 'wallet-view__address-loading',
        children: [
          Loader({ size: 'md' }),
          createElement('span', {
            className: 'wallet-view__address-loading-text',
            text: 'Loading deposit address…',
          }),
        ],
      }),
    );
  }

  function renderAddressError() {
    addressMount.replaceChildren(
      createElement('div', {
        className: 'wallet-view__address-error',
        children: [
          createElement('p', {
            className: 'wallet-view__address-error-text',
            text: state.error || 'Unable to load deposit address.',
          }),
          Button({
            label: 'Retry',
            variant: 'secondary',
            size: 'sm',
            onClick: loadDeposit,
          }),
        ],
      }),
    );
  }

  function renderAddressCard() {
    const ctx = getCoinNetwork(getCoinId());

    if (!ctx || !state.deposit?.address) {
      return;
    }

    const address = state.deposit.address;

    addressMount.replaceChildren(
      Card({
        variant: 'default',
        className: 'wallet-view__address-card',
        children: [
          createElement('p', {
            className: 'wallet-view__address-label',
            text: ctx.network.addressLabel,
          }),
          createElement('p', {
            className: 'wallet-view__address-value',
            text: address,
          }),
          createElement('div', {
            className: 'wallet-view__address-actions',
            children: [
              Button({
                label: 'скопировать',
                variant: 'primary',
                size: 'sm',
                className: 'wallet-view__action-btn',
                icon: ICON_COPY,
                onClick: () => copyAddress(address),
              }),
              Button({
                label: 'QR',
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
  }

  function updateInfo() {
    const ctx = getCoinNetwork(getCoinId());
    const minimum = state.deposit?.minimum;
    const coinLabel = ctx?.coin.label?.toLowerCase() || 'usdt';

    infoMount.replaceChildren(
      createElement('p', {
        className: 'wallet-view__min-sum',
        html: minimum
          ? `min sum: <strong>${minimum} ${coinLabel}</strong>`
          : 'min sum: <span class="wallet-view__min-sum-pending">—</span>',
      }),
      createElement('p', {
        className: 'wallet-view__disclaimer',
        text: DEPOSIT_DISCLAIMER,
      }),
    );
  }

  function updateStatus() {
    const label = DEPOSIT_STATUS_LABELS[state.status] || DEPOSIT_STATUS_LABELS.pending;

    statusMount.replaceChildren(
      createElement('p', {
        className: 'wallet-view__status',
        html: `Status: <span class="wallet-view__status-value">${label}</span>`,
      }),
    );
  }

  async function loadDeposit() {
    const ctx = getCoinNetwork(getCoinId());

    if (!ctx) {
      state.loading = false;
      state.error = 'Unsupported currency.';
      renderAddressError();
      return;
    }

    state.loading = true;
    state.error = null;
    state.deposit = null;
    renderAddressLoading();
    updateInfo();

    try {
      const data = await walletService.createDeposit(ctx.network.ticker);
      state.deposit = data;
      state.status = 'pending';
      renderAddressCard();
    } catch (error) {
      state.error = error?.status === 404 || error?.status === 501
        ? 'Deposit service is not available yet.'
        : 'Unable to load deposit address. Please try again.';
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
        Toast({ message: 'Address copied', type: 'success', duration: 2000 });
      })
      .catch(() => {
        Toast({ message: 'Failed to copy address', type: 'error', duration: 2500 });
      });
  }

  function showQrCode() {
    const qr = state.deposit?.qr_code;

    if (!qr) {
      // TODO: render QR from backend qr_code when endpoint returns it
      Toast({ message: 'QR code not available yet', type: 'info', duration: 2500 });
      return;
    }

    // TODO: open QR modal when qr_code is provided by backend
    Toast({ message: 'QR code not available yet', type: 'info', duration: 2500 });
  }

  function setCoinId(coinId) {
    void coinId;
    updateCoinGrid();
    updateNetwork();
    loadDeposit();
  }

  updateCoinGrid();
  updateNetwork();
  renderAddressLoading();
  updateInfo();
  updateStatus();
  loadDeposit();

  const element = createElement('div', {
    className: 'wallet-view wallet-view--deposit',
    attrs: { 'data-view': 'deposit' },
    children: [
      coinGridMount,
      networkMount,
      addressMount,
      infoMount,
      statusMount,
      createElement('button', {
        className: 'wallet-view__bonus',
        attrs: {
          type: 'button',
          'aria-label': 'Select bonus',
          // TODO: wire bonus selection when backend API is available
        },
        children: [
          createElement('span', {
            className: 'wallet-view__bonus-label',
            text: 'Bonuses selects',
          }),
          createElement('span', {
            className: 'wallet-view__bonus-chevron',
            html: ICON_CHEVRON,
          }),
        ],
      }),
    ],
  });

  return { element, setCoinId };
}
