/**
 * Balance modal — USD account overview inside bottom sheet.
 */

import { createElement } from '../../utils/dom.js';
import { ASSETS } from '../../utils/assets.js';
import { formatUsd } from '../../utils/format.js';
import { balanceService } from '../../services/balance.service.js';
import { t } from '../../i18n/index.js';
import { Button } from '../../components/base/Button.js';
import { Skeleton } from '../../components/base/Skeleton.js';
import { hydrateFadeIn } from '../../utils/hydrate.js';

/**
 * @param {object} options
 * @param {string} options.title
 * @param {HTMLElement} options.valueEl
 * @returns {HTMLElement}
 */
function createBalanceCard({ title, valueEl }) {
  return createElement('div', {
    className: 'balance-modal__card',
    children: [
      createElement('span', {
        className: 'balance-modal__asset-icon balance-modal__asset-icon--usd',
        attrs: { 'aria-hidden': 'true' },
        text: '$',
      }),
      createElement('div', {
        className: 'balance-modal__card-meta',
        children: [
          createElement('span', {
            className: 'balance-modal__card-title',
            text: title,
          }),
          valueEl,
        ],
      }),
    ],
  });
}

/**
 * @param {boolean} loading
 * @returns {HTMLElement}
 */
function createValueMount(loading) {
  if (loading) {
    return createElement('div', {
      className: 'balance-modal__card-value balance-modal__card-value--loading',
      attrs: { 'aria-live': 'polite', 'aria-busy': 'true' },
      children: [
        Skeleton({
          className: 'balance-modal__card-value-skeleton',
          variant: 'text',
        }),
      ],
    });
  }

  return createElement('span', {
    className: 'balance-modal__card-value',
    attrs: { 'aria-live': 'polite' },
    text: t('common.emDash'),
  });
}

/**
 * @param {HTMLElement} mount
 * @param {string} formatted
 */
function hydrateValueMount(mount, formatted) {
  if (mount.classList.contains('balance-modal__card-value--loading')) {
    mount.replaceChildren(
      createElement('span', {
        className: 'balance-modal__card-value-text',
        text: formatted,
      }),
    );
    mount.classList.remove('balance-modal__card-value--loading');
    mount.removeAttribute('aria-busy');
    hydrateFadeIn(mount, 150);
    return;
  }

  mount.textContent = formatted;
  hydrateFadeIn(mount, 150);
}

/**
 * @param {object} [options]
 * @param {string} [options.amount]
 * @param {number} [options.cashback]
 * @param {function} [options.onDeposit]
 * @param {function} [options.onWithdraw]
 * @returns {{ element: HTMLElement, destroy: () => void }}
 */
export function createBalanceModal(options = {}) {
  const {
    onDeposit,
    onWithdraw,
  } = options;

  const cached = balanceService.getBalances();
  const hasBalance = Boolean(cached);

  const amountValue = createValueMount(!hasBalance);
  const bonusValue = createValueMount(!hasBalance);
  const withdrawableValue = createValueMount(!hasBalance);
  const wagerValue = createValueMount(!hasBalance);
  const welcomeMount = createElement('p', {
    className: 'balance-modal__welcome',
    text: hasBalance
      ? (cached?.hasActiveWelcome
        ? t('balance.welcome.active')
        : t('balance.welcome.none'))
      : t('common.emDash'),
  });

  function formatWelcome(activeWelcome) {
    if (!activeWelcome) {
      welcomeMount.textContent = t('balance.welcome.none');
      return;
    }
    const parts = [t('balance.welcome.active')];
    if (activeWelcome.progress_percent != null) {
      parts.push(t('balance.welcome.progress', {
        percent: activeWelcome.progress_percent,
      }));
    }
    if (activeWelcome.expires_at) {
      const date = String(activeWelcome.expires_at).slice(0, 10);
      parts.push(t('balance.welcome.expires', { date }));
    }
    welcomeMount.textContent = parts.join(' · ');
  }

  function formatWager(activeWelcome) {
    if (!activeWelcome) {
      hydrateValueMount(wagerValue, formatUsd(0));
      return;
    }
    hydrateValueMount(
      wagerValue,
      formatUsd(Number(activeWelcome.wager_remaining ?? 0)),
    );
  }

  if (hasBalance) {
    hydrateValueMount(amountValue, formatUsd(cached.real));
    hydrateValueMount(bonusValue, formatUsd(cached.bonus));
    hydrateValueMount(
      withdrawableValue,
      formatUsd(cached.withdrawable ?? cached.real),
    );
    formatWager(cached.activeWelcome);
    formatWelcome(cached.activeWelcome);
  }

  const unsubscribe = balanceService.subscribe(({
    formattedReal,
    formattedBonus,
    formattedWithdrawable,
    activeWelcome,
  }) => {
    hydrateValueMount(amountValue, formattedReal);
    hydrateValueMount(bonusValue, formattedBonus);
    hydrateValueMount(withdrawableValue, formattedWithdrawable);
    formatWager(activeWelcome);
    formatWelcome(activeWelcome);
  });

  const element = createElement('div', {
    className: 'balance-modal',
    attrs: { 'data-modal': 'balance' },
    children: [
      createElement('div', {
        className: 'balance-modal__cards',
        children: [
          createBalanceCard({
            title: t('balance.real.title'),
            valueEl: amountValue,
          }),
          createBalanceCard({
            title: t('balance.bonus.title'),
            valueEl: bonusValue,
          }),
          createBalanceCard({
            title: t('balance.withdrawable.title'),
            valueEl: withdrawableValue,
          }),
          createBalanceCard({
            title: t('balance.wagerRemaining.title'),
            valueEl: wagerValue,
          }),
        ],
      }),
      welcomeMount,
      createElement('div', {
        className: 'balance-modal__actions',
        children: [
          Button({
            label: t('balance.actions.deposit'),
            variant: 'primary',
            block: true,
            className: 'balance-modal__action',
            onClick: onDeposit,
          }),
          Button({
            label: t('balance.actions.withdraw'),
            variant: 'secondary',
            block: true,
            className: 'balance-modal__action',
            onClick: onWithdraw,
          }),
        ],
      }),
      createElement('div', {
        className: 'balance-modal__brand',
        children: [
          createElement('img', {
            className: 'balance-modal__brand-logo',
            attrs: {
              src: ASSETS.logo,
              alt: t('brand.name'),
              draggable: false,
            },
          }),
        ],
      }),
    ],
  });

  return {
    element,
    destroy() {
      unsubscribe();
    },
  };
}
