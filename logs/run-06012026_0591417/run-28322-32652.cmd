@echo off
cd /d "D:\SL Platform"
tools\\caddy.exe run --config Caddyfile --adapter caddyfile 1>>"D:\SL Platform\logs\run-06012026_0591417\caddy.log" 2>>"D:\SL Platform\logs\run-06012026_0591417\caddy.err.log"
