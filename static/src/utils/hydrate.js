/**
 * Progressive hydration helpers — opacity-only transitions.
 */

const HYDRATE_MS = 150;

/**
 * Fade an element in after mount (opacity only).
 * @param {HTMLElement} element
 * @param {number} [durationMs]
 */
export function hydrateFadeIn(element, durationMs = HYDRATE_MS) {
  if (!element) return;

  element.classList.add('hydrate-fade');
  element.style.setProperty('--hydrate-duration', `${durationMs}ms`);

  requestAnimationFrame(() => {
    element.classList.add('hydrate-fade--visible');
  });
}

/**
 * Replace container children and fade the new root in.
 * @param {HTMLElement} container
 * @param {HTMLElement|HTMLElement[]} content
 * @param {number} [durationMs]
 */
export function replaceChildrenFadeIn(container, content, durationMs = HYDRATE_MS) {
  const nodes = Array.isArray(content) ? content : [content];
  container.replaceChildren(...nodes);
  nodes.forEach((node) => hydrateFadeIn(node, durationMs));
}
