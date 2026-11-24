; Custom NSIS hooks for Island installer
; Tauri 2 NSIS installer hooks

; Before install: kill running instances
!macro NSIS_HOOK_PREINSTALL
  nsExec::Exec 'taskkill /F /IM ${MAINBINARYNAME}.exe'
!macroend

; After install: register startup entry
!macro NSIS_HOOK_POSTINSTALL
  ; Write to Run registry for "Start with Windows"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Island" '"$INSTDIR\${MAINBINARYNAME}.exe"'
  
  ; Write StartupApproved entry (enabled = 02 00 00 00 ...)
  WriteRegBin HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "Island" 020000000000000000000000
!macroend

; Before uninstall: clean up startup entries  
!macro NSIS_HOOK_PREUNINSTALL
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Island"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "Island"
!macroend
