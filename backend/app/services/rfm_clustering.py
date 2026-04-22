"""
RFM Customer Clustering for Digital Shift Targeting
════════════════════════════════════════════════════
Clusters customers by cash transaction behavior to identify
migration targets. Based on SBI/HDFC digital adoption playbook.

Uses fact_transactions table (4.5M rows, 10% sample of actual).
"""

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler
from datetime import date
import logging

logger = logging.getLogger(__name__)


class RFMClustering:
    """Segment customers by cash transaction patterns."""

    def __init__(self, db_path: str = None):
        import sqlite3
        from pathlib import Path
        if db_path is None:
            db_path = str(Path(__file__).resolve().parent.parent.parent / "cash_engine.db")
        self.con = sqlite3.connect(db_path)
        self.n_clusters = 5

    def compute_rfm(self) -> dict:
        """Compute RFM metrics and cluster customers."""

        # Load cash transactions only
        logger.info("Loading transactions...")
        txn = pd.read_sql_query(
            "SELECT cust_id, date, amount_m, txn_type, channel FROM fact_transactions WHERE txn_type IN ('cash_in', 'cash_out')",
            self.con
        )

        if txn.empty:
            return {"error": "No transaction data. Run: make seed-cdm"}

        txn["date_dt"] = pd.to_datetime(txn["date"])
        ref_date = txn["date_dt"].max()

        logger.info(f"Computing RFM for {txn['cust_id'].nunique()} customers...")

        # RFM per customer
        rfm = txn.groupby("cust_id").agg(
            recency=("date_dt", lambda x: (ref_date - x.max()).days),
            frequency=("cust_id", "count"),
            monetary=("amount_m", "sum"),
            avg_amount=("amount_m", "mean"),
            cash_in_count=("txn_type", lambda x: (x == "cash_in").sum()),
            cash_out_count=("txn_type", lambda x: (x == "cash_out").sum()),
            counter_pct=("channel", lambda x: (x == "counter").mean()),
        ).reset_index()

        # Standardize for clustering
        features = ["recency", "frequency", "monetary"]
        scaler = StandardScaler()
        X = scaler.fit_transform(rfm[features].values)

        # KMeans clustering
        km = KMeans(n_clusters=self.n_clusters, random_state=42, n_init=10)
        rfm["cluster"] = km.fit_predict(X)

        # Label clusters by behavior
        cluster_stats = rfm.groupby("cluster").agg(
            count=("cust_id", "count"),
            avg_recency=("recency", "mean"),
            avg_frequency=("frequency", "mean"),
            avg_monetary=("monetary", "mean"),
            avg_amount=("avg_amount", "mean"),
            avg_counter_pct=("counter_pct", "mean"),
        ).reset_index()

        # Sort by frequency descending (most active cash users first)
        cluster_stats = cluster_stats.sort_values("avg_frequency", ascending=False).reset_index(drop=True)

        # Assign labels based on behavior
        labels = [
            "Cash Addicts (Very High Frequency)",
            "Habitual Cash Users (High Frequency)",
            "Regular Cash Users (Moderate)",
            "Occasional Cash Users (Low Frequency)",
            "Digital-Leaning (Minimal Cash)",
        ]

        segments = []
        for i, row in cluster_stats.iterrows():
            label = labels[i] if i < len(labels) else f"Segment {i}"

            # Migration ROI: cost to migrate vs perpetual cash handling cost saved
            cash_handling_cost_per_txn = 0.000095  # PKR 95 per txn in millions
            digital_cost_per_txn = 0.000008  # PKR 8 per txn
            saving_per_txn = cash_handling_cost_per_txn - digital_cost_per_txn

            annual_cash_cost = row["avg_frequency"] * 12 * cash_handling_cost_per_txn * row["count"]
            annual_saving_if_migrated = row["avg_frequency"] * 12 * saving_per_txn * row["count"]
            migration_cost = row["count"] * 0.0005  # PKR 500 per customer campaign cost
            roi_months = migration_cost / max(annual_saving_if_migrated / 12, 0.001)

            segments.append({
                "cluster": int(row["cluster"]),
                "label": label,
                "customer_count": int(row["count"]),
                "avg_recency_days": round(row["avg_recency"], 1),
                "avg_monthly_txns": round(row["avg_frequency"] / 1, 1),  # already monthly from 30d data
                "avg_total_amount_m": round(row["avg_monetary"], 3),
                "avg_txn_amount_m": round(row["avg_amount"], 4),
                "counter_reliance_pct": round(row["avg_counter_pct"] * 100, 1),
                "annual_cash_handling_cost_m": round(annual_cash_cost, 2),
                "annual_saving_if_migrated_m": round(annual_saving_if_migrated, 2),
                "migration_cost_m": round(migration_cost, 2),
                "roi_payback_months": round(roi_months, 1),
                "recommendation": (
                    "HIGH PRIORITY -- dedicated migration program" if i == 0 else
                    "TARGET -- fee-based nudge to digital" if i == 1 else
                    "MODERATE -- gentle digital incentive" if i == 2 else
                    "LOW -- occasional reminders" if i == 3 else
                    "SKIP -- already digital-leaning"
                ),
            })

        total_customers = int(rfm.shape[0])
        total_annual_cost = sum(s["annual_cash_handling_cost_m"] for s in segments)
        total_saving = sum(s["annual_saving_if_migrated_m"] for s in segments[:3])  # Top 3 segments

        return {
            "total_customers": total_customers,
            "segments": segments,
            "summary": {
                "total_annual_cash_cost_m": round(total_annual_cost, 2),
                "top3_migration_saving_m": round(total_saving, 2),
                "target_customers": sum(s["customer_count"] for s in segments[:3]),
                "target_pct": round(sum(s["customer_count"] for s in segments[:3]) / total_customers * 100, 1),
            },
            "method": "KMeans RFM Clustering (k=5)",
            "data_source": f"fact_transactions ({txn.shape[0]:,} cash transactions)",
            "narrative": (
                f"Segmented {total_customers:,} customers into 5 RFM clusters. "
                f"Top 3 segments ({sum(s['customer_count'] for s in segments[:3]):,} customers) "
                f"represent PKR {total_saving:.1f}M/year in migration savings. "
                f"Priority: {segments[0]['label']} ({segments[0]['customer_count']:,} customers)."
            ),
        }


# Singleton
_rfm = None

def get_rfm_service() -> RFMClustering:
    global _rfm
    if _rfm is None:
        _rfm = RFMClustering()
    return _rfm
