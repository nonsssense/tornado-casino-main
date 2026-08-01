/**
 * Balance service.
 *
 * Responsibility:
 * - Display backend-provided balance values (real + bonus).
 * - Refresh balance after games, deposits, and withdrawals.
 * - Present only server-authorized debits and credits during animations.
 */

import { fetchBalance } from '../api/wallet.js';
import { formatUsd } from '../utils/format.js';

/** @type {Set<function>} */
const listeners = new Set();

/** @type {{ real: number, bonus: number }|null} */
let cachedBalances = null;

/** @type {{ real: number, bonus: number }|null} */
let visibleBalances = null;

/** @type {{ real: number, bonus: number }|null} */
let stagedBalances = null;

/**
 * @param {{ real?: number, bonus?: number }} balances
 * @returns {{ real: number, bonus: number }}
 */
function normalizeBalances(balances) {
  return {
    real: Number(balances?.real ?? 0),
    bonus: Number(balances?.bonus ?? 0),
    pending: Number(balances?.pending ?? 0),
    withdrawable: Number(
      balances?.withdrawable ?? balances?.real ?? 0,
    ),
    available: Number(
      balances?.available
        ?? ((Number(balances?.real ?? 0) + Number(balances?.bonus ?? 0))),
    ),
    activeWelcome: balances?.activeWelcome ?? null,
    hasActiveWelcome: Boolean(balances?.hasActiveWelcome),
  };
}

/**
 * @param {{ real: number, bonus: number }} balances
 */
function notifyBalances(balances) {
  const formattedReal = formatUsd(balances.real);
  const formattedBonus = formatUsd(balances.bonus);
  const pending = Number(balances.pending ?? 0);
  const withdrawable = Number(balances.withdrawable ?? balances.real ?? 0);
  const available = Number(
    balances.available ?? (Number(balances.real ?? 0) + Number(balances.bonus ?? 0)),
  );
  const formattedPending = formatUsd(pending);
  const formattedWithdrawable = formatUsd(withdrawable);
  const formattedAvailable = formatUsd(available);

  listeners.forEach((listener) => {
    listener({
      real: balances.real,
      bonus: balances.bonus,
      pending,
      withdrawable,
      available,
      activeWelcome: balances.activeWelcome || null,
      hasActiveWelcome: Boolean(balances.hasActiveWelcome),
      formattedReal,
      formattedBonus,
      formattedPending,
      formattedWithdrawable,
      formattedAvailable,
    });
  });
}

