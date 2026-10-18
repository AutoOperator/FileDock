// 网格视图媒体支持：图片缩略图 + 未知后缀的系统关联图标
// 缩略图按路径+mtime 缓存；系统图标按后缀缓存（同一后缀只向系统取一次）
const { nativeImage, app } = require('electron');
const fs = require('fs');
const path = require('path');

const THUMB_W = 256;          // 缩略图目标宽（覆盖大格子 + 高分屏）
const MAX_CACHE = 400;        // 缩略图缓存上限，超过整体清空（内存保护）

const thumbCache = new Map(); // 'path|mtime' → dataURL（'' 表示解码失败，避免反复重试）
const iconCache = new Map();  // '.ext' → dataURL

function capThumbCache() {
  if (thumbCache.size > MAX_CACHE) thumbCache.clear();
}

// 单图缩略图。解码失败（tiff 等原生不支持的格式）返回 ''，由渲染层退回系统图标。
async function thumb(filePath) {
  try {
    const st = await fs.promises.stat(filePath);
    const key = filePath + '|' + st.mtimeMs;
    if (thumbCache.has(key)) return thumbCache.get(key);
    const buf = await fs.promises.readFile(filePath);
    let img = nativeImage.createFromBuffer(buf);
    if (img.isEmpty()) { thumbCache.set(key, ''); capThumbCache(); return ''; }
    if (img.getSize().width > THUMB_W) img = img.resize({ width: THUMB_W });
    const url = img.toDataURL();
    thumbCache.set(key, url);
    capThumbCache();
    return url;
  } catch (e) {
    return '';
  }
}

// Windows 资源管理器风格的关联应用图标（.psd → Photoshop、.lnk → 目标程序 …）
async function fileIcon(filePath) {
  try {
    const ext = path.extname(filePath).toLowerCase();
    if (iconCache.has(ext)) return iconCache.get(ext);
    const img = await app.getFileIcon(filePath, { size: 'large' });
    const url = img.isEmpty() ? '' : img.toDataURL();
    iconCache.set(ext, url);
    return url;
  } catch (e) {
    return '';
  }
}

module.exports = { thumb, fileIcon };
