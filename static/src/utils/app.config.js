/**
 * Global application configuration (non-secret).
 * Keep Telegram bot identity in one place — never hardcode across features.
 */

/** Bot username without leading @ */
export const TELEGRAM_BOT_USERNAME = 'wwwinwwwin_bot';

/**
 * @param {{ start?: string }} [options]
 * @returns {string}
 */
export function getTelegramBotUrl(options = {}) {
  const username = TELEGRAM_BOT_USERNAME.replace(/^@/, '');
  const start = typeof options.start === 'string' && options.start
    ? `?start=${encodeURIComponent(options.start)}`
    : '';
  return `https://t.me/${username}${start}`;
}

/**
 * Open the configured Tornado bot in Telegram (Mini App–aware when possible).
 * @param {{ start?: string }} [options]
 */
export function openTelegramBot(options = {}) {
  const url = getTelegramBotUrl(options);
  const tg = window.Telegram?.WebApp;

  if (typeof tg?.openTelegramLink === 'function') {
    try {
      tg.openTelegramLink(url);
      return;
    } catch {
      // Fall through to window.open.
    }
  }

  window.open(url, '_blank', 'noopener');
}
