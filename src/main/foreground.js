// 上一“非本窗口”的前台窗口 HWND 跟踪：供“拖出失败→贴回上一窗口”回退用
const nd = require('./native-drag');

let lastFg = 0;
let timer = null;
let getWin = null;

function hwndOf(win) {
  try { return win.getNativeWindowHandle().readUInt32LE(0); } catch (e) { return 0; }
}

function start(getter) {
  getWin = getter || null;
  if (timer) clearInterval(timer);
  timer = setInterval(() => {
    const w = getWin ? getWin() : null;
    const self = w ? hwndOf(w) : 0;
    const f = nd.fg();
    if (f && f !== self) lastFg = f;
  }, 250);
}
function stop() { if (timer) { clearInterval(timer); timer = null; } }
function get() { return lastFg; }

module.exports = { start, stop, get };
