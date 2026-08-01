"""Infrastructure + integration tests for CampaignManager (no live reward logic)."""

from __future__ import annotations

import unittest
import uuid

from database.campaign import (
    CAMPAIGN_PRIORITY_HIGH,
    CAMPAIGN_TYPE_DEPOSIT_BONUS,
    EVENT_BET_SETTLED,
    EVENT_DEPOSIT,
    EVENT_REGISTER,
    PARTICIPATION_STATUS_ACTIVE,
    PARTICIPATION_STATUS_AVAILABLE,
    PARTICIPATION_STATUS_COMPLETED,
    PARTICIPATION_STATUS_EXPIRED,
    PARTICIPATION_STATUS_QUALIFIED,
    CampaignManager,
    ensure_campaign_schema,
)


class CampaignManagerInfrastructureTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        ensure_campaign_schema()
        cls.manager = CampaignManager()

    def test_create_get_enable_disable_and_trigger_query(self):
        code = f"test_dep_{uuid.uuid4().hex[:10]}"
        created = self.manager.createCampaign(
            code=code,
            name="Test Deposit Tier",
            type=CAMPAIGN_TYPE_DEPOSIT_BONUS,
            trigger=EVENT_DEPOSIT,
            priority=CAMPAIGN_PRIORITY_HIGH,
            config={
                "conditions": {"deposit_number": 1, "min_deposit": 20},
                "progress": {"metric": "deposit_count", "target": 3},
                "reward": {
                    "type": "deposit_bonus",
                    "bonus_percent": 100,
                    "wager": 30,
                },
                "game": {
                    "allowed": ["dice", "plinko"],
                    "max_bet": 5,
                    "max_win": 50,
                },
                "limits": {"once_per_user": True, "global_budget": 10000},
            },
            budget=10000,
            created_by="unit_test",
        )

        self.assertIsNotNone(created.id)
        self.assertEqual(created.code, code)
        self.assertEqual(created.config["reward"]["bonus_percent"], 100)
        self.assertTrue(self.manager._evaluateConditions(created, {"deposit_amount": 20}))

        by_code = self.manager.getCampaignByCode(code)
        self.assertIsNotNone(by_code)
        self.assertEqual(by_code.id, created.id)

        by_trigger = self.manager.getCampaignByTrigger(EVENT_DEPOSIT)
        self.assertTrue(any(c.id == created.id for c in by_trigger))
        by_alias = self.manager.getCampaignByTrigger("on_deposit_confirmed")
        self.assertTrue(any(c.id == created.id for c in by_alias))

        disabled = self.manager.disableCampaign(created.id)
        self.assertFalse(disabled.enabled)
        active = self.manager.getActiveCampaigns()
        self.assertFalse(any(c.id == created.id for c in active))

        enabled = self.manager.enableCampaign(created.id)
        self.assertTrue(enabled.enabled)

        deleted = self.manager.deleteCampaign(created.id)
        self.assertFalse(deleted.enabled)

    def test_participation_lifecycle(self):
        code = f"test_part_{uuid.uuid4().hex[:10]}"
        campaign = self.manager.createCampaign(
            code=code,
            name="Participation Test",
            type=CAMPAIGN_TYPE_DEPOSIT_BONUS,
            trigger=EVENT_DEPOSIT,
            config={"limits": {"once_per_user": True}},
        )
        user_id = 9_000_000 + (uuid.uuid4().int % 100000)

        participation = self.manager.createParticipation(
            campaign_id=campaign.id,
            user_id=user_id,
            status=PARTICIPATION_STATUS_AVAILABLE,
            source_event="unit_test",
            metadata={"note": "infra"},
        )
        self.assertEqual(participation.status, PARTICIPATION_STATUS_AVAILABLE)
        self.assertFalse(participation.completed)

        fetched = self.manager.getParticipation(
            campaign_id=campaign.id,
            user_id=user_id,
        )
        self.assertIsNotNone(fetched)
        self.assertEqual(fetched.id, participation.id)

        active = self.manager.updateParticipationStatus(
            participation.id,
            PARTICIPATION_STATUS_ACTIVE,
            reward_id=123,
        )
        self.assertEqual(active.status, PARTICIPATION_STATUS_ACTIVE)
        self.assertTrue(active.reward_granted)
        self.assertEqual(active.reward_id, 123)

        completed = self.manager.completeParticipation(participation.id)
        self.assertEqual(completed.status, PARTICIPATION_STATUS_COMPLETED)
        self.assertTrue(completed.completed)

        code2 = f"test_exp_{uuid.uuid4().hex[:10]}"
        campaign2 = self.manager.createCampaign(
            code=code2,
            name="Expire Test",
            type=CAMPAIGN_TYPE_DEPOSIT_BONUS,
            config={},
        )
        part2 = self.manager.createParticipation(
            campaign_id=campaign2.id,
            user_id=user_id,
        )
        expired = self.manager.expireParticipation(part2.id, fail_reason="timeout")
        self.assertEqual(expired.status, PARTICIPATION_STATUS_EXPIRED)
        self.assertEqual(expired.fail_reason, "timeout")

        by_user = self.manager.getParticipationsByUser(user_id)
        self.assertGreaterEqual(len(by_user), 2)

    def test_handle_event_tracks_progress_and_player_api(self):
        code = f"test_evt_{uuid.uuid4().hex[:10]}"
        campaign = self.manager.createCampaign(
            code=code,
            name="Event Deposit Mission",
            type=CAMPAIGN_TYPE_DEPOSIT_BONUS,
            trigger=EVENT_DEPOSIT,
            config={
                "progress": {"metric": "deposit_count", "target": 3},
                "reward": {"type": "deposit_bonus", "bonus_percent": 50},
            },
        )
        user_id = 8_000_000 + (uuid.uuid4().int % 100000)

        available = self.manager.getAvailableCampaigns(user_id)
        self.assertTrue(any(c.id == campaign.id for c in available))

        results = self.manager.handleEvent(
            user_id,
            EVENT_DEPOSIT,
            {"amount_usd": 25, "deposit_index": 1},
        )
        self.assertTrue(any(r["campaign_id"] == campaign.id for r in results))

        participation = self.manager.getParticipation(
            campaign_id=campaign.id,
            user_id=user_id,
        )
        self.assertIsNotNone(participation)
        self.assertEqual(participation.status, PARTICIPATION_STATUS_QUALIFIED)
        self.assertAlmostEqual(float(participation.progress), 1.0 / 3.0, places=5)

        self.manager.handleEvent(user_id, EVENT_DEPOSIT, {"amount_usd": 10})
        self.manager.handleEvent(user_id, EVENT_DEPOSIT, {"amount_usd": 10})
        participation = self.manager.getParticipation(
            campaign_id=campaign.id,
            user_id=user_id,
        )
        self.assertEqual(participation.status, PARTICIPATION_STATUS_COMPLETED)

        card = self.manager.getCampaignProgress(user_id, campaign)
        self.assertEqual(card["code"], code)
        self.assertIn("progress", card)
        self.assertIn("reward_description", card)
        self.assertEqual(card["completion_percent"], 100.0)

        cards = self.manager.getUserCampaigns(user_id)
        self.assertTrue(any(c["campaign_id"] == campaign.id for c in cards))

    def test_register_and_bet_events(self):
        reg_code = f"test_reg_{uuid.uuid4().hex[:10]}"
        bet_code = f"test_bet_{uuid.uuid4().hex[:10]}"
        self.manager.createCampaign(
            code=reg_code,
            name="Welcome Track",
            type="welcome",
            trigger=EVENT_REGISTER,
            config={"progress": {"metric": "percent", "target": 100}},
        )
        self.manager.createCampaign(
            code=bet_code,
            name="Wager Track",
            type="custom",
            trigger=EVENT_BET_SETTLED,
            config={"progress": {"metric": "wager_amount", "target": 50}},
        )
        user_id = 7_000_000 + (uuid.uuid4().int % 100000)

        self.manager.handleEvent(user_id, EVENT_REGISTER, {})
        self.manager.handleEvent(
            user_id,
            EVENT_BET_SETTLED,
            {"stake": 18, "game": "dice"},
        )

        cards = self.manager.getUserCampaigns(user_id)
        wager_card = next(c for c in cards if c["code"] == bet_code)
        self.assertEqual(wager_card["status"], PARTICIPATION_STATUS_ACTIVE)
        self.assertAlmostEqual(wager_card["progress"]["current"], 18.0)
        self.assertAlmostEqual(wager_card["progress"]["remaining"], 32.0)


if __name__ == "__main__":
    unittest.main()
