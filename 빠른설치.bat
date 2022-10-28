@echo off
if not exist %USERPROFILE%\AppData\Roaming\spicetify (
spicetify.exe
start %USERPROFILE%\AppData\Roaming\spicetify
exit
)
spicetify.exe restore
spicetify.exe clear
spicetify.exe backup apply
exit
