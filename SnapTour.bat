@echo off
title SnapTour
cd /d "%~dp0"
if not exist node_modules\playwright-core call npm install --silent

:menu
cls
echo.
echo   SnapTour - screenshots every page of an app or website
echo   Saves to Desktop\Screenshots\SnapTour\
echo.
echo   1  A website            (menusparks.com, localhost:3001, any link)
echo   2  A saved desktop app  (vibedeck)
echo   3  Any program          (you click around, it snaps each new screen)
echo   4  Open the Screenshots folder
echo   5  Quit
echo.
set /p pick=  Pick 1-5:

if "%pick%"=="1" goto web
if "%pick%"=="2" goto app
if "%pick%"=="3" goto watch
if "%pick%"=="4" goto folder
if "%pick%"=="5" exit /b
goto menu

:web
echo.
set /p site=  Website address:
set /p fname=  Folder name (Enter = use the site name):
if "%fname%"=="" (node snaptour.mjs %site%) else (node snaptour.mjs %site% --name "%fname%")
pause
goto menu

:app
echo.
node snaptour.mjs list
set /p appname=  App name:
node snaptour.mjs %appname%
pause
goto menu

:watch
echo.
echo   Type part of the window's title to only shoot that app (example: VibeDeck),
echo   or just press Enter to shoot whatever window you click on.
set /p win=  Window title:
set /p fname=  Folder name (Enter = use the window title):
if "%fname%"=="" (node snaptour.mjs watch %win%) else (node snaptour.mjs watch %win% --name "%fname%")
pause
goto menu

:folder
if not exist "%USERPROFILE%\OneDrive\Desktop\Screenshots\SnapTour" mkdir "%USERPROFILE%\OneDrive\Desktop\Screenshots\SnapTour"
start "" "%USERPROFILE%\OneDrive\Desktop\Screenshots\SnapTour"
goto menu
