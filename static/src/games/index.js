/**
 * Games module barrel.
 *
 * Responsibility:
 * - Register game feature modules (Dice, Plinko, future Crash/Mines).
 * - Each game folder owns UI board, constants, and animation hooks.
 */

export * from './dice/index.js';
export * from './plinko/index.js';
