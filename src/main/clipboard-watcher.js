// 剪贴板仓 —— 后台采集 + 多格式快照 + 本地持久化
// 设计参照 docs/clipboard-vault-design-v1.md；格式读取借鉴同栈 Edge-Drop 思路（Apache-2.0，仅参考思想）
// 说明：本项目为便携/本地应用，读剪贴板是 Win32 桌面应用常规能力，无需系统权限。
const { clipboard, nativeImage } = require('electron');
const nd = require('./native-drag'); // 用其 clipSeq 做零解码变化探测；无 addon 走兜底门控
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const store = require('./store');

// —— 存储布局：configDir/clipvault/{index.json, clip_*.png} ——
function getVaultDir() {
  const dir = path.join(store.getConfigDir(), 'clipvault');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}
const indexFile = () => path.join(getVaultDir(), 'index.json');

const MAX_TEXT = 200 * 1024;   // 文本/富文本超长截断，防撑爆
const MAX_HTML = 1 * 1024 * 1024;
const POLL_MS = 600;           // 轮询间隔（对齐同类工具量级）

let items = [];        // 新→旧
let timer = null;
let notify = null;
let lastSig = '';
let lastProbe = 0;     // 上次探测图片内容的时间（无 addon 兜底用）
let lastSeq = -1;      // 剪贴板序列号（addon 提供，变化即采）
let skipNext = false;  // 自我写入抑制：本程序写剪贴板后，下一次“变化”不采（避免拖出/复制回采出新条目）

function uid() {
  return 'clip_' + Date.now().toString(36) + '_' + crypto.randomBytes(4).toString('hex');
}
function sha(s) {
  return crypto.createHash('sha1').update(s).digest('hex');
}

// —— 索引持久化（只存元数据，图片落 .png 文件）——
function loadIndex() {
  try {
    if (fs.existsSync(indexFile())) {
      items = JSON.parse(fs.readFileSync(indexFile(), 'utf8'));
    }
  } catch (e) { console.error('clipvault 索引读取失败:', e); items = []; }
  // 补缩略图缓存（图片项启动时算一次）
  items.forEach(it => { if (it.hasImage && !it.thumb) it.thumb = loadThumb(it); });
  items = items.filter(it => it && it.id);
}
function saveIndex() {
  const slim = items.map(it => ({
    id: it.id, kind: it.kind, created: it.created, pinned: !!it.pinned,
    text: it.text, html: it.html, hasImage: !!it.hasImage, hasHtml: !!it.hasHtml,
    imgs: it.imgs || undefined,   // 多图/图文：资产相对名数组（<id>_<i>.png）
    _sig: it._sig || undefined,   // 内容签名（与“最新一条”比较，完全一致不入仓）
  }));
  try { fs.writeFileSync(indexFile(), JSON.stringify(slim)); } catch (e) { console.error('clipvault 索引保存失败:', e); }
}
function imageFile(id) { return path.join(getVaultDir(), id + '.png'); }
function assetPath(rel) { return path.join(getVaultDir(), rel); }
function primaryImagePath(it) {
  if (it.imgs && it.imgs.length) return assetPath(it.imgs[0]);
  return imageFile(it.id);
}
function loadThumb(it) {
  try {
    const p = primaryImagePath(it);
    if (!fs.existsSync(p)) return '';
    return nativeImage.createFromBuffer(fs.readFileSync(p)).resize({ width: 96 }).toDataURL();
  } catch (e) { return ''; }
}
// 删除某条目关联的全部资产（单图或 imgs）
function removeItemAssets(it) {
  if (it.imgs && it.imgs.length) {
    it.imgs.forEach(rel => { try { fs.unlinkSync(assetPath(rel)); } catch (e) {} });
  } else if (it.hasImage) {
    try { fs.unlinkSync(imageFile(it.id)); } catch (e) {}
  }
}

// —— 采集单次剪贴板 → ClipItem；返回 null 表示无新内容 / 被忽略 ——
const isImgFile = (f) => /\.(png|jpe?g|gif|bmp|webp)$/i.test(f);

