/* FileDock top launcher (ANSI): runs app\FileDock.exe, data stays in this dir via env */
#include <windows.h>
#include <shellapi.h>
#include <string.h>
#include <stdio.h>

int WINAPI WinMain(HINSTANCE h, HINSTANCE p, LPSTR cmd, int show) {
    char self[MAX_PATH];
    GetModuleFileNameA(NULL, self, MAX_PATH);
    char* sl = strrchr(self, '\\');
    if (sl) *sl = 0;
    SetEnvironmentVariableA("PORTABLE_EXECUTABLE_DIR", self);

    char exe[MAX_PATH];
    _snprintf_s(exe, _TRUNCATE, "%s\\app\\FileDock.exe", self);
    ShellExecuteA(NULL, "open", exe, NULL, self, SW_SHOWNORMAL);
    return 0;
}
