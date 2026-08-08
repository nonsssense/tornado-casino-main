/**
 * Fiat (KZT) deposit flow — bank select → amount → payment.
 *
 * Mounted by deposit.view.js when the Bank method is active. The frontend is a
 * thin UI layer: it sends { amount, token } and renders the provider requisites
 * returned by POST /api/wallet/fiatdeposit. It never computes amounts, rates,
 * fees, limits, or bonuses — the backend stays authoritative.
 */

import '../../../../styles/pages/fiat.css';

import { createElement } from '../../../utils/dom.js';
import { t } from '../../../i18n/index.js';
import { isAuthenticated } from '../../../services/auth-state.js';
import { fiatService } from '../../../services/fiat.service.js';
import { Button } from '../../../components/base/Button.js';
import { Toast } from '../../../components/base/Toast.js';
import { requireAuth } from '../../../components/shared/GuestLoginModal.js';
import { createGuestNotice } from '../../../components/shared/GuestLock.js';
import { createFiatBonusBanner } from './fiat.bonus-banner.js';
import {
  FIAT_BANKS,
  FIAT_CURRENCY,
  FIAT_MIN_KZT,
  FIAT_QUICK_AMOUNTS,
  clampFiatAmount,
  formatKzt,
  getFiatBank,
} from './fiat.constants.js';

const ICON_BACK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>';

const ICON_COPY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';

/**
 * @param {object} [options]
 * @param {(isSubpage: boolean) => void} [options.onSubpageChange] - hide the
 *   method selector while inside a deeper step (amount / payment).
 * @returns {{ element: HTMLElement, destroy: () => void }}
 */
