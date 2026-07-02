"""Pre-train and persist the UC-01 managed-level (T3) forecast artifact.

Run this once (e.g. in `make setup`) so the first "Run Forecast" click loads the model
in ~5s instead of triggering a ~100s cold train inside the HTTP request.

    python -m scripts.train_forecast          # from backend/ with the `coe` env active
    make forecast-train                        # from repo root
"""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.services.managed_level_forecast import get_service, ARTIFACT_PATH  # noqa: E402


def main() -> None:
    t0 = time.time()
    svc = get_service(force_retrain=True)          # train + save artifact
    dt = time.time() - t0
    chk = svc.forecast_path(branch_ids=["ABB-001"])[0]["path"][0]["predicted"]
    print(f"trained + saved in {dt:.0f}s -> {ARTIFACT_PATH}")
    print(f"reproduce check: ABB-001 h1 = {chk} (expected 40.342)")


if __name__ == "__main__":
    main()
