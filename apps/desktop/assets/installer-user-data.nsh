; Hermes-IDE install/uninstall helpers for agent home layout.
;
; Install: pin HERMES_HOME to $INSTDIR\hermes so the app shell, checkout, and
; data share one user-chosen folder (no sibling D:\hermes / D:\hp).
;
; Uninstall: keep agent data unless the user opts in.
; electron-updater runs this uninstaller with /S during every auto-update
; (installUtil.nsh: ExecWait "... /S ... --updated"). A silent run must never
; delete that folder. deleteAppDataOnUninstall stays off; it only knows about
; $APPDATA\${APP_FILENAME} and is not the agent home.
;
; This file is included from electron-builder's generated header, before
; installer.nsi. Page macros expand later from assistedInstaller.nsh, after
; MUI2 (LogicLib, nsDialogs, WinMessages). Do not !include nsDialogs.nsh here —
; a second include registers another plugin path and electron-builder treats
; that warning as an error (-WX).
;
; FileFunc.nsh (GetFileName, GetRoot) ships with NSIS. multiUser.nsh includes
; it too; FILEFUNC_INCLUDED makes the second include a no-op.

!ifndef FILEFUNC_INCLUDED
!include "FileFunc.nsh"
!endif

; Runs after files are copied. Sets user HERMES_HOME to the colocated folder
; and broadcasts the environment change so a relaunch without reboot picks it up.
!macro customInstall
  CreateDirectory "$INSTDIR\hermes"
  WriteRegExpandStr HKCU "Environment" "HERMES_HOME" "$INSTDIR\hermes"
  DetailPrint "HERMES_HOME=$INSTDIR\hermes"
  ; WM_SETTINGCHANGE for "Environment" (SendMessageTimeout)
  System::Call 'user32::SendMessageTimeout(i 0xffff, i 0x1A, i 0, t "Environment", i 0x2, i 5000, *i .r0)'
!macroend

!ifdef BUILD_UNINSTALLER

Var hermesDeleteUserData
Var hermesDeleteUserDataCheckbox

; Drop trailing slashes so the last segment and the equality check see one form.
; $R7 is the path. Uses $R4.
!macro hermesStripTrailingSlashes
  ${Do}
    StrCpy $R4 $R7 1 -1
    ${If} $R4 == "\"
    ${OrIf} $R4 == "/"
      StrCpy $R7 $R7 -1
    ${Else}
      ${Break}
    ${EndIf}
  ${Loop}
!macroend

; Case-insensitive compare of $R7 with _PATH (slash-stripped). Result in $R4
; (0 = same). Unicode installers must call lstrcmpiW: lstrcmpiA stops at the
; first UTF-16 NUL, so "hermes" and "hello" would both look like "h".
; Does not modify $R7. Uses $R5.
!macro hermesCmpPath _PATH
  StrCpy $R5 `${_PATH}`
  ${Do}
    StrCpy $R4 $R5 1 -1
    ${If} $R4 == "\"
    ${OrIf} $R4 == "/"
      StrCpy $R5 $R5 -1
    ${Else}
      ${Break}
    ${EndIf}
  ${Loop}
  System::Call 'kernel32::lstrcmpiW(w r7, w r5) i.r4'
!macroend

; $R8 = 1 only when $R7 is exactly $LOCALAPPDATA\hermes (case-insensitive),
; the final directory name is hermes, and the path is not empty, a drive/UNC
; root, or the user profile. Last-segment compare, never StrContains.
; $R6 is the slash-stripped LOCALAPPDATA. Clobbers $R4, $R5, $R7, $R8, $R9.
!macro hermesUserDataIsExact
  StrCpy $R8 0
  StrCpy $R7 "$LOCALAPPDATA"
  !insertmacro hermesStripTrailingSlashes
  StrCpy $R6 $R7

  ${If} $R6 != ""
    StrLen $R4 $R6
    ${If} $R4 > 3
      ${GetRoot} "$R6" $R4
      ${If} $R6 != $R4
        StrCpy $R7 "$R6\hermes"
        !insertmacro hermesStripTrailingSlashes
        StrLen $R4 $R7
        ${If} $R7 != ""
        ${AndIf} $R4 > 3
          ${GetRoot} "$R7" $R4
          ${If} $R7 != $R4
            !insertmacro hermesCmpPath "$PROFILE"
            ${If} $R4 != 0
              ${GetFileName} "$R7" $R9
              StrCpy $R5 "hermes"
              System::Call 'kernel32::lstrcmpiW(w r9, w r5) i.r4'
              ${If} $R4 == 0
                !insertmacro hermesCmpPath "$R6\hermes"
                ${If} $R4 == 0
                  StrCpy $R8 1
                ${EndIf}
              ${EndIf}
            ${EndIf}
          ${EndIf}
        ${EndIf}
      ${EndIf}
    ${EndIf}
  ${EndIf}
