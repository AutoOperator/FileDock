// native-drag —— 进程内 OLE 文本拖放加载器
// 原生模块编译后位于 <app根>/native-drag/build/Release/native_drag.node
const path = require('path');
const fs = require('fs');

let mod = null;
function nodePath() {
  return path.join(__dirname, '..', '..', 'native-drag', 'build', 'Release', 'native_drag.node');
}
function available() {
  if (mod) return true;
  try {
    const p = nodePath();
    if (!fs.existsSync(p)) return false;
    mod = require(p); // .node 编译目标 = Electron 31.7.7（ABI 匹配）
    return typeof mod.startDrag === 'function';
  } catch (e) {
    console.error('native-drag 加载失败:', e);
    return false;
  }
}
// 发起进程内文本拖放（阻塞直到拖拽结束）；返回 {ok,down,effect,hr} 或 null
function dragText(text, html) {
  if (!available()) return null;
  try { return mod.startDrag(text || '', html || ''); }
  catch (e) { console.error('native-drag 调用失败:', e); return null; }
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
// 回退：写剪贴板并 Ctrl+V 贴进指定窗口（hwnd=number）
function paste(hwnd, text) {
  if (!available()) return false;
  try { return !!mod.paste(hwnd || 0, text || ''); }
  catch (e) { console.error('native-drag paste 失败:', e); return false; }
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
module.exports = { available, dragText, seq, fg, paste, cursor, winAt, sendPaste, clipFiles };
