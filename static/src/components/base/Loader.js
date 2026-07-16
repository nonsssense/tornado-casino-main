/**
 * Loader — inline spinner and fullscreen overlay loader.
 */

import { createElement } from '../../utils/dom.js';
import { t } from '../../i18n/index.js';

const SIZES = new Set(['sm', 'md', 'lg']);

/**
 * @param {object} options
 * @param {string} [options.size] - sm | md | lg
 * @param {boolean} [options.light]
 * @param {string} [options.className]
 * @param {string} [options.label] - accessible label
 */
export function Loader(options = {}) {
  const { size = 'md', light = false, className = '', label = t('common.loading') } = options;

  const classes = ['loader'];

  if (SIZES.has(size) && size !== 'md') classes.push(`loader--${size}`);
  if (light) classes.push('loader--light');
  if (className) classes.push(className);

  return createElement('div', {
    className: classes.join(' '),
    attrs: { role: 'status', 'aria-label': label },
  });
}

/**
 * @param {object} options
 * @param {boolean} [options.visible]
 * @param {string} [options.label]
 */
export function LoaderOverlay(options = {}) {
  const { visible = false, label = t('common.loading') } = options;

  const overlay = createElement('div', {
    className: `loader-overlay${visible ? ' loader-overlay--visible' : ''}`,
    attrs: { 'aria-hidden': visible ? 'false' : 'true' },
    children: [
      createElement('div', {
        className: 'loader-overlay__content',
        children: [
          Loader({ size: 'lg' }),
          createElement('span', { className: 'loader-overlay__label', text: label }),
        ],
      }),
    ],
  });

  overlay.setVisible = (isVisible) => {
    overlay.classList.toggle('loader-overlay--visible', isVisible);
    overlay.setAttribute('aria-hidden', isVisible ? 'false' : 'true');
  };

  return overlay;
}
