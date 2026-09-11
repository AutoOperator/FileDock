// IPC 处理器 - 主进程和渲染进程通信
const { ipcMain, screen, BrowserWindow, app, nativeImage, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

const store = require('./store');
const clipWatch = require('./clipboard-watcher');
const dnd = require('./dnd');
const nativeDrag = require('./native-drag');
const dragSession = require('./drag-session');
const fileOps = require('./file-ops');
const snapManager = require('./snap-manager');
const iconManager = require('./icon-manager');
const { getMainWindow, getTriggerWindow, updateWindowIcon, applyAlwaysOnTop } = require('./window-manager');
const { updateTrayIcon } = require('./tray-manager');

function registerIpcHandlers() {

  // ===== 设置相关 =====
  ipcMain.handle('settings:get', () => {
    return store.getSettings();
  });

  ipcMain.handle('settings:update', (event, updates) => {
    const settings = store.updateSettings(updates);
    // 通知所有窗口设置已更新
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('settings-changed', settings);
    });
    return settings;
  });

  // ===== 剪贴板仓 =====
  ipcMain.handle('clip:list', () => clipWatch.list());
  ipcMain.handle('clip:get', (event, id) => clipWatch.getById(id));
  ipcMain.handle('clip:capture', () => clipWatch.captureNow());
  ipcMain.handle('clip:favorite', () => clipWatch.favoriteCurrent());
  ipcMain.handle('clip:delete', (event, id) => clipWatch.remove(id));
  ipcMain.handle('clip:clear', () => clipWatch.clear());
  ipcMain.handle('clip:pin', (event, id, pinned) => clipWatch.setPinned(id, pinned));
  ipcMain.handle('clip:writeBack', (event, id) => clipWatch.writeBack(id));
  ipcMain.handle('clip:materialize', (event, id) => clipWatch.materializeImage(id));
  ipcMain.handle('clip:imageData', (event, id, maxW) => clipWatch.imageDataUrl(id, maxW));
  ipcMain.handle('clip:imageAt', (event, rel, maxW) => clipWatch.imageDataRel(rel, maxW));
  ipcMain.handle('clip:materializeAll', (event, id) => clipWatch.materializeImages(id));

  // 文本/图文拖出：拖拽会话（跟手拖影 + 松手贴进光标下窗口）。
  // 图文/富文本给“有序 HTML”（不附带单张 DIB），避免 QQ 只落图丢文；顺序由 html 的 <img> 次序保留。
  ipcMain.handle('dnd:startText', async (event, id) => {
    const it = clipWatch.getById(id);
    if (!it) return { ok: false, reason: '条目不存在' };
    let html = it.html || '';
    if (it.hasImage && html) html = clipWatch.buildRichHtml(id) || html;
    const r = await dragSession.run(it.text, html, null);
    return { ok: !!(r && r.ok), ghost: true, reason: r && r.error };
  });
  ipcMain.handle('clip:pause', (event, paused) => { store.updateSettings({ clipPaused: paused }); return paused; });
  ipcMain.handle('clip:state', () => clipWatch.state());

  // ===== 预设相关 =====
  ipcMain.handle('preset:create', (event, name, options) => {
    return store.createPreset(name, options);
  });

  ipcMain.handle('preset:getAll', () => {
    return store.getAllPresets();
  });

  ipcMain.handle('preset:get', (event, id) => {
    return store.getPreset(id);
  });

  ipcMain.handle('preset:getActive', () => {
    return store.getActivePreset();
  });

  ipcMain.handle('preset:setActive', (event, id) => {
    store.setActivePreset(id);
    const preset = store.getPreset(id);
    if (preset) {
      // 恢复窗口状态
      const win = getMainWindow();
      if (win && preset.bounds) {
        win.setBounds(preset.bounds);
      }
    }
    return preset;
  });

  ipcMain.handle('preset:update', (event, id, updates) => {
    return store.updatePreset(id, updates);
  });

  ipcMain.handle('preset:delete', (event, id) => {
    return store.deletePreset(id);
  });

  // 重命名文件仓
  ipcMain.handle('preset:rename', (event, id, newName) => {
    return store.updatePreset(id, { name: newName });
  });

  // ===== 文件操作 =====
  ipcMain.handle('file:getInfo', (event, filePaths) => {
    return fileOps.getFilesInfo(filePaths);
  });

  ipcMain.handle('file:open', (event, filePath) => {
    return fileOps.openFile(filePath);
  });

  ipcMain.handle('file:showInFolder', (event, filePath) => {
    return fileOps.showItemInFolder(filePath);
  });

  ipcMain.handle('file:exists', (event, filePath) => {
    return fileOps.fileExists(filePath);
  });

  // 批量删除文件（移入回收站，可恢复，避免误删风险）
  ipcMain.handle('file:delete', async (event, filePaths) => {
    const results = [];
    for (const filePath of filePaths) {
      try {
        if (!fs.existsSync(filePath)) {
          results.push({ path: filePath, success: false, error: '文件不存在' });
          continue;
        }
        // 移入系统回收站（shell.trashItem 支持文件和文件夹）
        await shell.trashItem(filePath);
        results.push({ path: filePath, success: true });
      } catch (err) {
        results.push({ path: filePath, success: false, error: err.message });
      }
    }
    return results;
  });

  // 列出文件夹内容
  ipcMain.handle('folder:list', (event, dirPath) => {
    try {
      if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
        return { success: false, error: '路径不是文件夹或不存在' };
      }
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      const files = entries.map(entry => {
        const fullPath = path.join(dirPath, entry.name);
        const stat = fs.statSync(fullPath);
        return {
          path: fullPath,
          name: entry.name,
          ext: entry.isDirectory() ? '' : path.extname(entry.name).slice(1).toLowerCase(),
          isDirectory: entry.isDirectory(),
          size: stat.size,
          mtime: stat.mtimeMs,
        };
      });
      return { success: true, files };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // 选择文件夹（用于创建引用仓）
  ipcMain.handle('folder:pick', async () => {
    const win = getMainWindow();
    const result = await dialog.showOpenDialog(win, {
      title: '选择文件夹',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, canceled: true };
    }
    return { success: true, path: result.filePaths[0] };
  });

  // 确保文件夹存在（不存在则创建），用于引用仓绑定路径
  ipcMain.handle('folder:ensureDir', (event, dirPath) => {
    try {
      if (!dirPath) return { success: false, error: '路径为空' };
      fs.mkdirSync(dirPath, { recursive: true });
      return { success: true, path: dirPath };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // 创建子项（文件夹或空文件），自动处理重名
  // 用于空白处右键「新建文件夹 / 新建文本文件 / 新建 Markdown 文档」
  ipcMain.handle('folder:createChild', (event, { parentPath, name, isDir }) => {
    try {
      if (!parentPath || !name) return { success: false, error: '参数为空' };
      if (!fs.existsSync(parentPath) || !fs.statSync(parentPath).isDirectory()) {
        return { success: false, error: '父文件夹不存在' };
      }
      let finalName = name;
      let finalPath = path.join(parentPath, finalName);
      if (fs.existsSync(finalPath)) {
        const ext = isDir ? '' : path.extname(name);
        const base = isDir ? name : path.basename(name, ext);
        let i = 1;
        while (fs.existsSync(finalPath)) {
          finalName = isDir ? `${base} (${i})` : `${base} (${i})${ext}`;
          finalPath = path.join(parentPath, finalName);
          i++;
        }
      }
      if (isDir) {
        fs.mkdirSync(finalPath, { recursive: false });
      } else {
        fs.writeFileSync(finalPath, '');
      }
      return { success: true, path: finalPath, name: finalName };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // 在系统资源管理器中打开文件夹
  ipcMain.handle('folder:openInExplorer', (event, folderPath) => {
    try {
      if (!folderPath || !fs.existsSync(folderPath) || !fs.statSync(folderPath).isDirectory()) {
        return { success: false, error: '文件夹不存在' };
      }
      shell.openPath(folderPath);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // 重命名文件/文件夹（同目录改名）
  // 用于文件/文件夹右键「重命名」
  ipcMain.handle('folder:rename', (event, { srcPath, newName }) => {
    try {
      if (!srcPath || !newName) return { success: false, error: '参数为空' };
      if (!fs.existsSync(srcPath)) {
        return { success: false, error: '源文件不存在' };
      }
      if (/[\\/:*?"<>|]/.test(newName)) {
        return { success: false, error: '名称包含非法字符' };
      }
      const dir = path.dirname(srcPath);
      const destPath = path.join(dir, newName);
      if (path.normalize(destPath) === path.normalize(srcPath)) {
        return { success: true, path: srcPath, name: newName, noChange: true };
      }
      if (fs.existsSync(destPath)) {
        return { success: false, error: '同名文件已存在' };
      }
      fs.renameSync(srcPath, destPath);
      return { success: true, path: destPath, name: newName };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // 真实移动文件
  ipcMain.handle('file:move', (event, { srcPath, destDir }) => {
    try {
      if (!fs.existsSync(srcPath)) {
        return { success: false, error: '源文件不存在' };
      }
      const fileName = path.basename(srcPath);
      const destPath = path.join(destDir, fileName);
      // 处理重名
      let finalPath = destPath;
      if (fs.existsSync(finalPath)) {
        const ext = path.extname(fileName);
        const base = path.basename(fileName, ext);
        let i = 1;
        while (fs.existsSync(finalPath)) {
          finalPath = path.join(destDir, `${base} (${i})${ext}`);
          i++;
        }
      }
      fs.renameSync(srcPath, finalPath);
      // 跨盘可能失败，回退到复制+删除
      return { success: true, destPath: finalPath };
    } catch (err) {
      // 尝试复制+删除（跨盘）
      try {
        const fileName = path.basename(srcPath);
        const destPath = path.join(destDir, fileName);
        if (fs.statSync(srcPath).isDirectory()) {
          copyFolderRecursiveSync(srcPath, destPath);
          fs.rmSync(srcPath, { recursive: true, force: true });
        } else {
          fs.copyFileSync(srcPath, destPath);
          fs.unlinkSync(srcPath);
        }
        return { success: true, destPath };
      } catch (err2) {
        return { success: false, error: err2.message };
      }
    }
  });

  // 真实复制文件
  ipcMain.handle('file:copy', (event, { srcPath, destDir }) => {
    try {
      if (!fs.existsSync(srcPath)) {
        return { success: false, error: '源文件不存在' };
      }
      const fileName = path.basename(srcPath);
      let destPath = path.join(destDir, fileName);
      // 处理重名
      if (fs.existsSync(destPath)) {
        const ext = path.extname(fileName);
        const base = path.basename(fileName, ext);
        let i = 1;
        while (fs.existsSync(destPath)) {
          destPath = path.join(destDir, `${base} (${i})${ext}`);
          i++;
        }
      }
      if (fs.statSync(srcPath).isDirectory()) {
        copyFolderRecursiveSync(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
      return { success: true, destPath };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // 拖出文件 - 开始原生拖拽
  ipcMain.handle('file:startDrag', (event, items) => {
    // items: [{path, name, icon(dataURL)}]
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && items.length > 0) {
      const icon = items[0].icon
        ? nativeImage.createFromDataURL(items[0].icon)
        : createDefaultIcon();
      win.webContents.startDrag({
        files: items.map(i => i.path),
        icon: icon,
      });
    }
    return true;
  });

  // ===== 窗口控制 =====
  ipcMain.handle('window:pin', (event, pinned) => {
    store.updateWindowState({ pinned });
    const win = getMainWindow();
    if (win) {
      // 固定后设置不可拖动（通过渲染进程控制）
      win.webContents.send('pin-state-changed', pinned);
    }
    // 固定状态下暂停自动隐藏：取消进行中的隐藏计时，必要时恢复展开
    snapManager.onPinChanged(pinned);
    return pinned;
  });

  ipcMain.handle('window:getState', () => {
    return store.getWindowState();
  });

  ipcMain.handle('window:setBounds', (event, bounds) => {
    const win = getMainWindow();
    if (win) {
      win.setBounds(bounds);
    }
    return true;
  });

  ipcMain.handle('window:close', () => {
    const settings = store.getSettings();
    if (settings.closeToTray) {
      const win = getMainWindow();
      if (win) win.hide();
      return false; // 不真正关闭
    }
    app.quit();
    return true;
  });

  ipcMain.handle('window:minimize', () => {
    const win = getMainWindow();
    if (win) win.minimize();
    return true;
  });

  // 最小化到托盘：始终隐藏主窗口（不受"关闭后最小化到托盘"设置限制）
  // 用于标题栏最小化按钮：当不在可自动隐藏位置时，直接收到托盘
  ipcMain.handle('window:hideToTray', () => {
    const win = getMainWindow();
    if (win) win.hide();
    return true;
  });

  // 标题栏"-"按钮：从当前窗口位置实时探测吸附边缘（不依赖缓存的 snapState.edge）
  // - 处于吸附边缘：若已固定则先取消固定（同步渲染进程 + snap 层），再吸附并立即折叠为触点
  // - 不在吸附边缘：最小化到托盘（保持固定状态不变）
  ipcMain.handle('window:minimizeOrSnap', () => {
    const win = getMainWindow();
    if (!win) return { action: 'none' };
    const bounds = win.getBounds();
    const edge = snapManager.detectEdge(bounds);
    if (!edge) {
      // 不在吸附边缘：最小化到托盘，固定状态保持不变
      win.hide();
      return { action: 'tray' };
    }
    // 处于吸附边缘：若已固定，先取消固定
    const ws = store.getWindowState();
    if (ws.pinned) {
      store.updateWindowState({ pinned: false });
      win.webContents.send('pin-state-changed', false);
      // onPinChanged(false) 会触发吸附（snapToEdge 对齐 + 按 autoHideOnSnap 安排折叠计时）
      snapManager.onPinChanged(false);
    }
    // 确保吸附已建立（覆盖：未固定但尚未吸附的情况，如启动后未拖动过）
    const snap = snapManager.getSnapState();
    if (snap.edge !== edge) {
      snapManager.snapToEdge(edge);
    }
    // 立即折叠为触点（不等 autoHideOnSnap 计时，这是用户显式最小化动作）
    snapManager.collapseToTrigger();
    return { action: 'snap' };
  });

  ipcMain.handle('window:toggleAlwaysOnTop', (event, onTop) => {
    // 统一应用置顶到主窗口和触点窗口：启用时使用 screen-saver 强层级
    // （与固定后的窗口一致，高于全屏视频等），关闭时取消置顶
    applyAlwaysOnTop(!!onTop);
    return onTop;
  });

  // 设置窗口可点击区域（用于透明区域鼠标穿透）
  ipcMain.handle('window:setShape', (event, rects) => {
    const win = getMainWindow();
    if (win) {
      try {
        win.setShape(rects || []);
      } catch (err) {
        // setShape 可能在某些平台不支持
      }
    }
    return true;
  });

  // ===== 吸附相关 =====
  ipcMain.handle('snap:getState', () => {
    return snapManager.getSnapState();
  });

  ipcMain.handle('snap:checkAndSnap', (event, bounds) => {
    const edge = snapManager.detectEdge(bounds);
    if (edge) {
      snapManager.snapToEdge(edge);
      return edge;
    }
    return null;
  });

  ipcMain.handle('snap:unsnap', () => {
    snapManager.unsnap();
    return true;
  });

  ipcMain.handle('snap:expand', () => {
    snapManager.expandFromTrigger();
    return true;
  });

  ipcMain.handle('snap:collapse', () => {
    snapManager.collapseToTrigger();
    return true;
  });

  // 触点窗口 - 鼠标进入
  ipcMain.on('trigger:mouseEnter', () => {
    const settings = store.getSettings();
    if (settings.triggerAction === 'hover') {
      snapManager.onTriggerActivated();
    }
  });

  // 触点窗口 - 鼠标点击
  ipcMain.on('trigger:mouseClick', () => {
    const settings = store.getSettings();
    if (settings.triggerAction === 'click') {
      snapManager.onTriggerActivated();
    }
  });

  // 主窗口 - 鼠标进入
  ipcMain.on('window:mouseEnter', () => {
    snapManager.onMainWindowMouseEnter();
  });

  // 主窗口 - 鼠标离开
  ipcMain.on('window:mouseLeave', () => {
    snapManager.onMainWindowMouseLeave();
  });

  // 窗口拖动结束 - 检测吸附
  ipcMain.on('window:moved', (event, bounds) => {
    snapManager.handleWindowMoved();
  });

  // 保存当前预设的文件列表
  ipcMain.handle('preset:saveFiles', (event, presetId, files) => {
    return store.updatePreset(presetId, { files });
  });

  // 保存窗口状态到预设
  ipcMain.handle('preset:saveWindowState', (event, presetId, bounds, viewMode) => {
    return store.updatePreset(presetId, { bounds, viewMode });
  });

  // 获取屏幕信息
  ipcMain.handle('screen:getDisplay', () => {
    const display = screen.getPrimaryDisplay();
    return {
      workArea: display.workArea,
      size: display.size,
    };
  });

  // ===== 图标管理 =====
  // 列出所有可用图标
  ipcMain.handle('icon:list', () => {
    return {
      current: iconManager.getCurrentIconName(),
      icons: iconManager.listIcons(),
    };
  });

  // 设置当前图标
  ipcMain.handle('icon:set', (event, iconName) => {
    store.updateSettings({ iconName });
    // 同步更新任务栏和托盘图标
    updateWindowIcon(iconName);
    updateTrayIcon(iconName);
    return { success: true, iconName };
  });

  // 上传自定义图标（接收 dataUrl）
  ipcMain.handle('icon:upload', (event, { dataUrl, name }) => {
    try {
      // 解析 dataUrl: data:image/png;base64,xxxx
      const match = /^data:image\/\w+;base64,(.+)$/.exec(dataUrl || '');
      if (!match) return { success: false, error: '无效的图片数据' };
      const buf = Buffer.from(match[1], 'base64');
      const iconName = iconManager.saveCustomIcon(buf, name || 'custom.png');
      // 自动切换到新上传的图标
      store.updateSettings({ iconName });
      updateWindowIcon(iconName);
      updateTrayIcon(iconName);
      return { success: true, iconName };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // 删除自定义图标
  ipcMain.handle('icon:delete', (event, iconName) => {
    const ok = iconManager.deleteCustomIcon(iconName);
    // 如果删除的是当前图标，回退到 folder
    if (ok && iconManager.getCurrentIconName() === iconName) {
      store.updateSettings({ iconName: 'folder' });
      updateWindowIcon('folder');
      updateTrayIcon('folder');
    }
    return { success: ok };
  });
}

// 创建默认拖拽图标（32x32 蓝色方块）
function createDefaultIcon() {
  const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAABGdBTUEAALGPC/xhBQAAAAlwSFlzAAAOwQAADsEBuJFr7QAAABl0RVh0U29mdHdhcmUAcGFpbnQubmV0IDQuMC4xNkRpr/UAAAA0SURBVFhH7c0xDQAgEATBh7z9h0UcQzvM0EzQMEEzQcMELdAETdAETdAETdAETdAETdAETdAETdAETdAETfwm8gWfnAmW8YmFvQAAAABJRU5ErkJggg==';
  return nativeImage.createFromBuffer(Buffer.from(pngBase64, 'base64'));
}

// 递归复制文件夹
function copyFolderRecursiveSync(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyFolderRecursiveSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

module.exports = {
  registerIpcHandlers,
};
