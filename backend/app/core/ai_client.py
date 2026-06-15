"""
LLM dispatcher for the "Ask AI" button.

Priority chain (configurable via LLM_BACKEND in .env):
  1. Ollama (local, free, fully offline) — primary
  2. OpenAI (if OPENAI_API_KEY set)      — fallback
  3. Graceful "unavailable" message      — final fallback

Public contract (unchanged from the OpenAI-only version):
  - ask_ai(system_prompt, user_content) -> {"summary": str, "available": bool}
  - get_client() -> truthy if some LLM backend is reachable, else None

Pattern adapted from pakfindata/services/llm_client.py.
"""
from __future__ import annotations

import time
from typing import Optional

import requests

from app.config import settings


# ─── Status cache ────────────────────────────────────────────────────────────
_status_cache: dict = {"ts": 0.0, "ollama_up": False, "ollama_models": []}
_STATUS_TTL = 30.0  # seconds


def _ollama_status(force: bool = False) -> dict:
    """Check Ollama reachability + installed models. Cached for 30s."""
    now = time.time()
    if not force and (now - _status_cache["ts"]) < _STATUS_TTL:
        return _status_cache
    try:
        r = requests.get(f"{settings.OLLAMA_BASE_URL}/api/tags", timeout=2)
        if r.status_code == 200:
            _status_cache["ollama_up"] = True
            _status_cache["ollama_models"] = [m["name"] for m in r.json().get("models", [])]
        else:
            _status_cache["ollama_up"] = False
            _status_cache["ollama_models"] = []
    except Exception:
        _status_cache["ollama_up"] = False
        _status_cache["ollama_models"] = []
    _status_cache["ts"] = now
    return _status_cache


def _resolve_ollama_model() -> Optional[str]:
    """Return configured Ollama model if available, else best installed model."""
    st = _ollama_status()
    if not st["ollama_up"]:
        return None
    available = st["ollama_models"]
    if not available:
        return None
    want = settings.OLLAMA_MODEL
    if want in available:
        return want
    # Prefix match (e.g. "llama3.1" matches "llama3.1:8b")
    for m in available:
        if m.startswith(want.split(":")[0]):
            return m
    # Fall back to first installed model
    return available[0]


# ─── Backend selection ──────────────────────────────────────────────────────

def _pick_backend() -> str:
    """Returns 'ollama' | 'openai' | 'off' based on config + availability."""
    cfg = (settings.LLM_BACKEND or "auto").lower()

    if cfg == "off":
        return "off"

    if cfg == "ollama":
        return "ollama" if _resolve_ollama_model() else "off"

    if cfg == "openai":
        return "openai" if settings.OPENAI_API_KEY else "off"

    # auto: prefer ollama, fall back to openai, then off
    if _resolve_ollama_model():
        return "ollama"
    if settings.OPENAI_API_KEY:
        return "openai"
    return "off"


# ─── OpenAI client (lazy) ────────────────────────────────────────────────────
_openai_client = None


def _get_openai_client():
    global _openai_client
    if _openai_client is None and settings.OPENAI_API_KEY:
        from openai import OpenAI
        _openai_client = OpenAI(api_key=settings.OPENAI_API_KEY)
    return _openai_client


# ─── Public API ─────────────────────────────────────────────────────────────

def get_client():
    """Truthy if any LLM backend is reachable. Kept for backwards compatibility
    with existing /api/ai-summary/status endpoint."""
    return _pick_backend() != "off"


def get_status() -> dict:
    """Detailed status for the /status endpoint."""
    backend = _pick_backend()
    info = {"available": backend != "off", "backend": backend}
    if backend == "ollama":
        info["model"] = _resolve_ollama_model()
        info["url"] = settings.OLLAMA_BASE_URL
    elif backend == "openai":
        info["model"] = settings.OPENAI_MODEL
    return info


def ask_ai(system_prompt: str, user_content: str) -> dict:
    """Single entry point for ALL AI calls across ALL use cases.

    Returns {"summary": str, "available": bool}. Never raises.
    """
    backend = _pick_backend()

    if backend == "ollama":
        return _ask_ollama(system_prompt, user_content)
    if backend == "openai":
        return _ask_openai(system_prompt, user_content)

    return {
        "summary": (
            "AI summary unavailable — no LLM backend reachable. "
            "Start Ollama (`sudo systemctl start ollama`) or set OPENAI_API_KEY. "
            "All optimization results above are computed locally."
        ),
        "available": False,
    }


# ─── Backend implementations ────────────────────────────────────────────────

def _ask_ollama(system_prompt: str, user_content: str) -> dict:
    model = _resolve_ollama_model()
    if model is None:
        return {"summary": "Ollama not reachable.", "available": False}

    try:
        r = requests.post(
            f"{settings.OLLAMA_BASE_URL}/api/chat",
            json={
                "model": model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_content},
                ],
                "stream": False,
                "options": {
                    "temperature": 0.3,
                    "num_predict": 800,
                },
            },
            timeout=120,
        )
        if r.status_code != 200:
            return {
                "summary": f"Ollama returned HTTP {r.status_code}. Computed results above are still valid.",
                "available": False,
            }
        text = r.json().get("message", {}).get("content", "").strip()

        # Strip <think>...</think> from reasoning models (deepseek-r1 etc.)
        if "<think>" in text:
            import re
            text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()
            text = re.sub(r"<think>.*", "", text, flags=re.DOTALL).strip()

        if not text:
            return {"summary": "Ollama returned empty response.", "available": False}
        return {"summary": text, "available": True}

    except requests.Timeout:
        return {"summary": "Ollama timeout (>120s). Try a smaller model.", "available": False}
    except requests.ConnectionError:
        return {
            "summary": "Ollama not reachable — run: sudo systemctl start ollama",
            "available": False,
        }
    except Exception as e:
        return {"summary": f"Ollama error: {e}", "available": False}


def _ask_openai(system_prompt: str, user_content: str) -> dict:
    c = _get_openai_client()
    if c is None:
        return {"summary": "OpenAI client init failed.", "available": False}
    try:
        response = c.chat.completions.create(
            model=settings.OPENAI_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content},
            ],
            max_tokens=800,
            temperature=0.3,
        )
        return {"summary": response.choices[0].message.content, "available": True}
    except Exception as e:
        return {
            "summary": f"OpenAI error: {e}. Optimization results above are computed locally.",
            "available": False,
        }
