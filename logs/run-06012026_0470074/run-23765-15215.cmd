@echo off
cd /d "D:\SL Platform\SL_Recruitment\frontend"
set "PORT=3002"
npm run dev 1>>"D:\SL Platform\logs\run-06012026_0470074\recruitment-frontend.log" 2>>"D:\SL Platform\logs\run-06012026_0470074\recruitment-frontend.err.log"
