/**
 * Input — text field primitive with label, hint, and error support.
 */

import { createElement } from '../../utils/dom.js';

/**
 * @param {object} options
 * @param {string} [options.label]
 * @param {string} [options.name]
 * @param {string} [options.type] - text | number | password | search
 * @param {string} [options.placeholder]
 * @param {string} [options.value]
 * @param {string} [options.hint]
 * @param {string} [options.error]
 * @param {boolean} [options.disabled]
 * @param {boolean} [options.multiline]
 * @param {boolean} [options.mono]
 * @param {number} [options.rows]
 * @param {string} [options.className]
 * @param {string} [options.inputClassName]
 * @param {function} [options.onInput]
 * @param {function} [options.onChange]
 */
export function Input(options = {}) {
  const {
    label,
    name,
    type = 'text',
    placeholder = '',
    value = '',
    hint,
    error,
    disabled = false,
    multiline = false,
    mono = false,
    rows = 4,
    className = '',
    inputClassName = '',
    onInput,
    onChange,
  } = options;

  const inputClasses = ['input'];

  if (multiline) inputClasses.push('input--textarea');
  if (mono) inputClasses.push('input--mono');
  if (error) inputClasses.push('input--error');
  if (inputClassName) inputClasses.push(inputClassName);

  const fieldTag = multiline ? 'textarea' : 'input';
  const fieldAttrs = {
    name,
    placeholder,
    disabled,
    onInput,
    onChange,
  };

  if (multiline) {
    fieldAttrs.rows = rows;
  } else {
    fieldAttrs.type = type;
  }

  if (value !== undefined && value !== null) {
    fieldAttrs.value = value;
  }

  const field = createElement(fieldTag, {
    className: inputClasses.join(' '),
    attrs: fieldAttrs,
  });

  if (multiline && value) {
    field.value = value;
  }

  const children = [];

  if (label) {
    children.push(createElement('label', {
      className: 'input-field__label',
      attrs: { for: name },
      text: label,
    }));
  }

  children.push(field);

  if (error) {
    children.push(createElement('span', {
      className: 'input-field__error',
      text: error,
      attrs: { role: 'alert' },
    }));
  } else if (hint) {
    children.push(createElement('span', {
      className: 'input-field__hint',
      text: hint,
    }));
  }

  if (name) {
    field.id = name;
  }

  const wrapperClasses = ['input-field'];
  if (className) wrapperClasses.push(className);

  return createElement('div', {
    className: wrapperClasses.join(' '),
    children,
  });
}
