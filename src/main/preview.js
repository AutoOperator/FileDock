// 悬浮预览窗（两个槽位）：
//  悬停槽 —— 跟随 Ctrl/悬停触发，单例复用、不抢焦点、随鼠标即时弹出/消失；
//  钉住槽 —— 按 L 把当前悬停预览升级为独立小窗（可拖动、等比缩放、右上角×关闭），
//             钉住后悬停槽继续服务其他文件，两者互不干扰。
// 内容注入式加载：页面骨架只加载一次参数，src 由主进程 executeJavaScript 注入，
// 支持 file:// 路径和 dataURL（剪贴板仓大图）两种来源。
const { BrowserWindow, screen, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const store = require('./store');

let hoverWin = null;
const pinWins = new Set(); // 可同时钉住多个
let hoverSeq = 0;
let hoverCur = null; // { path?, url?, kind }

const MIN_SHOW = 160; // 过小的图放大到该尺寸（轻微损失分辨率）
const PAD = 0;        // 窗口与内容完全重合，无留白无黑框

const dimCache = new Map(); // path|mtime → {width, height}

function fileUrlOf(p) {
  return 'file:///' + encodeURI(String(p).replace(/\\/g, '/')).replace(/#/g, '%23').replace(/\?/g, '%3F');
}

// 预览内容页用 renderer/preview.html（file:// origin 才允许加载 file:// 子资源）
// t= 时间戳强制真实导航（只在每窗口首次加载时用一次）
function pageUrl() {
  const page = encodeURI(path.join(__dirname, '..', 'renderer', 'preview.html').replace(/\\/g, '/'));
  return 'file:///' + page + '?t=' + Date.now();
}

function makeWindow() {
  const w = new BrowserWindow({
    width: 420, height: 300,
    frame: false, transparent: true, resizable: false, movable: false,
    skipTaskbar: true, focusable: false, hasShadow: false, show: false,
    alwaysOnTop: true, backgroundColor: '#00000000',
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  w.setAlwaysOnTop(true, 'screen-saver');
  // 关掉 Ctrl+滚轮的页面缩放：滚轮留给“调整钉住窗大小”
  try { w.webContents.setVisualZoomLevelLimits(1, 1); } catch (e) {}
  // Ctrl+滚轮缩放钉住窗（手动调整，不受悬浮上下限约束；以窗口中心为锚）
  w.webContents.on('input-event', (e, input) => {
    if (!input || input.type !== 'mouseWheel') return;
    if (!input.modifiers || !input.modifiers.includes('control')) return;
    if (!pinWins.has(w)) return;
    zoomPinByWheel(w, input.deltaY);
  });
  w.on('closed', () => {
    pinWins.delete(w);
    if (w === hoverWin) hoverWin = null;
  });
  return w;
}

// Ctrl+滚轮：等比缩放钉住窗，中心点不动
function zoomPinByWheel(w, deltaY) {
  if (w.isDestroyed()) return;
  try {
    const [wd, ht] = w.getSize();
    const [x, y] = w.getPosition();
    const step = deltaY < 0 ? 1.12 : 1 / 1.12;
    let nw = wd * step;
    const aspect = wd / ht;
    const wa = screen.getDisplayNearestPoint({ x: x + wd / 2, y: y + ht / 2 }).workArea;
    const minSide = 60; // 手动调整不受 160 下限约束，只防手滑缩没了
    const maxW = Math.max(1200, Math.round(wa.width * 2));
    const maxH = Math.max(900, Math.round(wa.height * 2));
    nw = Math.min(Math.max(nw, minSide), maxW);
    let nh = Math.round(nw / aspect);
    nh = Math.min(Math.max(nh, minSide), maxH);
    nw = Math.round(nh * aspect);
    const nx = x - Math.round((nw - wd) / 2);
    const ny = y - Math.round((nh - ht) / 2);
    w.setBounds({ x: nx, y: ny, width: nw, height: nh });
  } catch (e) { /* 窗口正在销毁 */ }
}

function resetHoverProps(w) {
  w.setResizable(false);
  w.setMovable(false);
  try { w.setFocusable(false); } catch (e) {}
}
void resetHoverProps; // 悬停窗创建即为目标属性，无需每次重置（重置会引发样式抖动/闪烁）

// 页面骨架每个窗口只加载一次：导航会清空页面内容，换图时表现为"闪一下"。
// 钉住态也不是重新加载，而是运行时加 body.pin 类（见 preview.html）。
async function ensurePage(w) {
  if (w.__pageReady) return true;
  await w.loadURL(pageUrl());
  w.__pageReady = true;
  return true;
}

// 仅替换内容：不导航、不改尺寸，窗口保持可见 → 切换图片无闪烁
async function setContent(w, kind, src) {
  if (!w || w.isDestroyed()) return false;
  try {
    const ready = await w.webContents.executeJavaScript(
      `window.__setSrc(${JSON.stringify(kind)}, ${JSON.stringify(src)})`
    );
    return ready !== false;
  } catch (e) {
    return false;
  }
}

function mediaDimsOf(w) {
  return w.webContents.executeJavaScript('window.__mediaDims ? window.__mediaDims() : null').catch(() => null);
}

// 悬浮/钉住共用的尺寸策略：原始尺寸优先；超上限才等比缩小；过小才放大到下限。
// 缩放上限 4 倍。手动拉边缩放不受此限制。
function fitSize(dw, dh, wa, allowUpscale) {
  const maxW = Math.max(160, Math.min(560, Math.round(wa.width * 0.5)));
  const maxH = Math.max(120, Math.min(560, Math.round(wa.height * 0.6)));
  dw = dw || 1;
  dh = dh || 1;
  let scale = 1;
  if (dw > maxW || dh > maxH) scale = Math.min(maxW / dw, maxH / dh);
  if (allowUpscale && dw * scale < MIN_SHOW && dh * scale < MIN_SHOW) {
    scale = Math.min(MIN_SHOW / Math.min(dw, dh), 4);
  }
  return {
    w: Math.max(2, Math.round(dw * scale)),
    h: Math.max(2, Math.round(dh * scale)),
  };
}

function clampPos(x, y, w, h, wa) {
  return {
    x: Math.min(Math.max(x, wa.x), wa.x + wa.width - w),
    y: Math.min(Math.max(y, wa.y), wa.y + wa.height - h),
  };
}

// 悬停预览（普通态）
async function show(payload) {
  const { path, url } = payload || {};
  const kind = (payload && payload.kind) || 'image';
  if (!path && !url) return;
  const seq = ++hoverSeq;
  hoverCur = { path, url, kind };
  try {
    const pt = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(pt);
    const wa = display.workArea;

    let w = 480, h = 300;
    let dimsKnown = false;
    if (kind === 'image') {
      let dims = null;
      if (path) {
        try {
          const st = await fs.promises.stat(path);
          const key = path + '|' + st.mtimeMs;
          dims = dimCache.get(key);
          if (!dims) {
            const img = nativeImage.createFromPath(path);
            if (!img.isEmpty()) {
              const s = img.getSize();
              dims = { width: s.width, height: s.height };
              if (dimCache.size > 50) dimCache.clear();
              dimCache.set(key, dims);
            }
          }
        } catch (e) { /* 文件读不到则按默认尺寸 */ }
      } else if (url) {
        try {
          const img = nativeImage.createFromDataURL(url);
          if (!img.isEmpty()) dims = img.getSize();
        } catch (e) { /* dataURL 解码失败按默认尺寸 */ }
      }
      if (dims) {
        const fit = fitSize(dims.width, dims.height, wa, true);
        w = fit.w; h = fit.h;
        dimsKnown = true;
      }
    }

    let pos = clampPos(pt.x + 18, pt.y + 14, w, h, wa);

    const firstUse = !hoverWin || hoverWin.isDestroyed();
    if (firstUse) hoverWin = makeWindow();
    const win = hoverWin;
    const wasVisible = win.isVisible();
    if (firstUse) await ensurePage(win);
    // 全程可见、不导航、不 hide：
    //  · 尺寸已知（图片/dataURL）→ 先把位置尺寸一次摆好再换内容；
    //  · 尺寸未知（视频/原生解不了的图片）→ 只挪位置不动尺寸，
    //    免得旧内容被拉伸；元数据到手后再整体贴合
    if (dimsKnown) {
      // 尺寸没变就只挪位置（改尺寸会触发重绘 = 残余闪烁源之一）
      const [cw, ch] = win.getSize();
      const [cx, cy] = win.getPosition();
      if (cw !== w || ch !== h) {
        win.setBounds({ x: pos.x, y: pos.y, width: w, height: h });
      } else if (cx !== pos.x || cy !== pos.y) {
        try { win.setPosition(pos.x, pos.y); } catch (e) {}
      }
    } else {
      try { win.setPosition(pos.x, pos.y); } catch (e) {}
    }
    const ok = await setContent(win, kind, url || fileUrlOf(path));
    if (seq !== hoverSeq) return;
    if (!ok) {
      // 内容加载失败：首次使用就保持隐藏；已在显示则保留上一张，避免空窗
      if (!wasVisible) win.hide();
      return;
    }
    // 视频尺寸事先未知 / 图片原生解不了（伪装格式）：等内容就绪后按真实尺寸贴合
    if (!dimsKnown) {
      const d = await mediaDimsOf(win);
      if (d && d.w && d.h) {
        const fit = fitSize(d.w, d.h, wa, kind === 'image');
        pos = clampPos(pos.x, pos.y, fit.w, fit.h, wa);
        win.setBounds({ x: pos.x, y: pos.y, width: fit.w, height: fit.h });
      }
    }
    if (seq !== hoverSeq) return;
    if (win && !win.isDestroyed() && !wasVisible) {
      // 透明窗首次显示时 Windows 可能闪一帧空白：先以 0 不透明度显示，
      // 下一帧再恢复（此时内容已加载完毕，看到的即完整画面，仍属"瞬间"）
      try { win.setOpacity(0); } catch (e) {}
      win.showInactive();
      win.moveTop();
      setTimeout(() => {
        if (win && !win.isDestroyed()) { try { win.setOpacity(1); } catch (e) {} }
      }, 16);
    }
  } catch (e) {
    // 文件消失 / 加载失败：仅收起，窗口保留复用
    if (hoverWin && !hoverWin.isDestroyed()) hoverWin.hide();
  }
}

// 钉住：把当前悬停预览窗口整体升级为独立小窗
// 尺寸保持不变：悬停窗本就按内容适配好（视频也已按真实尺寸贴合），钉住只换状态不重排
// 钉住窗右上角 X 的显隐：主进程轮询光标位置驱动（页面内 no-drag 热区做 :hover
// 会吞掉那一块的拖拽，曾导致钉住窗右上角拖不动）。只在有钉住窗时轮询。
let xPollTimer = null;

function ensureXPoll() {
  if (xPollTimer) return;
  xPollTimer = setInterval(() => {
    if (!pinWins.size) {
      clearInterval(xPollTimer);
      xPollTimer = null;
      return;
    }
    let pt = null;
    try { pt = screen.getCursorScreenPoint(); } catch (e) { return; }
    pinWins.forEach(w => {
      if (w.isDestroyed()) return;
      try {
        const [x, y] = w.getPosition();
        const [wd, ht] = w.getSize();
        const near = pt.x >= x + wd - 150 && pt.x <= x + wd + 24 &&
                     pt.y >= y - 24 && pt.y <= y + 150;
        const flag = near ? '1' : '0';
        if (w.__xShow !== flag) {
          w.__xShow = flag;
          w.webContents.executeJavaScript(`document.body.classList.toggle('x-show', ${near})`)
            .catch(() => {});
        }
        // 光标进入拉伸判定区（贴近窗口边缘，含外侧 8px）→ 显示整圈外框；
        // 离开后滞留 500ms 再收，透明背景的图也能看清拖拽/拉伸范围
        const nearEdge = pt.x >= x - 8 && pt.x <= x + wd + 8 && pt.y >= y - 8 && pt.y <= y + ht + 8 &&
          (pt.x < x + 14 || pt.x > x + wd - 14 || pt.y < y + 14 || pt.y > y + ht - 14);
        if (nearEdge) {
          clearTimeout(w.__edgeHideT);
          w.__edgeHideT = null;
          if (!w.__edgeOn) {
            w.__edgeOn = true;
            w.webContents.executeJavaScript(`document.body.classList.add('edge-show')`)
              .catch(() => {});
          }
        } else if (w.__edgeOn && !w.__edgeHideT) {
          w.__edgeHideT = setTimeout(() => {
            w.__edgeOn = false;
            if (!w.isDestroyed()) {
              w.webContents.executeJavaScript(`document.body.classList.remove('edge-show')`)
                .catch(() => {});
            }
          }, 500);
        }
        // 图片组：光标靠近左右边缘时浮现切换箭头
        if (w.__group && w.__group.length > 1) {
          const nearL = pt.x >= x - 24 && pt.x <= x + 130 && pt.y >= y - 20 && pt.y <= y + ht + 20;
          const nearR = pt.x >= x + wd - 130 && pt.x <= x + wd + 24 && pt.y >= y - 20 && pt.y <= y + ht + 20;
          if (w.__navL !== nearL) {
            w.__navL = nearL;
            w.webContents.executeJavaScript(`document.body.classList.toggle('nav-l', ${nearL})`).catch(() => {});
          }
          if (w.__navR !== nearR) {
            w.__navR = nearR;
            w.webContents.executeJavaScript(`document.body.classList.toggle('nav-r', ${nearR})`).catch(() => {});
          }
          // 组内切换后贴合新图尺寸（页面置 __pendingResize 请求一次）
          w.webContents.executeJavaScript(
            'window.__pendingResize ? ((window.__pendingResize = false), window.__mediaDims()) : null'
          ).then(d => {
            if (d && d.w && d.h && !w.isDestroyed()) {
              const wa2 = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
              const fit = fitSize(d.w, d.h, wa2, true);
              const capH = w.__capH || 0;
              const [px, py] = w.getPosition();
              const pos2 = clampPos(px, py, fit.w, fit.h + capH, wa2);
              w.setBounds({ x: pos2.x, y: pos2.y, width: fit.w, height: fit.h + capH });
              w.setAspectRatio(fit.w / (fit.h + capH));
            }
          }).catch(() => {});
        }
      } catch (e) { /* 窗口正在销毁 */ }
    });
  }, 90);
}

async function pin(payload) {
  if (!hoverWin || hoverWin.isDestroyed() || !hoverCur) return false;
  const cur = hoverCur;
  const win = hoverWin;
  hoverWin = null;
  hoverCur = null;
  pinWins.add(win);
  ensureXPoll();
  try {
    const [w0, h0] = win.getSize();
    win.setResizable(true);
    win.setMinimumSize(140, 140);
    win.setMovable(true);
    // 必须保持不可聚焦：钉住窗若抢走键盘焦点，之后的 Ctrl / L 全进钉住窗，
    // 文件仓的悬浮预览和再次 Lock 都会失灵（拖动/拉边/X 都不依赖焦点，无碍）
    try { win.setFocusable(false); } catch (e) {}
    // 拉边缩放时锁定纵横比（按当前窗口比例 = 内容比例）
    win.setAspectRatio(w0 / h0);

    // —— 图片组 / 单张 ——
    // payload.items 存在且 >1：把多选的可预览文件钉成一个组（页面内部左右切换）
    const items = payload && Array.isArray(payload.items) && payload.items.length > 1 ? payload.items : null;
    if (items) {
      win.__group = items.map(it => ({ kind: it.kind, src: fileUrlOf(it.path), name: it.name || '' }));
      win.webContents.executeJavaScript(
        `window.__setGroup(${JSON.stringify(win.__group)}, ${Math.max(0, payload.index | 0)})`
      ).catch(() => {});
    }
    // —— 下方文件名栏（设置项，默认关）——
    let name = '';
    if (cur.path) {
      name = cur.path.slice(Math.max(cur.path.lastIndexOf('\\'), cur.path.lastIndexOf('/')) + 1);
    }
    const showName = !!store.getSettings().pinShowName && !!name;
    win.__capH = showName ? 24 : 0;
    if (win.__capH) {
      // 图片区域尺寸不变，窗口向下多出一条名称栏
      win.setBounds({ x: win.getPosition()[0], y: win.getPosition()[1], width: w0, height: h0 + win.__capH });
      win.setAspectRatio(w0 / (h0 + win.__capH));
    }
    const js = [`document.body.classList.add('pin')`];
    if (showName) {
      js.push(`document.body.classList.add('show-name')`);
      js.push(`window.__caption = ${JSON.stringify(name)}`);
      js.push(`window.__updateCaption && window.__updateCaption()`);
    }
    win.webContents.executeJavaScript(js.join(';')).catch(() => {});
    win.showInactive();
    win.moveTop();
    return true;
  } catch (e) {
    return false;
  }
}

// 收起悬停窗（钉住窗不受影响，由用户 × / Esc 关闭）
function close() {
  hoverSeq++;
  hoverCur = null;
  if (hoverWin && !hoverWin.isDestroyed()) hoverWin.hide();
}

// 把所有钉住窗提到最上（同层级 alwaysOnTop 窗口按激活顺序排 z，
// 主仓被点活时会盖住重叠的钉住窗——主窗口 focus 时调用本函数压回来）
function raisePins() {
  pinWins.forEach(w => {
    if (!w.isDestroyed()) w.moveTop();
  });
}

module.exports = { show, close, pin, raisePins };
