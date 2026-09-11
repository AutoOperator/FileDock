// 吸附管理模块 - 处理窗口吸附到屏幕边缘和自动隐藏/恢复
const { screen } = require('electron');
const {
  getMainWindow,
  getTriggerWindow,
  getTriggerBounds,
  getExpandedBounds,
  createTriggerWindow,
} = require('./window-manager');
const { getSettings, updateWindowState, getWindowState } = require('./store');

// 是否处于固定状态（固定状态下自动隐藏暂停）
function isPinned() {
  return !!(getWindowState() && getWindowState().pinned);
}

// 固定状态变化时调用：取消正在进行的自动隐藏，并恢复展开
function onPinChanged(pinned) {
  if (pinned) {
    clearHideTimer();
    clearMouseLeaveTimer();
    // 若当前已折叠为触点，恢复展开
    if (snapState.edge && snapState.isHidden) {
      expandFromTrigger();
    }
  } else {
    // 取消固定：若窗口当前正处于吸附边缘，走正常吸附流程
    // (snapToEdge 对齐边缘 + 按 autoHideOnSnap 安排延迟隐藏，给用户操作时间，不瞬间隐藏)
    const win = getMainWindow();
    if (!win) return;
    const edge = detectEdge(win.getBounds());
    if (edge) {
      snapToEdge(edge);
    }
  }
}

let snapState = {
  edge: null,        // 'top'|'bottom'|'left'|'right'|null
  isHidden: false,   // 是否处于隐藏(触点)状态
  isExpanded: false, // 是否从隐藏状态展开
  lastWindowSize: null, // 隐藏前的窗口尺寸 {width, height}
  snapPosition: null,   // 吸附时窗口的位置 {x, y}，用于保持原位置
  isSnapping: false, // 防止重入标志
  isAnimating: false, // 滑动动画进行中，忽略 move 事件
};

let hideTimer = null;
let mouseLeaveTimer = null;

function getSnapState() {
  return { ...snapState };
}

function clearHideTimer() {
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
}

function clearMouseLeaveTimer() {
  if (mouseLeaveTimer) {
    clearTimeout(mouseLeaveTimer);
    mouseLeaveTimer = null;
  }
}

// 检测窗口是否靠近屏幕边缘
// 优先级：左右优先（交界处如右上角会吸附到右边）
function detectEdge(bounds) {
  const settings = getSettings();
  if (!settings.snapEnabled) return null;

  const threshold = settings.snapThreshold || 20;
  const display = screen.getDisplayMatching(bounds);
  const workArea = display.workArea;

  const nearTop = Math.abs(bounds.y - workArea.y) < threshold;
  const nearBottom = Math.abs((bounds.y + bounds.height) - (workArea.y + workArea.height)) < threshold;
  const nearLeft = Math.abs(bounds.x - workArea.x) < threshold;
  const nearRight = Math.abs((bounds.x + bounds.width) - (workArea.x + workArea.width)) < threshold;

  // 优先级：左右优先于上下
  if (nearLeft) return 'left';
  if (nearRight) return 'right';
  if (nearTop) return 'top';
  if (nearBottom) return 'bottom';
  return null;
}

// 吸附到边缘 - 保持窗口在非吸附方向上的当前位置
function snapToEdge(edge) {
  const win = getMainWindow();
  if (!win || !edge || snapState.isSnapping) return;

  snapState.isSnapping = true;

  const bounds = win.getBounds();
  snapState.edge = edge;
  snapState.lastWindowSize = { width: bounds.width, height: bounds.height };
  // 记录吸附时窗口的位置，用于保持原位置展开
  snapState.snapPosition = { x: bounds.x, y: bounds.y };

  // 将窗口贴齐边缘，保持非吸附方向的当前位置
  const expandedBounds = getExpandedBounds(edge, snapState.lastWindowSize, bounds);
  if (expandedBounds) {
    win.setBounds(expandedBounds);
  }

  updateWindowState({ snapped: true, snapEdge: edge });

  const settings = getSettings();
  if (settings.autoHideOnSnap && !isPinned()) {
    // 延迟隐藏，让用户看到吸附效果
    clearHideTimer();
    hideTimer = setTimeout(() => {
      if (!isPinned()) collapseToTrigger();
    }, 500);
  }

  setTimeout(() => { snapState.isSnapping = false; }, 500);
}

