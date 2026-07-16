/**
 * Localization — Tornado Mini App.
 * Default locale: Russian. Persistence: localStorage.
 */

import { ru } from './locales/ru.js';
import { en } from './locales/en.js';

export const LOCALES = Object.freeze({
  ru: 'ru',
  en: 'en',
});

export const DEFAULT_LOCALE = LOCALES.ru;

const STORAGE_KEY = 'tornado.locale';

const DICTIONARIES = {
  [LOCALES.ru]: ru,
  [LOCALES.en]: en,
};

/** @type {string} */
let currentLocale = loadStoredLocale();

/** @type {Set<(locale: string) => void>} */
const listeners = new Set();

/**
 * @returns {string}
 */
function loadStoredLocale() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === LOCALES.ru || stored === LOCALES.en) {
      return stored;
    }
  } catch {
    // private mode / unavailable storage
  }
  return DEFAULT_LOCALE;
}

/**
 * @param {string} locale
 */
function persistLocale(locale) {
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // ignore
  }
}

/**
 * Resolve nested key path. Falls back to English, then the key itself.
 * @param {Record<string, unknown>} dict
 * @param {string} path
 * @returns {string|undefined}
 */
function lookup(dict, path) {
  const parts = path.split('.');
  let node = dict;
  for (const part of parts) {
    if (node == null || typeof node !== 'object') return undefined;
    node = node[part];
  }
  return typeof node === 'string' ? node : undefined;
}

/**
 * Replace `{name}` tokens in a template.
 * @param {string} template
 * @param {Record<string, string|number>} [params]
 * @returns {string}
 */
function interpolate(template, params) {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, key) => (
    params[key] == null ? `{${key}}` : String(params[key])
  ));
}

/**
 * Translate a key for the active locale.
 * @param {string} key
 * @param {Record<string, string|number>} [params]
 * @returns {string}
 */
export function t(key, params) {
  const primary = lookup(DICTIONARIES[currentLocale], key);
  if (primary != null) return interpolate(primary, params);

  const fallback = lookup(DICTIONARIES[LOCALES.en], key)
    ?? lookup(DICTIONARIES[LOCALES.ru], key);
  if (fallback != null) return interpolate(fallback, params);

  return key;
}

/**
 * @returns {string}
 */
export function getLocale() {
  return currentLocale;
}

/**
 * @param {string} locale
 * @returns {boolean}
 */
export function isLocale(locale) {
  return currentLocale === locale;
}

/**
 * Switch language and notify subscribers. No page reload.
 * @param {string} locale
 * @returns {boolean} true if locale changed
 */
export function setLocale(locale) {
  if (locale !== LOCALES.ru && locale !== LOCALES.en) {
    return false;
  }
  if (locale === currentLocale) {
    return false;
  }

  currentLocale = locale;
  persistLocale(locale);
  document.documentElement.lang = locale;

  listeners.forEach((listener) => {
    try {
      listener(locale);
    } catch {
      // subscriber errors must not break others
    }
  });

  return true;
}

/**
 * Toggle between Russian and English.
 * @returns {string} new locale
 */
export function toggleLocale() {
  const next = currentLocale === LOCALES.ru ? LOCALES.en : LOCALES.ru;
  setLocale(next);
  return next;
}

/**
 * @param {(locale: string) => void} listener
 * @returns {() => void} unsubscribe
 */
export function subscribeLocale(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Apply document lang attribute once at boot.
 */
export function initI18n() {
  document.documentElement.lang = currentLocale;
}

/**
 * Count leaf string keys in a nested dictionary (for verification).
 * @param {Record<string, unknown>} dict
 * @returns {number}
 */
export function countStrings(dict = DICTIONARIES[LOCALES.ru]) {
  let count = 0;
  const walk = (node) => {
    if (typeof node === 'string') {
      count += 1;
      return;
    }
    if (node && typeof node === 'object') {
      Object.values(node).forEach(walk);
    }
  };
  walk(dict);
  return count;
}

export const i18n = {
  t,
  getLocale,
  setLocale,
  toggleLocale,
  isLocale,
  subscribe: subscribeLocale,
  init: initI18n,
  LOCALES,
  DEFAULT_LOCALE,
};
