/**
 * Animation layer helpers.
 * Structure only — no complex animations yet.
 */

import { SHELL_IDS } from '../utils/constants.js';

/**
 * @returns {HTMLElement|null}
 */
export function getAnimationRoot() {
  return document.getElementById(SHELL_IDS.ANIMATION);
}

/**
 * Mount a transient animation element into the global animation layer.
 * @param {HTMLElement} element
 * @returns {function} cleanup — removes the element
 */
export function mountAnimation(element) {
  const root = getAnimationRoot();
  if (!root) return () => {};

  root.appendChild(element);

  return () => {
    element.remove();
  };
}

/**
 * Clear all animation layer children.
 */
export function clearAnimations() {
  const root = getAnimationRoot();
  if (root) root.replaceChildren();
}
