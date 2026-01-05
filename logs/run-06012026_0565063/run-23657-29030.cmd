@echo off
cd /d "D:\SL Platform\SL_IT\frontend"
set "PORT=3001"
npm run dev 1>>"D:\SL Platform\logs\run-06012026_0565063\it-frontend.log" 2>>"D:\SL Platform\logs\run-06012026_0565063\it-frontend.err.log"
