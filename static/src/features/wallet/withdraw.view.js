/**
 * Withdraw view — crypto withdraw + bank coming-soon.
 * Matches Deposit layout language: method split, currency/network pair, premium fields.
 */

import { createElement } from '../../utils/dom.js';
import { WITHDRAW_ADDRESS_PLACEHOLDER } from '../../utils/wallet.constants.js';
import { formatUsd } from '../../utils/format.js';
import { walletService } from '../../services/wallet.service.js';
import { balanceService } from '../../services/balance.service.js';
import { isAuthenticated } from '../../services/auth-state.js';
import { t } from '../../i18n/index.js';
import { getCoinNetwork, getDefaultNetworkId } from './wallet.utils.js';
import { Button } from '../../components/base/Button.js';
import { Input } from '../../components/base/Input.js';
import { Toast } from '../../components/base/Toast.js';
import { AmountInput, updateAmountInputCurrency } from '../../components/shared/AmountInput.js';
import { MethodSelector } from '../../components/shared/MethodSelector.js';
import { createCoinNetworkPair } from '../../components/shared/CoinNetworkPair.js';
import { createGuestNotice } from '../../components/shared/GuestLock.js';
import { requireAuth } from '../../components/shared/GuestLoginModal.js';

const ICON_INFO = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.15"/><path d="M12 8v5M12 16h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

const PERCENT_SHORTCUTS = [25, 50, 75, 100];

/**
 * @param {object} [options]
 * @returns {{ element: HTMLElement, setCoinId: Function, setNetworkId: Function, destroy: Function }}
 */
