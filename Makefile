.PHONY: setup seed backend frontend dev migrate clean migrate-demo restore-initial forecast-train

setup:
	conda create -n coe python=3.11 -y || true
	conda run -n coe pip install -r backend/requirements.txt
	cd frontend && npm install
	cd backend && conda run -n coe python -c "from app.database import init_db; init_db()"
	@echo "Setup complete. Run 'make seed' to populate database."

seed:
	cd backend && conda run -n coe python seed_data.py

forecast-train:
	cd backend && conda run -n coe python -m scripts.train_forecast

backend:
	cd backend && conda run -n coe python -m uvicorn app.main:app --reload --port 8000

frontend:
	cd frontend && npm run dev

dev:
	@echo "Starting backend and frontend..."
	$(MAKE) backend &
	$(MAKE) frontend &
	wait

migrate:
	cd backend && conda run -n coe alembic upgrade head

migrate-demo:
	cd backend && conda run -n coe python migrate_demo_data.py

restore-initial:
	cd backend && conda run -n coe python migrate_demo_data.py --restore

clean:
	rm -f backend/cash_engine.db
	rm -rf backend/models/*.pt
	@echo "Cleaned database and model files."

red-team:
	cd backend && conda run -n coe python -m app.services.red_team

constitution-test:
	cd backend && conda run -n coe python -m pytest tests/test_cash_constitution.py -v

contract-test:
	cd backend && conda run -n coe python -m pytest tests/test_uc10_data_source_contract.py -v

daily-run:
	cd backend && conda run -n coe python -c "from app.services.daily_runner import DailyRunner; import json; print(json.dumps(DailyRunner().run_morning_cycle(), indent=2))"

generate-alerts:
	cd backend && conda run -n coe python -c "import requests; r=requests.post('http://localhost:8000/api/business/alerts/generate'); print(r.json())"

enrich-branches:
	cd backend && conda run -n coe python enrich_branches.py

seed-cdm:
	cd backend && conda run -n coe python -c "from app.services.reconciling_generator import seed_reconciled_data; seed_reconciled_data()"

sbp-fetch:
	cd backend && conda run -n coe python -c "from app.core.sbp_easydata import cmd_fetch_priority; cmd_fetch_priority()"

sbp-update:
	cd backend && conda run -n coe python -c "from app.core.sbp_easydata import cmd_update; cmd_update()"

sbp-status:
	cd backend && conda run -n coe python -c "from app.core.sbp_easydata import cmd_status; cmd_status()"

sbp-sync-db:
	cd backend && conda run -n coe python -c "import sqlite3; from app.core.sbp_easydata import sync_all_to_db; con = sqlite3.connect('cash_engine.db'); print(sync_all_to_db(con)); con.close()"
