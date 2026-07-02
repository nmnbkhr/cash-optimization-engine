"""create dim_calendar

Phase 0 (AI-centric upgrade): single source of truth for the Pakistan banking
calendar. Columns mirror the keys of pk_calendar.calendar_features():
  - date            : TEXT primary key (ISO YYYY-MM-DD)
  - <FEATURE_COLUMNS>: numeric calendar features (pk_calendar.FEATURE_COLUMNS)
  - holiday_name    : TEXT
  - holiday_type    : TEXT

Revision ID: 0001_dim_calendar
Revises:
Create Date: 2026-06-16
"""
from alembic import op
import sqlalchemy as sa

# env.py inserts the backend/ dir onto sys.path, so app.* is importable here.
from app.core.pk_calendar import FEATURE_COLUMNS

# revision identifiers, used by Alembic.
revision = "0001_dim_calendar"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    columns = [sa.Column("date", sa.String(), primary_key=True)]
    columns += [sa.Column(name, sa.Integer(), nullable=True) for name in FEATURE_COLUMNS]
    columns += [
        sa.Column("holiday_name", sa.Text(), nullable=True),
        sa.Column("holiday_type", sa.Text(), nullable=True),
    ]
    op.create_table("dim_calendar", *columns)


def downgrade() -> None:
    op.drop_table("dim_calendar")
