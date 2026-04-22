import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env from project root
env_path = Path(__file__).resolve().parent.parent.parent / ".env"
load_dotenv(dotenv_path=env_path)


class Settings:
    PROJECT_NAME: str = "Cash Optimization Engine"
    VERSION: str = "1.0.0"

    # Database
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./cash_engine.db")

    # OpenAI (optional — only for "Ask AI" button)
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")

    # SBP Regulatory
    SBP_POLICY_RATE: float = float(os.getenv("SBP_POLICY_RATE", "0.11"))
    CRR_WEEKLY_AVG: float = float(os.getenv("CRR_WEEKLY_AVG", "0.06"))
    CRR_DAILY_MIN: float = float(os.getenv("CRR_DAILY_MIN", "0.04"))

    # UBL Constants
    UBL_TOTAL_BRANCHES: int = int(os.getenv("UBL_TOTAL_BRANCHES", "1547"))
    UBL_TOTAL_ATMS: int = int(os.getenv("UBL_TOTAL_ATMS", "2180"))
    UBL_DEPOSIT_BASE_TRILLIONS: float = float(os.getenv("UBL_DEPOSIT_BASE_TRILLIONS", "2.54"))

    # CORS
    CORS_ORIGINS: list = ["http://localhost:5173", "http://127.0.0.1:5173"]


settings = Settings()
