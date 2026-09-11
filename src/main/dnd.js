// dnd 文本拖出 —— 常驻 dnd-helper（预热），拖出瞬间指令即达，避免冷启动错过用户按住。
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

let child = null;
let queue = [];   // 等待结果的 resolver（按序，一次只拖一个）

function helperPath() {
  return path.join(__dirname, '..', 'dnd-helper', 'dnd-helper.exe');
}
function ensure() {
  if (child && child.exitCode == null) return true;
  const hp = helperPath();
  if (!fs.existsSync(hp)) return false;
  child = spawn(hp, ['--serve'], { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true });
  let buf = '';
  child.stdout.on('data', (d) => {
    buf += d.toString('utf8');
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      const cb = queue.shift();
      if (cb) cb(line === 'OK' || line.startsWith('OK'));
    }
  });
  child.on('exit', () => { child = null; const q = queue; queue = []; q.forEach(cb => cb(false)); });
  child.on('error', () => { child = null; const q = queue; queue = []; q.forEach(cb => cb(false)); });
  return true;
}

// 发起一次文本拖出；text/html 先写临时文件，再让 helper 立即 DoDragDrop
function dragText(text, html) {
  return new Promise((resolve) => {
    if (!ensure()) { resolve(false); return; }
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fddnd-'));
    const tf = path.join(dir, 't.txt');
    const hf = path.join(dir, 'h.html');
    let wrote = true;
    try {
      fs.writeFileSync(tf, text || '', 'utf8');
      let line = tf;
      if (html) { fs.writeFileSync(hf, html, 'utf8'); line += '\t' + hf; }
      child.stdin.write(line + '\n');
    } catch (e) { wrote = false; }
    if (!wrote) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {} resolve(false); return; }
    const done = (ok) => {
      const idx = queue.indexOf(done);
      if (idx >= 0) queue.splice(idx, 1);
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
      resolve(ok);
    };
    queue.push(done);
    setTimeout(() => done(false), 45000); // 超时兜底
  });
}

function warm() { return ensure(); }
function stop() {
  if (child) { try { child.stdin.end(); } catch (e) {} try { child.kill(); } catch (e) {} child = null; }
}

module.exports = { dragText, warm, stop };