// 取消吸附
function unsnap() {
  clearHideTimer();
  clearMouseLeaveTimer();
  snapState.edge = null;
  snapState.isHidden = false;
  snapState.isExpanded = false;
  snapState.isExpanding = false;
  updateWindowState({ snapped: false, snapEdge: null });

  const trigger = getTriggerWindow();
  if (trigger) {
    trigger.hide();
  }
}

// 折叠为触点
function collapseToTrigger() {
  const win = getMainWindow();
  if (!win || !snapState.edge) return;

  // 正在展开（滑入动画进行中）时拒绝折叠，避免主窗口/触点同时消失的闪烁
  if (snapState.isExpanding) return;

  const settings = getSettings();
  // 使用吸附时记录的窗口位置，让触点跟随窗口位置（偏中上）
  const winBounds = snapState.snapPosition
    ? { ...snapState.snapPosition, ...snapState.lastWindowSize }
    : win.getBounds();
  const triggerBounds = getTriggerBounds(snapState.edge, settings.triggerSize, winBounds);

  // 确保触点窗口存在
  let trigger = getTriggerWindow();
  if (!trigger) {
    trigger = createTriggerWindow();
    // 触点窗口加载完成后发送配置
    trigger.webContents.once('did-finish-load', () => {
      trigger.webContents.send('trigger-config', {
        edge: snapState.edge,
        color: settings.triggerColor || settings.accentColor,
        size: settings.triggerSize,
      });
    });
  } else {
    trigger.webContents.send('trigger-config', {
      edge: snapState.edge,
      color: settings.triggerColor || settings.accentColor,
      size: settings.triggerSize,
    });
  }

  if (triggerBounds) {
    trigger.setBounds(triggerBounds);
  }
  trigger.show();
  // 兜底：确保触点显示瞬间位于最顶层（即便 alwaysOnTop 已开，
  // 某些情况下新 show 的窗口仍可能被同层级窗口盖住）
  if (typeof trigger.moveTop === 'function') trigger.moveTop();
  win.hide();

  snapState.isHidden = true;
  snapState.isExpanded = false;
}

// 从触点展开窗口 - 滑动出现，避免闪烁
function expandFromTrigger() {
  const win = getMainWindow();
  if (!win || !snapState.edge) return;

  // 防止重入：正在展开时若再次触发（如触点 mouseenter 抖动、拖动 dragenter），
  // 旧流程的 setTimeout 可能恰好让窗口处于 setOpacity(0) 但尚未 show 完成的中间态，
  // 此时若被 collapse 抢断会造成"恢复一半消失"的闪烁。统一在展开期间拒绝再次展开/折叠。
  if (snapState.isExpanding) return;
  snapState.isExpanding = true;

  // 触点先保持显示，直到主窗口真正可见后再隐藏，避免两者同时消失的空窗
  const trigger = getTriggerWindow();

  // 使用吸附时保存的位置（snapPosition），保持原位置展开
  const size = snapState.lastWindowSize || { width: 320, height: 480 };
  const finalBounds = getExpandedBounds(snapState.edge, size, snapState.snapPosition);
  if (!finalBounds) {
    win.show();
    win.focus();
    if (trigger) trigger.hide();
    snapState.isHidden = false;
    snapState.isExpanded = true;
    snapState.isExpanding = false;
    clearMouseLeaveTimer();
    return;
  }

  // 计算滑动起点：从边缘外侧滑入
  const startBounds = computeSlideStart(snapState.edge, finalBounds);

  // 先在透明状态下设置起点位置并显示，避免跳变闪烁
  win.setBounds(startBounds);
  win.setOpacity(0);
  win.show();
  win.focus();

  // 让窗口以透明状态完成首帧渲染，再淡入并滑动，避免空白闪现
  setTimeout(() => {
    // 中途若已被取消（窗口关闭/取消吸附），直接退出，不再操作已失效的窗口
    if (!snapState.isExpanding || win.isDestroyed()) {
      snapState.isExpanding = false;
      return;
    }
    win.setOpacity(1);
    // 主窗口已可见，再隐藏触点，避免同时消失
    if (trigger && !trigger.isDestroyed()) trigger.hide();
    // 滑动动画（仅动画位置，尺寸固定，更平滑）
    animateWindowSlide(win, startBounds, finalBounds, 260, () => {
      snapState.isExpanding = false;
    });
  }, 16);

  snapState.isHidden = false;
  snapState.isExpanded = true;
  clearMouseLeaveTimer();
}

