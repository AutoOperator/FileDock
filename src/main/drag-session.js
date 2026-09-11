// 拖拽会话：按住文本/图文卡 → 出现跟随光标的“文字拖影”小窗；松开 → 把内容
// （文本+富文本+图 按存在性）贴进光标下方的那个窗口（Ctrl+V）。不依赖目标吃不吃 OLE。
const { BrowserWindow, clipboard, nativeImage, screen } = require('electron');
const os = require('os');
const path = require('path');
const fs = require('fs');
const nd = require('./native-drag');
const clipWatch = require('./clipboard-watcher'); // noteSelfWrite：自我写入不再回采
const { getMainWindow } = require('./window-manager');

let ghost = null;

function logw(m) {
  try { fs.appendFileSync(path.join(os.tmpdir(), 'filedock.log'), '[' + new Date().toISOString() + '] drag: ' + m + '\n'); } catch (e) {}
}

function escHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
function hideGhost() {
  if (ghost && !ghost.isDestroyed()) ghost.destroy();
  ghost = null;
}
function chipHtml(text) {
  const t = (text || '').replace(/\s+/g, ' ').trim();
  const label = escHtml(t.length > 40 ? t.slice(0, 40) + '…' : (t || '文本'));
  return '<!doctype html><html><head><meta charset="utf-8"><style>'
    + 'html,body{margin:0;padding:0;background:transparent;overflow:hidden;user-select:none;-webkit-user-select:none;}'
    + '#chip{display:inline-block;max-width:320px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;'
    + 'font:12px "Microsoft YaHei",sans-serif;color:#fff;background:rgba(30,30,30,.78);padding:4px 8px;border-radius:6px;'
    + 'box-shadow:0 2px 6px rgba(0,0,0,.3);}'
    + '</style></head><body><span id="chip">' + label + '</span></body></html>';
}
function selfHwnd() {
  try { const w = getMainWindow(); return w ? w.getNativeWindowHandle().readUInt32LE(0) : 0; } catch (e) { return 0; }
}

// 一直跟到左键松开（或 20s 超时）。拖影窗用 screen(DIP) 定位，落点用 addon 物理像素。
function waitRelease() {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      try {
        const dip = screen.getCursorScreenPoint();
        if (ghost && !ghost.isDestroyed()) ghost.setPosition(dip.x + 14, dip.y + 8);
      } catch (e) {}
      const down = nd.cursor().down;
      if (!down || Date.now() - t0 > 20000) {
        clearInterval(iv);
        const c = nd.cursor();
        const hwnd = nd.winAt(c.x, c.y);
        resolve({ x: c.x, y: c.y, hwnd });
      }
    }, 16);
  });
}

async function run(text, html, imagePng) {
  logw('begin textlen=' + (text ? text.length : 0) + ' img=' + !!imagePng);
  try {
    ghost = new BrowserWindow({
      width: 200, height: 30, frame: false, transparent: true,
      resizable: false, movable: false, skipTaskbar: true, focusable: false,
      hasShadow: false, alwaysOnTop: true, show: false,
      webPreferences: { contextIsolation: true, sandbox: true },
    });
    ghost.setAlwaysOnTop(true, 'screen-saver');
    ghost.setIgnoreMouseEvents(true, { forward: true });
    try { const d = screen.getCursorScreenPoint(); ghost.setPosition(d.x + 14, d.y + 8); } catch (e) {}
    await ghost.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(chipHtml(text)));
    ghost.showInactive();
    const pt = await waitRelease();
    hideGhost();
    logw('released at ' + pt.x + ',' + pt.y + ' hwnd=' + pt.hwnd + ' self=' + selfHwnd());

    // 组装多格式剪贴板：文本 + 富文本 + 图（按存在性）
    const data = { text: text || '' };
    if (html) data.html = html;
    if (imagePng) { try { data.image = nativeImage.createFromPath(imagePng); } catch (e) { logw('img load err ' + e); } }
    try { clipboard.write(data); clipWatch.noteSelfWrite(); logw('clipboard write ok'); } catch (e) { logw('clipboard err ' + e); }

    const self = selfHwnd();
    if (pt.hwnd && pt.hwnd !== self) {
      const ok = nd.sendPaste(pt.hwnd, pt.x, pt.y);
      logw('sendPaste ok=' + ok + ' at ' + pt.x + ',' + pt.y);
      return { ok: ok || true, hwnd: pt.hwnd };
    }
    logw('released over self, skipped');
    return { ok: true, self: true };
  } catch (e) {
    hideGhost();
    logw('EXC ' + (e && e.stack || e));
    console.error('drag-session 出错:', e);
    return { ok: false, error: String(e && e.message || e) };
  }
}

module.exports = { run };
