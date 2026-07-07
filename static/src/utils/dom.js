/**
 * DOM helpers.
 */

export function $(selector, root = document) {
  return root.querySelector(selector);
}

export function $$(selector, root = document) {
  return [...root.querySelectorAll(selector)];
}

/**
 * @param {string} tag
 * @param {object} [options]
 * @param {string} [options.className]
 * @param {string[]} [options.classList]
 * @param {Record<string, unknown>} [options.attrs]
 * @param {Record<string, string>} [options.dataset]
 * @param {Record<string, string>} [options.aria]
 * @param {string} [options.text]
 * @param {string} [options.html]
 * @param {Array<Node|string|null|undefined>} [options.children]
 */
export function createElement(tag, options = {}) {
  const {
    className,
    classList = [],
    attrs = {},
    dataset,
    aria,
    text,
    html,
    children = [],
  } = options;

  const el = document.createElement(tag);
  const classes = [className, ...classList].filter(Boolean).join(' ');

  if (classes) {
    el.className = classes;
  }

  if (dataset) {
    Object.entries(dataset).forEach(([key, value]) => {
      el.dataset[key] = value;
    });
  }

  if (aria) {
    Object.entries(aria).forEach(([key, value]) => {
      el.setAttribute(`aria-${key}`, value);
    });
  }

  Object.entries(attrs).forEach(([key, value]) => {
    if (value === undefined || value === null) return;

    if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
      return;
    }

    if (key in el) {
      el[key] = value;
    } else {
      el.setAttribute(key, String(value));
    }
  });

  if (text != null) el.textContent = text;
  if (html != null) el.innerHTML = html;

  children.flat().forEach((child) => {
    if (child == null) return;
    el.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  });

  return el;
}

export function setClass(element, className, active) {
  element.classList.toggle(className, active);
}

export function appendChildren(parent, children = []) {
  children.flat().forEach((child) => {
    if (child == null) return;
    parent.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  });
  return parent;
}
