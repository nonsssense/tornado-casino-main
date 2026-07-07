/**
 * CoinSelector — reusable cryptocurrency chip grid.
 */

import { Chip, ChipGroup } from '../base/Chip.js';
import { WALLET_COINS } from '../../utils/wallet.constants.js';

/**
 * @param {object} [options]
 * @param {string} [options.activeId]
 * @param {function} [options.onSelect] - (coinId) => void
 * @param {string} [options.className]
 */
export function CoinSelector(options = {}) {
  const {
    activeId = 'usdt',
    onSelect,
    className = '',
  } = options;

  const classes = ['wallet-coin-grid'];
  if (className) classes.push(className);

  return ChipGroup({
    layout: '2col',
    className: classes.join(' '),
    chips: WALLET_COINS.map((coin) =>
      Chip({
        label: coin.label,
        iconSrc: coin.icon,
        active: coin.id === activeId,
        className: 'wallet-coin-grid__chip',
        onClick: onSelect ? () => onSelect(coin.id) : undefined,
      }),
    ),
  });
}
