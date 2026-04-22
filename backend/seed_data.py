"""Seed the database with synthetic UBL data."""
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from app.database import init_db, engine, Base
from app.services.data_generator import generate_all


def main():
    print("Initializing database...")
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    print("Generating synthetic UBL data...")
    print("This will create:")
    print("  - 1,547 branches across Pakistan")
    print("  - 365 days of vault positions per branch")
    print("  - 2,180 ATMs with cassette data")
    print("  - CRR positions, Nostro/Vostro accounts")
    print("  - Denomination inventories")
    print()

    stats = generate_all()

    print("\nSeeding complete!")
    for key, value in stats.items():
        print(f"  {key}: {value:,}")


if __name__ == "__main__":
    main()
