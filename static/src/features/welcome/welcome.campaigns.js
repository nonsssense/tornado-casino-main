/**
 * Welcome campaign content configuration.
 *
 * Banner-first welcome popup — artwork + claim CTA only.
 * Swap ACTIVE_WELCOME_CAMPAIGN_ID or add a WELCOME_CAMPAIGNS entry
 * to launch a different banner without changing modal UI code.
 */

import { ASSETS } from '../../utils/assets.js';

export const ACTIVE_WELCOME_CAMPAIGN_ID = 'launch_v1';

/**
 * @typedef {object} WelcomeCampaign
 * @property {string} id
 * @property {string} bannerSrc
 * @property {string} bannerAltKey
 * @property {{ claimKey: string }} cta
 */

/** @type {Record<string, WelcomeCampaign>} */
export const WELCOME_CAMPAIGNS = {
  launch_v1: {
    id: 'launch_v1',
    bannerSrc: ASSETS.welcomeBanner,
    bannerAltKey: 'welcome.campaigns.launch_v1.bannerAlt',
    cta: {
      claimKey: 'welcome.campaigns.launch_v1.cta.claim',
    },
  },
};

/**
 * @param {string} [campaignId]
 * @returns {WelcomeCampaign}
 */
export function getWelcomeCampaign(campaignId = ACTIVE_WELCOME_CAMPAIGN_ID) {
  const campaign = WELCOME_CAMPAIGNS[campaignId] || WELCOME_CAMPAIGNS[ACTIVE_WELCOME_CAMPAIGN_ID];
  if (!campaign) {
    throw new Error(`Unknown welcome campaign: ${campaignId}`);
  }
  return campaign;
}

/**
 * Kept for callers that still pass a variant from auth payload.
 * Banner UI is identical for all variants.
 * @param {WelcomeCampaign} campaign
 * @param {string} [_variant]
 */
export function resolveWelcomeVariant(campaign, _variant) {
  return campaign;
}
