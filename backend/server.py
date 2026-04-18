"""Entry point for `uvicorn server:app`.
Kept for compatibility with the existing deploy convention of the repo.
The real app lives in app/main.py.
"""
from app.main import app

__all__ = ["app"]
