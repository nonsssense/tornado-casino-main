/**
 * NetworkSelector — network field with optional multi-network menu.
 * UI-only; selection is controlled by parent.
 */

import { createElement } from '../../utils/dom.js';
import { Icon } from '../base/Icon.js';

const CHEVRON_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';

/**
 * @param {object} [options]
 * @param {string} [options.networkLabel] - e.g. "Tron network"
 * @param {string} [options.label] - e.g. "TRC20"
 * @param {string} [options.iconSrc]
 * @param {boolean} [options.disabled]
 * @param {Array<{ id: string, label: string, networkLabel?: string, icon?: string }>} [options.options]
 * @param {string} [options.activeId]
 * @param {function(string): void} [options.onSelect]
 * @param {function} [options.onClick]
 * @param {string} [options.className]
 */
export function NetworkSelector(options = {}) {
  const {
    networkLabel = '',
    label = '',
    iconSrc,
    disabled = false,
    options: networkOptions = [],
    activeId,
    onSelect,
    onClick,
    className = '',
  } = options;

  const hasMenu = networkOptions.length > 1 && typeof onSelect === 'function';
  const classes = ['network-selector'];
  if (className) classes.push(className);
  if (hasMenu) classes.push('network-selector--selectable');

  const valueChildren = [];

  if (iconSrc) {
    valueChildren.push(Icon({ src: iconSrc, alt: '', className: 'network-selector__icon' }));
  }

  valueChildren.push(createElement('span', {
    className: 'network-selector__value',
    text: label,
  }));

  const field = createElement('button', {
    className: 'network-selector__field',
    attrs: {
      type: 'button',
      disabled: disabled || (!hasMenu && !onClick),
      'aria-label': networkLabel ? `${networkLabel}: ${label}` : label,
      'aria-haspopup': hasMenu ? 'listbox' : undefined,
      'aria-expanded': hasMenu ? 'false' : undefined,
    },
    children: [
      createElement('span', {
        className: 'network-selector__field-inner',
        children: valueChildren,
      }),
      createElement('span', {
        className: 'network-selector__chevron',
        html: CHEVRON_ICON,
      }),
    ],
  });

  const root = createElement('div', {
    className: classes.join(' '),
    children: [
      createElement('span', {
        className: 'network-selector__label',
        text: networkLabel,
      }),
      field,
    ],
  });

  let menu = null;

  function closeMenu() {
    if (!menu) return;
    menu.remove();
    menu = null;
    field.setAttribute('aria-expanded', 'false');
    document.removeEventListener('click', handleDocumentClick);
  }

  function handleDocumentClick(event) {
    if (!root.contains(event.target)) {
      closeMenu();
    }
  }

  function openMenu() {
    if (!hasMenu || menu) return;

    menu = createElement('div', {
      className: 'network-selector__menu',
      attrs: { role: 'listbox' },
      children: networkOptions.map((option) => {
        const isActive = option.id === activeId;
        const itemChildren = [];

        if (option.icon) {
          itemChildren.push(Icon({
            src: option.icon,
            alt: '',
            className: 'network-selector__menu-icon',
          }));
        }

        itemChildren.push(createElement('span', {
          className: 'network-selector__menu-text',
          children: [
            createElement('span', {
              className: 'network-selector__menu-title',
              text: option.label,
            }),
            option.networkLabel
              ? createElement('span', {
                className: 'network-selector__menu-subtitle',
                text: option.networkLabel,
              })
              : null,
          ].filter(Boolean),
        }));

        return createElement('button', {
          className: isActive
            ? 'network-selector__menu-item network-selector__menu-item--active'
            : 'network-selector__menu-item',
          attrs: {
            type: 'button',
            role: 'option',
            'aria-selected': isActive ? 'true' : 'false',
            onClick: (event) => {
              event.stopPropagation();
              closeMenu();
              if (!isActive) onSelect(option.id);
            },
          },
          children: itemChildren,
        });
      }),
    });

    root.appendChild(menu);
    field.setAttribute('aria-expanded', 'true');
    setTimeout(() => document.addEventListener('click', handleDocumentClick), 0);
  }

  field.addEventListener('click', (event) => {
    event.stopPropagation();

    if (hasMenu) {
      if (menu) closeMenu();
      else openMenu();
      return;
    }

    if (onClick) onClick(event);
  });

  return root;
}
