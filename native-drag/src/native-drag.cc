// native-drag: in-process OLE text drag for Electron/FileDock.
// Export startDrag(text, html?) -> bool
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <shellapi.h>
#include <objbase.h>
#include <oleidl.h>
#include <node_api.h>

#include <string>
#include <vector>
#include <cstring>
#include <cstdio>

static UINT g_cfHtml = 0;

static HGLOBAL ToGlobalUnicode(const std::wstring& s) {
  HGLOBAL h = GlobalAlloc(GMEM_MOVEABLE, (s.size() + 1) * sizeof(wchar_t));
  if (!h) return nullptr;
  wchar_t* p = (wchar_t*)GlobalLock(h);
  if (!p) { GlobalFree(h); return nullptr; }
  memcpy(p, s.c_str(), (s.size() + 1) * sizeof(wchar_t));
  GlobalUnlock(h);
  return h;
}
static HGLOBAL ToGlobalUtf8(const std::string& s) {
  HGLOBAL h = GlobalAlloc(GMEM_MOVEABLE, s.size() + 1);
  if (!h) return nullptr;
  char* p = (char*)GlobalLock(h);
  if (!p) { GlobalFree(h); return nullptr; }
  memcpy(p, s.c_str(), s.size() + 1);
  GlobalUnlock(h);
  return h;
}
static std::wstring Utf8ToWide(const std::string& in) {
  if (in.empty()) return L"";
  int n = MultiByteToWideChar(CP_UTF8, 0, in.c_str(), (int)in.size(), nullptr, 0);
  if (n <= 0) return L"";
  std::wstring out((size_t)n, L'\0');
  MultiByteToWideChar(CP_UTF8, 0, in.c_str(), (int)in.size(), &out[0], n);
  return out;
}
// ANSI(CP_ACP) bytes for CF_TEXT
static std::string WideToAnsi(const std::wstring& w) {
  if (w.empty()) return "";
  int n = WideCharToMultiByte(CP_ACP, 0, w.c_str(), (int)w.size(), nullptr, 0, nullptr, nullptr);
  if (n <= 0) return "";
  std::string out((size_t)n, '\0');
  WideCharToMultiByte(CP_ACP, 0, w.c_str(), (int)w.size(), &out[0], n, nullptr, nullptr);
  return out;
}
// CF_HTML header needs byte offsets (StartHTML/EndHTML/...)
static std::string WrapHtml(const std::string& body) {
  const char* tmpl =
    "Version:0.9\r\nStartHTML:%08u\r\nEndHTML:%08u\r\n"
    "StartFragment:%08u\r\nEndFragment:%08u\r\n";
  const char* zeros =
    "Version:0.9\r\nStartHTML:00000000\r\nEndHTML:00000000\r\n"
    "StartFragment:00000000\r\nEndFragment:00000000\r\n";
  int headLen = (int)strlen(zeros);
  int startHtml = headLen;
  int startFrag = startHtml;
  int endFrag = startFrag + (int)body.size();
  int endHtml = endFrag;
  char hdr[192];
  sprintf_s(hdr, tmpl, startHtml, endHtml, startFrag, endFrag);
  return std::string(hdr) + body;
}

// ---- IEnumFORMATETC ----
class FmtEnum : public IEnumFORMATETC {
  ULONG ref_;
  std::vector<FORMATETC> v_;
  ULONG idx_;
 public:
  FmtEnum(const std::vector<FORMATETC>& v) : ref_(1), v_(v), idx_(0) {}
  STDMETHODIMP QueryInterface(REFIID riid, void** pp) override {
    if (riid == IID_IUnknown || riid == IID_IEnumFORMATETC) { *pp = this; AddRef(); return S_OK; }
    *pp = nullptr; return E_NOINTERFACE;
  }
  STDMETHODIMP_(ULONG) AddRef() override { return InterlockedIncrement(&ref_); }
  STDMETHODIMP_(ULONG) Release() override { ULONG r = InterlockedDecrement(&ref_); if (!r) delete this; return r; }
  STDMETHODIMP Next(ULONG celt, FORMATETC* out, ULONG* got) override {
    ULONG i = 0;
    while (i < celt && idx_ < (ULONG)v_.size()) out[i++] = v_[idx_++];
    if (got) *got = i;
    return i == celt ? S_OK : S_FALSE;
  }
  STDMETHODIMP Skip(ULONG celt) override { idx_ += celt; return idx_ >= (ULONG)v_.size() ? S_FALSE : S_OK; }
  STDMETHODIMP Reset() override { idx_ = 0; return S_OK; }
  STDMETHODIMP Clone(IEnumFORMATETC** out) override { *out = new FmtEnum(v_); return S_OK; }
};

