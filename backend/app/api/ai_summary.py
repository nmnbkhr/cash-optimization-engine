"""
One endpoint handles AI summaries for ALL use cases.
Called only when user explicitly clicks "Ask AI" button.
Receives pre-computed optimization results, sends compact summary to GPT.
"""
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
from app.core.ai_client import ask_ai

router = APIRouter(prefix="/api", tags=["ai"])

SYSTEM_PROMPTS = {
    "uc01": "You are a senior bank treasury analyst. Given pre-computed optimization results for a Pakistani bank branch, write a 4-5 sentence executive brief. Include: risk assessment, key action, expected savings. Be specific with numbers. Do NOT recompute anything — just narrate the provided results clearly.",
    "uc02": "You are an ATM operations expert. Given pre-computed ATM replenishment optimization results, write a 4-5 sentence executive brief. Focus on: stockout risk, cost savings, recommended action. Be specific with numbers.",
    "uc03": "You are a cash logistics strategist. Given pre-computed inter-branch netting results, write a 4-5 sentence executive brief. Focus on: netting savings, optimal routes, network efficiency.",
    "uc04": "You are a regulatory compliance specialist. Given pre-computed CRR float engineering results, write a 4-5 sentence brief. Focus on: freed liquidity, compliance risk, overnight deployment opportunity.",
    "uc05": "You are a nostro/correspondent banking expert. Given pre-computed nostro optimization results, write a 4-5 sentence brief. Focus on: excess balance reduction, FX exposure, yield improvement.",
    "uc06": "You are a vostro liability specialist. Given pre-computed vostro optimization results, write a 4-5 sentence brief. Focus on: liquidity-at-risk, stable portion deployment, yield opportunity.",
    "uc07": "You are a denomination management expert. Given pre-computed denomination mix optimization results, write a 4-5 sentence brief. Focus on: mismatch reduction, SBP penalty avoidance, operational efficiency.",
    "uc08": "You are a CIT logistics optimizer. Given pre-computed CIT routing results, write a 4-5 sentence brief. Focus on: route efficiency, cost reduction, fleet utilization.",
    "uc09": "You are a digital banking strategist. Given pre-computed digital channel incentivization results, write a 4-5 sentence brief. Focus on: conversion rate, budget efficiency, segment targeting.",
    "uc10": "You are a financial controller. Given pre-computed cash P&L attribution results, write a 4-5 sentence brief. Focus on: cost drivers, branch rankings, transfer pricing impact.",
}


class AISummaryRequest(BaseModel):
    use_case: str
    context: dict
    question: Optional[str] = None


class AISummaryResponse(BaseModel):
    summary: str
    available: bool


@router.post("/ai-summary", response_model=AISummaryResponse)
async def get_ai_summary(request: AISummaryRequest):
    system_prompt = SYSTEM_PROMPTS.get(
        request.use_case,
        "You are a senior financial analyst. Summarize the provided pre-computed results in 4-5 sentences."
    )

    user_content = str(request.context)
    if request.question:
        user_content += f"\n\nUser question: {request.question}"

    result = ask_ai(system_prompt, user_content)
    return AISummaryResponse(**result)


@router.get("/ai-summary/status")
async def ai_status():
    from app.core.ai_client import get_client
    available = get_client() is not None
    return {"available": available}
