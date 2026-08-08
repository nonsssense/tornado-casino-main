import { createElement } from '../../utils/dom.js';

/**
 * @param {object} options
 * @param {string} options.label
 * @param {string} options.value
 * @param {string} [options.assetPath]
 * @returns {HTMLElement}
 */
export function createPersonalDataStatCard(options) {
  const { label, value, assetPath } = options;

  const card = createElement('article', {
    className: 'personal-data__stat-card',
    children: [
      createElement('div', {
        className: 'personal-data__stat-content',
        children: [
          createElement('span', { className: 'personal-data__stat-label', text: label }),
          createElement('strong', { className: 'personal-data__stat-value', text: value }),
        ],
      }),
    ],
  });

  if (assetPath) {
    const bg = createElement('img', {
      className: 'personal-data__stat-bg',
      attrs: { src: assetPath, alt: '', 'aria-hidden': 'true', draggable: false },
    });
    bg.addEventListener('error', () => {
      bg.remove();
    });
    card.prepend(bg);
  }

  return card;
}

