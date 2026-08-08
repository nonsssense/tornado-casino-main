/**
 * CoinNetworkPair — Currency + Network side-by-side compact dropdowns.
 * Collapsed by default; only the open menu expands.
 */

import { createElement } from '../../utils/dom.js';
import { Icon } from '../base/Icon.js';
import { t } from '../../i18n/index.js';
import { WALLET_COINS } from '../../utils/wallet.constants.js';
import { getNetworksForCoin } from '../../features/wallet/wallet.utils.js';

const CHEVRON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';

/**
 * @param {object} options
 * @param {string} options.fieldLabel
 * @param {string} options.valueLabel
 * @param {string} [options.iconSrc]
 * @param {boolean} [options.disabled]
 * @param {boolean} [options.open]
 * @param {Array<{ id: string, label: string, icon?: string }>} [options.options]
 * @param {string} [options.activeId]
 * @param {function(string): void} [options.onSelect]
 * @param {function(): void} [options.onToggle]
 * @returns {HTMLElement}
 */
function CompactSelect(options) {
  const {
    fieldLabel,
    valueLabel,
    iconSrc,
    disabled = false,
    open = false,
    options: menuOptions = [],
    activeId,
    onSelect,
    onToggle,
  } = options;

  const canOpen = !disabled && menuOptions.length > 1 && typeof onSelect === 'function';

  const valueChildren = [];
  if (iconSrc) {
    valueChildren.push(Icon({
      src: iconSrc,
      alt: '',
      className: 'wallet-pair__icon',
    }));
  }
  valueChildren.push(createElement('span', {
    className: 'wallet-pair__value',
    text: valueLabel,
  }));

  const field = createElement('button', {
    className: 'wallet-pair__field',
    attrs: {
      type: 'button',
      disabled: disabled || (!canOpen && menuOptions.length <= 1),
      'aria-label': `${fieldLabel}: ${valueLabel}`,
      'aria-haspopup': canOpen ? 'listbox' : undefined,
      'aria-expanded': canOpen ? (open ? 'true' : 'false') : undefined,
      onClick: canOpen ? () => onToggle?.() : undefined,
    },
    children: [
      createElement('span', {
        className: 'wallet-pair__field-inner',
        children: valueChildren,
      }),
      createElement('span', {
        className: 'wallet-pair__chevron',
        html: CHEVRON,
      }),
    ],
  });

  const children = [
    createElement('span', {
      className: 'wallet-pair__label',
      text: fieldLabel,
    }),
    field,
  ];

  if (open && canOpen) {
    children.push(
      createElement('div', {
        className: 'wallet-pair__menu',
        attrs: { role: 'listbox' },
        children: menuOptions.map((option) =>
          createElement('button', {
            className: [
              'wallet-pair__menu-item',
              option.id === activeId ? 'wallet-pair__menu-item--active' : '',
            ].filter(Boolean).join(' '),
            attrs: {
              type: 'button',
              role: 'option',
              'aria-selected': option.id === activeId ? 'true' : 'false',
              onClick: () => onSelect?.(option.id),
            },
            children: [
              option.icon
                ? Icon({ src: option.icon, alt: '', className: 'wallet-pair__icon' })
                : null,
              createElement('span', {
                className: 'wallet-pair__menu-label',
                text: option.label,
              }),
              option.recommended
                ? createElement('span', {
                  className: 'wallet-pair__menu-badge',
                  text: t('wallet.network.recommended'),
                })
                : null,
            ].filter(Boolean),
          }),
        ),
      }),
    );
  }

  return createElement('div', {
    className: [
      'wallet-pair__select',
      open ? 'wallet-pair__select--open' : '',
      canOpen ? 'wallet-pair__select--selectable' : '',
    ].filter(Boolean).join(' '),
    children,
  });
}

/**
 * @param {object} [options]
 * @param {string} [options.coinId]
 * @param {string} [options.networkId]
 * @param {function(string): void} [options.onCoinSelect]
 * @param {function(string): void} [options.onNetworkSelect]
 * @returns {{ element: HTMLElement, setCoinId: Function, setNetworkId: Function, destroy: Function }}
 */
export function createCoinNetworkPair(options = {}) {
  const {
    coinId: initialCoinId = 'usdt',
    networkId: initialNetworkId = '',
    onCoinSelect,
    onNetworkSelect,
  } = options;

  let coinId = initialCoinId;
  let networkId = initialNetworkId;
  /** @type {'coin'|'network'|null} */
  let openMenu = null;

  const root = createElement('div', {
    className: 'wallet-pair',
  });

  function closeMenus() {
    if (openMenu == null) return;
    openMenu = null;
    render();
  }

  function onDocumentPointer(event) {
    if (!root.contains(event.target)) {
      closeMenus();
    }
  }

  function render() {
    const coin = WALLET_COINS.find((item) => item.id === coinId) || WALLET_COINS[0];
    const networks = getNetworksForCoin(coin.id);
    const network = networks.find((item) => item.id === networkId) || networks[0];

    root.replaceChildren(
      CompactSelect({
        fieldLabel: t('wallet.pair.currency'),
        valueLabel: t(coin.labelKey),
        iconSrc: coin.icon,
        open: openMenu === 'coin',
        activeId: coin.id,
        options: WALLET_COINS.map((item) => ({
          id: item.id,
          label: t(item.labelKey),
          icon: item.icon,
        })),
        onToggle: () => {
          openMenu = openMenu === 'coin' ? null : 'coin';
          render();
        },
        onSelect: (id) => {
          openMenu = null;
          if (id === coinId) {
            render();
            return;
          }
          onCoinSelect?.(id);
        },
      }),
      CompactSelect({
        fieldLabel: t('wallet.pair.network'),
        valueLabel: network ? t(network.labelKey) : t('common.emDash'),
        iconSrc: network?.icon,
        disabled: networks.length === 0,
        open: openMenu === 'network',
        activeId: network?.id,
        options: networks.map((item) => ({
          id: item.id,
          label: t(item.labelKey),
          icon: item.icon,
          recommended: item.recommended === true,
        })),
        onToggle: () => {
          openMenu = openMenu === 'network' ? null : 'network';
          render();
        },
        onSelect: (id) => {
          openMenu = null;
          if (id === networkId) {
            render();
            return;
          }
          onNetworkSelect?.(id);
        },
      }),
    );
  }

  document.addEventListener('pointerdown', onDocumentPointer, true);
  render();

  return {
    element: root,
    setCoinId(nextId) {
      coinId = nextId;
      render();
    },
    setNetworkId(nextId) {
      networkId = nextId;
      render();
    },
    destroy() {
      document.removeEventListener('pointerdown', onDocumentPointer, true);
    },
  };
}
