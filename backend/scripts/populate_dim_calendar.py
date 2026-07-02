"""
populate_dim_calendar.py — idempotent seed for the dim_calendar table.

Builds the daily Pakistan banking-calendar feature frame from
pk_calendar.build_calendar_dataframe() and UPSERTs it into dim_calendar
(INSERT OR REPLACE on the `date` primary key, so re-running is safe).

Usage (from backend/):
    conda activate coe
    python -m scripts.populate_dim_calendar
    # or: python scripts/populate_dim_calendar.py [--start 2024-01-01] [--end 2027-12-31]
"""
from __future__ import annotations

import argparse
import os
import sqlite3
import sys
from pathlib import Path

# Make `app` importable whether run as a module or a script.
_BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

from app.core.pk_calendar import FEATURE_COLUMNS, build_calendar_dataframe  # noqa: E402

DEFAULT_START = "2024-01-01"
DEFAULT_END = "2027-12-31"
DB_PATH = str(_BACKEND_DIR / "cash_engine.db")

# Column order must match the dim_calendar table definition (migration 0001).
COLUMNS = ["date"] + list(FEATURE_COLUMNS) + ["holiday_name", "holiday_type"]


def populate(start: str = DEFAULT_START, end: str = DEFAULT_END, db_path: str = DB_PATH) -> int:
    df = build_calendar_dataframe(start, end)
    df = df[COLUMNS]  # enforce table column order

    placeholders = ", ".join(["?"] * len(COLUMNS))
    col_list = ", ".join(COLUMNS)
    sql = f"INSERT OR REPLACE INTO dim_calendar ({col_list}) VALUES ({placeholders})"

    rows = [tuple(r) for r in df.itertuples(index=False, name=None)]

    conn = sqlite3.connect(db_path)
    try:
        conn.executemany(sql, rows)
        conn.commit()
        count = conn.execute("SELECT COUNT(*) FROM dim_calendar").fetchone()[0]
    finally:
        conn.close()

    print(f"dim_calendar: upserted {len(rows)} rows ({start} .. {end}); table now has {count} rows.")
    return count


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed/refresh dim_calendar (idempotent).")
    parser.add_argument("--start", default=DEFAULT_START)
    parser.add_argument("--end", default=DEFAULT_END)
    parser.add_argument("--db", default=DB_PATH)
    args = parser.parse_args()
    populate(args.start, args.end, args.db)


if __name__ == "__main__":
    main()
