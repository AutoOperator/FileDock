// 文件操作模块 - 处理文件拖出（移动/复制）
const { app } = require('electron');
const path = require('path');
const fs = require('fs');

// 获取文件信息
function getFileInfo(filePath) {
  try {
    const stat = fs.statSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const name = path.basename(filePath);
    return {
      path: filePath,
      name,
      ext,
      isDirectory: stat.isDirectory(),
      size: stat.size,
      addedAt: Date.now(),
    };
  } catch (e) {
    return null;
  }
}

// 批量获取文件信息
function getFilesInfo(filePaths) {
  return filePaths.map(getFileInfo).filter(Boolean);
}

// 检查文件是否存在
function fileExists(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

// 打开文件
async function openFile(filePath) {
  const { shell } = require('electron');
  if (fileExists(filePath)) {
    await shell.openPath(filePath);
    return true;
  }
  return false;
}

// 在文件管理器中显示
async function showItemInFolder(filePath) {
  const { shell } = require('electron');
  if (fileExists(filePath)) {
    shell.showItemInFolder(filePath);
    return true;
  }
  return false;
}

module.exports = {
  getFileInfo,
  getFilesInfo,
  fileExists,
  openFile,
  showItemInFolder,
};
