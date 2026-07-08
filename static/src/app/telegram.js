/**
 * Telegram Mini App bridge.
 *
 * Responsibility:
 * - Wrap window.Telegram.WebApp (ready, expand, theme, viewport).
 * - Expose initData and user info for auth.service.js.
 * - Keep Telegram-specific code out of pages and components.
 */

export function getTelegramContext() {
  const telegram = window.Telegram;
  const tg = telegram?.WebApp;
  const initData = tg?.initData;
  const initDataUnsafe = tg?.initDataUnsafe;
  const unsafeUser = initDataUnsafe?.user;

  console.log('[getTelegramContext] window.Telegram:', telegram ? 'present' : null);
  console.log('[getTelegramContext] window.Telegram?.WebApp:', tg ? 'present' : null);
  console.log('[getTelegramContext] Telegram.WebApp.initData:', {
    present: Boolean(initData),
    length: initData?.length ?? 0,
  });
  console.log('[getTelegramContext] Telegram.WebApp.initDataUnsafe:', initDataUnsafe ?? null);
  console.log('[getTelegramContext] Telegram WebApp detected:', Boolean(tg));
  console.log('[getTelegramContext] InitData present:', Boolean(initData));
  console.log('[getTelegramContext] InitData length:', initData?.length ?? 0);
  console.log('[getTelegramContext] Telegram ID:', unsafeUser?.id ?? null);
  console.log('[getTelegramContext] Username:', unsafeUser?.username ?? null);

  if (!tg) {
    console.log('[getTelegramContext] returned:', null);
    return null;
  }

  try {
    tg.ready();
    tg.expand();
  } catch (error) {
    // Browser still loads telegram-web-app.js; allow /api/auth to run.
    console.warn('[getTelegramContext] ready/expand failed:', error);
  }

  const user = tg.initDataUnsafe?.user ?? null;

  const context = {
    initData: tg.initData || null,
    user,
    telegramId: user?.id ?? null,
  };

  console.log('[getTelegramContext] returned:', {
    initDataPresent: Boolean(context.initData),
    initDataLength: context.initData?.length ?? 0,
    telegramId: context.telegramId,
    username: context.user?.username ?? null,
    user: context.user,
  });

  return context;
}