export const balanceService = {
  /**
   * @param {{ notify?: boolean, stage?: boolean }} [options]
   * @returns {Promise<{ real: number, bonus: number }>}
   */
  async fetchBalances(options = {}) {
    const { notify = true, stage = false } = options;
    const data = await fetchBalance();
    const real = Number(data?.real_balance ?? 0);
    const bonus = Number(data?.bonus_balance ?? 0);
    const pending = Number(data?.pending_balance ?? 0);
    const withdrawable = Number(data?.withdrawable_balance ?? real);
    const available = Number(
      data?.available_balance ?? data?.balance ?? (real + bonus),
    );
    const nextBalances = {
      real,
      bonus,
      pending,
      withdrawable,
      available,
      activeWelcome: data?.active_welcome_bonus || null,
      hasActiveWelcome: Boolean(data?.has_active_welcome_bonus),
    };

    if (stage) {
      stagedBalances = nextBalances;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        this.publishStaged();
      }
      return nextBalances;
    }

    cachedBalances = nextBalances;
    visibleBalances = nextBalances;
    stagedBalances = null;
    if (notify) this.notify();
    return cachedBalances;
  },

  /**
   * @returns {Promise<number>}
   */
  async fetchBalance() {
    const balances = await this.fetchBalances();
    return balances.real;
  },

  /**
   * @returns {{ real: number, bonus: number }|null}
   */
  getBalances() {
    return visibleBalances ?? cachedBalances;
  },

  /**
   * Present a confirmed stake debit without changing staged server truth.
   * @param {number} amount
   * @param {string} balanceType
   * @returns {boolean}
   */
  presentConfirmedDebit(amount, balanceType) {
    const debit = Number(amount);
    if (!visibleBalances || !Number.isFinite(debit) || debit <= 0) return false;

    const type = String(balanceType || 'REAL').toUpperCase();
    const nextVisible = { ...visibleBalances };

    if (type === 'MIXED') {
      const fromReal = Math.min(nextVisible.real, debit);
      const fromBonus = debit - fromReal;
      nextVisible.real = Math.round((nextVisible.real - fromReal) * 100) / 100;
      nextVisible.bonus = Math.round((nextVisible.bonus - fromBonus) * 100) / 100;
      nextVisible.withdrawable = nextVisible.real;
    } else if (type === 'BONUS') {
      nextVisible.bonus = Math.round((nextVisible.bonus - debit) * 100) / 100;
    } else if (type === 'REAL') {
      nextVisible.real = Math.round((nextVisible.real - debit) * 100) / 100;
      nextVisible.withdrawable = nextVisible.real;
    } else {
      return false;
    }

    visibleBalances = nextVisible;
    notifyBalances(visibleBalances);
    return true;
  },

  /**
   * Begin a server-authoritative multi-result reveal sequence.
   * @param {{ real: number, bonus: number }} balanceAfterDebit
   * @param {{ real: number, bonus: number }} finalBalances
   * @returns {boolean}
   */
  beginSettlementSequence(balanceAfterDebit, finalBalances) {
    const visible = normalizeBalances(balanceAfterDebit);
    const final = normalizeBalances(finalBalances);
    if (
      !Number.isFinite(visible.real)
      || !Number.isFinite(visible.bonus)
      || !Number.isFinite(final.real)
      || !Number.isFinite(final.bonus)
    ) {
      return false;
    }

    visibleBalances = visible;
    cachedBalances = final;
    stagedBalances = final;
    notifyBalances(visibleBalances);

    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      this.publishStaged();
    }
    return true;
  },

  /**
   * Reveal one backend-authorized settlement credit while final truth stays staged.
   * @param {number} amount
   * @param {string} balanceType
   * @returns {boolean}
   */
  presentStagedCredit(amount, balanceType) {
    const credit = Number(amount);
    if (!stagedBalances || !visibleBalances || !Number.isFinite(credit) || credit < 0) {
      return false;
    }
    if (balanceType !== 'REAL' && balanceType !== 'BONUS') return false;

    if (credit > 0) {
      const key = balanceType === 'BONUS' ? 'bonus' : 'real';
      visibleBalances = {
        ...visibleBalances,
        [key]: Math.round((visibleBalances[key] + credit) * 100) / 100,
      };
      if (key === 'real') {
        visibleBalances.withdrawable = visibleBalances.real;
      }
      notifyBalances(visibleBalances);
    }
    return true;
  },

  /**
   * Publish the authoritative balance staged during a game animation.
   * @returns {boolean}
   */
  publishStaged() {
    if (!stagedBalances) return false;
    cachedBalances = stagedBalances;
    visibleBalances = stagedBalances;
    stagedBalances = null;
    notifyBalances(visibleBalances);
    return true;
  },

  notify() {
    if (!visibleBalances) return;
    notifyBalances(visibleBalances);
  },

  /**
   * @param {function({ real: number, bonus: number, formattedReal: string, formattedBonus: string }): void} callback
   * @returns {function(): void}
   */
  subscribe(callback) {
    listeners.add(callback);

    if (visibleBalances) {
      const available = Number(
        visibleBalances.available
          ?? (Number(visibleBalances.real ?? 0) + Number(visibleBalances.bonus ?? 0)),
      );
      callback({
        real: visibleBalances.real,
        bonus: visibleBalances.bonus,
        pending: Number(visibleBalances.pending ?? 0),
        withdrawable: Number(visibleBalances.withdrawable ?? visibleBalances.real ?? 0),
        available,
        activeWelcome: visibleBalances.activeWelcome || null,
        hasActiveWelcome: Boolean(visibleBalances.hasActiveWelcome),
        formattedReal: formatUsd(visibleBalances.real),
        formattedBonus: formatUsd(visibleBalances.bonus),
        formattedPending: formatUsd(visibleBalances.pending ?? 0),
        formattedWithdrawable: formatUsd(
          visibleBalances.withdrawable ?? visibleBalances.real ?? 0,
        ),
        formattedAvailable: formatUsd(available),
      });
    }

    return () => listeners.delete(callback);
  },

  /**
   * @param {function(string, number): void} callback - header subscriber (playable = real+bonus)
   * @returns {function(): void}
   */
  subscribeReal(callback) {
    return this.subscribe(({ formattedAvailable, available, formattedReal, real }) => {
      callback(formattedAvailable || formattedReal, available ?? real);
    });
  },
};

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const publishInterruptedBalance = () => {
    balanceService.publishStaged();
  };

  window.addEventListener('pagehide', publishInterruptedBalance);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') publishInterruptedBalance();
  });
}
