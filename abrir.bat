@echo off
setlocal EnableExtensions
cd /d "%~dp0"

title QA Studio
color 0A

echo ========================================
echo   QA Studio - abertura local
echo ========================================
echo.

:: --- Node.js ---
where node >nul 2>&1
if errorlevel 1 (
  echo [ERRO] Node.js nao encontrado no PATH.
  echo Instale Node 22+ em https://nodejs.org e tente de novo.
  pause
  exit /b 1
)

for /f "tokens=*" %%v in ('node -v') do set NODE_VER=%%v
echo [ok] Node %NODE_VER%

:: --- Este .bat precisa estar na raiz do projeto ---
if not exist "package.json" (
  echo.
  echo [ERRO] Este script nao esta na pasta do QA Studio.
  echo        Pasta atual: %CD%
  echo.
  echo Nao copie o abrir.bat para a Area de Trabalho: ele roda sempre
  echo na pasta onde esta salvo. Use o abrir.bat que fica na raiz do
  echo projeto, ou crie um ATALHO para ele ^(botao direito ^> Enviar para
  echo ^> Area de Trabalho^).
  pause
  exit /b 1
)

:: --- .env ---
if not exist ".env" (
  if exist ".env.example" (
    copy /y ".env.example" ".env" >nul
    echo [ok] Criado .env a partir de .env.example
    echo      Se o projeto estiver no OneDrive, defina QA_DB_PATH fora dele
    echo      ^(ex.: %%LOCALAPPDATA%%\QA-Studio\qa.db^) para nao perder dados.
  ) else (
    echo [aviso] Sem .env nem .env.example. Seguindo com padroes.
  )
) else (
  echo [ok] .env encontrado
)

:: --- Dependencias ---
if not exist "node_modules\" (
  echo.
  echo [..] Instalando dependencias ^(primeira vez pode demorar^)...
  call npm.cmd install
  if errorlevel 1 (
    echo [ERRO] npm install falhou.
    pause
    exit /b 1
  )
) else (
  echo [ok] Dependencias ja instaladas
)

:: --- Build do frontend ---
if not exist "client\dist\index.html" (
  echo.
  echo [..] Gerando build do frontend...
  call npm.cmd run build
  if errorlevel 1 (
    echo [ERRO] Build falhou.
    pause
    exit /b 1
  )
) else (
  echo [ok] Frontend ja compilado ^(client\dist^)
)

set "PORT=3001"

:: --- Ja esta rodando? ---
netstat -ano | findstr /R /C:":%PORT% .*LISTENING" >nul 2>&1
if not errorlevel 1 (
  echo.
  echo [ok] Servidor ja esta em http://localhost:%PORT%
  echo Abrindo o navegador...
  start "" "http://localhost:%PORT%"
  echo.
  pause
  exit /b 0
)

echo.
echo [..] Subindo QA Studio em http://localhost:%PORT%
echo     Feche esta janela ou pressione Ctrl+C para encerrar.
echo.

:: Abre o navegador depois que a API responder (timeout ~40s)
start "" /b powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$u='http://localhost:%PORT%/api/projects'; $ok=$false; 1..40 | ForEach-Object { try { $r=Invoke-WebRequest -Uri $u -UseBasicParsing -TimeoutSec 2; if($r.StatusCode -ge 200 -and $r.StatusCode -lt 500){$ok=$true; break} } catch {}; Start-Sleep -Seconds 1 }; Start-Process 'http://localhost:%PORT%'"

call npm.cmd start
set "EXITCODE=%ERRORLEVEL%"

echo.
if not "%EXITCODE%"=="0" (
  echo [ERRO] Servidor encerrou com codigo %EXITCODE%.
  pause
)
exit /b %EXITCODE%
