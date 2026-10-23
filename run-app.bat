@echo off
chcp 65001 > nul
title MIX-IMAGE HTML Archive — Real-Time Cloud Edition
echo ======================================================================
echo   MIX-IMAGE HTML Archive — Real-Time Cloud Edition
echo ======================================================================
echo.
echo กำลังเปิด http://localhost:5000 บนเว็บเบราว์เซอร์ของคุณ...
echo (กด Ctrl + C เพื่อหยุดการทำงานของเซิร์ฟเวอร์)
echo.
start http://localhost:5000
python -m http.server 5000
pause
