; hermes-local: warn on the directory page, confirm after path selection,
; then wipe $INSTDIR before files are extracted.
; Functions live in macros expanded after multiUserUi.nsh (nsDialogs + StrContains).
; Do not !include nsDialogs.nsh here — that registers a second plugin path.

!ifndef BUILD_UNINSTALLER

!macro customWelcomePage
  !define MUI_DIRECTORYPAGE_TEXT_TOP "【安装路径警告】继续安装将会自动删除所选安装目录下的全部内容（所有文件与子文件夹），且无法从回收站恢复。$\r$\n$\r$\nWarning: Setup will permanently delete ALL files and subfolders in the folder you choose (including the app subfolder). This cannot be undone. Pick a directory that contains nothing you need to keep."
  !insertmacro MUI_PAGE_WELCOME
!macroend

!macro hermesNormalizeInstDir
  ${StrContains} $0 "${APP_FILENAME}" $INSTDIR
  ${If} $0 == ""
    StrCpy $INSTDIR "$INSTDIR\${APP_FILENAME}"
  ${EndIf}
!macroend

!macro hermesWipeInstDir
  !insertmacro hermesNormalizeInstDir
  ClearErrors
  ${If} ${FileExists} "$INSTDIR\*.*"
    RMDir /r "$INSTDIR"
  ${EndIf}
  CreateDirectory "$INSTDIR"
  ClearErrors
!macroend

!macro customPageAfterChangeDir
  Page custom hermesWipeDirPage hermesWipeDirPageLeave

  Function hermesWipeDirPage
    nsDialogs::Create 1018
    Pop $0
    ${If} $0 == error
      Abort
    ${EndIf}

    !insertmacro hermesNormalizeInstDir

    ${NSD_CreateLabel} 0 0 100% 140u "【安装路径警告】$\r$\n$\r$\n继续安装将会自动删除所选安装目录下的全部内容（包括所有文件与子文件夹），且无法从回收站恢复。$\r$\n$\r$\nWarning: Continuing will permanently delete ALL files and subfolders in the install directory. This cannot be undone.$\r$\n$\r$\n路径 / Path:$\r$\n$INSTDIR$\r$\n$\r$\n请确认该目录没有重要数据。Click Next only if this folder is safe to wipe."
    Pop $1

    nsDialogs::Show
  FunctionEnd

  Function hermesWipeDirPageLeave
    IfSilent hermes_wipe_go
    !insertmacro hermesNormalizeInstDir
    MessageBox MB_YESNO|MB_ICONEXCLAMATION|MB_DEFBUTTON2 \
      "确认清空并安装？$\r$\n$\r$\n以下目录中的全部内容将被永久删除：$\r$\n$INSTDIR$\r$\n$\r$\nConfirm wipe and install?$\r$\nEverything under that path will be permanently deleted." \
      IDYES hermes_wipe_go
    Abort
    hermes_wipe_go:
    !insertmacro hermesWipeInstDir
  FunctionEnd
!macroend

!endif
