@echo off
title Shipshot
cd /d "%~dp0"
if not exist node_modules\playwright-core call npm install --silent

:menu
cls
echo.
echo   Shipshot - screenshots every page of an app or website
echo   Saves to Desktop\Screenshots\Shipshot\
echo.
echo   1  Open the Shipshot app window
echo   2  A website            (yoursite.com, localhost:3001, any link)
echo   3  A saved desktop app  (from apps.json)
echo   4  Any program          (you click around, it snaps each new screen)
echo   5  Open the Screenshots folder
echo   6  Put a Shipshot icon on the desktop
echo   7  Quit
echo.
set /p pick=  Pick 1-7:

if "%pick%"=="1" goto window
if "%pick%"=="2" goto web
if "%pick%"=="3" goto app
if "%pick%"=="4" goto watch
if "%pick%"=="5" goto folder
if "%pick%"=="6" goto install
if "%pick%"=="7" exit /b
goto menu

:window
node shipshot.mjs app
exit /b

:web
echo.
set /p site=  Website address:
set /p fname=  Folder name (Enter = use the site name):
set share=
set /p share=  Also make images for x,discord,github,linkedin,instagram,og or all (Enter = none):
set opts=
if not "%share%"=="" set opts=--for %share%
if "%fname%"=="" (node shipshot.mjs %site% %opts%) else (node shipshot.mjs %site% --name "%fname%" %opts%)
pause
goto menu

:app
echo.
node shipshot.mjs list
set /p appname=  App name:
node shipshot.mjs %appname%
pause
goto menu

:watch
echo.
echo   Type part of the window's title to only shoot that app (example: Photoshop),
echo   or just press Enter to shoot whatever window you click on.
set /p win=  Window title:
set /p fname=  Folder name (Enter = use the window title):
if "%fname%"=="" (node shipshot.mjs watch %win%) else (node shipshot.mjs watch %win% --name "%fname%")
pause
goto menu

:folder
node shipshot.mjs folder
goto menu

:install
node shipshot.mjs install
pause
goto menu
