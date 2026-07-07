/**
 * NetworkSelector — network field with dropdown affordance.
 * UI-only display; selection is controlled by parent.
 */

import { createElement } from '../../utils/dom.js';
import { Icon } from '../base/Icon.js';

const CHEVRON_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';

/**
 * @param {object} [options]
 * @param {string} [options.networkLabel] - e.g. "Tron network"
 * @param {string} [options.label] - e.g. "Trc20"
 * @param {string} [options.iconSrc]
 * @param {boolean} [options.disabled]
 * @param {function} [options.onClick]
 * @param {string} [options.className]
 */
export function NetworkSelector(options = {}) {
  const {
    networkLabel = '',
    label = '',
    iconSrc,
    disabled = false,
    onClick,
    className = '',
  } = options;

  const classes = ['network-selector'];
  if (className) classes.push(className);

  const valueChildren = [];

  if (iconSrc) {
    valueChildren.push(Icon({ src: iconSrc, alt: '', className: 'network-selector__icon' }));
  }

  valueChildren.push(createElement('span', {
    className: 'network-selector__value',
    text: label,
  }));

  return createElement('div', {
    className: classes.join(' '),
    children: [
      createElement('span', {
        className: 'network-selector__label',
        text: networkLabel,
      }),
      createElement('button', {
        className: 'network-selector__field',
        attrs: {
          type: 'button',
          disabled,
          onClick,
          'aria-label': networkLabel ? `${networkLabel}: ${label}` : label,
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
      }),
    ],
  });
}
