/**
 * Withdraw view — withdraw panel content for the wallet modal.
 */

import { createElement } from '../../utils/dom.js';
import { WITHDRAW_ADDRESS_PLACEHOLDER } from '../../utils/wallet.constants.js';
import { formatCryptoAmount } from '../../utils/format.js';
import { walletService } from '../../services/wallet.service.js';
import { balanceService } from '../../services/balance.service.js';
import { t } from '../../i18n/index.js';
import { getCoinNetwork, getCoinSymbol, getDefaultNetworkId } from './wallet.utils.js';
import { Button } from '../../components/base/Button.js';
import { Input } from '../../components/base/Input.js';
import { Toast } from '../../components/base/Toast.js';
import { CoinSelector } from '../../components/shared/CoinSelector.js';
import { NetworkSelector } from '../../components/shared/NetworkSelector.js';
import { AmountInput, updateAmountInputCurrency } from '../../components/shared/AmountInput.js';

const ICON_INFO = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.15"/><path d="M12 8v5M12 16h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

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
export function createWithdrawView(options = {}) {
  const {
    getCoinId = () => 'usdt',
    getNetworkId = () => getDefaultNetworkId(getCoinId()),
    onCoinSelect,
    onNetworkSelect,
  } = options;

  const state = {
    amount: '',
    address: '',
    amountError: '',
    minimum: null,
    submitting: false,
  };

  const coinGridMount = createElement('div');
  const networkMount = createElement('div');
  const amountMount = createElement('div');
  const addressMount = createElement('div');
  const infoMount = createElement('div');
  const actionMount = createElement('div');

  let addressInput = null;
  let amountInput = null;
  let amountFieldRoot = null;

  function updateAmountCurrency() {
    if (!amountFieldRoot) return;
    updateAmountInputCurrency(
      amountFieldRoot,
      t('common.usd'),
      Boolean(state.amount),
    );
  }

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

  function renderAmountField() {
    const field = AmountInput({
      name: 'withdraw-amount',
      value: state.amount,
      currency: t('common.usd'),
      error: state.amountError,
      placeholder: t('wallet.amount.placeholder'),
      className: 'wallet-view__amount',
      onInput: (event) => {
        state.amount = event.target.value;
        amountFieldRoot?.classList.toggle('amount-input--has-value', Boolean(state.amount));
        if (state.amountError) {
          state.amountError = '';
          renderAmountField();
        }
      },
      onMaxClick: async () => {
        const balances = await balanceService.fetchBalances();
        state.amount = String(balances.real);
        state.amountError = '';
        renderAmountField();
      },
    });

    amountFieldRoot = field;
    amountInput = field.querySelector('.amount-input__control');
    amountMount.replaceChildren(field);
  }

  function renderAddressField() {
    const field = Input({
      name: 'withdraw-address',
      multiline: true,
      rows: 4,
      mono: true,
      placeholder: WITHDRAW_ADDRESS_PLACEHOLDER(),
      value: state.address,
      className: 'wallet-view__address-field',
      inputClassName: 'wallet-view__address-input',
      onInput: (event) => {
        state.address = event.target.value;
        updateSubmitButton();
      },
    });

    addressInput = field.querySelector('.wallet-view__address-input')
      || field.querySelector('.input');

    addressMount.replaceChildren(field);
    updateSubmitButton();
  }

  function updateMinAmount() {
    const ctx = currentContext();
    const coinLabel = ctx?.coin.symbol || getCoinSymbol(getCoinId()) || 'USDT';
    const formattedMin = state.minimum != null
      ? formatCryptoAmount(state.minimum, { symbol: coinLabel })
      : null;

    infoMount.replaceChildren(
      createElement('div', {
        className: 'wallet-view__withdraw-info',
        children: [
          createElement('p', {
            className: 'wallet-view__min-amount',
            html: formattedMin
              ? t('wallet.withdraw.minAmount', { amount: `<strong>${formattedMin}</strong>` })
              : t('wallet.withdraw.minAmount', {
                amount: `<span class="wallet-view__min-sum-pending">${t('common.emDash')}</span>`,
              }),
          }),
          createElement('span', {
            className: 'wallet-view__info-icon',
            html: ICON_INFO,
            attrs: { 'aria-hidden': 'true' },
          }),
        ],
      }),
    );
  }

  function updateSubmitButton() {
    actionMount.replaceChildren(
      Button({
        label: t('wallet.withdraw.submit'),
        variant: 'primary',
        pill: true,
        block: true,
        loading: state.submitting,
        disabled: state.submitting || !state.address.trim() || !state.amount.trim(),
        className: 'wallet-view__withdraw-btn',
        onClick: submitWithdraw,
      }),
    );
  }

  async function loadWithdrawInfo() {
    const ctx = currentContext();
    if (!ctx) return;

    // TODO: fetch minimum withdraw amount from backend when endpoint is documented
    state.minimum = null;
    updateMinAmount();
  }

  async function submitWithdraw() {
    const ctx = currentContext();
    const address = state.address.trim();
    const amount = Number(state.amount);

    if (!ctx || !address || state.submitting) return;

    if (!Number.isFinite(amount) || amount <= 0) {
      state.amountError = t('wallet.withdraw.validation.amount');
      renderAmountField();
      return;
    }

    state.submitting = true;
    updateSubmitButton();

    try {
      await walletService.submitWithdraw({
        ticker: ctx.network.ticker,
        address,
        amount,
      });

      Toast({ message: t('wallet.withdraw.toast.success'), type: 'success', duration: 2500 });
      state.address = '';
      state.amount = '';
      if (addressInput) addressInput.value = '';
      if (amountInput) amountInput.value = '';
      renderAmountField();
      await balanceService.fetchBalances();
    } catch (error) {
      const detail = error?.data?.detail;
      let message = t('wallet.withdraw.error.generic');

      if (typeof detail === 'string') {
        message = detail;
      } else if (error?.status === 404 || error?.status === 501) {
        message = t('wallet.withdraw.error.unavailable');
      } else if (error?.status === 409) {
        message = t('wallet.withdraw.error.insufficient');
      }

      Toast({ message, type: 'error', duration: 3000 });
    } finally {
      state.submitting = false;
      updateSubmitButton();
    }
  }

  function setCoinId(coinId) {
    void coinId;
    updateCoinGrid();
    updateNetwork();
    loadWithdrawInfo();
    updateAmountCurrency();
  }

  function setNetworkId(networkId) {
    void networkId;
    updateNetwork();
    loadWithdrawInfo();
  }

  updateCoinGrid();
  updateNetwork();
  renderAmountField();
  renderAddressField();
  loadWithdrawInfo();
  updateMinAmount();

  const element = createElement('div', {
    className: 'wallet-view wallet-view--withdraw',
    attrs: { 'data-view': 'withdraw' },
    children: [
      coinGridMount,
      networkMount,
      amountMount,
      addressMount,
      infoMount,
      actionMount,
    ],
  });

  return { element, setCoinId, setNetworkId };
}
