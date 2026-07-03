# plinko_stress_test_summary.py
from __future__ import annotations

import sys
from pathlib import Path

sys.path.append(
    str(Path(__file__).resolve().parents[2])
)

import csv
from collections import Counter
from dataclasses import dataclass
from math import comb, sqrt
from pathlib import Path
from random import getrandbits
from statistics import mean, median

from config import plinko_tables


SPINS_PER_TABLE = 100_000
LIFETIME_PLAYERS = 2_000
START_BALANCE = 100.0
BET = 1.0
MAX_LIFETIME_SPINS = 5_000
OUTPUT_CSV = Path("plinko_stress_summary.csv")


@dataclass
class TableResult:
    risk_mode: str
    rows: int
    spins: int

    theoretical_rtp: float
    theoretical_house_edge: float
    theoretical_variance: float
    theoretical_std_dev: float

    observed_rtp: float
    observed_house_edge: float

    total_bet: float
    total_payout: float
    player_profit: float
    house_profit: float

    max_single_payout: float
    house_loss_spins: int
    edge_hits: int
    center_hits: int
    jackpot_hits: int
    max_house_drawdown: float

    basket_counts: Counter[int]


@dataclass
class LifetimeResult:
    avg_spins_to_bust: float
    median_spins_to_bust: float
    p90_spins_to_bust: float
    avg_bust_balance: float
    survival_100: float
    survival_500: float
    survival_1000: float


def theoretical_stats(rows: int, table: list[float]) -> tuple[float, float, float, float]:
    total_paths = 2 ** rows
    probs = [comb(rows, k) / total_paths for k in range(rows + 1)]

    rtp = sum(p * m for p, m in zip(probs, table))
    second_moment = sum(p * (m ** 2) for p, m in zip(probs, table))

    variance = second_moment - rtp**2
    std_dev = sqrt(variance)
    house_edge = 1.0 - rtp
    return rtp, house_edge, variance, std_dev


def simulate_table_fast(
    risk_mode: str,
    rows: int,
    table: list[float],
    spins: int = SPINS_PER_TABLE,
    bet: float = BET,
) -> TableResult:
    theo_rtp, theo_he, theo_var, theo_sd = theoretical_stats(rows, table)

    total_bet = spins * bet
    total_payout = 0.0
    player_profit = 0.0
    house_profit = 0.0

    max_single_payout = 0.0
    house_loss_spins = 0
    edge_hits = 0
    center_hits = 0
    jackpot_hits = 0

    basket_counts: Counter[int] = Counter()
    running_house_profit = 0.0
    min_running_house_profit = 0.0

    center_basket = rows // 2

    for _ in range(spins):
        basket = getrandbits(rows).bit_count()
        basket_counts[basket] += 1

        multiplier = table[basket]
        payout = bet * multiplier

        spin_player_profit = payout - bet
        spin_house_profit = bet - payout

        total_payout += payout
        player_profit += spin_player_profit
        house_profit += spin_house_profit

        running_house_profit += spin_house_profit
        if running_house_profit < min_running_house_profit:
            min_running_house_profit = running_house_profit

        if payout > max_single_payout:
            max_single_payout = payout

        if spin_house_profit < 0:
            house_loss_spins += 1

        if basket == 0 or basket == rows:
            edge_hits += 1

        if basket == center_basket:
            center_hits += 1

        if multiplier >= 100:
            jackpot_hits += 1

    observed_rtp = total_payout / total_bet
    observed_house_edge = 1.0 - observed_rtp

    return TableResult(
        risk_mode=risk_mode,
        rows=rows,
        spins=spins,
        theoretical_rtp=theo_rtp,
        theoretical_house_edge=theo_he,
        theoretical_variance=theo_var,
        theoretical_std_dev=theo_sd,
        observed_rtp=observed_rtp,
        observed_house_edge=observed_house_edge,
        total_bet=total_bet,
        total_payout=total_payout,
        player_profit=player_profit,
        house_profit=house_profit,
        max_single_payout=max_single_payout,
        house_loss_spins=house_loss_spins,
        edge_hits=edge_hits,
        center_hits=center_hits,
        jackpot_hits=jackpot_hits,
        max_house_drawdown=min_running_house_profit,
        basket_counts=basket_counts,
    )


def simulate_deposit_lifetime(
    rows: int,
    table: list[float],
    players: int = LIFETIME_PLAYERS,
    start_balance: float = START_BALANCE,
    bet: float = BET,
    max_spins_cap: int = MAX_LIFETIME_SPINS,
) -> LifetimeResult:
    spins_to_bust: list[int] = []
    bust_balances: list[float] = []

    survived_100 = 0
    survived_500 = 0
    survived_1000 = 0

    for _ in range(players):
        balance = start_balance
        spins = 0

        while balance >= bet and spins < max_spins_cap:
            basket = getrandbits(rows).bit_count()
            multiplier = table[basket]
            balance += bet * multiplier - bet
            spins += 1

            if spins == 100 and balance >= bet:
                survived_100 += 1
            if spins == 500 and balance >= bet:
                survived_500 += 1
            if spins == 1000 and balance >= bet:
                survived_1000 += 1

        spins_to_bust.append(spins)
        bust_balances.append(max(balance, 0.0))

    spins_sorted = sorted(spins_to_bust)
    p90_index = int(0.9 * (players - 1))

    return LifetimeResult(
        avg_spins_to_bust=mean(spins_to_bust),
        median_spins_to_bust=median(spins_to_bust),
        p90_spins_to_bust=spins_sorted[p90_index],
        avg_bust_balance=mean(bust_balances),
        survival_100=survived_100 / players * 100.0,
        survival_500=survived_500 / players * 100.0,
        survival_1000=survived_1000 / players * 100.0,
    )


