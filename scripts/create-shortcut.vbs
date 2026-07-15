Set WshShell = CreateObject("WScript.Shell")
Set FSO = CreateObject("Scripting.FileSystemObject")

scriptDir = FSO.GetParentFolderName(WScript.ScriptFullName)
projectDir = FSO.GetParentFolderName(scriptDir)
desktop = WshShell.SpecialFolders("Desktop")

target   = scriptDir & "\forge-launcher.vbs"
iconFile = projectDir & "\client\public\forge-icon-512.png"
shortcut = desktop & "\Forge.lnk"

If FSO.FileExists(shortcut) Then
    Call FSO.DeleteFile(shortcut, True)
End If

Set sc = WshShell.CreateShortcut(shortcut)
sc.TargetPath = target
sc.WorkingDirectory = projectDir
sc.IconLocation = iconFile & ",0"
sc.Description = "Forge - Hardware Project Management"
sc.Save

MsgBox "Done! Shortcut: " & shortcut, 64, "Forge"
