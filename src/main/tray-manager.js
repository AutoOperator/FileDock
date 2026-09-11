// 系统托盘模块
const { Tray, Menu, app } = require('electron');
const iconManager = require('./icon-manager');

let tray = null;

function createTray(mainWindow, callbacks = {}) {
  const icon = iconManager.getIconImage(iconManager.getCurrentIconName());
  tray = new Tray(icon);
  tray.setToolTip('FileDock - 文件收纳');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示/隐藏窗口',
      click: () => callbacks.toggleWindow?.(),
    },
    { type: 'separator' },
    {
      label: '新建文件仓',
      click: () => callbacks.newPreset?.(),
    },
    {
      label: '文件仓管理',
      click: () => callbacks.managePresets?.(),
    },
    { type: 'separator' },
    {
      label: '设置',
      click: () => callbacks.openSettings?.(),
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    callbacks.toggleWindow?.();
  });

  return tray;
}

// 运行时更新托盘图标
function updateTrayIcon(iconName) {
  if (!tray) return;
  const image = iconManager.getIconImage(iconName);
  tray.setImage(image);
}

function destroyTray() {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}

module.exports = {
  createTray,
  destroyTray,
  updateTrayIcon,
};
