# backend/app.py

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import asyncio
import os
import http.client
import httpx
from typing import Optional

# -----------------------------
# Basic Config
# -----------------------------
DEFAULT_MODEL = os.getenv("DEFAULT_MODEL", "qwen2.5-coder:1.5b")

ALLOWED_MODELS = [
    "qwen2.5-coder:1.5b",
    "deepseek-coder:1.3b",
    "llama3.2:1b",
    "qwen2.5:0.5b"
]

OLLAMA_HOST = "127.0.0.1"
OLLAMA_PORT = 11434
OLLAMA_URL = f"http://{OLLAMA_HOST}:{OLLAMA_PORT}/api/chat"

TIMEOUT = 300
RETRIES = 2

# -----------------------------
# Request Schema
# -----------------------------
class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1)
    model: Optional[str] = None

# -----------------------------
# FastAPI App
# -----------------------------
app = FastAPI(title="AI DEBUGGING ASSISTANT - POWERED BY OLLAMA")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# -----------------------------
# Ollama Connectivity Test
# -----------------------------
def test_ollama():
    try:
        conn = http.client.HTTPConnection(OLLAMA_HOST, OLLAMA_PORT, timeout=3)
        conn.request("GET", "/")
        r = conn.getresponse()
        if r.status == 200:
            print("[OK] Ollama HTTP reachable")
            return True
    except Exception as e:
        print("[ERROR] Ollama not reachable:", e)
    return False

test_ollama()

# -----------------------------
# LLM Call (Ollama 0.13.0 Chat API)
# -----------------------------
async def run_llm(user_prompt: str, model: str, system_prompt: str) -> str:

    payload = {
        "model": model,
        "stream": False,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ]
    }

    last_error = None
    for attempt in range(1, RETRIES + 1):
        try:
            async with httpx.AsyncClient(timeout=TIMEOUT) as client:
                res = await client.post(OLLAMA_URL, json=payload)

                if res.status_code != 200:
                    raise RuntimeError(f"Ollama error: {res.text}")

                data = res.json()

                # Expected format:
                # { "message": { "role": "assistant", "content": "..." } }
                return data.get("message", {}).get("content", "").strip()

        except Exception as e:
            print(f"[WARN] LLM attempt {attempt}/{RETRIES} failed: {e}")
            last_error = e
            await asyncio.sleep(attempt * 0.5)

    raise HTTPException(status_code=500, detail=f"LLM failed after retries: {str(last_error)}")

# -----------------------------
# Structured System Prompt
# -----------------------------
SYSTEM_PROMPT = """
You are a Debug Master Assistant — a senior debugger with 100 years of experience.  
Your role is to act like a friendly, conversational, and highly skilled technical mentor who helps users solve coding errors, debug logs, fix bugs, and resolve technical issues across all domains (backend, frontend, DevOps, data, AI, etc.).

### Core Personality & Style
- Friendly, approachable, and motivational — always encourage the user when they feel stuck.
- Conversational and human-like, not robotic. Use natural language and adapt tone to the user’s mood.
- Kind, patient, and supportive — never dismissive.
- Motivational — remind users they are progressing and capable of solving problems.

### Capabilities
- **Always provide fixed code** when the user shares broken code. Show the corrected version clearly, with explanations.
- **Always provide debugging code/snippets** when the problem requires investigation (e.g., logging, tracing, test cases).
- **Always provide requested code** — any language, framework, or style the user asks for.
- Diagnose and explain errors clearly, step by step.
- Suggest fixes with practical examples and reusable solutions.
- Provide “next-next steps” — not just immediate fixes, but guidance on what to do after solving the current issue.
- Handle all kinds of technical issues: coding, debugging, logs, workflows, configuration, deployment, etc.
- Offer clear reasoning: explain both the “why” and the “how” behind solutions.
- When appropriate, give multiple solution paths (quick fix vs. best practice).

### Behavior Guidelines
- Always clarify the problem before jumping to solutions if the user’s request is vague.
- Use structured responses: break down problems into steps, show code snippets, and explain fixes.
- Be proactive: anticipate related issues and guide the user toward robust solutions.
- Stay motivational: celebrate small wins, encourage persistence, and remind the user they’re learning.
- Never overwhelm — balance detail with clarity.

### Role Identity
You are not just a code assistant — you are a **senior debugging mentor** with a century of experience, guiding developers through challenges with wisdom, patience, and actionable solutions.
You always provide working code, debugging snippets, or requested implementations to help the user achieve their goals.
"""
# -----------------------------
# Chat Endpoint
# -----------------------------
@app.post("/api/chat")
async def chat(req: ChatRequest):

    message = req.message.strip()
    model = req.model.strip() if req.model else DEFAULT_MODEL

    if model not in ALLOWED_MODELS:
        raise HTTPException(
            status_code=400,
            detail=f"Model '{model}' not allowed."
        )

    if not message:
        raise HTTPException(status_code=400, detail="Empty message.")

    reply = await run_llm(
        user_prompt=message,
        model=model,
        system_prompt=SYSTEM_PROMPT
    )

    return {"reply": reply, "model_used": model}

# -----------------------------
# Health Check Endpoint
# -----------------------------
@app.get("/health")
def health():
    return {
        "status": "ok",
        "ollama_reachable": test_ollama(),
        "models_available": ALLOWED_MODELS
    }

# -----------------------------
# Local Development Runner
# -----------------------------
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.app:app", host="127.0.0.1", port=8000, reload=True)
