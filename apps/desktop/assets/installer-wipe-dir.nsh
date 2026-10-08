; hermes-local: confirm the install folder, then continue only when it is a
; safe empty directory named ${APP_FILENAME}. Never RMDir /r.
;
; This file is compiled into electron-builder's generated NSIS header, before
; installer.nsi. The macros are expanded later from assistedInstaller.nsh,
; after MUI2 (LogicLib) and multiUserUi.nsh (nsDialogs). Do not !include
; nsDialogs.nsh here — a second include registers another plugin path and
; electron-builder treats that warning as an error.
;
; FileFunc.nsh (GetFileName, GetRoot, DirState) ships with NSIS. multiUser.nsh
; includes it as well; FILEFUNC_INCLUDED makes the second include a no-op.
; Silent installs (/S) do not run page callbacks, so customInit applies the
; same rules there. /updated upgrades are allowed to reuse a non-empty install
; folder: electron-builder uninstalls the previous version itself.

!ifndef BUILD_UNINSTALLER

!ifndef FILEFUNC_INCLUDED
!include "FileFunc.nsh"
!endif

!macro customWelcomePage
  !define MUI_DIRECTORYPAGE_TEXT_TOP "【安装路径提示】请选择一个专用的空目录。安装程序会在其下使用名为 ${APP_FILENAME} 的子文件夹；若该文件夹已存在且非空，安装将中止，不会删除其中的文件。$\r$\n$\r$\nTip: Pick an empty folder dedicated to this app. Setup uses a ${APP_FILENAME} subfolder and will abort (without deleting) if that folder already has files."
  !insertmacro MUI_PAGE_WELCOME
!macroend

Var /GLOBAL hermesChosenDir

; Drop a trailing slash so last-segment and equality checks see one path form.
!macro hermesStripInstDirSlash
  ${Do}
    StrCpy $R4 $INSTDIR 1 -1
    ${If} $R4 == "\"
    ${OrIf} $R4 == "/"
      StrCpy $INSTDIR $INSTDIR -1
    ${Else}
      ${Break}
    ${EndIf}
  ${Loop}
!macroend

; Case-insensitive exact match. $R7 is the path under test. Sets $R8 to 1 on hit.
!macro hermesMarkIfSame _PATH
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
  System::Call 'kernel32::lstrcmpi(t r7, t r5) i.r4'
  ${If} $R4 == 0
  ${AndIf} $R7 != ""
    StrCpy $R8 1
  ${EndIf}
!macroend

; $R8 = 1 when $INSTDIR is a drive/UNC root or a protected directory.
; Last-segment policy is separate: this must see the folder the user chose,
; before the app name is appended (otherwise C:\ becomes C:\${APP_FILENAME}).
!macro hermesIsProtectedInstDir
  StrCpy $R8 0
  StrCpy $R7 $INSTDIR
  StrLen $R4 $R7
  ${If} $R4 <= 3
    StrCpy $R8 1
  ${Else}
    ${GetRoot} "$R7" $R4
    ${If} $R7 == $R4
      StrCpy $R8 1
    ${EndIf}
    !insertmacro hermesMarkIfSame "$PROFILE"
    !insertmacro hermesMarkIfSame "$DOCUMENTS"
    !insertmacro hermesMarkIfSame "$DESKTOP"
    !insertmacro hermesMarkIfSame "$LOCALAPPDATA"
    !insertmacro hermesMarkIfSame "$APPDATA"
    !insertmacro hermesMarkIfSame "$WINDIR"
    !insertmacro hermesMarkIfSame "$SYSDIR"
    !insertmacro hermesMarkIfSame "$TEMP"
    !insertmacro hermesMarkIfSame "$PROGRAMFILES"
    !insertmacro hermesMarkIfSame "$PROGRAMFILES32"
    !insertmacro hermesMarkIfSame "$PROGRAMFILES64"
  ${EndIf}
!macroend

; Last path segment only. A substring match (StrContains) treated
; C:\Users\HermesNotes as already normalized and used to wipe that tree.
!macro hermesNormalizeInstDir
  !insertmacro hermesStripInstDirSlash
  ${GetFileName} "$INSTDIR" $R9
  ${If} $R9 != "${APP_FILENAME}"
    StrCpy $INSTDIR "$INSTDIR\${APP_FILENAME}"
  ${EndIf}
!macroend

!macro hermesStopInstall
  ${If} ${Silent}
    SetErrorLevel 2
    Quit
  ${Else}
    Abort
  ${EndIf}
!macroend

