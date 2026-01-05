@echo off
cd /d "D:\SL Platform\SL_Recruitment\backend"
python -m uvicorn app.main:app --reload --port 8002 1>>"D:\SL Platform\logs\run-06012026_0591417\recruitment-backend.log" 2>>"D:\SL Platform\logs\run-06012026_0591417\recruitment-backend.err.log"
