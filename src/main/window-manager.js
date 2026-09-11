// 窗口管理模块 - 创建和管理主窗口、触点窗口
const { BrowserWindow, screen, shell, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const iconManager = require('./icon-manager');

let mainWindow = null;
let triggerWindow = null; // 触点窗口（吸附隐藏时显示）

// 触点尺寸配置
// transparent 与 large 拥有相同碰撞箱，但渲染时为完全透明
const TRIGGER_SIZES = {
  small:      { length: 60,  thickness: 3 },
  medium:     { length: 100, thickness: 5 },
  large:      { length: 160, thickness: 7 },
  transparent:{ length: 160, thickness: 7 },
};

function getMainWindow() {
  return mainWindow;
}

function getTriggerWindow() {
  return triggerWindow;
}

// 置顶层级：使用 'screen-saver' 让窗口高于全屏视频等高层级窗口
// 与固定状态保持一致强度，避免触点/主窗口被全屏应用遮挡
const ALWAYS_ON_TOP_LEVEL = 'screen-saver';

function createMainWindow() {
  const iconImage = iconManager.getWindowIconImage(iconManager.getCurrentIconName());
  mainWindow = new BrowserWindow({
    width: 320,
    height: 480,
    minWidth: 280,
    minHeight: 150,
    frame: false,
    transparent: true,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: '#00000000',
    icon: iconImage,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // 强化置顶层级，确保不被全屏视频等遮挡
  mainWindow.setAlwaysOnTop(true, ALWAYS_ON_TOP_LEVEL);

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // 阻止默认右键菜单
  mainWindow.webContents.on('will-prevent-unload', () => {});

  return mainWindow;
}

// 创建触点窗口（细线）
function createTriggerWindow() {
  triggerWindow = new BrowserWindow({
    width: 5,
    height: 100,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // 触点窗口始终置顶（独立于主窗口的 alwaysOnTop 设置）：
  // 触点是"提示 dock 在这里"的视觉线索，若被其他窗口盖住用户就找不到 dock 了。
  // 即使用户关闭了主窗口置顶，触点仍需高于普通窗口，确保吸附后始终可见。
  triggerWindow.setAlwaysOnTop(true, ALWAYS_ON_TOP_LEVEL);

  triggerWindow.loadFile(path.join(__dirname, '..', 'renderer', 'trigger.html'));
  triggerWindow.setIgnoreMouseEvents(false);

  triggerWindow.on('closed', () => {
    triggerWindow = null;
  });

  return triggerWindow;
}

// 统一应用置顶设置到主窗口
// 注意：触点窗口不参与此切换——它始终置顶（见 createTriggerWindow），
// 因为触点是吸附后 dock 的视觉替身，被盖住用户就找不到 dock 了。
// onTop=true 时使用 screen-saver 强层级（高于全屏视频等），与固定后的窗口一致
// onTop=false 时关闭置顶
function applyAlwaysOnTop(onTop) {
  const level = onTop ? ALWAYS_ON_TOP_LEVEL : 'normal';
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setAlwaysOnTop(!!onTop, level);
  }
}

// 根据吸附边和触点大小计算触点窗口的位置和尺寸
// currentBounds: 当前窗口位置 {x, y, width, height}，用于让触点跟随窗口位置（偏中上）
function getTriggerBounds(edge, sizeName, currentBounds) {
  const size = TRIGGER_SIZES[sizeName] || TRIGGER_SIZES.medium;
  const display = screen.getPrimaryDisplay();
  const { width: sw, height: sh } = display.workAreaSize;
  const { x: wx, y: wy } = display.workArea;

  // 默认触点位置（居中）
  let posX = wx + (sw - size.length) / 2;
  let posY = wy + (sh - size.length) / 2;

  // 如果提供了窗口当前位置，触点跟随窗口位置（偏中上/中左）
  if (currentBounds) {
    // 左右吸附：触点Y跟随窗口Y + 窗口高度的1/4（偏中上）
    posY = currentBounds.y + (currentBounds.height || 0) * 0.25;
    // 上下吸附：触点X跟随窗口X + 窗口宽度的1/4（偏中左）
    posX = currentBounds.x + (currentBounds.width || 0) * 0.25;
  }

  // 限制在屏幕工作区内
  posX = Math.min(Math.max(posX, wx), wx + sw - size.length);
  posY = Math.min(Math.max(posY, wy), wy + sh - size.length);

  switch (edge) {
    case 'top':
      return { x: posX, y: wy, width: size.length, height: size.thickness };
    case 'bottom':
      return { x: posX, y: wy + sh - size.thickness, width: size.length, height: size.thickness };
    case 'left':
      return { x: wx, y: posY, width: size.thickness, height: size.length };
    case 'right':
      return { x: wx + sw - size.thickness, y: posY, width: size.thickness, height: size.length };
    default:
      return null;
  }
}

// 根据吸附边计算主窗口展开后的位置
// currentBounds: 当前窗口位置 {x, y}，用于保持非吸附方向的当前位置
function getExpandedBounds(edge, windowSize, currentBounds) {
  const display = screen.getPrimaryDisplay();
  const { width: sw, height: sh } = display.workAreaSize;
  const { x: wx, y: wy } = display.workArea;
  const w = windowSize.width || 320;
  const h = windowSize.height || 480;

  // 默认使用居中位置作为非吸附方向的初始值
  let keepX = wx + (sw - w) / 2;
  let keepY = wy + (sh - h) / 2;

  // 如果提供了当前位置，使用当前位置作为非吸附方向的保持值
  if (currentBounds) {
    keepX = currentBounds.x;
    keepY = currentBounds.y;
  }

  // 将保持值限制在屏幕工作区内
  const clampX = Math.min(Math.max(keepX, wx), wx + sw - w);
  const clampY = Math.min(Math.max(keepY, wy), wy + sh - h);

  switch (edge) {
    case 'top':
      // 上下吸附：保持 X 位置，Y 贴顶
      return { x: clampX, y: wy, width: w, height: h };
    case 'bottom':
      // 上下吸附：保持 X 位置，Y 贴底
      return { x: clampX, y: wy + sh - h, width: w, height: h };
    case 'left':
      // 左右吸附：保持 Y 位置，X 贴左
      return { x: wx, y: clampY, width: w, height: h };
    case 'right':
      // 左右吸附：保持 Y 位置，X 贴右
      return { x: wx + sw - w, y: clampY, width: w, height: h };
    default:
      return null;
  }
}

// 运行时更新主窗口图标（任务栏）
function updateWindowIcon(iconName) {
  if (!mainWindow) return;
  const image = iconManager.getWindowIconImage(iconName);
  mainWindow.setIcon(image);
}

module.exports = {
  createMainWindow,
  createTriggerWindow,
  getMainWindow,
  getTriggerWindow,
  getTriggerBounds,
  getExpandedBounds,
  updateWindowIcon,
  applyAlwaysOnTop,
  TRIGGER_SIZES,
  ALWAYS_ON_TOP_LEVEL,
};
