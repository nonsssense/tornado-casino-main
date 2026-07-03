from math import comb, sqrt


def calculate_rtp_and_variance(rows: int, table: list[float]):

    probabilities = [
        comb(rows, k) / (2 ** rows)
        for k in range(rows + 1)
    ]

    rtp = sum(
        p * m
        for p, m in zip(probabilities, table)
    )

    second_moment = sum(
        p * (m ** 2)
        for p, m in zip(probabilities, table)
    )

    variance = second_moment - rtp ** 2
    std_dev = sqrt(variance)

    return {
        "rtp": rtp,
        "house_edge": 1 - rtp,
        "variance": variance,
        "std_dev": std_dev,
    }


HIGH_RISK_8_TABLE = [
    24.984, 3.897, 1.599, 0.29, 0.2, 0.29, 1.599, 3.897, 24.984
]

HIGH_RISK_10_TABLE = [
    54.363, 12.081, 2.617, 1.007, 0.292, 0.171, 0.292, 1.007, 2.617, 12.081, 54.363
]

HIGH_RISK_12_TABLE = [
    140.065, 28.013, 5.202, 1.901, 0.8, 0.34, 0.18, 0.34, 0.8, 1.901, 5.202, 28.013, 140.065
]

HIGH_RISK_14_TABLE = [
    343.18, 58.542, 10.094, 3.634, 1.615, 0.737, 0.373, 0.192, 0.373, 0.737, 1.615, 3.634, 10.094, 58.542, 343.18
]

HIGH_RISK_16_TABLE = [
    894.293, 119.239, 19.873, 5.962, 2.981, 1.292, 0.795, 0.397, 0.199, 0.397, 0.795, 1.292, 2.981, 5.962, 19.873, 119.239, 894.293
]

MEDIUM_RISK_8_TABLE = [
    10.971, 3.092, 1.297, 0.688, 0.389, 0.688, 1.297, 3.092, 10.971
]

MEDIUM_RISK_10_TABLE = [
    18.962, 6.786, 2.295, 1.098, 0.629, 0.339, 0.629, 1.098, 2.295, 6.786, 18.962
]

MEDIUM_RISK_12_TABLE = [
    34.538, 14.221, 3.86, 1.828, 1.016, 0.589, 0.335, 0.589, 1.016, 1.828, 3.86, 14.221, 34.538
]

MEDIUM_RISK_14_TABLE = [
    60.598, 27.269, 6.262, 3.131, 1.717, 1.01, 0.505, 0.313, 0.505, 1.01, 1.717, 3.131, 6.262, 27.269, 60.598
]

MEDIUM_RISK_16_TABLE = [
    110.033, 50.015, 10.003, 4.501, 2.901, 1.5, 1.1, 0.4, 0.3, 0.4, 1.1, 1.5, 2.901, 4.501, 10.003, 50.015, 110.033
]

LOW_RISK_8_TABLE = [
    5.457, 2.084, 1.091, 0.972, 0.486, 0.972, 1.091, 2.084, 5.457
]

LOW_RISK_10_TABLE = [
    7.318, 3.208, 1.504, 1.103, 0.942, 0.471, 0.942, 1.103, 1.504, 3.208, 7.318
]

LOW_RISK_12_TABLE = [
    9.834, 4.866, 1.825, 1.217, 1.115, 0.963, 0.466, 0.963, 1.115, 1.217, 1.825, 4.866, 9.834
]

LOW_RISK_14_TABLE = [
    13.094, 6.749, 2.015, 1.511, 1.209, 1.108, 0.977, 0.433, 0.977, 1.108, 1.209, 1.511, 2.015, 6.749, 13.094
]

LOW_RISK_16_TABLE = [
    16.001, 9.001, 2.0, 1.7, 1.3, 1.2, 1.1, 1.0, 0.4, 1.0, 1.1, 1.2, 1.3, 1.7, 2.0, 9.001, 16.001
]


TABLES = {
    8: {
        "HIGH": HIGH_RISK_8_TABLE,
        "MEDIUM": MEDIUM_RISK_8_TABLE,
        "LOW": LOW_RISK_8_TABLE,
    },
    10: {
        "HIGH": HIGH_RISK_10_TABLE,
        "MEDIUM": MEDIUM_RISK_10_TABLE,
        "LOW": LOW_RISK_10_TABLE,
    },
    12: {
        "HIGH": HIGH_RISK_12_TABLE,
        "MEDIUM": MEDIUM_RISK_12_TABLE,
        "LOW": LOW_RISK_12_TABLE,
    },
    14: {
        "HIGH": HIGH_RISK_14_TABLE,
        "MEDIUM": MEDIUM_RISK_14_TABLE,
        "LOW": LOW_RISK_14_TABLE,
    },
    16: {
        "HIGH": HIGH_RISK_16_TABLE,
        "MEDIUM": MEDIUM_RISK_16_TABLE,
        "LOW": LOW_RISK_16_TABLE,
    }
}


print("-" * 95)
print(
    f"{'ROWS':<8}"
    f"{'RISK':<10}"
    f"{'RTP %':>12}"
    f"{'EDGE %':>12}"
    f"{'VARIANCE':>15}"
    f"{'STD DEV':>15}"
)
print("-" * 95)

for rows, risks in TABLES.items():

    for risk_name, table in risks.items():

        stats = calculate_rtp_and_variance(
            rows,
            table
        )

        print(
            f"{rows:<8}"
            f"{risk_name:<10}"
            f"{stats['rtp'] * 100:>11.2f}%"
            f"{stats['house_edge'] * 100:>11.2f}%"
            f"{stats['variance']:>15.4f}"
            f"{stats['std_dev']:>15.4f}"
        )

print("-" * 95)