// 计算滑动起点：把窗口移到吸附边缘的外侧（屏幕外）
function computeSlideStart(edge, final) {
  switch (edge) {
    case 'left':
      return { x: final.x - final.width, y: final.y, width: final.width, height: final.height };
    case 'right':
      return { x: final.x + final.width, y: final.y, width: final.width, height: final.height };
    case 'top':
      return { x: final.x, y: final.y - final.height, width: final.width, height: final.height };
    case 'bottom':
      return { x: final.x, y: final.y + final.height, width: final.width, height: final.height };
    default:
      return final;
  }
}

// 窗口位置滑动动画（easeOutCubic）
function animateWindowSlide(win, startBounds, finalBounds, duration, onDone) {
  snapState.isAnimating = true;
  const startTime = Date.now();
  const dx = finalBounds.x - startBounds.x;
  const dy = finalBounds.y - startBounds.y;
  const w = finalBounds.width;
  const h = finalBounds.height;

  function step() {
    const elapsed = Date.now() - startTime;
    const t = Math.min(elapsed / duration, 1);
    // easeOutCubic
    const e = 1 - Math.pow(1 - t, 3);
    const x = Math.round(startBounds.x + dx * e);
    const y = Math.round(startBounds.y + dy * e);
    try {
      win.setBounds({ x, y, width: w, height: h });
    } catch (err) {
      // 窗口可能已关闭
      snapState.isAnimating = false;
      if (typeof onDone === 'function') onDone();
      return;
    }
    if (t < 1) {
      setTimeout(step, 16);
    } else {
      snapState.isAnimating = false;
      if (typeof onDone === 'function') onDone();
    }
  }
  step();
}

// 鼠标离开窗口后开始计时隐藏
function startMouseLeaveTimer() {
  clearMouseLeaveTimer();
  const settings = getSettings();
  mouseLeaveTimer = setTimeout(() => {
    if (snapState.edge && snapState.isExpanded && !isPinned()) {
      collapseToTrigger();
    }
  }, settings.hideDelay || 3000);
}

// 取消鼠标离开计时
function cancelMouseLeaveTimer() {
  clearMouseLeaveTimer();
}

// 处理窗口移动事件 - 移动中取消展开状态
function handleWindowMove() {
  const win = getMainWindow();
  if (!win || snapState.isSnapping || snapState.isAnimating || snapState.isExpanding) return;

  // 如果已吸附且展开，移动表示用户在拖动窗口，取消吸附
  if (snapState.edge && snapState.isExpanded && !snapState.isHidden) {
    unsnap();
  }
}

// 处理窗口移动结束 - 检测是否需要吸附
function handleWindowMoved() {
  const win = getMainWindow();
  if (!win || snapState.isSnapping || snapState.isAnimating || snapState.isExpanding) return;

  // 如果已隐藏（触点状态），不处理
  if (snapState.isHidden) return;

  // 固定状态下完全不自动吸附：清除可能残留的吸附状态，让窗口作为普通浮动窗口
  if (isPinned()) {
    if (snapState.edge) unsnap();
    return;
  }

  const bounds = win.getBounds();
  const edge = detectEdge(bounds);

  if (edge && edge !== snapState.edge) {
    // 移动到新边缘，吸附
    if (snapState.edge) unsnap();
    snapToEdge(edge);
  } else if (!edge && snapState.edge) {
    // 不在任何边缘，取消吸附
    unsnap();
  }
}

// 触点被触发（hover或click）
function onTriggerActivated() {
  expandFromTrigger();
}

// 鼠标进入主窗口
function onMainWindowMouseEnter() {
  if (snapState.edge && snapState.isExpanded) {
    cancelMouseLeaveTimer();
  }
}

// 鼠标离开主窗口
function onMainWindowMouseLeave() {
  if (snapState.edge && snapState.isExpanded && !isPinned()) {
    startMouseLeaveTimer();
  }
}

module.exports = {
  getSnapState,
  detectEdge,
  snapToEdge,
  unsnap,
  collapseToTrigger,
  expandFromTrigger,
  handleWindowMove,
  handleWindowMoved,
  onTriggerActivated,
  onMainWindowMouseEnter,
  onMainWindowMouseLeave,
  startMouseLeaveTimer,
  cancelMouseLeaveTimer,
  onPinChanged,
};
