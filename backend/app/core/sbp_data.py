"""
SBP Live Data Service for COE
Wraps the pakfindata sbp_easydata.py scraper.
Provides convenience methods for business_output.py.
Falls back to constants if API/cache unavailable.

3 modes:
1. CACHED: reads from pre-downloaded CSVs in data/sbp_cache/series/ (instant)
2. LIVE: calls EasyData API directly (rate-limited, 15s delay)
3. FALLBACK: returns constants.py values
"""

import logging
from datetime import date, timedelta

logger = logging.getLogger(__name__)

# Fallback rates from constants
_FALLBACK_POLICY_RATE = 0.105
_FALLBACK_FX = {
    "USD": 278.50, "EUR": 305.0, "GBP": 355.0, "AED": 75.85,
    "SAR": 74.20, "JPY": 1.85, "CNY": 38.50, "CHF": 320.0,
}


def _try_import():
    """Lazy import of sbp_easydata — only fails if file is missing."""
    try:
        from app.core.sbp_easydata import (
            get_kibor, get_policy_rate, get_daily_fx,
            get_exchange_rate, get_walr, get_cpi,
            read_series, sync_all_to_db,
        )
        return {
            "get_kibor": get_kibor,
            "get_policy_rate": get_policy_rate,
            "get_daily_fx": get_daily_fx,
            "get_exchange_rate": get_exchange_rate,
            "get_walr": get_walr,
            "get_cpi": get_cpi,
            "read_series": read_series,
            "sync_all_to_db": sync_all_to_db,
        }
    except Exception as e:
        logger.warning(f"sbp_easydata import failed: {e}")
        return None


class SBPDataService:
    """Thin layer over pakfindata scraper."""

    def __init__(self):
        self._api = _try_import()
        self._cache = {}

    @property
    def available(self) -> bool:
        return self._api is not None

    def get_overnight_kibor(self) -> float:
        """Latest 6M KIBOR offer rate (proxy for overnight opportunity cost)."""
        if "kibor" in self._cache:
            return self._cache["kibor"]

        if self._api:
            try:
                # Try cached CSV first (no API call)
                # KIBOR0030 = Six-Months KIBOR Offer Rate
                data = self._api["read_series"]("TS_GP_BAM_SIRKIBOR_D.KIBOR0030")
                if data:
                    # CSV is reverse-chronological, find most recent
                    val = data[0]["value"] / 100
                    self._cache["kibor"] = val
                    return val

                # Try live API
                rates = self._api["get_kibor"](
                    tenor="6M",
                    start_date=(date.today() - timedelta(days=30)).isoformat(),
                )
                if rates:
                    val = rates[-1][1] / 100
                    self._cache["kibor"] = val
                    return val
            except Exception as e:
                logger.warning(f"KIBOR fetch failed: {e}")

        return _FALLBACK_POLICY_RATE

    def get_policy_rate_current(self) -> float:
        """Current SBP policy rate."""
        if "policy" in self._cache:
            return self._cache["policy"]

        if self._api:
            try:
                data = self._api["read_series"]("TS_GP_IR_SIRPR_AH.SBPOL0030")
                if data:
                    val = data[0]["value"] / 100  # first record = most recent
                    self._cache["policy"] = val
                    return val

                rates = self._api["get_policy_rate"](
                    start_date=(date.today() - timedelta(days=90)).isoformat(),
                )
                if rates:
                    val = rates[-1][1] / 100
                    self._cache["policy"] = val
                    return val
            except Exception as e:
                logger.warning(f"Policy rate fetch failed: {e}")

        return _FALLBACK_POLICY_RATE

    # EasyData series keys for daily FX (PKR per currency)
    _FX_SERIES = {
        "USD": "TS_GP_ES_FADERPKR_M.XRDAVG0220",
        "EUR": "TS_GP_ES_FADERPKR_M.XRDAVG0230",
        "GBP": "TS_GP_ES_FADERPKR_M.XRDAVG0210",
        "AED": "TS_GP_ES_FADERPKR_M.XRDAVG0200",
        "SAR": "TS_GP_ES_FADERPKR_M.XRDAVG0170",
        "JPY": "TS_GP_ES_FADERPKR_M.XRDAVG0070",
        "CNY": "TS_GP_ES_FADERPKR_M.XRDAVG0040",
    }

    def get_fx_rate(self, currency: str = "USD") -> float:
        """Latest PKR per unit of foreign currency. Uses cached CSV only."""
        cache_key = f"fx_{currency}"
        if cache_key in self._cache:
            return self._cache[cache_key]

        if self._api:
            # Try cached CSV first (instant, no API call)
            series_key = self._FX_SERIES.get(currency.upper())
            if series_key:
                try:
                    data = self._api["read_series"](series_key)
                    if data:
                        val = data[0]["value"]
                        self._cache[cache_key] = val
                        return val
                except Exception as e:
                    logger.warning(f"FX CSV read failed for {currency}: {e}")

        return _FALLBACK_FX.get(currency.upper(), 278.50)

    # KIBOR curve series keys (offer rates)
    _KIBOR_TENORS = {
        "1W":  "TS_GP_BAM_SIRKIBOR_D.1KIBOR1W",
        "2W":  "TS_GP_BAM_SIRKIBOR_D.2KIBOR2W",
        "6M":  "TS_GP_BAM_SIRKIBOR_D.KIBOR0030",
        "9M":  "TS_GP_BAM_SIRKIBOR_D.6KIBOR9M",
        "12M": "TS_GP_BAM_SIRKIBOR_D.7KIBOR12M",
    }

    def get_kibor_curve(self) -> dict:
        """Full KIBOR yield curve — from cached CSVs only."""
        if "curve" in self._cache:
            return self._cache["curve"]

        curve = {}
        if self._api:
            for label, key in self._KIBOR_TENORS.items():
                try:
                    data = self._api["read_series"](key)
                    if data:
                        curve[label] = data[0]["value"]
                except Exception:
                    pass
            if curve:
                self._cache["curve"] = curve

        return curve

    def get_weighted_avg_lending(self) -> float:
        """Industry weighted average lending rate — from cached CSV."""
        if self._api:
            try:
                data = self._api["read_series"]("TS_GP_BAM_SIRWALDR_M.WALD0010")
                if data:
                    return data[0]["value"] / 100
            except Exception:
                pass
        return 0.15

    def get_cpi_latest(self) -> float:
        """Latest CPI inflation YoY % — from cached CSV."""
        if self._api:
            try:
                data = self._api["read_series"]("TS_GP_PT_CPI_M.P00011516")
                if data:
                    return data[0]["value"]
            except Exception:
                pass
        return 10.0

    def get_all_rates_summary(self) -> dict:
        """Everything in one call — for dashboard display."""
        return {
            "as_of": str(date.today()),
            "data_source": "SBP EasyData" if self.available else "Fallback Constants",
            "kibor_6m": round(self.get_overnight_kibor() * 100, 2),
            "policy_rate": round(self.get_policy_rate_current() * 100, 2),
            "kibor_curve": self.get_kibor_curve(),
            "fx": {
                "USD": self.get_fx_rate("USD"),
                "EUR": self.get_fx_rate("EUR"),
                "GBP": self.get_fx_rate("GBP"),
                "AED": self.get_fx_rate("AED"),
                "SAR": self.get_fx_rate("SAR"),
            },
            "weighted_avg_lending": round(self.get_weighted_avg_lending() * 100, 2),
            "cpi_yoy": self.get_cpi_latest(),
        }


# Singleton
_service = None


def get_sbp_service() -> SBPDataService:
    global _service
    if _service is None:
        _service = SBPDataService()
    return _service
