// 图标管理模块 - 管理默认图标和自定义图标，运行时切换任务栏/托盘图标
const { nativeImage, app } = require('electron');
const path = require('path');
const fs = require('fs');
const { getConfigDir, getSettings, updateSettings } = require('./store');

// 默认图标定义
const DEFAULT_ICONS = [
  { name: 'folder', label: '文件夹', file: 'folder.png' },
  { name: 'warehouse', label: '收纳盒', file: 'warehouse.png' },
  { name: 'monogram', label: '字母 F', file: 'monogram.png' },
];

// 获取默认图标所在目录
function getDefaultIconsDir() {
  // 1. 跟随源码打包的目录（src/main/default-icons/ → resources/app/src/main/default-icons/）
  const srcDir = path.join(__dirname, 'default-icons');
  if (fs.existsSync(srcDir)) return srcDir;
  // 2. 开发环境：build/icons/
  const devDir = path.join(__dirname, '..', '..', 'build', 'icons');
  if (fs.existsSync(devDir)) return devDir;
  // 3. 打包环境：resources/icons/
  if (process.resourcesPath) {
    const pkgDir = path.join(process.resourcesPath, 'icons');
    if (fs.existsSync(pkgDir)) return pkgDir;
  }
  // 兜底：build/icon.png 所在目录
  return path.join(__dirname, '..', '..', 'build');
}

// 获取自定义图标目录（config/icons/）
function getCustomIconsDir() {
  const dir = path.join(getConfigDir(), 'icons');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

// 根据图标名获取图标文件路径
function getIconPath(iconName) {
  // 自定义图标：'custom:<filename>'
  if (iconName && iconName.startsWith('custom:')) {
    const filename = iconName.slice('custom:'.length);
    const p = path.join(getCustomIconsDir(), filename);
    if (fs.existsSync(p)) return p;
    return null;
  }
  // 默认图标
  const def = DEFAULT_ICONS.find(i => i.name === iconName);
  if (!def) {
    // 兜底用 folder
    const fallback = DEFAULT_ICONS[0];
    const p = path.join(getDefaultIconsDir(), fallback.file);
    return fs.existsSync(p) ? p : null;
  }
  const p = path.join(getDefaultIconsDir(), def.file);
  return fs.existsSync(p) ? p : null;
}

// 创建托盘/任务栏用的 nativeImage（16x16 清晰）
function getIconImage(iconName) {
  const p = getIconPath(iconName);
  if (!p) return createFallbackImage();
  let image = nativeImage.createFromPath(p);
  if (image.isEmpty()) return createFallbackImage();
  image = image.resize({ width: 16, height: 16 });
  image.setTemplateImage(false);
  return image;
}

// 获取大尺寸图标（用于窗口图标，更清晰）
function getWindowIconImage(iconName) {
  const p = getIconPath(iconName);
  if (!p) return createFallbackImage();
  let image = nativeImage.createFromPath(p);
  if (image.isEmpty()) return createFallbackImage();
  image.setTemplateImage(false);
  return image;
}

// 兜底图标（蓝色实心方块，保证不透明）
function createFallbackImage() {
  const size = 16;
  const buf = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    buf[i * 4] = 37; buf[i * 4 + 1] = 99; buf[i * 4 + 2] = 235; buf[i * 4 + 3] = 255;
  }
  return nativeImage.createFromBuffer(buf, { width: size, height: size });
}

// 列出所有可用图标（默认 + 自定义），含 dataUrl 用于缩略图
function listIcons() {
  const result = [];
  // 默认图标
  for (const def of DEFAULT_ICONS) {
    const p = path.join(getDefaultIconsDir(), def.file);
    if (fs.existsSync(p)) {
      result.push({
        name: def.name,
        label: def.label,
        isCustom: false,
        dataUrl: fileToDataUrl(p),
      });
    }
  }
  // 自定义图标
  const customDir = getCustomIconsDir();
  try {
    const files = fs.readdirSync(customDir).filter(f => /\.png$/i.test(f));
    for (const f of files) {
      const p = path.join(customDir, f);
      result.push({
        name: 'custom:' + f,
        label: path.basename(f, '.png'),
        isCustom: true,
        dataUrl: fileToDataUrl(p),
      });
    }
  } catch (e) {}
  return result;
}

function fileToDataUrl(filePath) {
  try {
    const buf = fs.readFileSync(filePath);
    return 'data:image/png;base64,' + buf.toString('base64');
  } catch (e) {
    return '';
  }
}

// 保存上传的自定义图标，返回图标名
function saveCustomIcon(buffer, originalName) {
  const dir = getCustomIconsDir();
  // 安全文件名
  const base = path.basename(originalName || 'icon.png').replace(/[^\w.\-]/g, '_');
  let filename = base.endsWith('.png') ? base : base + '.png';
  // 避免覆盖默认图标名
  if (DEFAULT_ICONS.some(i => i.file === filename)) {
    filename = 'custom_' + filename;
  }
  // 避免重名
  let final = filename;
  let i = 1;
  while (fs.existsSync(path.join(dir, final))) {
    const ext = path.extname(filename);
    const stem = path.basename(filename, ext);
    final = `${stem}_${i}${ext}`;
    i++;
  }
  const fullPath = path.join(dir, final);
  fs.writeFileSync(fullPath, buffer);
  return 'custom:' + final;
}

// 删除自定义图标
function deleteCustomIcon(iconName) {
  if (!iconName || !iconName.startsWith('custom:')) return false;
  const filename = iconName.slice('custom:'.length);
  const p = path.join(getCustomIconsDir(), filename);
  try {
    if (fs.existsSync(p)) {
      fs.unlinkSync(p);
      return true;
    }
  } catch (e) {}
  return false;
}

// 当前选中的图标名
function getCurrentIconName() {
  return getSettings().iconName || 'folder';
}

module.exports = {
  DEFAULT_ICONS,
  getDefaultIconsDir,
  getCustomIconsDir,
  getIconPath,
  getIconImage,
  getWindowIconImage,
  listIcons,
  saveCustomIcon,
  deleteCustomIcon,
  getCurrentIconName,
  createFallbackImage,
};
