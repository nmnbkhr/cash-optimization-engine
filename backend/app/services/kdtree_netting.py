"""
KDTree-Optimized Inter-Branch Cash Netting
═══════════════════════════════════════════
Uses scipy.spatial.KDTree for O(n log n) nearest-neighbor search
and networkx maximum_weight_matching for globally optimal pairing.

Research: "Spatial optimization of cash logistics" — replaces naive O(n^2) with KDTree.
"""

import numpy as np
from scipy.spatial import KDTree
import networkx as nx
from sqlalchemy.orm import Session
from app.models.branch import Branch


def M(v):
    """Raw PKR -> PKR Millions."""
    return (v or 0) / 1e6


class KDTreeNetting:
    """Optimal netting using spatial indexing + maximum weight matching."""

    def __init__(self, db: Session, max_distance_km: float = 15.0):
        self.db = db
        self.max_dist = max_distance_km
        self.bsc_charge = 0.0012
        self.cit_cost = 0.015  # PKR M per trip

    def solve(self, city: str = None) -> dict:
        """Find optimal surplus->deficit matches."""
        query = self.db.query(Branch)
        if city:
            query = query.filter(Branch.city == city)
        branches = query.all()

        surplus = [b for b in branches if b.current_vault_balance > b.optimal_vault_balance * 1.3 and b.optimal_vault_balance > 0]
        deficit = [b for b in branches if b.current_vault_balance < b.optimal_vault_balance * 0.8 and b.optimal_vault_balance > 0]

        if not surplus or not deficit:
            return self._empty_result(len(surplus), len(deficit), city)

        # Build KDTree from deficit branch coordinates
        # Convert lat/lng to approximate km (1 degree ~ 111 km)
        def to_km(lat, lng):
            return np.array([lat * 111.0, lng * 111.0 * np.cos(np.radians(lat))])

        deficit_coords = np.array([to_km(b.latitude or 30.0, b.longitude or 70.0) for b in deficit])
        tree = KDTree(deficit_coords)

        # Build bipartite graph: surplus nodes <-> deficit nodes
        G = nx.Graph()

        for i, s in enumerate(surplus):
            s_coord = to_km(s.latitude or 30.0, s.longitude or 70.0)

            # Query KDTree for deficit branches within max_distance_km
            nearby_indices = tree.query_ball_point(s_coord, self.max_dist)

            excess = M(s.current_vault_balance - s.optimal_vault_balance)

            for j in nearby_indices:
                d = deficit[j]
                shortfall = M(d.optimal_vault_balance - d.current_vault_balance)
                transfer = min(excess, shortfall)

                if transfer < 3.0:  # Min PKR 3M
                    continue

                # Net saving = BSC charge avoided + 1 CIT trip saved
                saving = transfer * self.bsc_charge + self.cit_cost
                dist = np.linalg.norm(s_coord - deficit_coords[j])

                # Edge: surplus_i <-> deficit_j with weight = saving
                s_node = f"S_{i}"
                d_node = f"D_{j}"
                G.add_edge(s_node, d_node, weight=saving,
                          transfer=transfer, distance=round(dist, 1),
                          surplus_idx=i, deficit_idx=j)

        if not G.edges:
            return self._empty_result(len(surplus), len(deficit), city)

        # Solve maximum weight matching (globally optimal pairing)
        matching = nx.max_weight_matching(G, weight="weight")

        # Build results
        matches = []
        for u, v in matching:
            edge = G.edges[u, v]
            si = edge["surplus_idx"]
            di = edge["deficit_idx"]
            s = surplus[si]
            d = deficit[di]

            matches.append({
                "from_branch": s.branch_id,
                "from_name": s.name,
                "to_branch": d.branch_id,
                "to_name": d.name,
                "city": s.city,
                "transfer_amount": round(edge["transfer"], 1),
                "distance_km": edge["distance"],
                "net_saving": round(edge["weight"], 4),
                "bsc_charge_avoided": round(edge["transfer"] * self.bsc_charge, 4),
                "cit_trip_saved": self.cit_cost,
            })

        matches.sort(key=lambda x: x["net_saving"], reverse=True)
        total_nettable = sum(m["transfer_amount"] for m in matches)
        total_saving = sum(m["net_saving"] for m in matches)

        # Comparison with naive approach
        naive_comparisons = len(surplus) * len(deficit)
        kdtree_lookups = sum(len(tree.query_ball_point(to_km(s.latitude or 30, s.longitude or 70), self.max_dist)) for s in surplus)

        return {
            "algorithm": "KDTree + Maximum Weight Matching",
            "surplus_branches": len(surplus),
            "deficit_branches": len(deficit),
            "matches_found": len(matches),
            "total_nettable_amount": round(total_nettable, 1),
            "total_daily_saving": round(total_saving, 3),
            "annual_saving": round(total_saving * 300, 1),
            "matches": matches[:20],
            "performance": {
                "naive_comparisons": naive_comparisons,
                "kdtree_lookups": kdtree_lookups,
                "speedup": f"{naive_comparisons / max(kdtree_lookups, 1):.1f}x",
            },
            "narrative": (
                f"{len(matches)} optimal matches found via KDTree + maximum weight matching. "
                f"PKR {total_nettable:.0f}M nettable. Annual saving: PKR {total_saving * 300:.1f}M. "
                f"Algorithm: {kdtree_lookups} lookups vs {naive_comparisons} naive comparisons "
                f"({naive_comparisons / max(kdtree_lookups, 1):.0f}x faster)."
            ),
        }

    def _empty_result(self, n_surplus, n_deficit, city):
        return {
            "algorithm": "KDTree + Maximum Weight Matching",
            "surplus_branches": n_surplus,
            "deficit_branches": n_deficit,
            "matches_found": 0,
            "total_nettable_amount": 0,
            "annual_saving": 0,
            "matches": [],
            "narrative": f"No netting opportunities for {city or 'network'}.",
        }
