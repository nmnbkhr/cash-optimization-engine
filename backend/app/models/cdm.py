"""FSDM Common Data Model — dimension and fact tables for COE analytics."""

from sqlalchemy import Column, Integer, String, Float, Boolean

from app.database import Base


class DimMarket(Base):
    __tablename__ = "dim_market"

    id = Column(Integer, primary_key=True, autoincrement=True)
    date = Column(String, index=True)
    kibor_overnight = Column(Float)
    kibor_3m = Column(Float)
    kibor_6m = Column(Float)
    sbp_policy_rate = Column(Float)
    tbill_3m_yield = Column(Float)
    usd_pkr = Column(Float)
    eur_pkr = Column(Float)
    gbp_pkr = Column(Float)
    aed_pkr = Column(Float)
    sar_pkr = Column(Float)
    cpi_yoy = Column(Float)
    holiday_flag = Column(Boolean, default=False)
    is_friday = Column(Boolean, default=False)
    is_salary_day = Column(Boolean, default=False)
    is_eid_window = Column(Boolean, default=False)
    is_ramadan = Column(Boolean, default=False)

    def __repr__(self):
        return f"<DimMarket {self.date}>"


class FactGLDaily(Base):
    __tablename__ = "fact_gl_daily"

    id = Column(Integer, primary_key=True, autoincrement=True)
    date = Column(String, index=True)
    branch_id = Column(String, index=True)
    opening_balance_m = Column(Float)
    total_deposit_flow_m = Column(Float)
    total_withdrawal_flow_m = Column(Float)
    closing_balance_m = Column(Float)
    idle_cash_m = Column(Float)
    crr_required_m = Column(Float)
    crr_held_m = Column(Float)
    total_deposits_m = Column(Float)
    casa_deposits_m = Column(Float)
    term_deposits_m = Column(Float)
    interest_income_m = Column(Float)
    interest_expense_m = Column(Float)
    fee_income_m = Column(Float)
    personnel_cost_m = Column(Float)
    premises_cost_m = Column(Float)
    direct_cost_m = Column(Float)
    other_cost_m = Column(Float)
    cash_handling_cost_m = Column(Float)
    cit_cost_m = Column(Float)
    insurance_cost_m = Column(Float)

    def __repr__(self):
        return f"<FactGLDaily {self.date} branch={self.branch_id}>"


class FactTransaction(Base):
    __tablename__ = "fact_transactions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    txn_id = Column(String, unique=True, index=True)
    timestamp = Column(String)
    date = Column(String, index=True)
    branch_id = Column(String, index=True)
    cust_id = Column(String, index=True)
    txn_type = Column(String)  # cash_in, cash_out, atm_withdrawal, transfer, bill_payment
    amount_m = Column(Float)
    channel = Column(String)  # counter, atm, cdm, mobile, raast, cheque, transfer_in
    is_peak_event = Column(Boolean, default=False)
    denomination_hint = Column(String, nullable=True)

    def __repr__(self):
        return f"<FactTransaction {self.txn_id}>"


class CDMDevice(Base):
    """Cash Deposit Machine — per PSP&OD Circular Letter No. 01 of 2025."""
    __tablename__ = "cdm_devices"

    id = Column(Integer, primary_key=True, autoincrement=True)
    branch_id = Column(String, index=True)
    cdm_type = Column(String)           # basic_deposit, recycler
    status = Column(String)             # installed, planned, none
    installed_date = Column(String, nullable=True)
    monthly_deposits_m = Column(Float, default=0)
    recycling_ratio = Column(Float, default=0)
    notes_authenticated = Column(Integer, default=0)
    cctv_compliant = Column(Boolean, default=True)
    biometric_enabled = Column(Boolean, default=False)
