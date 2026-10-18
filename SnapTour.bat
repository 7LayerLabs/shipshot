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
echo   1  Open the SnapTour app window
echo   2  A website            (menusparks.com, localhost:3001, any link)
echo   3  A saved desktop app  (vibedeck)
echo   4  Any program          (you click around, it snaps each new screen)
echo   5  Open the Screenshots folder
echo   6  Put a SnapTour icon on the desktop
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
node snaptour.mjs app
exit /b

:web
echo.
set /p site=  Website address:
set /p fname=  Folder name (Enter = use the site name):
set share=
set /p share=  Also make images for x,discord,github,linkedin,instagram,og or all (Enter = none):
set opts=
if not "%share%"=="" set opts=--for %share%
if "%fname%"=="" (node snaptour.mjs %site% %opts%) else (node snaptour.mjs %site% --name "%fname%" %opts%)
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
node snaptour.mjs folder
goto menu

:install
node snaptour.mjs install
pause
goto menu