// ---- IDataObject ----
class DObj : public IDataObject {
  ULONG ref_;
  std::wstring text_;
  std::string ansi_;   // CF_TEXT (ANSI)
  std::string html_;
  std::vector<FORMATETC> fmt_;
 public:
  DObj(const std::wstring& t, const std::string& h, bool hasHtml)
    : ref_(1), text_(t), ansi_(WideToAnsi(t)), html_(h) {
    if (!text_.empty()) {
      FORMATETC fw = { CF_UNICODETEXT, nullptr, DVASPECT_CONTENT, -1, TYMED_HGLOBAL };
      fmt_.push_back(fw);
      if (!ansi_.empty()) {
        FORMATETC fa = { CF_TEXT, nullptr, DVASPECT_CONTENT, -1, TYMED_HGLOBAL };
        fmt_.push_back(fa);
      }
    }
    if (hasHtml && g_cfHtml) {
      FORMATETC fh = { (CLIPFORMAT)g_cfHtml, nullptr, DVASPECT_CONTENT, -1, TYMED_HGLOBAL };
      fmt_.push_back(fh);
    }
  }
  STDMETHODIMP QueryInterface(REFIID riid, void** pp) override {
    if (riid == IID_IUnknown || riid == IID_IDataObject) { *pp = static_cast<IDataObject*>(this); AddRef(); return S_OK; }
    *pp = nullptr; return E_NOINTERFACE;
  }
  STDMETHODIMP_(ULONG) AddRef() override { return InterlockedIncrement(&ref_); }
  STDMETHODIMP_(ULONG) Release() override { ULONG r = InterlockedDecrement(&ref_); if (!r) delete this; return r; }
  STDMETHODIMP GetData(FORMATETC* fe, STGMEDIUM* psm) override {
    if (!fe || !psm) return E_INVALIDARG;
    psm->tymed = TYMED_HGLOBAL; psm->pUnkForRelease = nullptr;
    if (fe->cfFormat == CF_UNICODETEXT && (fe->tymed & TYMED_HGLOBAL)) {
      psm->hGlobal = ToGlobalUnicode(text_); return psm->hGlobal ? S_OK : E_OUTOFMEMORY;
    }
    if (fe->cfFormat == CF_TEXT && (fe->tymed & TYMED_HGLOBAL) && !ansi_.empty()) {
      psm->hGlobal = ToGlobalUtf8(ansi_); return psm->hGlobal ? S_OK : E_OUTOFMEMORY;
    }
    if (g_cfHtml && fe->cfFormat == (CLIPFORMAT)g_cfHtml && (fe->tymed & TYMED_HGLOBAL)) {
      psm->hGlobal = ToGlobalUtf8(html_); return psm->hGlobal ? S_OK : E_OUTOFMEMORY;
    }
    return DV_E_FORMATETC;
  }
  STDMETHODIMP GetDataHere(FORMATETC*, STGMEDIUM*) override { return E_NOTIMPL; }
  STDMETHODIMP QueryGetData(FORMATETC* fe) override {
    if (!fe) return E_INVALIDARG;
    for (size_t i = 0; i < fmt_.size(); i++) if (fmt_[i].cfFormat == fe->cfFormat) return S_OK;
    return DV_E_FORMATETC;
  }
  STDMETHODIMP GetCanonicalFormatEtc(FORMATETC*, FORMATETC* out) override { *out = FORMATETC(); return E_NOTIMPL; }
  STDMETHODIMP SetData(FORMATETC*, STGMEDIUM*, BOOL) override { return E_NOTIMPL; }
  STDMETHODIMP EnumFormatEtc(DWORD dir, IEnumFORMATETC** out) override {
    if (dir != DATADIR_GET) return E_NOTIMPL;
    *out = new FmtEnum(fmt_); return S_OK;
  }
  STDMETHODIMP DAdvise(FORMATETC*, DWORD, IAdviseSink*, DWORD* dw) override { *dw = 0; return E_NOTIMPL; }
  STDMETHODIMP DUnadvise(DWORD) override { return E_NOTIMPL; }
  STDMETHODIMP EnumDAdvise(IEnumSTATDATA** out) override { *out = nullptr; return OLE_E_ADVISENOTSUPPORTED; }
};