// 图文场景：QQ 等把图以 <img src="本地临时文件"> 嵌在 HTML 里、剪贴板不放 CF_HDROP → 从 html 抠出仍存在的本地图片
function htmlImgFiles(html) {
  const out = [];
  const re = /src\s*=\s*["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html))) {
    let p = m[1];
    try { p = decodeURIComponent(p); } catch (e) {}
    if (/^file:\/\//i.test(p)) p = p.replace(/^file:\/\/\//i, '').replace(/^file:\/\//i, '');
    p = p.replace(/\//g, '\\');
    if (/^[a-zA-Z]:\\/.test(p) && isImgFile(p)) out.push(p);
  }
  const seen = new Set();
  return out.filter((p) => {
    const k = p.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    try { return fs.existsSync(p); } catch (e) { return false; }
  });
}

function captureNow() {
  try {
    const text = clipboard.readText() || '';
    let html = clipboard.readHTML() || '';
    const img = clipboard.readImage();
    const hasImage = !img.isEmpty();
    const s = store.getSettings();

    const hasText = !!(text && text.trim());

    // 文件列表里的图片（QQ/资源管理器 复制“多图”或“图文”）
    let fileImgs = [];
    try {
      const fl = nd.clipFiles() || [];
      fileImgs = fl.filter(isImgFile);
      if (fileImgs.length && fileImgs.length !== fl.length) fileImgs = []; // 混有非图文件则忽略整批
    } catch (e) { fileImgs = []; }
    // 图文：剪贴板没给 CF_HDROP 时，从 html 抠 <img src="本地临时文件">
    if (!fileImgs.length && hasText && html) fileImgs = htmlImgFiles(html);

    if (!hasText) html = ''; // 无真文字时清掉 html（防纯图/多图误判带富文本）

    if (!hasImage && !fileImgs.length && !html && (text || '').trim().length < (s.clipSkipShort ?? 5)) return null;
    if (!text && !html && !hasImage && !fileImgs.length) return null;

    const trimCap = (newItem) => {
      const max = s.clipMaxItems ?? 200;
      while (items.length > max) { const v = items.pop(); removeItemAssets(v); }
    };

    // —— 多图 / 图文（来源=剪贴板文件列表）——
    if (fileImgs.length) {
      const sigFile = 'imgf:' + sha(fileImgs[0]);
      if (items.length && items[0]._sig === sigFile) return null; // 与最新一条完全一致 → 不入仓
      const id = uid();
      const imgs = [];
      let any = false;
      for (let i = 0; i < fileImgs.length; i++) {
        try {
          const bytes = fs.readFileSync(fileImgs[i]);
          const rel = id + '_' + i + '.png';
          fs.writeFileSync(assetPath(rel), bytes);
          imgs.push(rel);
          any = true;
        } catch (e) { /* 跳过读不到的文件 */ }
      }
      if (any) {
        const it = {
          id, kind: hasText ? 'mixed' : (imgs.length > 1 ? 'images' : 'image'), created: Date.now(), pinned: false,
          text: hasText ? text.slice(0, MAX_TEXT) : '',
          html: (hasText && html) ? html.slice(0, MAX_HTML) : '',
          hasImage: true, hasHtml: !!(hasText && html),
          imgs, _sig: sigFile,
        };
        items.unshift(it);
        trimCap(it);
        saveIndex();
        return it;
      }
      fileImgs = []; // 全部读失败 → 走普通单图/文本路径
    }

    // —— 普通：单图 / 文本 / 富文本 ——
    const kind = hasImage
      ? (hasText ? 'mixed' : 'image')
      : (html ? (hasText ? 'rich' : 'html') : 'text');
    let pngBuf = null;
    if (hasImage) pngBuf = img.toPNG();
    const sig = hasImage ? 'img:' + sha(pngBuf.toString('base64')) : 'txt:' + sha(text);
    if (items.length && items[0]._sig === sig) return null; // 与最新一条完全一致 → 不入仓

    const it = {
      id: uid(), kind, created: Date.now(), pinned: false,
      text: text ? text.slice(0, MAX_TEXT) : '',
      html: html ? html.slice(0, MAX_HTML) : '',
      hasImage, hasHtml: !!html, _sig: sig,
    };
    if (hasImage && pngBuf) {
      try { fs.writeFileSync(imageFile(it.id), pngBuf); } catch (e) { it.hasImage = false; }
    }
    items.unshift(it);
    trimCap(it);
    saveIndex();
    return it;
  } catch (e) {
    console.error('clip 采集失败:', e);
    return null;
  }
}

// 变化探测：优先用原生剪贴板序列号（零解码、任何格式变化都触发）；无 addon 才退回“文本门控 + 图片定时探测”。
function poll() {
  const s = store.getSettings();
  if (!s.clipEnabled || s.clipPaused) return; // 暂停/关闭时不采

  let seqOk = false, changed = false;
  try {
    const q = nd.seq(); // 返回 >=0 表示可用；图片-only 复制同样触发
    if (q >= 0) { seqOk = true; changed = (q !== lastSeq); lastSeq = q; }
  } catch (e) { /* addon 缺失 */ }
  if (seqOk) {
    if (!changed) return;
    if (skipNext) { skipNext = false; lastSeq = q; return; } // 本程序自己的写入，跳过
    if (captureNow()) { if (notify) notify(); }
    return;
  }

  // —— 兜底（无 addon）：文本门控 + 图片定时探测 ——
  let text, formats, sig;
  try {
    formats = clipboard.availableFormats() || [];
    text = clipboard.readText() || '';
  } catch (e) { return; }
  sig = formats.join(',') + '|' + text;
  const imgFmt = formats.some(f => /image/i.test(f));
  if (imgFmt && !text && (sig !== lastSig || Date.now() - lastProbe > 1500)) {
    lastProbe = Date.now();
    try {
      const b = clipboard.readBuffer('image/png');
      if (b && b.length) sig += '|img:' + b.slice(0, 64).toString('hex');
    } catch (e) { /* 无 png 格式 */ }
  }
  if (sig === lastSig) return;
  lastSig = sig;
  if (skipNext) { skipNext = false; return; } // 本程序自己的写入，跳过
  if (captureNow()) { if (notify) notify(); }
}

// —— 对外 API ——
function start(notifyFn) {
  notify = notifyFn;
  loadIndex();
  lastSeq = -1;
  lastSig = '';
  lastProbe = 0;
  if (!timer) timer = setInterval(poll, POLL_MS);
}
function stop() { if (timer) { clearInterval(timer); timer = null; } saveIndex(); }

function list() {
  const now = Date.now();
  return items.map(it => {
    const imgs = it.imgs || [];
    return {
      id: it.id, kind: it.kind, created: it.created, pinned: !!it.pinned,
      hasImage: !!it.hasImage, hasHtml: !!it.hasHtml,
      imageCount: imgs.length || (it.hasImage ? 1 : 0),
      imgs,   // 多图/图文的资产相对名数组
      preview: it.text ? it.text.replace(/\s+/g, ' ').trim().slice(0, 160)
        : (imgs.length > 1 ? '[图片×' + imgs.length + ']'
          : (it.kind === 'images' ? '[多图]' : (it.kind === 'mixed' ? '[图+文]' : '[图片]'))),
      thumb: it.thumb || (it.hasImage ? (it.thumb = loadThumb(it)) : ''),
      ago: Math.max(1, Math.round((now - it.created) / 1000)),
    };
  });
}

function remove(id) {
  const idx = items.findIndex(x => x.id === id);
  if (idx < 0) return false;
  removeItemAssets(items.splice(idx, 1)[0]);
  saveIndex(); return true;
}
function clear() {
  items.forEach(removeItemAssets);
  items = []; saveIndex(); return true;
}
function setPinned(id, pinned) {
  const it = items.find(x => x.id === id);
  if (!it) return false;
  it.pinned = !!pinned; saveIndex(); return true;
}

// 标记一次“自我写入”：下一次剪贴板变化是本程序自己写造成的，跳过不采
function noteSelfWrite() { skipNext = true; }

// 回写剪贴板（多格式：text + html + image 按存在与否放回，尽量还原 QQ 混排）
function writeBack(id) {
  const it = items.find(x => x.id === id);
  if (!it) return false;
  try {
    const data = { text: it.text || '' };
    if (it.hasHtml && it.html) data.html = it.html;
    const p = primaryImagePath(it);
    if (it.hasImage && p && fs.existsSync(p)) {
      data.image = nativeImage.createFromBuffer(fs.readFileSync(p));
    }
    clipboard.write(data);
    noteSelfWrite(); // 本次是我们自己写剪贴板 → 下一次变化不重采
    return true;
  } catch (e) { console.error('clip 回写失败:', e); return false; }
}

// 图片落临时文件并返回路径，供渲染层 startDrag 拖出（可拖进聊天/上传框等）
function materializeImage(id) {
  const it = items.find(x => x.id === id);
  if (!it || !it.hasImage) return null;
  const p = primaryImagePath(it);
  return fs.existsSync(p) ? p : null;
}
// 多图：返回全部资产绝对路径（单个图片也返回单元素数组）
function materializeImages(id) {
  const it = items.find(x => x.id === id);
  if (!it || !it.hasImage) return [];
  if (it.imgs && it.imgs.length) return it.imgs.map(r => assetPath(r)).filter(p => fs.existsSync(p));
  const p = imageFile(it.id);
  return fs.existsSync(p) ? [p] : [];
}

function state() {
  const s = store.getSettings();
  return { count: items.length, paused: !!s.clipPaused, enabled: s.clipEnabled !== false };
}

// 收藏当前剪贴板：即使内容过短也收，并强制置顶（= 钉进"收藏"库）
function favoriteCurrent() {
  try {
    const text = clipboard.readText() || '';
    const html = clipboard.readHTML() || '';
    const img = clipboard.readImage();
    const hasImage = !img.isEmpty();
    if (!text && !html && !hasImage) return null;
    const pngBuf = hasImage ? img.toPNG() : null;
    const hasText = !!(text && text.trim());
    if (hasImage && !hasText) html = '';
    const it = {
      id: uid(), kind: hasImage ? (hasText ? 'mixed' : 'image') : (html ? (hasText ? 'rich' : 'html') : 'text'),
      created: Date.now(), pinned: true,
      text: text ? text.slice(0, MAX_TEXT) : '',
      html: html ? html.slice(0, MAX_HTML) : '',
      hasImage, hasHtml: !!html,
    };
    if (hasImage && pngBuf) { try { fs.writeFileSync(imageFile(it.id), pngBuf); } catch (e) { it.hasImage = false; } }
    items.unshift(it);
    saveIndex();
    return it;
  } catch (e) { console.error('clip 收藏失败:', e); return null; }
}

module.exports = { start, stop, captureNow, favoriteCurrent, list, remove, clear, setPinned, noteSelfWrite, writeBack, materializeImage, materializeImages, imageDataUrl, imageDataRel, getById, buildRichHtml, state };

function getById(id) {
  const it = items.find(x => x.id === id);
  return it ? { id, kind: it.kind, text: it.text || '', html: it.html || '', hasImage: !!it.hasImage } : null;
}

// 重建“有序富文本”：按原 HTML 中 <img> 的先后，逐个替换成我们仓内的图（file:// 绝对路径），
// 从而保留 “图+文+图+文” 的真实顺序；图片指向本仓副本（不会因 QQ 临时文件清理而失效）。
function buildRichHtml(id) {
  const it = items.find(x => x.id === id);
  if (!it || !it.html) return it ? it.html : '';
  if (!it.imgs || !it.imgs.length) return it.html;
  let i = 0;
  const out = it.html.replace(/<img\b[^>]*?\bsrc\s*=\s*["']([^"']*)["']/gi, (whole) => {
    const rel = it.imgs[i];
    i++;
    if (!rel) return whole;
    const abs = assetPath(rel);
    const url = 'file:///' + encodeURI(abs.replace(/\\/g, '/'));
    return whole.replace(/src\s*=\s*["'][^"']*["']/i, 'src="' + url + '"');
  });
  return out;
}

// 取图片大图 dataURL（展开全貌用），按宽等比缩小以免过大
function imageDataUrl(id, maxW) {
  return fileToDataUrl(imageFile(id), maxW);
}
// 按资产相对名取 dataURL（多图用）
function imageDataRel(rel, maxW) {
  return fileToDataUrl(assetPath(rel), maxW);
}
function fileToDataUrl(p, maxW) {
  try {
    if (!fs.existsSync(p)) return '';
    const img = nativeImage.createFromBuffer(fs.readFileSync(p));
    const w = maxW && img.getSize().width > maxW ? maxW : img.getSize().width;
    return img.resize({ width: w }).toDataURL();
  } catch (e) { return ''; }
}
