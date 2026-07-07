/**
 * Animations barrel.
 *
 * Responsibility:
 * - Shared motion utilities (transitions, easing constants).
 * - Animation layer mount helpers.
 * - Game-specific animations live under games/*/ *.animation.js.
 */

export { TRANSITION_DURATION, EASING, DURATION } from './transitions.js';
export { getAnimationRoot, mountAnimation, clearAnimations } from './layer.js';
