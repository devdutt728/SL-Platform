@echo off
cd /d "D:\SL Platform\SL_IT\backend"
python -m uvicorn app.main:app --reload --port 8001 1>>"D:\SL Platform\logs\run-06012026_0591417\it-backend.log" 2>>"D:\SL Platform\logs\run-06012026_0591417\it-backend.err.log"
