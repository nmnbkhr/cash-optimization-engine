"""
Copilot Grounding (Phase 4 — no-free-invention narration)
=========================================================
The "Ask AI" copilot must explain a recommendation using ONLY the structured facts the
oversight layer already produced: the SHAP attribution, the Cash Constitution result, and
the conformal band_pct. It may not invent numbers, regulations, or causes.

This module builds (system_prompt, user_facts) from those stored fields and routes them
through the existing app.core.ai_client dispatcher. The system prompt hard-constrains the
LLM to the supplied facts. With NO LLM backend reachable, `explain()` returns a
DETERMINISTIC template assembled from the very same fields — identical grounding, no model.

The generic ai_client dispatcher is intentionally left prompt-agnostic; grounding lives
here so the constraint travels with the facts. Amounts in PKR Millions.
"""
from __future__ import annotations

import json

import pandas as pd

from app.core.ai_client import ask_ai
from app.core.cash_constitution import CONSTITUTION
from app.services.forecast_attribution import attribution_for_branch, format_drivers

GROUNDED_SYSTEM_PROMPT = (
    "You are a treasury copilot for United Bank Limited. Explain the cash recommendation "
    "below to a branch manager in 2-4 sentences. CRITICAL RULES: use ONLY the figures and "
    "facts in the JSON provided. Do NOT invent any number, rate, regulation, date, or cause "
    "that is not present. All amounts are PKR Millions. If the constitution status is BLOCKED, "
    "lead with the block reason. Always state the forecast uncertainty (band) plainly. Do not "
    "give advice beyond what the drivers and constitution support."
)


def _gather_facts(branch_id: str, origin_date: str | None = None) -> dict:
    """Assemble the grounding facts for one branch from existing oversight outputs."""
    origin = pd.Timestamp(origin_date) if origin_date else None
    attr = attribution_for_branch(branch_id, origin_dt=origin)
    if "path" not in attr or not attr["path"]:
        return {"branch_id": branch_id, "error": attr.get("error", "no forecast")}

    # constitution check on the h=1 forecast as a vault level (consistent with the queue)
    h1 = attr["path"][0]
    rec = CONSTITUTION.enforce({"vault_balance_m": h1["predicted_m"]},
                               {"action": "FORECAST_LEVEL"})
    return {
        "branch_id": branch_id,
        "origin_date": attr["origin_date"],
        "model_version": attr["model_version"],
        "horizons": [
            {"horizon": p["horizon"], "predicted_m": p["predicted_m"],
             "band_pct": p["band_pct"],
             "top_drivers": [{"label": d["label"], "pct": d["pct"],
                              "contribution_m": d["contribution_m"]} for d in p["drivers"]]}
            for p in attr["path"]
        ],
        "constitution_status": rec["constitution_status"],
        "constitution_violations": rec["constitution_violations"],
    }


def _deterministic_template(facts: dict) -> str:
    """Narrative built purely from the facts — the no-LLM grounding fallback."""
    if "error" in facts:
        return f"No forecast available for {facts['branch_id']}: {facts['error']}."
    h1 = facts["horizons"][0]
    h7 = facts["horizons"][-1]
    drv = format_drivers([{"label": d["label"], "pct": d["pct"],
                           "contribution_m": d["contribution_m"]} for d in h1["top_drivers"]])
    status = facts["constitution_status"]
    lines = [
        f"Branch {facts['branch_id']}: managed cash level is forecast at "
        f"{h1['predicted_m']:.1f} M tomorrow (±{h1['band_pct']:.0f}% band), "
        f"moving to {h7['predicted_m']:.1f} M by day 7 (±{h7['band_pct']:.0f}%).",
        f"Main drivers ({drv}).",
    ]
    if status == "BLOCKED":
        rules = ", ".join(v["rule"] for v in facts["constitution_violations"]
                          if v["severity"] == "hard")
        lines.insert(0, f"BLOCKED by constitution: {rules}. Manual review required.")
    elif status == "ANNOTATED":
        soft = ", ".join(v["rule"] for v in facts["constitution_violations"])
        lines.append(f"Soft preferences noted: {soft}.")
    else:
        lines.append("All hard constraints satisfied (constitution: CLEAR).")
    if h7["band_pct"] > 50:
        lines.append("Wide uncertainty band — treat as a review item, not an auto-decision.")
    return " ".join(lines)


def explain(branch_id: str, origin_date: str | None = None) -> dict:
    """Grounded explanation. Uses the LLM if reachable, else the deterministic template.
    Either way the content is constrained to the stored attribution + constitution + band."""
    facts = _gather_facts(branch_id, origin_date)
    template = _deterministic_template(facts)

    user_content = (
        "Explain this cash recommendation using ONLY these facts (PKR Millions):\n"
        + json.dumps(facts, indent=2)
    )
    resp = ask_ai(GROUNDED_SYSTEM_PROMPT, user_content)
    if resp.get("available"):
        return {"branch_id": branch_id, "grounded": True, "source": "llm",
                "summary": resp["summary"], "facts": facts}
    # no backend -> deterministic, still fully grounded
    return {"branch_id": branch_id, "grounded": True, "source": "template",
            "summary": template, "facts": facts}
