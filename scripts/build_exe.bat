@echo off
chcp 65001 > nul
echo ========================================================
echo  church-partner-hub: Windows Portable EXE Builder
echo ========================================================
echo.

python "%~dp0build_exe.py"
if %errorlevel% neq 0 (
    echo.
    echo [오류] 빌드 도중 문제가 발생했습니다.
    pause
    exit /b %errorlevel%
)

echo.
echo [완료] 빌드가 성공적으로 완료되었습니다!
pause
