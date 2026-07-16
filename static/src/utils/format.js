/**
 * Formatting helpers.
 *
 * Responsibility:
 * - Display-only number, fiat USD, and crypto amount formatting.
 * - Never mutate stored values or calculation precision.
 */

const DEFAULT_MAX_DECIMALS = 4;

const USD_NUMBER_FORMAT = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Truncate toward zero to `decimals` fractional digits (display only).
 * @param {number} value
 * @param {number} decimals
 * @returns {number}
 */
function truncateDecimals(value, decimals) {
  if (!Number.isFinite(value)) return 0;
  if (decimals <= 0) return Math.trunc(value);

  const factor = 10 ** decimals;
  // Slight epsilon bias avoids float artifacts like 1.0000000002 → 1.0001
  const adjusted = value >= 0
    ? value * factor + Number.EPSILON
    : value * factor - Number.EPSILON;

  return Math.trunc(adjusted) / factor;
}

/**
 * Format an internal wallet / balance amount as fiat USD.
 *
 * Always: `$` prefix, thousands separators, exactly 2 decimal places.
 *
 * @param {unknown} value
 * @returns {string}
 *
 * @example
 * formatUsd(0)        // "$0.00"
 * formatUsd(5)        // "$5.00"
 * formatUsd(25.5)     // "$25.50"
 * formatUsd(1200)     // "$1,200.00"
 * formatUsd(15342.4)  // "$15,342.40"
 * formatUsd(1500000)  // "$1,500,000.00"
 * formatUsd(-10)      // "-$10.00"
 */
export function formatUsd(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '$0.00';

  const formatted = USD_NUMBER_FORMAT.format(Math.abs(num));
  return num < 0 ? `-$${formatted}` : `$${formatted}`;
}

/**
 * Format a cryptocurrency amount for UI display (on-chain deposit/withdraw mins).
 *
 * Rules:
 * - at most `maxDecimals` fractional digits (default 4)
 * - strip trailing zeros
 * - drop the decimal point when the fraction is empty
 *
 * @param {unknown} value
 * @param {object} [options]
 * @param {number} [options.maxDecimals=4]
 * @param {string} [options.symbol] - e.g. USDT, ETH (on-chain asset ticker)
 * @returns {string}
 *
 * @example
 * formatCryptoAmount(10) // "10"
 * formatCryptoAmount(10.00000000, { symbol: 'USDT' }) // "10 USDT"
 * formatCryptoAmount(0.00234234523, { symbol: 'ETH' }) // "0.0023 ETH"
 */
export function formatCryptoAmount(value, options = {}) {
  const {
    maxDecimals = DEFAULT_MAX_DECIMALS,
    symbol,
  } = options;

  const num = Number(value);
  if (!Number.isFinite(num)) {
    return symbol ? `0 ${symbol}` : '0';
  }

  const truncated = truncateDecimals(num, maxDecimals);
  const abs = Math.abs(truncated);
  let formatted = abs.toFixed(maxDecimals).replace(/\.?0+$/, '');

  if (truncated < 0 && formatted !== '0') {
    formatted = `-${formatted}`;
  }

  return symbol ? `${formatted} ${symbol}` : formatted;
}

/**
 * Format a money balance for UI (alias of formatUsd).
 *
 * @param {unknown} value
 * @returns {string}
 */
export function formatCurrency(value) {
  return formatUsd(value);
}
