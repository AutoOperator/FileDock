// 主进程入口
const { app, BrowserWindow, screen, nativeImage } = require('electron');
const path = require('path');

// Linux root 环境下需要禁用沙箱
if (process.platform === 'linux' && process.getuid && process.getuid() === 0) {
  app.commandLine.appendSwitch('no-sandbox');
}

const { createMainWindow, getMainWindow, createTriggerWindow, applyAlwaysOnTop } = require('./window-manager');
const { registerIpcHandlers } = require('./ipc-handlers');
const { createTray, destroyTray } = require('./tray-manager');
const preview = require('./preview');
const store = require('./store');
const snapManager = require('./snap-manager');
const clipWatch = require('./clipboard-watcher');
const nd = require('./native-drag');
const fgTrack = require('./foreground');

// 防止多实例
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = getMainWindow();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
  });
}

let trayCreated = false;
let isQuitting = false; // 标记是否正在退出应用
let flushPendingBounds = null; // 由 whenReady 赋值：补写尚未落盘的窗口位置

app.whenReady().then(() => {
  registerIpcHandlers();

  // 剪贴板仓：启动后台采集（自动全收）；变化时把“新条目 + 被淘汰条目”推给渲染层增量刷新
  clipWatch.start((r) => {
    const mw = getMainWindow();
    if (mw && !mw.isDestroyed()) {
      mw.webContents.send('clip:changed', r ? {
        added: r.added ? clipWatch.formatItem(r.added) : null,
        evicted: r.evicted || [],
      } : null);
    }
  });
  // 跟踪“上一个前台窗口”（拖出回退粘贴用）
  fgTrack.start(() => getMainWindow());

  const win = createMainWindow();

  // 钉住预览窗层级压过主仓：同层级 alwaysOnTop 窗口按激活顺序排 z，
  // 主仓被点活时会把重叠的钉住窗盖住——主仓一获得焦点就把钉住窗重新置顶
  win.on('focus', () => {
    preview.raisePins();
  });

  // —— 热键轮询：悬浮预览的 Ctrl 触发 / L 钉住原先依赖文件仓持有键盘焦点，
  // 而焦点在启动（setSkipTaskbar 会隐藏再重显窗口）等时机并不可靠，导致
  // “按 Ctrl 没反应、Lock 之后失灵”。改用原生 GetAsyncKeyState 轮询：
  // 无论焦点在哪，按下 Ctrl / L 都作用到光标下的预览（主窗口可见时）。
  // 无原生模块时由渲染层页面 keydown 兜底（需焦点）。
  let prevCtrlDown = false;
  let prevLDown = false;
  let hotkeyTimer = null;
  if (nd.available()) {
    hotkeyTimer = setInterval(() => {
      const mw = getMainWindow();
      if (!mw || mw.isDestroyed() || !mw.isVisible()) return;
      const ctrl = nd.keyDown(0x11); // VK_CONTROL
      const l = nd.keyDown(0x4C);    // 'L'
      if (ctrl && !prevCtrlDown) mw.webContents.send('hotkey:ctrl');
      if (!ctrl && prevCtrlDown) mw.webContents.send('hotkey:ctrl-up'); // 松开沿：收起悬浮
      if (l && !prevLDown) mw.webContents.send('hotkey:l');
      prevCtrlDown = ctrl;
      prevLDown = l;
    }, 60);
  }

  // 错误诊断日志（%TEMP%\filedock.log）：渲染层 error / 崩溃 / 拖拽会话异常
  const log = (msg) => {
    try { require('fs').appendFileSync(path.join(require('os').tmpdir(), 'filedock.log'), '[' + new Date().toISOString() + '] ' + msg + '\n'); } catch (e) {}
  };
  win.webContents.on('console-message', (e, level, message) => { if (level >= 2) log('render[err] ' + message); });
  win.on('unresponsive', () => log('MAIN_WINDOW_UNRESPONSIVE'));
  win.webContents.on('render-process-gone', (ev, d) => log('render-gone ' + JSON.stringify(d)));
  win.webContents.on('crashed', () => log('render-crashed'));
  process.on('uncaughtException', (err) => log('uncaught ' + (err && err.stack || err)));


  // 设置窗口位置
  const windowState = store.getWindowState();
  if (windowState.bounds) {
    win.setBounds(windowState.bounds);
  } else {
    // 默认放在屏幕右侧
    const display = screen.getPrimaryDisplay();
    const { width: sw, height: sh } = display.workAreaSize;
    const w = 320, h = 480;
    win.setPosition(sw - w - 20, Math.round((sh - h) / 2));
  }

  // 应用置顶设置（启用时使用 screen-saver 强层级，确保不被全屏视频等遮挡）
  // 统一通过 applyAlwaysOnTop 处理主窗口和触点窗口，保持两者层级一致
  const settings = store.getSettings();
  applyAlwaysOnTop(settings.alwaysOnTop !== false);
  // 应用不在任务栏显示，只在托盘显示（避免弹出时任务栏闪烁）
  win.setSkipTaskbar(true);

  // 创建托盘
  createTray(win, {
    toggleWindow: () => {
      const mw = getMainWindow();
      if (mw) {
        if (mw.isVisible()) {
          mw.hide();
        } else {
          mw.show();
          mw.focus();
        }
      }
    },
    newPreset: () => {
      const mw = getMainWindow();
      if (mw) {
        mw.show();
        mw.webContents.send('action:newPreset');
      }
    },
    managePresets: () => {
      const mw = getMainWindow();
      if (mw) {
        mw.show();
        mw.webContents.send('action:managePresets');
      }
    },
    openSettings: () => {
      const mw = getMainWindow();
      if (mw) {
        mw.show();
        mw.webContents.send('action:openSettings');
      }
    },
  });
  trayCreated = true;

  // 窗口关闭行为
  win.on('close', (e) => {
    if (isQuitting) {
      // 真正退出，不阻止
      return;
    }
    const settings = store.getSettings();
    if (settings.closeToTray) {
      e.preventDefault();
      win.hide();
    }
  });

  // 保存窗口位置 + 吸附检测
  // 拖动窗口时 move 事件每移动一像素就触发一次，而 electron-store 每次 set 都会把
  // 整份配置序列化后同步写盘。逐次落盘会让主进程在拖动全程持续阻塞，所以位置改成
  // 延迟合并保存，并在窗口关闭 / 应用退出前补一次，避免丢掉最后一次位置。
  let moveEndTimer = null;
  let persistBoundsTimer = null;
  let pendingBounds = null;

  flushPendingBounds = () => {
    clearTimeout(persistBoundsTimer);
    persistBoundsTimer = null;
    if (!pendingBounds) return;
    store.updateWindowState({ bounds: pendingBounds });
    pendingBounds = null;
  };

  const schedulePersistBounds = () => {
    pendingBounds = win.getBounds();
    clearTimeout(persistBoundsTimer);
    persistBoundsTimer = setTimeout(flushPendingBounds, 400);
  };

  win.on('resize', schedulePersistBounds);
  win.on('move', () => {
    schedulePersistBounds();
    // 移动时取消已展开的吸附状态
    snapManager.handleWindowMove();
    // 移动结束后检测吸附
    clearTimeout(moveEndTimer);
    moveEndTimer = setTimeout(() => {
      snapManager.handleWindowMoved();
    }, 300);
  });

  win.on('close', () => flushPendingBounds());
});

app.on('window-all-closed', () => {
  const settings = store.getSettings();
  if (settings.closeToTray) {
    // 不退出，保持托盘
  } else {
    app.quit();
  }
});

app.on('activate', () => {
  const win = getMainWindow();
  if (win) {
    win.show();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  if (flushPendingBounds) flushPendingBounds();
  clipWatch.stop();
  fgTrack.stop();
  destroyTray();
});

// 确保所有窗口关闭后退出
app.on('will-quit', () => {
  isQuitting = true;
});
