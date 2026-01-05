@echo off
cd /d "D:\SL Platform\SL_Workbook\frontend"
set "PORT=3003"
npm run dev 1>>"D:\SL Platform\logs\run-06012026_0565063\workbook-frontend.log" 2>>"D:\SL Platform\logs\run-06012026_0565063\workbook-frontend.err.log"
