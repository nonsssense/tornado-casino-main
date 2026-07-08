/**
 * Withdraw view — withdraw panel content for the wallet modal.
 */

import { createElement } from '../../utils/dom.js';
import { WITHDRAW_ADDRESS_PLACEHOLDER } from '../../utils/wallet.constants.js';
import { formatCryptoAmount } from '../../utils/format.js';
import { walletService } from '../../services/wallet.service.js';
import { getCoinNetwork, getCoinSymbol, getDefaultNetworkId } from './wallet.utils.js';
import { Button } from '../../components/base/Button.js';
import { Input } from '../../components/base/Input.js';
import { Toast } from '../../components/base/Toast.js';
import { CoinSelector } from '../../components/shared/CoinSelector.js';
import { NetworkSelector } from '../../components/shared/NetworkSelector.js';
import { AmountInput, updateAmountInputCurrency } from '../../components/shared/AmountInput.js';

const ICON_INFO = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.15"/><path d="M12 8v5M12 16h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

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
      getCoinSymbol(getCoinId()),
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
        networkLabel: ctx.network.networkLabel,
        label: ctx.network.label,
        iconSrc: ctx.network.icon,
        className: 'wallet-view__network',
        options: ctx.networks,
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
      currency: getCoinSymbol(getCoinId()),
      error: state.amountError,
      placeholder: 'Enter amount',
      className: 'wallet-view__amount',
      onInput: (event) => {
        state.amount = event.target.value;
        amountFieldRoot?.classList.toggle('amount-input--has-value', Boolean(state.amount));
        // TODO: clear validation error when user edits amount
        if (state.amountError) {
          state.amountError = '';
          renderAmountField();
        }
      },
      // TODO: set amount to wallet balance when MAX is wired to backend
      onMaxClick: undefined,
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
      placeholder: WITHDRAW_ADDRESS_PLACEHOLDER,
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
              ? `min amount: <strong>${formattedMin}</strong>`
              : 'min amount: <span class="wallet-view__min-sum-pending">—</span>',
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
        label: 'Вывод',
        variant: 'primary',
        pill: true,
        block: true,
        loading: state.submitting,
        disabled: state.submitting || !state.address.trim(),
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

    if (!ctx || !address || state.submitting) return;

    state.submitting = true;
    updateSubmitButton();

    try {
      await walletService.submitWithdraw({
        ticker: ctx.network.ticker,
        address,
        // TODO: pass amount: state.amount when backend validation is implemented
      });

      Toast({ message: 'Withdrawal submitted', type: 'success', duration: 2500 });
      state.address = '';
      state.amount = '';
      if (addressInput) addressInput.value = '';
      if (amountInput) amountInput.value = '';
      renderAmountField();
    } catch (error) {
      const message = error?.status === 404 || error?.status === 501
        ? 'Withdrawal service is not available yet.'
        : 'Unable to submit withdrawal. Please try again.';
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
