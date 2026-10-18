// native-drag —— 进程内 OLE 原生能力加载器（剪贴板序列号 / 前台窗口 / 贴入 / 文件列表）
// 原生模块编译后位于 <app根>/native-drag/build/Release/native_drag.node
const path = require('path');
const fs = require('fs');

let mod = null;
let loadFailed = false; // 加载失败或导出不完整时永久记为不可用，避免每次调用都重复尝试
function nodePath() {
  return path.join(__dirname, '..', '..', 'native-drag', 'build', 'Release', 'native_drag.node');
}
function available() {
  if (mod) return true;
  if (loadFailed) return false;
  try {
    const p = nodePath();
    if (!fs.existsSync(p)) { loadFailed = true; return false; }
    const m = require(p); // .node 编译目标 = Electron 31.7.7（ABI 匹配）
    if (typeof m.clipSeq !== 'function') { loadFailed = true; return false; }
    mod = m;
    return true;
  } catch (e) {
    console.error('native-drag 加载失败:', e);
    loadFailed = true;
    return false;
  }
}
// 剪贴板序列号 / 前台窗口（供采集与“贴回上一窗口”回退用）
function seq() {
  if (!available()) return -1;
  try { const v = mod.clipSeq(); return typeof v === 'number' ? v : -1; } catch (e) { return -1; }
}
function fg() {
  if (!available()) return 0;
  try { const v = mod.fgHwnd(); return typeof v === 'number' ? v : 0; } catch (e) { return 0; }
}
// 拖拽会话辅助：光标状态 / 指定点所在窗口 / 只发 Ctrl+V
function cursor() {
  if (!available()) return { x: 0, y: 0, down: false };
  try { return mod.cursor(); } catch (e) { return { x: 0, y: 0, down: false }; }
}
function winAt(x, y) {
  if (!available()) return 0;
  try { return mod.winAt(x, y); } catch (e) { return 0; }
}
function sendPaste(hwnd, x, y) {
  if (!available()) return false;
  try { return !!mod.sendPaste(hwnd || 0, x || 0, y || 0); } catch (e) { return false; }
}
// 剪贴板里的文件列表（CF_HDROP），如 QQ/资源管理器复制的多图
function clipFiles() {
  if (!available()) return [];
  try { return mod.clipFiles() || []; } catch (e) { return []; }
}
// 虚拟键按下状态（GetAsyncKeyState，不依赖窗口焦点）：悬浮预览 Ctrl/L 热键轮询用
function keyDown(vk) {
  if (!available()) return false;
  try { return !!mod.keyDown(vk); } catch (e) { return false; }
}
module.exports = { available, seq, fg, cursor, winAt, sendPaste, clipFiles, keyDown };