export function createFiatDepositView(options = {}) {
  const { onSubpageChange } = options;

  const state = {
    step: 'bank', // 'bank' | 'amount' | 'payment'
    bank: null,
    amount: '',
    amountError: '',
    submitting: false,
    order: null,
  };

  /** @type {{ element: HTMLElement, destroy: () => void }|null} */
  let bonusBanner = null;

  const root = createElement('div', {
    className: 'fiat-view',
    attrs: { 'data-view': 'fiat' },
  });

  function destroyBonusBanner() {
    bonusBanner?.destroy?.();
    bonusBanner = null;
  }

  function goStep(step) {
    state.step = step;
    onSubpageChange?.(step !== 'bank');
    render();
  }

  // ------------------------------------------------------------- step: bank ---

  function renderBankStep() {
    const list = createElement('div', {
      className: 'fiat-bank-list',
      children: FIAT_BANKS.map((bank) => createElement('button', {
        className: 'fiat-bank',
        attrs: {
          type: 'button',
          onClick: () => {
            state.bank = bank;
            state.amount = '';
            state.amountError = '';
            state.order = null;
            goStep('amount');
          },
        },
        children: [
          createElement('img', {
            className: 'fiat-bank__logo',
            attrs: {
              src: bank.logo,
              alt: '',
              loading: 'lazy',
              decoding: 'async',
              draggable: false,
            },
          }),
          createElement('span', {
            className: 'fiat-bank__name',
            text: t(bank.nameKey),
          }),
          createElement('span', {
            className: 'fiat-bank__min',
            text: t('wallet.fiat.minFrom', {
              amount: `${formatKzt(FIAT_MIN_KZT)} ${FIAT_CURRENCY}`,
            }),
          }),
        ],
      })),
    });

    root.replaceChildren(
      createElement('div', {
        className: 'fiat-view__label',
        text: t('wallet.fiat.chooseBank'),
      }),
      list,
    );
  }

  // ------------------------------------------------------ shared: subheader ---

  function bankHeader(onBack) {
    const bank = state.bank || getFiatBank(state.order?.token);
    return createElement('div', {
      className: 'fiat-subhead',
      children: [
        createElement('button', {
          className: 'fiat-subhead__back',
          attrs: {
            type: 'button',
            'aria-label': t('common.back'),
            onClick: onBack,
          },
          html: ICON_BACK,
        }),
        createElement('div', {
          className: 'fiat-identity',
          children: [
            bank?.logo
              ? createElement('img', {
                className: 'fiat-identity__logo',
                attrs: { src: bank.logo, alt: '', decoding: 'async', draggable: false },
              })
              : null,
            createElement('span', {
              className: 'fiat-identity__name',
              text: bank ? t(bank.nameKey) : (state.order?.bank_name || ''),
            }),
          ],
        }),
      ],
    });
  }

  // ----------------------------------------------------------- step: amount ---

  function renderAmountStep() {
    const input = createElement('input', {
      className: 'fiat-amount__input',
      attrs: {
        type: 'text',
        inputmode: 'numeric',
        autocomplete: 'off',
        value: state.amount,
        placeholder: t('wallet.fiat.enterAmount'),
        'aria-label': t('wallet.fiat.enterAmount'),
        onInput: (event) => {
          // Keep digits only while typing; clamp happens on blur / submit so the
          // user can freely type multi-digit amounts.
          const digits = event.target.value.replace(/\D+/g, '');
          state.amount = digits;
          event.target.value = digits;
          if (state.amountError) {
            state.amountError = '';
            errorMount.replaceChildren();
          }
          syncSubmit();
        },
        onChange: () => {
          const clamped = clampFiatAmount(state.amount);
          if (clamped != null) {
            state.amount = String(clamped);
            input.value = state.amount;
          }
          syncSubmit();
        },
      },
    });

    const quick = createElement('div', {
      className: 'fiat-quick',
      children: FIAT_QUICK_AMOUNTS.map((value) => createElement('button', {
        className: 'fiat-quick__btn',
        attrs: {
          type: 'button',
          onClick: () => {
            state.amount = String(value);
            state.amountError = '';
            input.value = state.amount;
            errorMount.replaceChildren();
            syncSubmit();
          },
        },
        text: formatKzt(value),
      })),
    });

    const errorMount = createElement('div', { className: 'fiat-amount__error-slot' });
    if (state.amountError) {
      errorMount.replaceChildren(createElement('p', {
        className: 'fiat-amount__error',
        text: state.amountError,
        attrs: { role: 'alert' },
      }));
    }

    const submitMount = createElement('div', { className: 'fiat-amount__submit-slot' });

    function syncSubmit() {
      if (!isAuthenticated()) {
        submitMount.replaceChildren(
          createGuestNotice({
            message: t('guest.deposit.message'),
            className: 'fiat-view__guest-notice',
          }),
        );
        return;
      }
      submitMount.replaceChildren(
        Button({
          label: t('wallet.fiat.topUp'),
          variant: 'primary',
          pill: true,
          block: true,
          loading: state.submitting,
          disabled: state.submitting || !state.amount,
          className: 'fiat-amount__submit',
          onClick: submitOrder,
        }),
      );
    }

    const bonusMount = createElement('div', { className: 'fiat-view__bonus-slot' });
    destroyBonusBanner();
    bonusBanner = createFiatBonusBanner();
    bonusMount.replaceChildren(bonusBanner.element);

    root.replaceChildren(
      bankHeader(() => goStep('bank')),
      createElement('div', {
        className: 'fiat-amount',
        children: [
          input,
          createElement('span', {
            className: 'fiat-amount__currency',
            text: FIAT_CURRENCY,
          }),
        ],
      }),
      quick,
      errorMount,
      submitMount,
      bonusMount,
    );

    syncSubmit();
  }

  async function submitOrder() {
    if (!requireAuth()) return;
    if (state.submitting || !state.bank) return;

    const amount = clampFiatAmount(state.amount);
    if (amount == null) {
      state.amountError = t('wallet.fiat.validation.amount');
      renderAmountStep();
      return;
    }
    state.amount = String(amount);
    state.amountError = '';

    state.submitting = true;
    renderAmountStep();

    try {
      const order = await fiatService.createDeposit({
        amount,
        token: state.bank.token,
      });
      state.order = order;
      state.submitting = false;
      destroyBonusBanner();
      goStep('payment');
    } catch (error) {
      state.submitting = false;

      if (error?.status === 401 || !isAuthenticated()) {
        renderAmountStep();
        requireAuth();
        return;
      }

      const detail = error?.data?.detail;
      let message;
      if (typeof detail === 'string' && detail) {
        message = detail;
      } else if (error?.status === 502) {
        message = t('wallet.fiat.error.provider');
      } else {
        message = t('wallet.fiat.error.generic');
      }
      state.amountError = message;
      renderAmountStep();
      Toast({ message, type: 'error', duration: 3200 });
    }
  }

  // ---------------------------------------------------------- step: payment ---

  function credentialRow(labelKey, value, { copy = false } = {}) {
    if (value == null || value === '') return null;
    const children = [
      createElement('span', { className: 'fiat-cred__label', text: t(labelKey) }),
      createElement('span', { className: 'fiat-cred__value', text: String(value) }),
    ];
    if (copy) {
      children.push(createElement('button', {
        className: 'fiat-cred__copy',
        attrs: {
          type: 'button',
          'aria-label': t('wallet.fiat.copy'),
          onClick: () => copyText(String(value)),
        },
        html: ICON_COPY,
      }));
    }
    return createElement('div', {
      className: 'fiat-cred__row',
      children,
    });
  }

  function renderPaymentStep() {
    const order = state.order || {};
    const rows = [
      credentialRow('wallet.fiat.recipient', order.recipient_name),
      credentialRow('wallet.fiat.account', order.receiver, { copy: true }),
    ].filter(Boolean);

    const credentials = rows.length
      ? createElement('div', { className: 'fiat-cred', children: rows })
      : createElement('p', {
        className: 'fiat-payment__pending',
        text: t('wallet.fiat.requisitesPending'),
      });

    root.replaceChildren(
      bankHeader(() => goStep('amount')),
      createElement('div', {
        className: 'fiat-payment',
        children: [
          createElement('span', {
            className: 'fiat-payment__label',
            text: t('wallet.fiat.amountToPay'),
          }),
          createElement('span', {
            className: 'fiat-payment__amount',
            text: `${formatKzt(order.amount_kzt)} ${order.currency || FIAT_CURRENCY}`,
          }),
        ],
      }),
      credentials,
      createElement('p', {
        className: 'fiat-payment__hint',
        text: t('wallet.fiat.paymentHint'),
      }),
    );
  }

  function copyText(value) {
    if (!value || !navigator.clipboard) return;
    navigator.clipboard.writeText(value)
      .then(() => Toast({ message: t('wallet.fiat.toast.copied'), type: 'success', duration: 2000 }))
      .catch(() => Toast({ message: t('wallet.fiat.toast.copyFailed'), type: 'error', duration: 2500 }));
  }

  // --------------------------------------------------------------- dispatch ---

  function render() {
    if (state.step !== 'amount') destroyBonusBanner();
    if (state.step === 'amount') renderAmountStep();
    else if (state.step === 'payment') renderPaymentStep();
    else renderBankStep();
  }

  render();

  return {
    element: root,
    destroy() {
      destroyBonusBanner();
      onSubpageChange?.(false);
    },
  };
}