export function createWithdrawView(options = {}) {
  const {
    getCoinId = () => 'usdt',
    getNetworkId = () => getDefaultNetworkId(getCoinId()),
    onCoinSelect,
    onNetworkSelect,
  } = options;

  const state = {
    method: 'crypto',
    amount: '',
    address: '',
    amountError: '',
    minimumUsd: null,
    submitting: false,
    activePercent: null,
  };

  /** @type {{ element: HTMLElement, setCoinId: Function, setNetworkId: Function, destroy: Function }|null} */
  let coinNetworkPair = null;

  const methodMount = createElement('div', { className: 'wallet-view__method-slot' });
  const mainMount = createElement('div', { className: 'wallet-view__main' });
  const pairMount = createElement('div', { className: 'wallet-view__pair-slot' });
  const amountMount = createElement('div');
  const percentMount = createElement('div', { className: 'wallet-view__percent-row' });
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

  function updateMethodSelector() {
    methodMount.replaceChildren(
      MethodSelector({
        activeId: state.method,
        onSelect: (methodId) => {
          if (state.method === methodId) return;
          state.method = methodId;
          updateMethodSelector();
          renderMain();
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

  async function getWithdrawableBalance() {
    const balances = await balanceService.fetchBalances();
    return Number(balances.withdrawable ?? balances.real ?? 0);
  }

  function formatAmountValue(value) {
    if (!Number.isFinite(value) || value <= 0) return '0';
    const rounded = Math.round(value * 100) / 100;
    return String(rounded);
  }

  async function applyPercent(percent) {
    try {
      const available = await getWithdrawableBalance();
      const next = formatAmountValue((available * percent) / 100);
      state.amount = next;
      state.activePercent = percent;
      state.amountError = '';
      renderAmountField();
      renderPercentShortcuts();
      updateSubmitButton();
    } catch {
      Toast({
        message: t('wallet.withdraw.error.generic'),
        type: 'error',
        duration: 2500,
      });
    }
  }

  function renderPercentShortcuts() {
    percentMount.replaceChildren(
      ...PERCENT_SHORTCUTS.map((percent) =>
        createElement('button', {
          className: [
            'wallet-view__percent-btn',
            state.activePercent === percent ? 'wallet-view__percent-btn--active' : '',
          ].filter(Boolean).join(' '),
          attrs: {
            type: 'button',
            onClick: () => void applyPercent(percent),
          },
          text: `${percent}%`,
        }),
      ),
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
        state.activePercent = null;
        amountFieldRoot?.classList.toggle('amount-input--has-value', Boolean(state.amount));
        renderPercentShortcuts();
        if (state.amountError) {
          state.amountError = '';
          renderAmountField();
        }
        updateSubmitButton();
      },
      onMaxClick: async () => {
        try {
          const available = await getWithdrawableBalance();
          state.amount = formatAmountValue(available);
          state.activePercent = 100;
          state.amountError = '';
          renderAmountField();
          renderPercentShortcuts();
          updateSubmitButton();
        } catch {
          Toast({
            message: t('wallet.withdraw.error.generic'),
            type: 'error',
            duration: 2500,
          });
        }
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
      rows: 3,
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

    addressMount.replaceChildren(
      createElement('div', {
        className: 'wallet-view__field-block',
        children: [
          createElement('label', {
            className: 'wallet-view__field-label',
            text: t('wallet.withdraw.addressLabel'),
          }),
          field,
        ],
      }),
    );
    updateSubmitButton();
  }

  function updateMinAmount() {
    const formattedMin = state.minimumUsd != null
      ? formatUsd(state.minimumUsd)
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
    if (!isAuthenticated()) {
      actionMount.replaceChildren(
        createGuestNotice({
          message: t('guest.withdraw.message'),
          className: 'wallet-view__guest-notice',
        }),
      );
      return;
    }

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
    state.minimumUsd = null;
    updateMinAmount();
    if (!isAuthenticated()) {
      updateMinAmount();
      return;
    }
    try {
      const data = await walletService.getWithdrawMinimum();
      const minUsd = Number(data?.minimum_usd);
      state.minimumUsd = Number.isFinite(minUsd) ? minUsd : null;
    } catch (error) {
      if (error?.status === 401) {
        state.minimumUsd = null;
      } else {
        state.minimumUsd = null;
      }
    }
    updateMinAmount();
  }

  async function submitWithdraw() {
    if (!requireAuth()) return;

    const ctx = currentContext();
    const address = state.address.trim();
    const amount = Number(state.amount);

    if (!ctx || !address || state.submitting) return;

    if (!Number.isFinite(amount) || amount <= 0) {
      state.amountError = t('wallet.withdraw.validation.amount');
      renderAmountField();
      return;
    }

    if (
      state.minimumUsd != null
      && amount + 1e-9 < Number(state.minimumUsd)
    ) {
      state.amountError = t('wallet.withdraw.validation.belowMinimum', {
        amount: formatUsd(state.minimumUsd),
      });
      renderAmountField();
      return;
    }

    state.amountError = '';
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
      state.activePercent = null;
      if (addressInput) addressInput.value = '';
      if (amountInput) amountInput.value = '';
      renderAmountField();
      renderPercentShortcuts();
      renderAddressField();
      await balanceService.fetchBalances();
    } catch (error) {
      if (error?.status === 401 || !isAuthenticated()) {
        requireAuth();
        return;
      }

      const detail = error?.data?.detail;
      let message = t('wallet.withdraw.error.generic');

      if (detail && typeof detail === 'object' && detail.code === 'below_minimum') {
        const minUsd = Number(detail.minimum_usd);
        message = Number.isFinite(minUsd)
          ? t('wallet.withdraw.validation.belowMinimum', { amount: formatUsd(minUsd) })
          : (detail.message || message);
        state.amountError = message;
        renderAmountField();
      } else if (typeof detail === 'string') {
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
      amountMount,
      percentMount,
      addressMount,
      infoMount,
      actionMount,
    );
  }

  function renderMain() {
    if (state.method === 'bank') {
      renderBankComingSoon();
      return;
    }
    renderCryptoMain();
  }

  function setCoinId(coinId) {
    coinNetworkPair?.setCoinId(coinId);
    coinNetworkPair?.setNetworkId(getNetworkId());
    loadWithdrawInfo();
    updateAmountCurrency();
  }

  function setNetworkId(networkId) {
    coinNetworkPair?.setNetworkId(networkId);
    loadWithdrawInfo();
  }

  updateMethodSelector();
  mountCoinNetworkPair();
  renderAmountField();
  renderPercentShortcuts();
  renderAddressField();
  loadWithdrawInfo();
  updateMinAmount();
  renderMain();

  const element = createElement('div', {
    className: [
      'wallet-view',
      'wallet-view--withdraw',
      isAuthenticated() ? '' : 'wallet-view--guest-disabled',
    ].filter(Boolean).join(' '),
    attrs: { 'data-view': 'withdraw' },
    children: [methodMount, mainMount],
  });

  updateSubmitButton();

  return {
    element,
    setCoinId,
    setNetworkId,
    destroy() {
      coinNetworkPair?.destroy?.();
    },
  };
}