def fmt_pct(x: float) -> str:
    return f"{x * 100:8.3f}%"


def print_table(result: TableResult, life: LifetimeResult) -> None:
    edge_pct = result.edge_hits / result.spins * 100
    center_pct = result.center_hits / result.spins * 100

    print("\n" + "=" * 110)
    print(f"{result.risk_mode.upper():<8} | rows={result.rows:<2} | spins={result.spins:,}")
    print("-" * 110)
    print(f"Theoretical RTP      : {fmt_pct(result.theoretical_rtp)}")
    print(f"Theoretical HouseEdge: {fmt_pct(result.theoretical_house_edge)}")
    print(f"Theoretical Variance : {result.theoretical_variance:10.4f}")
    print(f"Theoretical StdDev   : {result.theoretical_std_dev:10.4f}")
    print("-" * 110)
    print(f"Observed RTP         : {fmt_pct(result.observed_rtp)}")
    print(f"Observed HouseEdge   : {fmt_pct(result.observed_house_edge)}")
    print(f"Total bet            : {result.total_bet:12.2f}")
    print(f"Total payout         : {result.total_payout:12.2f}")
    print(f"Player profit        : {result.player_profit:12.2f}")
    print(f"House profit         : {result.house_profit:12.2f}")
    print(f"Max single payout    : {result.max_single_payout:10.2f}x")
    print(f"House loss spins     : {result.house_loss_spins:,} ({result.house_loss_spins / result.spins * 100:.2f}%)")
    print(f"Edge basket hits     : {result.edge_hits:,} ({edge_pct:.2f}%)")
    print(f"Center basket hits   : {result.center_hits:,} ({center_pct:.2f}%)")
    print(f"Jackpot hits (>=100x): {result.jackpot_hits:,}")
    print(f"Max house drawdown   : {result.max_house_drawdown:12.2f}")
    print("-" * 110)
    print("Deposit lifetime")
    print(f"  Avg spins to bust  : {life.avg_spins_to_bust:10.2f}")
    print(f"  Median spins to bust: {life.median_spins_to_bust:10.2f}")
    print(f"  P90 spins to bust  : {life.p90_spins_to_bust:10.2f}")
    print(f"  Avg bust balance   : {life.avg_bust_balance:10.2f}")
    print(f"  Survival 100 spins : {life.survival_100:10.2f}%")
    print(f"  Survival 500 spins : {life.survival_500:10.2f}%")
    print(f"  Survival 1000 spins: {life.survival_1000:10.2f}%")
    print("=" * 110)

    counts_line = "  ".join(
        f"{k}:{result.basket_counts.get(k, 0):>6}"
        for k in range(result.rows + 1)
    )
    print("Baskets:", counts_line)


def main() -> None:
    rows_out = []

    for risk_mode in ("low", "medium", "high"):
        for rows in sorted(plinko_tables[risk_mode].keys()):
            table = plinko_tables[risk_mode][rows]

            table_result = simulate_table_fast(risk_mode, rows, table)
            life_result = simulate_deposit_lifetime(rows, table)

            print_table(table_result, life_result)

            row = {
                "risk_mode": risk_mode,
                "rows": rows,
                "spins": table_result.spins,

                "theoretical_rtp": table_result.theoretical_rtp,
                "theoretical_house_edge": table_result.theoretical_house_edge,
                "theoretical_variance": table_result.theoretical_variance,
                "theoretical_std_dev": table_result.theoretical_std_dev,

                "observed_rtp": table_result.observed_rtp,
                "observed_house_edge": table_result.observed_house_edge,

                "total_bet": table_result.total_bet,
                "total_payout": table_result.total_payout,
                "player_profit": table_result.player_profit,
                "house_profit": table_result.house_profit,

                "max_single_payout": table_result.max_single_payout,
                "house_loss_spins": table_result.house_loss_spins,
                "house_loss_spins_pct": table_result.house_loss_spins / table_result.spins * 100.0,

                "edge_hits": table_result.edge_hits,
                "edge_hits_pct": table_result.edge_hits / table_result.spins * 100.0,
                "center_hits": table_result.center_hits,
                "center_hits_pct": table_result.center_hits / table_result.spins * 100.0,
                "jackpot_hits": table_result.jackpot_hits,
                "max_house_drawdown": table_result.max_house_drawdown,

                "avg_spins_to_bust": life_result.avg_spins_to_bust,
                "median_spins_to_bust": life_result.median_spins_to_bust,
                "p90_spins_to_bust": life_result.p90_spins_to_bust,
                "avg_bust_balance": life_result.avg_bust_balance,
                "survival_100": life_result.survival_100,
                "survival_500": life_result.survival_500,
                "survival_1000": life_result.survival_1000,
            }

            for k in range(17):
                row[f"basket_{k}"] = table_result.basket_counts.get(k, 0)

            rows_out.append(row)

    fieldnames = list(rows_out[0].keys())
    with OUTPUT_CSV.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows_out)

    print(f"\nSaved CSV: {OUTPUT_CSV.resolve()}")


if __name__ == "__main__":
    main()