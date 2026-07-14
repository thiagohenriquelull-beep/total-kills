@echo off
chcp 65001 >nul
cd /d "%~dp0"
title GOL Kills Predictor

echo.
echo   GOL Kills Predictor :: Servidor HTTP
echo   =======================================
echo.

:: Verifica se http-server esta instalado globalmente
where http-server >nul 2>&1
if errorlevel 1 (
    echo   http-server nao encontrado.
    echo   Instalando via npm ^(aguarde^)...
    echo.
    call npm install -g http-server
    if errorlevel 1 (
        echo.
        echo   ERRO: falha ao instalar http-server.
        echo   Verifique se o Node.js esta instalado corretamente.
        pause
        exit /b 1
    )
    echo.
    echo   http-server instalado com sucesso.
    echo.
)

echo   Servidor: http://localhost:8080
echo   Pressione Ctrl+C para encerrar.
echo.

:: Abre o Chrome apos 2 segundos em processo background
start /min "" cmd /c "timeout /t 2 /nobreak >nul && powershell -noprofile -command Start-Process chrome.exe http://localhost:8080"

:: Inicia o servidor HTTP — bloqueia aqui ate Ctrl+C
http-server . -p 8080 -c-1 --cors

echo.
echo   Servidor encerrado.
pause
