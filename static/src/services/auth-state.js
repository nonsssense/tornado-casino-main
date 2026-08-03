/**
 * Lightweight auth status — shared by the HTTP client and auth.service.
 * No API imports (avoids circular dependency with request.js).
 */

export const AUTH_STATUS = Object.freeze({
  LOADING: 'loading',
  GUEST: 'guest',
  AUTHENTICATED: 'authenticated',
});

/** @type {string} */
let status = AUTH_STATUS.LOADING;

/** @type {Set<(status: string) => void>} */
const listeners = new Set();

/**
 * @returns {string}
 */
export function getAuthStatus() {
  return status;
}

/**
 * @returns {boolean}
 */
export function isAuthenticated() {
  return status === AUTH_STATUS.AUTHENTICATED;
}

/**
 * @returns {boolean}
 */
export function isGuest() {
  return status === AUTH_STATUS.GUEST;
}

/**
 * @returns {boolean}
 */
export function isAuthLoading() {
  return status === AUTH_STATUS.LOADING;
}

/**
 * @param {string} next
 */
export function setAuthStatus(next) {
  if (
    next !== AUTH_STATUS.LOADING
    && next !== AUTH_STATUS.GUEST
    && next !== AUTH_STATUS.AUTHENTICATED
  ) {
    return;
  }
  if (status === next) return;
  status = next;
  listeners.forEach((listener) => {
    try {
      listener(status);
    } catch {
      // Subscriber errors must not break others.
    }
  });
}

/**
 * @param {(status: string) => void} listener
 * @returns {() => void}
 */
export function subscribeAuthStatus(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
