@echo off
chcp 65001 >nul
cd /d "%~dp0\.."
echo MinutesLearn — สุ่มรหัสแอดมินใหม่
echo ใช้ฐานข้อมูลตามไฟล์ .env ในโฟลเดอร์นี้
echo.
pause
echo.
call npx tsx scripts/reset-admin-password.ts
echo.
pause
