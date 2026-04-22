"""
Thin OpenAI wrapper. Used ONLY when user clicks "Ask AI" button.
The entire application works without this. This is optional garnish.
"""
import os
from openai import OpenAI

client = None


def get_client():
    global client
    if client is None:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            return None
        client = OpenAI(api_key=api_key)
    return client


def ask_ai(system_prompt: str, user_content: str) -> dict:
    """
    Single function for ALL AI calls across ALL use cases.
    Returns {"summary": str, "available": bool}
    If no API key or API fails, returns graceful fallback.
    """
    c = get_client()
    if c is None:
        return {
            "summary": "AI summary unavailable — no OPENAI_API_KEY set. All optimization results above are computed locally.",
            "available": False,
        }

    try:
        response = c.chat.completions.create(
            model="gpt-4.1",
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
            "summary": f"AI unavailable: {str(e)}. All optimization results above are computed locally.",
            "available": False,
        }