// ---- IDropSource ----
class DSrc : public IDropSource {
  ULONG ref_;
 public:
  DSrc() : ref_(1) {}
  STDMETHODIMP QueryInterface(REFIID riid, void** pp) override {
    if (riid == IID_IUnknown || riid == IID_IDropSource) { *pp = this; AddRef(); return S_OK; }
    *pp = nullptr; return E_NOINTERFACE;
  }
  STDMETHODIMP_(ULONG) AddRef() override { return InterlockedIncrement(&ref_); }
  STDMETHODIMP_(ULONG) Release() override { ULONG r = InterlockedDecrement(&ref_); if (!r) delete this; return r; }
  STDMETHODIMP QueryContinueDrag(BOOL fPressed, DWORD) override {
    if (!fPressed) return DRAGDROP_S_DROP;
    if (GetAsyncKeyState(VK_ESCAPE) & 0x8000) return DRAGDROP_S_CANCEL;
    return S_OK;
  }
  STDMETHODIMP GiveFeedback(DWORD) override { return DRAGDROP_S_USEDEFAULTCURSORS; }
};

static bool DoTextDrag(const std::string& utf8text, const std::string& utf8html,
                       bool* outDown, DWORD* outEffect, LONG* outHr) {
  *outDown = (GetAsyncKeyState(VK_LBUTTON) & 0x8000) != 0;
  *outEffect = 0;
  *outHr = 0;
  static bool oleOk = false;
  if (!oleOk) {
    HRESULT hr = OleInitialize(nullptr);
    oleOk = (hr == S_OK || hr == S_FALSE);
    g_cfHtml = RegisterClipboardFormatA("HTML Format");
  }
  if (!oleOk) return false;
  std::wstring text = Utf8ToWide(utf8text);
  bool hasHtml = !utf8html.empty();
  std::string html = hasHtml ? WrapHtml(utf8html) : "";

  DObj* data = new DObj(text, html, hasHtml);
  DSrc* src = new DSrc();
  DWORD effect = 0;
  HRESULT hr = DoDragDrop(data, src, DROPEFFECT_COPY | DROPEFFECT_MOVE, &effect);
  data->Release();
  src->Release();
  *outEffect = effect;
  *outHr = (LONG)hr;
  return SUCCEEDED(hr) && (effect & (DROPEFFECT_COPY | DROPEFFECT_MOVE)) != 0;
}

