// 数据存储模块 - 管理配置和预设
const Store = require('electron-store');
const { app } = require('electron');
const path = require('path');
const fs = require('fs');

// 检测是否为便携模式（绿色版）
// - asar 打包：app.isPackaged === true
// - 目录打包（resources/app/）：app.isPackaged === false，但 __dirname 包含 resources/app
// - exe 同级存在 config 目录：用户手动放置的绿色版
function isPortableMode() {
  if (app.isPackaged) return true;
  const normalized = __dirname.replace(/\\/g, '/');
  if (normalized.includes('/resources/app/')) return true;
  // 绿色文件夹版：exe 同级有 config 目录则按便携模式处理
  const exeDir = path.dirname(app.getPath('exe'));
  return fs.existsSync(path.join(exeDir, 'config'));
}

// 获取配置文件目录
// 绿色版：配置跟 exe 走，放在 exe 同目录的 config 文件夹
// 开发版：使用默认的 userData 目录
function getConfigDir() {
  if (isPortableMode()) {
    // electron-builder portable 运行时会设置 PORTABLE_EXECUTABLE_DIR
    const portableDir = process.env.PORTABLE_EXECUTABLE_DIR;
    const baseDir = portableDir || path.dirname(app.getPath('exe'));
    const configDir = path.join(baseDir, 'config');
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    return configDir;
  }
  return app.getPath('userData');
}

const store = new Store({
  name: 'filedock-config',
  cwd: getConfigDir(),
  defaults: {
    settings: {
      theme: 'default',       // 主题: 'default' | 'cat' | 'popsicle' | 'glass'
      themeMode: 'day',       // 日间/夜间: 'day' | 'night'
      accentColor: '',        // 强调色，空则用主题默认色
      // 吸附设置
      snapEnabled: true,      // 是否启用吸附
      snapThreshold: 20,      // 吸附阈值(像素)
      autoHideOnSnap: true,   // 吸附后自动隐藏
      triggerSize: 'medium',  // 触点大小 'small'|'medium'|'large'
      triggerColor: '',       // 触点颜色，空则用强调色
      triggerAction: 'hover', // 恢复方式 'hover'|'click'
      hideDelay: 1500,        // 隐藏延迟(毫秒)
      // 窗口行为
      alwaysOnTop: true,      // 窗口置顶
      closeToTray: true,      // 关闭时最小化到托盘
      // 文件夹操作模式
      folderMode: 'safe',     // 'safe' 安全模式 | 'modify' 修改模式
      modifyModeConfirmed: false, // 修改模式切换警告已确认（不再提示切换警告）
      // 临时仓拖出行为
      removeOnDragOutFromTemp: true, // 从临时仓拖出文件时，是否从仓中移除引用（默认移除）
      // 剪贴板仓
      clipEnabled: true,     // 是否启用剪贴板自动采集（自动全收）
      clipPaused: false,     // 是否暂停采集（隐私/暂不收纳）
      clipMaxItems: 200,     // 历史条数上限
      clipSkipShort: 5,      // 纯短文本忽略长度（<此长度无图无富文本不收纳）
      // 顶栏按钮顺序（用户可自定义）
      toolbarOrder: ['settings', 'view', 'filter', 'sort', 'edit', 'pin', 'hide', 'close'],
      // 排序状态
      sortDirection: 'asc',   // 'asc' | 'desc'
      sortBy: 'name',         // 'name' | 'time' | 'size'
      // 筛选状态
      filterEnabled: false,         // 是否启用筛选
      filterMode: 'type',           // 'type' 按类型 | 'ext' 按后缀名
      filterChecked: {},            // { 'type:image': true, 'ext:pdf': false, ... } 勾选状态
      // 应用图标
      iconName: 'folder',     // 默认图标名 | 'custom:<filename>'
      // 启动行为
      startupPreset: 'last',  // 'last' | 'new' | preset id
    },
    presets: [],
    activePresetId: null,
    windowState: {
      bounds: null,           // {x, y, width, height}
      pinned: false,
      viewMode: 'list',       // 'list' | 'grid'
    }
  }
});

// 文件仓管理（内部仍沿用 presets 存储键与函数名，对用户统一称"文件仓"）
// 文件仓分两类：
//   - temporary 临时仓：仓内仅存文件引用，拖出即从仓中消失，不影响真实文件
//   - reference 引用仓：绑定真实文件夹 folderPath，仓内内容为该文件夹的实时引用
function createPreset(name, options = {}) {
  const type = options.type === 'reference' ? 'reference'
    : options.type === 'clipboard' ? 'clipboard'
    : 'temporary'; // 'temporary' | 'reference' | 'clipboard'
  const preset = {
    id: `preset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: name || '未命名文件仓',
    type,
    folderPath: options.type === 'reference' ? (options.folderPath || '') : undefined,
    files: [],               // 临时仓：[{path, name, ext, iconType, addedAt}]；引用仓/剪贴板仓：留空，内容另有来源
    viewMode: 'list',
    bounds: null,
    createdAt: Date.now(),
  };

  // 引用仓：若未指定路径，则在配置目录下创建一个空文件夹作为绑定目录
  if (preset.type === 'reference' && !preset.folderPath) {
    const baseDir = path.join(getConfigDir(), 'reference-docks', preset.id);
    try {
      fs.mkdirSync(baseDir, { recursive: true });
      preset.folderPath = baseDir;
    } catch (err) {
      console.error('创建引用仓默认文件夹失败:', err);
    }
  }

  const presets = store.get('presets', []);
  presets.push(preset);
  store.set('presets', presets);
  return preset;
}

function getPreset(id) {
  const presets = store.get('presets', []);
  return presets.find(p => p.id === id) || null;
}

function getAllPresets() {
  return store.get('presets', []);
}

function updatePreset(id, updates) {
  const presets = store.get('presets', []);
  const idx = presets.findIndex(p => p.id === id);
  if (idx >= 0) {
    presets[idx] = { ...presets[idx], ...updates };
    store.set('presets', presets);
    return presets[idx];
  }
  return null;
}

function deletePreset(id) {
  const presets = store.get('presets', []);
  const filtered = presets.filter(p => p.id !== id);
  store.set('presets', filtered);
  return filtered;
}

function getActivePreset() {
  const id = store.get('activePresetId');
  if (!id) return null;
  return getPreset(id);
}

function setActivePreset(id) {
  store.set('activePresetId', id);
}

// 设置管理（含旧格式迁移）
function getSettings() {
  const s = store.get('settings');
  // 旧格式迁移：theme 曾经是 'day'|'night'
  if (s.theme === 'day' || s.theme === 'night') {
    s.themeMode = s.theme;
    s.theme = 'default';
    store.set('settings', s);
  }
  if (!s.themeMode) {
    s.themeMode = 'day';
    store.set('settings', s);
  }
  return s;
}

function updateSettings(updates) {
  const settings = store.get('settings');
  store.set('settings', { ...settings, ...updates });
  return store.get('settings');
}

// 窗口状态
function getWindowState() {
  return store.get('windowState');
}

function updateWindowState(updates) {
  const state = store.get('windowState');
  store.set('windowState', { ...state, ...updates });
  return store.get('windowState');
}

module.exports = {
  store,
  getConfigDir,
  createPreset,
  getPreset,
  getAllPresets,
  updatePreset,
  deletePreset,
  getActivePreset,
  setActivePreset,
  getSettings,
  updateSettings,
  getWindowState,
  updateWindowState,
};
