// preload 脚本 - 安全的 IPC 桥接
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // 设置
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    update: (updates) => ipcRenderer.invoke('settings:update', updates),
    onChanged: (callback) => {
      const handler = (event, settings) => callback(settings);
      ipcRenderer.on('settings-changed', handler);
      return () => ipcRenderer.removeListener('settings-changed', handler);
    },
  },

  // 文件仓（内部仍用 presets 通道）
  presets: {
    create: (name, options) => ipcRenderer.invoke('preset:create', name, options),
    getAll: () => ipcRenderer.invoke('preset:getAll'),
    get: (id) => ipcRenderer.invoke('preset:get', id),
    getActive: () => ipcRenderer.invoke('preset:getActive'),
    setActive: (id) => ipcRenderer.invoke('preset:setActive', id),
    update: (id, updates) => ipcRenderer.invoke('preset:update', id, updates),
    delete: (id) => ipcRenderer.invoke('preset:delete', id),
    rename: (id, newName) => ipcRenderer.invoke('preset:rename', id, newName),
    saveFiles: (id, files) => ipcRenderer.invoke('preset:saveFiles', id, files),
    saveWindowState: (id, bounds, viewMode) => ipcRenderer.invoke('preset:saveWindowState', id, bounds, viewMode),
  },

  // 文件操作
  files: {
    getInfo: (paths) => ipcRenderer.invoke('file:getInfo', paths),
    open: (path) => ipcRenderer.invoke('file:open', path),
    showInFolder: (path) => ipcRenderer.invoke('file:showInFolder', path),
    exists: (path) => ipcRenderer.invoke('file:exists', path),
    startDrag: (items) => ipcRenderer.invoke('file:startDrag', items),
    delete: (paths) => ipcRenderer.invoke('file:delete', paths),
    move: (srcPath, destDir) => ipcRenderer.invoke('file:move', { srcPath, destDir }),
    copy: (srcPath, destDir) => ipcRenderer.invoke('file:copy', { srcPath, destDir }),
  },

  // 剪贴板仓
  clip: {
    list: () => ipcRenderer.invoke('clip:list'),
    get: (id) => ipcRenderer.invoke('clip:get', id),
    capture: () => ipcRenderer.invoke('clip:capture'),
    favorite: () => ipcRenderer.invoke('clip:favorite'),
    remove: (id) => ipcRenderer.invoke('clip:delete', id),
    clear: () => ipcRenderer.invoke('clip:clear'),
    pin: (id, pinned) => ipcRenderer.invoke('clip:pin', id, pinned),
    writeBack: (id) => ipcRenderer.invoke('clip:writeBack', id),
    materialize: (id) => ipcRenderer.invoke('clip:materialize', id),
    materializeAll: (id) => ipcRenderer.invoke('clip:materializeAll', id),
    imageData: (id, maxW) => ipcRenderer.invoke('clip:imageData', id, maxW),
    imageAt: (rel, maxW) => ipcRenderer.invoke('clip:imageAt', rel, maxW),
    pause: (paused) => ipcRenderer.invoke('clip:pause', paused),
    state: () => ipcRenderer.invoke('clip:state'),
    onChanged: (callback) => {
      const handler = () => callback();
      ipcRenderer.on('clip:changed', handler);
      return () => ipcRenderer.removeListener('clip:changed', handler);
    },
  },

  // 文件夹操作
  folder: {
    list: (dirPath) => ipcRenderer.invoke('folder:list', dirPath),
    pick: () => ipcRenderer.invoke('folder:pick'),
    ensureDir: (dirPath) => ipcRenderer.invoke('folder:ensureDir', dirPath),
    createChild: (parentPath, name, isDir) => ipcRenderer.invoke('folder:createChild', { parentPath, name, isDir }),
    openInExplorer: (folderPath) => ipcRenderer.invoke('folder:openInExplorer', folderPath),
    rename: (srcPath, newName) => ipcRenderer.invoke('folder:rename', { srcPath, newName }),
  },

  // 窗口控制
  window: {
    pin: (pinned) => ipcRenderer.invoke('window:pin', pinned),
    getState: () => ipcRenderer.invoke('window:getState'),
    setBounds: (bounds) => ipcRenderer.invoke('window:setBounds', bounds),
    close: () => ipcRenderer.invoke('window:close'),
    minimize: () => ipcRenderer.invoke('window:minimize'),
    hideToTray: () => ipcRenderer.invoke('window:hideToTray'),
    minimizeOrSnap: () => ipcRenderer.invoke('window:minimizeOrSnap'),
    toggleAlwaysOnTop: (onTop) => ipcRenderer.invoke('window:toggleAlwaysOnTop', onTop),
    setShape: (rects) => ipcRenderer.invoke('window:setShape', rects),
    onPinChanged: (callback) => {
      const handler = (event, pinned) => callback(pinned);
      ipcRenderer.on('pin-state-changed', handler);
      return () => ipcRenderer.removeListener('pin-state-changed', handler);
    },
    mouseEnter: () => ipcRenderer.send('window:mouseEnter'),
    mouseLeave: () => ipcRenderer.send('window:mouseLeave'),
    moved: (bounds) => ipcRenderer.send('window:moved', bounds),
  },

  // 吸附
  snap: {
    getState: () => ipcRenderer.invoke('snap:getState'),
    checkAndSnap: (bounds) => ipcRenderer.invoke('snap:checkAndSnap', bounds),
    unsnap: () => ipcRenderer.invoke('snap:unsnap'),
    expand: () => ipcRenderer.invoke('snap:expand'),
    collapse: () => ipcRenderer.invoke('snap:collapse'),
  },

  // 触点窗口
  trigger: {
    mouseEnter: () => ipcRenderer.send('trigger:mouseEnter'),
    mouseClick: () => ipcRenderer.send('trigger:mouseClick'),
    onConfig: (callback) => {
      const handler = (event, config) => callback(config);
      ipcRenderer.on('trigger-config', handler);
      return () => ipcRenderer.removeListener('trigger-config', handler);
    },
  },

  // 屏幕信息
  screen: {
    getDisplay: () => ipcRenderer.invoke('screen:getDisplay'),
  },

  // 文本 OLE 拖出
  dnd: {
    startText: (id) => ipcRenderer.invoke('dnd:startText', id),
  },

  // 图标管理
  icon: {
    list: () => ipcRenderer.invoke('icon:list'),
    set: (name) => ipcRenderer.invoke('icon:set', name),
    upload: (dataUrl, name) => ipcRenderer.invoke('icon:upload', { dataUrl, name }),
    remove: (name) => ipcRenderer.invoke('icon:delete', name),
  },

  // 动作通知（来自托盘菜单）
  actions: {
    onNewPreset: (callback) => {
      const handler = () => callback();
      ipcRenderer.on('action:newPreset', handler);
      return () => ipcRenderer.removeListener('action:newPreset', handler);
    },
    onManagePresets: (callback) => {
      const handler = () => callback();
      ipcRenderer.on('action:managePresets', handler);
      return () => ipcRenderer.removeListener('action:managePresets', handler);
    },
    onOpenSettings: (callback) => {
      const handler = () => callback();
      ipcRenderer.on('action:openSettings', handler);
      return () => ipcRenderer.removeListener('action:openSettings', handler);
    },
  },
});