// ---- N-API ----
static std::string GetString(napi_env env, napi_value v) {
  size_t len = 0;
  if (napi_get_value_string_utf8(env, v, nullptr, 0, &len) != napi_ok) return "";
  std::string s(len, '\0');
  size_t got = 0;
  napi_get_value_string_utf8(env, v, &s[0], len + 1, &got);
  s.resize(got);
  return s;
}
static napi_value StartDrag(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value argv[2] = { nullptr, nullptr };
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  std::string text = (argc >= 1) ? GetString(env, argv[0]) : "";
  std::string html = (argc >= 2 && argv[1]) ? GetString(env, argv[1]) : "";
  bool down = false, ok = false;
  DWORD effect = 0;
  LONG hr = 0;
  if (!text.empty() || !html.empty()) ok = DoTextDrag(text, html, &down, &effect, &hr);
  napi_value out;
  napi_create_object(env, &out);
  napi_value v;
  napi_get_boolean(env, ok, &v); napi_set_named_property(env, out, "ok", v);
  napi_get_boolean(env, down, &v); napi_set_named_property(env, out, "down", v);
  napi_create_int32(env, (int32_t)effect, &v); napi_set_named_property(env, out, "effect", v);
  napi_create_int32(env, (int32_t)hr, &v); napi_set_named_property(env, out, "hr", v);
  return out;
}
// fallback: write clipboard, set foreground, send Ctrl+V
static bool SetClipText(const std::wstring& t) {
  if (t.empty()) return false;
  if (!OpenClipboard(nullptr)) return false;
  EmptyClipboard();
  bool ok = false;
  HGLOBAL u = ToGlobalUnicode(t);
  if (u) { if (SetClipboardData(CF_UNICODETEXT, u)) ok = true; else GlobalFree(u); }
  std::string a = WideToAnsi(t);
  HGLOBAL an = a.empty() ? nullptr : ToGlobalUtf8(a);
  if (an) { if (SetClipboardData(CF_TEXT, an)) { /* owned */ } else GlobalFree(an); }
  CloseClipboard();
  return ok;
}
static void SendCtrlV() {
  keybd_event(VK_CONTROL, 0, 0, 0);
  keybd_event('V', 0, 0, 0);
  keybd_event('V', 0, KEYEVENTF_KEYUP, 0);
  keybd_event(VK_CONTROL, 0, KEYEVENTF_KEYUP, 0);
}
static bool DoPaste(HWND h, const std::wstring& t) {
  if (!SetClipText(t)) return false;
  if (h) { SetForegroundWindow(h); BringWindowToTop(h); }
  Sleep(70);
  SendCtrlV();
  return true;
}
static napi_value Paste(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value argv[2] = { nullptr, nullptr };
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  HWND h = nullptr;
  if (argc >= 1) { int64_t v = 0; if (napi_get_value_int64(env, argv[0], &v) == napi_ok) h = (HWND)(uintptr_t)v; }
  std::string text = (argc >= 2 && argv[1]) ? GetString(env, argv[1]) : "";
  bool ok = DoPaste(h, Utf8ToWide(text));
  napi_value out;
  napi_get_boolean(env, ok, &out);
  return out;
}
// cursor info {x,y,down} + window under point + send-only Ctrl+V
static napi_value CursorInfo(napi_env env, napi_callback_info info) {
  POINT p; GetCursorPos(&p);
  bool down = (GetAsyncKeyState(VK_LBUTTON) & 0x8000) != 0;
  napi_value o, v;
  napi_create_object(env, &o);
  napi_create_int32(env, p.x, &v); napi_set_named_property(env, o, "x", v);
  napi_create_int32(env, p.y, &v); napi_set_named_property(env, o, "y", v);
  napi_get_boolean(env, down, &v); napi_set_named_property(env, o, "down", v);
  return o;
}
static napi_value WinAt(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value argv[2] = { nullptr, nullptr };
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  int x = 0, y = 0;
  if (argc >= 1) napi_get_value_int32(env, argv[0], &x);
  if (argc >= 2) napi_get_value_int32(env, argv[1], &y);
  POINT p = { x, y };
  HWND h = WindowFromPoint(p);
  napi_value o;
  napi_create_double(env, (double)(uintptr_t)h, &o);
  return o;
}
static void ClickAt(int x, int y) {
  SetCursorPos(x, y);
  mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0);
  mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0);
}
static napi_value SendPasteOnly(napi_env env, napi_callback_info info) {
  size_t argc = 3;
  napi_value argv[3] = { nullptr, nullptr, nullptr };
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  HWND h = nullptr;
  int x = 0, y = 0;
  if (argc >= 1) { int64_t v = 0; if (napi_get_value_int64(env, argv[0], &v) == napi_ok) h = (HWND)(uintptr_t)v; }
  if (argc >= 2) napi_get_value_int32(env, argv[1], &x);
  if (argc >= 3) napi_get_value_int32(env, argv[2], &y);
  bool ok = false;
  if (h) {
    ok = (SetForegroundWindow(h) != 0) || (BringWindowToTop(h) != 0);
    Sleep(80);
    ClickAt(x, y);   // 在释放点点一下，让目标输入框落光标
    Sleep(40);
    SendCtrlV();
  }
  napi_value out;
  napi_get_boolean(env, ok, &out);
  return out;
}
static std::string WideToUtf8(const std::wstring& w) {
  if (w.empty()) return "";
  int n = WideCharToMultiByte(CP_UTF8, 0, w.c_str(), (int)w.size(), nullptr, 0, nullptr, nullptr);
  if (n <= 0) return "";
  std::string out((size_t)n, '\0');
  WideCharToMultiByte(CP_UTF8, 0, w.c_str(), (int)w.size(), &out[0], n, nullptr, nullptr);
  return out;
}
// clipboard file list (CF_HDROP): absolute paths, UTF-8 array
static void ReadDropFiles(std::vector<std::wstring>& out) {
  if (!IsClipboardFormatAvailable(CF_HDROP)) return;
  if (!OpenClipboard(nullptr)) return;
  HANDLE h = GetClipboardData(CF_HDROP);
  if (h) {
    HDROP drop = (HDROP)GlobalLock(h);
    if (drop) {
      UINT n = DragQueryFileW(drop, 0xFFFFFFFF, nullptr, 0);
      for (UINT i = 0; i < n; i++) {
        UINT len = DragQueryFileW(drop, i, nullptr, 0);
        if (len == 0) continue;
        std::wstring p(len, L'\0');
        DragQueryFileW(drop, i, &p[0], len + 1);
        out.push_back(p);
      }
      GlobalUnlock(h);
    }
  }
  CloseClipboard();
}
static napi_value ClipFiles(napi_env env, napi_callback_info info) {
  std::vector<std::wstring> paths;
  ReadDropFiles(paths);
  napi_value arr;
  napi_create_array_with_length(env, paths.size(), &arr);
  for (size_t i = 0; i < paths.size(); i++) {
    std::string s = WideToUtf8(paths[i]);
    napi_value v;
    napi_create_string_utf8(env, s.c_str(), s.size(), &v);
    napi_set_element(env, arr, (uint32_t)i, v);
  }
  return arr;
}
// clipboard sequence number: +1 on any change, cheap change detection
static napi_value ClipSeq(napi_env env, napi_callback_info info) {
  napi_value o;
  napi_create_int32(env, (int32_t)GetClipboardSequenceNumber(), &o);
  return o;
}
// foreground window handle (as JS number)
static napi_value FgHwnd(napi_env env, napi_callback_info info) {
  HWND h = GetForegroundWindow();
  napi_value o;
  napi_create_double(env, (double)(uintptr_t)h, &o);
  return o;
}
static napi_value Init(napi_env env, napi_value exports) {
  napi_value fn;
  napi_create_function(env, "startDrag", NAPI_AUTO_LENGTH, StartDrag, nullptr, &fn);
  napi_set_named_property(env, exports, "startDrag", fn);
  napi_create_function(env, "clipSeq", NAPI_AUTO_LENGTH, ClipSeq, nullptr, &fn);
  napi_set_named_property(env, exports, "clipSeq", fn);
  napi_create_function(env, "fgHwnd", NAPI_AUTO_LENGTH, FgHwnd, nullptr, &fn);
  napi_set_named_property(env, exports, "fgHwnd", fn);
  napi_create_function(env, "paste", NAPI_AUTO_LENGTH, Paste, nullptr, &fn);
  napi_set_named_property(env, exports, "paste", fn);
  napi_create_function(env, "cursor", NAPI_AUTO_LENGTH, CursorInfo, nullptr, &fn);
  napi_set_named_property(env, exports, "cursor", fn);
  napi_create_function(env, "winAt", NAPI_AUTO_LENGTH, WinAt, nullptr, &fn);
  napi_set_named_property(env, exports, "winAt", fn);
  napi_create_function(env, "sendPaste", NAPI_AUTO_LENGTH, SendPasteOnly, nullptr, &fn);
  napi_set_named_property(env, exports, "sendPaste", fn);
  napi_create_function(env, "clipFiles", NAPI_AUTO_LENGTH, ClipFiles, nullptr, &fn);
  napi_set_named_property(env, exports, "clipFiles", fn);
  return exports;
}
NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