!macro hermesAbortUnsafe
  MessageBox MB_OK|MB_ICONSTOP \
    "安装路径不安全，已中止。$\r$\n请选择一个普通的专用文件夹，不要选盘符根目录、用户主目录、文档、桌面、AppData、Windows、系统目录、临时目录或 Program Files。$\r$\n$\r$\nUnsafe install path. Pick a normal folder, not a drive root, your user profile, Documents, Desktop, AppData, Windows, System, Temp, or Program Files.$\r$\n$\r$\n$INSTDIR" \
    /SD IDOK
  !insertmacro hermesStopInstall
!macroend

; Refuse a drive root or protected directory, then nest ${APP_FILENAME}
; unless that is already the last path segment. Leaves $INSTDIR normalized.
!macro hermesRejectUnsafeInstDir
  !insertmacro hermesStripInstDirSlash
  !insertmacro hermesIsProtectedInstDir
  ${If} $R8 == 1
    !insertmacro hermesAbortUnsafe
  ${EndIf}

  !insertmacro hermesNormalizeInstDir
  !insertmacro hermesIsProtectedInstDir
  ${GetFileName} "$INSTDIR" $R9
  ${If} $R9 != "${APP_FILENAME}"
    StrCpy $R8 1
  ${EndIf}
  ${If} $R8 == 1
    !insertmacro hermesAbortUnsafe
  ${EndIf}
!macroend

; Create the folder only when it is missing or empty. A non-empty folder
; aborts unless this is an /updated upgrade (electron-builder removes the
; previous install on its own). Never deletes existing contents.
!macro hermesPrepareInstDir
  !insertmacro hermesRejectUnsafeInstDir

  ; DirState: 0 empty, 1 has entries other than . and .., -1 missing.
  ${DirState} "$INSTDIR" $R2
  ${If} $R2 == 1
  ${AndIfNot} ${isUpdated}
    MessageBox MB_OK|MB_ICONSTOP \
      "安装目录不是空的，已中止，不会删除其中的文件。$\r$\n请选一个空目录，或先清空后再装。$\r$\n$\r$\nInstall folder is not empty; setup will not delete its contents.$\r$\nPick an empty folder or clear it first.$\r$\n$\r$\n$INSTDIR" \
      /SD IDOK
    !insertmacro hermesStopInstall
  ${EndIf}
  CreateDirectory "$INSTDIR"
  ClearErrors
!macroend

!macro customInit
  ${If} ${Silent}
    !insertmacro hermesPrepareInstDir
  ${EndIf}
!macroend

!macro customPageAfterChangeDir
  Page custom hermesWipeDirPage hermesWipeDirPageLeave

  Function hermesWipeDirPage
    !insertmacro hermesStripInstDirSlash
    StrCpy $hermesChosenDir $INSTDIR

    nsDialogs::Create 1018
    Pop $0
    ${If} $0 == error
      ; Abort in a page's create callback only skips the page, which would
      ; continue into InstFiles with no folder check. Quit instead.
      MessageBox MB_OK|MB_ICONSTOP \
        "无法显示安装路径确认页，已中止。$\r$\n$\r$\nCould not open the install-path confirmation page. Setup will exit." \
        /SD IDOK
      SetErrorLevel 2
      Quit
    ${EndIf}

    !insertmacro hermesNormalizeInstDir

    ${NSD_CreateLabel} 0 0 100% 140u "【安装路径确认】$\r$\n$\r$\n将安装到下面这个专用文件夹。若它已存在且非空，下一步会中止，不会删除任何文件。$\r$\n$\r$\nConfirm install path. If this folder already exists and is not empty, Next will abort without deleting files.$\r$\n$\r$\n路径 / Path:$\r$\n$INSTDIR"
    Pop $1

    nsDialogs::Show
  FunctionEnd

  Function hermesWipeDirPageLeave
    ${If} $hermesChosenDir != ""
      StrCpy $INSTDIR $hermesChosenDir
    ${EndIf}
    IfSilent hermes_prep_go
    ; Reject before the confirm prompt so Next never asks to install into a
    ; drive root or a protected directory.
    !insertmacro hermesRejectUnsafeInstDir
    MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 \
      "确认安装到：$\r$\n$INSTDIR$\r$\n$\r$\n目录必须为空（或不存在）。非空目录不会被删除。$\r$\n$\r$\nInstall to that path? Folder must be empty (or missing). Non-empty folders will not be deleted." \
      /SD IDNO IDYES hermes_prep_go
    ${If} $hermesChosenDir != ""
      StrCpy $INSTDIR $hermesChosenDir
    ${EndIf}
    Abort
    hermes_prep_go:
    ${If} $hermesChosenDir != ""
      StrCpy $INSTDIR $hermesChosenDir
    ${EndIf}
    !insertmacro hermesPrepareInstDir
  FunctionEnd
!macroend

!endif
