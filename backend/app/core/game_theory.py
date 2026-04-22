"""Shared game theory engines used across multiple use cases."""
import numpy as np
from itertools import product


def find_nash_equilibria(payoff_a, payoff_b):
    """
    Find pure-strategy Nash equilibria in a two-player game.
    payoff_a, payoff_b: 2D numpy arrays (rows=player A strategies, cols=player B strategies)
    Returns list of (i, j) tuples representing Nash equilibrium strategy pairs.
    """
    rows, cols = payoff_a.shape
    equilibria = []
    for i, j in product(range(rows), range(cols)):
        # Check if i is best response to j
        if payoff_a[i, j] >= payoff_a[:, j].max():
            # Check if j is best response to i
            if payoff_b[i, j] >= payoff_b[i, :].max():
                equilibria.append((i, j))
    return equilibria


def compute_mixed_nash_2x2(payoff_a, payoff_b):
    """Compute mixed strategy Nash equilibrium for 2x2 games."""
    a = payoff_a
    b = payoff_b

    # Player B's mixing probability (makes A indifferent)
    denom_q = (a[0, 0] - a[0, 1] - a[1, 0] + a[1, 1])
    if abs(denom_q) < 1e-10:
        return None
    q = (a[1, 1] - a[0, 1]) / denom_q

    # Player A's mixing probability (makes B indifferent)
    denom_p = (b[0, 0] - b[0, 1] - b[1, 0] + b[1, 1])
    if abs(denom_p) < 1e-10:
        return None
    p = (b[1, 1] - b[1, 0]) / denom_p

    if 0 <= p <= 1 and 0 <= q <= 1:
        return {"player_a_prob": [p, 1 - p], "player_b_prob": [q, 1 - q]}
    return None


def shapley_value(characteristic_function, n_players):
    """
    Compute Shapley values for a cooperative game.
    characteristic_function: dict mapping frozenset of player indices to coalition value
    n_players: number of players
    """
    from math import factorial

    shapley = np.zeros(n_players)

    for i in range(n_players):
        for subset_mask in range(2 ** n_players):
            players_in_s = frozenset(
                j for j in range(n_players) if subset_mask & (1 << j)
            )
            if i in players_in_s:
                continue
            s_with_i = players_in_s | {i}
            s_size = len(players_in_s)

            v_s = characteristic_function.get(players_in_s, 0)
            v_s_i = characteristic_function.get(s_with_i, 0)

            weight = (factorial(s_size) * factorial(n_players - s_size - 1)) / factorial(n_players)
            shapley[i] += weight * (v_s_i - v_s)

    return shapley


def iterated_elimination(payoff_a, payoff_b):
    """
    Iterated elimination of strictly dominated strategies.
    Returns reduced game matrices and remaining strategy indices.
    """
    a = payoff_a.copy()
    b = payoff_b.copy()
    rows_remaining = list(range(a.shape[0]))
    cols_remaining = list(range(a.shape[1]))

    changed = True
    while changed:
        changed = False
        # Eliminate dominated rows (Player A)
        for i in list(rows_remaining):
            for i2 in rows_remaining:
                if i != i2:
                    idx_i = rows_remaining.index(i)
                    idx_i2 = rows_remaining.index(i2)
                    if all(a[idx_i, :] < a[idx_i2, :]):
                        rows_remaining.remove(i)
                        a = np.delete(a, idx_i, axis=0)
                        b = np.delete(b, idx_i, axis=0)
                        changed = True
                        break
            if changed:
                break

        # Eliminate dominated columns (Player B)
        for j in list(cols_remaining):
            for j2 in cols_remaining:
                if j != j2:
                    idx_j = cols_remaining.index(j)
                    idx_j2 = cols_remaining.index(j2)
                    if all(b[:, idx_j] < b[:, idx_j2]):
                        cols_remaining.remove(j)
                        a = np.delete(a, idx_j, axis=1)
                        b = np.delete(b, idx_j, axis=1)
                        changed = True
                        break
            if changed:
                break

    return a, b, rows_remaining, cols_remaining
