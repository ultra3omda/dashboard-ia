@echo off
cd /d "%~dp0backend"
python -m uvicorn server:app --reload --port 8000
