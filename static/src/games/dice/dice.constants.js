/**
 * Dice UI constants — bet limits mirror backend config (UX only).
 */

export const DICE_BET_LIMITS = {
  min: 0.1,
  max: 5,
};

/** Valid target range keeps the existing 97.5% RTP multiplier at or above 1.00×. */
export const DICE_TARGET_LIMITS = {
  min: 3,
  max: 97,
};

/** Quick-select amounts shown inside the Bet Amount card. */
export const DICE_QUICK_BETS = [0.1, 0.2, 0.5, 1, 2, 5];