!macroend

; Switch to the current-user shell context so $LOCALAPPDATA is the user
; profile even when the install mode is per-machine, then restore it.
; Silent and /updated never reach this macro.
!macro hermesDeleteExactUserData
  Push $R3
  Push $R4
  Push $R5
  Push $R6
  Push $R7
  Push $R8
  Push $R9

  StrCpy $R3 0
  ${If} $installMode == "all"
    StrCpy $R3 1
    SetShellVarContext current
  ${EndIf}

  !insertmacro hermesUserDataIsExact
  ${If} $R8 == 1
    ${If} ${FileExists} "$R7"
      DetailPrint "Deleting user data: $R7"
      RMDir /r "$R7"
      ${If} ${Errors}
        DetailPrint "Could not fully delete user data: $R7"
        ClearErrors
      ${EndIf}
    ${Else}
      DetailPrint "User data folder is not present: $R7"
    ${EndIf}
  ${Else}
    DetailPrint "Keeping user data; path is not exactly %LOCALAPPDATA%\hermes."
  ${EndIf}

  ${If} $R3 == 1
    SetShellVarContext all
  ${EndIf}

  Pop $R9
  Pop $R8
  Pop $R7
  Pop $R6
  Pop $R5
  Pop $R4
  Pop $R3
!macroend

!macro customUnInit
  StrCpy $hermesDeleteUserData "0"
!macroend

; Replaces MUI_UNPAGE_WELCOME. Expanded from assistedInstaller.nsh after
; nsDialogs is already included.
!macro customUnWelcomePage
  UninstPage custom un.hermesUnDataPage un.hermesUnDataPageLeave

  Function un.hermesUnDataPage
    nsDialogs::Create 1018
    Pop $0
    ${If} $0 == error
      ; Skip this page only. The checkbox stays unset, so user data is kept.
      Abort
    ${EndIf}

    ${NSD_CreateLabel} 0 0 100% 78u "将卸载 Hermes-IDE。$\r$\n$\r$\n用户数据默认保留：$INSTDIR\hermes（以及旧版 %LOCALAPPDATA%\hermes）。$\r$\n$\r$\nHermes-IDE will be uninstalled. User data under $INSTDIR\hermes (and legacy %LOCALAPPDATA%\hermes) is kept unless you check the box below."
    Pop $1

    ${NSD_CreateCheckbox} 0 86u 100% 14u "同时删除用户数据 / Also delete user data"
    Pop $hermesDeleteUserDataCheckbox
    ${NSD_SetState} $hermesDeleteUserDataCheckbox ${BST_UNCHECKED}

    GetDlgItem $1 $HWNDPARENT 1
    SendMessage $1 ${WM_SETTEXT} 0 "STR:卸载 / Uninstall"

    nsDialogs::Show
  FunctionEnd

  Function un.hermesUnDataPageLeave
    ${NSD_GetState} $hermesDeleteUserDataCheckbox $hermesDeleteUserData
  FunctionEnd
!macroend

; Inserted at the start of the uninstall section. Do not Return from here —
; that would skip removing the app itself. Do not define customRemoveFiles;
; that macro replaces the whole $INSTDIR removal.
!macro customUnInstall
  ${IfNot} ${Silent}
  ${AndIfNot} ${isUpdated}
  ${AndIf} $hermesDeleteUserData == "1"
    !insertmacro hermesDeleteExactUserData
    ${If} ${FileExists} "$INSTDIR\hermes"
      DetailPrint "Deleting colocated user data: $INSTDIR\hermes"
      RMDir /r "$INSTDIR\hermes"
      ${If} ${Errors}
        DetailPrint "Could not fully delete colocated user data: $INSTDIR\hermes"
        ClearErrors
      ${EndIf}
    ${EndIf}
  ${EndIf}
!macroend

!endif
