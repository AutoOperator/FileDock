// 剪贴板仓 —— 后台采集 + 多格式快照 + 本地持久化
// 设计参照 docs/clipboard-vault-design-v1.md；格式读取借鉴同栈 Edge-Drop 思路（Apache-2.0，仅参考思想）
// 说明：本项目为便携/本地应用，读剪贴板是 Win32 桌面应用常规能力，无需系统权限。
const { clipboard, nativeImage } = require('electron');
const nd = require('./native-drag'); // 用其 clipSeq 做零解码变化探测；无 addon 走兜底门控
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const store = require('./store');

// —— 存储布局：configDir/clipvault/{index.json, clip_<id>.png, clip_<id>.txt/.html} ——
// 索引只存元数据与正文预览；超长 text/html 落独立文件，保证 index.json 恒定轻量
//（此前整份正文内联在索引里，上限组合下单文件可达上百 MB，且每次采集都全量重写）。
function getVaultDir() {
  const dir = path.join(store.getConfigDir(), 'clipvault');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}
const indexFile = () => path.join(getVaultDir(), 'index.json');

const MAX_TEXT = 200 * 1024;   // 文本/富文本超长截断，防撑爆
const MAX_HTML = 1 * 1024 * 1024;
const INLINE_MAX = 16 * 1024;  // 超过此长度的 text/html 落独立文件，索引里只留预览
const PREVIEW_MAX = 512;       // 索引中保留的正文预览长度
const POLL_MS = 600;           // 轮询间隔（对齐同类工具量级）

let items = [];        // 新→旧
let timer = null;
let notify = null;
let lastSig = '';
let lastProbe = 0;     // 上次探测图片内容的时间（无 addon 兜底用）
let lastSeq = -1;      // 剪贴板序列号（addon 提供，变化即采）
let skipNext = false;  // 自我写入抑制：本程序写剪贴板后，下一次“变化”不采（避免拖出/复制回采出新条目）

// 缩略图缓存（id → dataURL）。只存内存不进索引：启动时零解码开销，渲染层按需来取。
const thumbs = new Map();

function uid() {
  return 'clip_' + Date.now().toString(36) + '_' + crypto.randomBytes(4).toString('hex');
}
function sha(s) {
  return crypto.createHash('sha1').update(s).digest('hex');
}

// 图片资产的对外文件名：Clip_年月日-时分秒_随机.png（多图加 _序号）。
// 旧版曾把不同条目的图存成同一个名字（如 download.png），拖出到同一文件夹会互相覆盖；
// 现在每条资产天生唯一且可读，拖出即为最终文件名。
function fmtStamp(ts) {
  const d = new Date(ts);
  const p = (n, w) => String(n).padStart(w || 2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
function assetStem(created) {
  return 'Clip_' + fmtStamp(created) + '_' + crypto.randomBytes(2).toString('hex');
}

// —— 索引持久化 ——
function loadIndex() {
  try {
    if (fs.existsSync(indexFile())) {
      const raw = fs.readFileSync(indexFile(), 'utf8');
      try {
        items = JSON.parse(raw);
      } catch (parseErr) {
        // 索引损坏：把坏文件改名留档供排查，而不是悄悄清空后继续覆写
        try { fs.renameSync(indexFile(), indexFile() + '.bad-' + Date.now()); } catch (e) {}
        console.error('clipvault 索引损坏，已备份:', parseErr);
        items = [];
      }
    }
  } catch (e) { console.error('clipvault 索引读取失败:', e); items = []; }
  items = items.filter(it => it && it.id);
  if (normalizeLoadedItems()) flushIndex();
}

// 加载后归一化：统一图片资产到 it.imgs，并做“先到先得”的资产认领。
// 旧版数据可能把多个条目指向同一个文件名（后者覆盖前者），仍存在的文件归最新条目，
// 其余条目视为图片已丢失（hasImage 置否）；旧命名的存活文件顺手改成可读唯一名。
function normalizeLoadedItems() {
  let changed = false;
  const claimed = new Set();
  for (const it of items) {
    const rels = Array.isArray(it.imgs) ? it.imgs.slice() : (it.hasImage ? [it.id + '.png'] : []);
    const kept = [];
    for (let i = 0; i < rels.length; i++) {
      let rel = rels[i];
      const abs = assetPath(rel);
      if (claimed.has(rel)) continue;
      if (!fs.existsSync(abs)) continue;
      if (!/^Clip_/.test(rel)) {
        // 旧命名 → 改成 Clip_时间戳_随机.png，拖出即得好名字
        let renamed = '';
        for (let n = 0; n < 50; n++) {
          const cand = assetStem(it.created) + (n ? '_' + n : '') + '.png';
          if (!fs.existsSync(assetPath(cand))) { renamed = cand; break; }
        }
        if (renamed) {
          try { fs.renameSync(abs, assetPath(renamed)); rel = renamed; } catch (e) { /* 保原名 */ }
        }
      }
      claimed.add(rel);
      kept.push(rel);
    }
    const hadImgs = Array.isArray(it.imgs);
    if (kept.length) {
      if (!hadImgs || it.imgs.join('\u0000') !== kept.join('\u0000')) changed = true;
      it.imgs = kept;
      it.hasImage = true;
    } else if (it.hasImage || hadImgs) {
      it.imgs = undefined;
      it.hasImage = false;
      changed = true;
    }
  }
  return changed;
}

let saveTimer = null;
let saveDirty = false;

// 原子写：先写 .tmp 再改名覆盖。同步直写一旦中途被打断会留下截断的 JSON，
// 下次启动解析失败会把整段历史当空表处理。
function writeIndexNow() {
  const slim = items.map(it => ({
    id: it.id, kind: it.kind, created: it.created, pinned: !!it.pinned,
    text: it.text, html: it.html, hasImage: !!it.hasImage, hasHtml: !!it.hasHtml,
    imgs: it.imgs || undefined,   // 多图/图文：资产相对名数组（<id>_<i>.png）
    tFile: it.tFile || undefined, // 超长正文：独立文件相对名（clip_<id>.txt）
    hFile: it.hFile || undefined, // 超长富文本：独立文件相对名（clip_<id>.html）
    _sig: it._sig || undefined,   // 内容签名（与“最新一条”比较，完全一致不入仓）
  }));
  const tmp = indexFile() + '.tmp';
  try {
    fs.writeFileSync(tmp, JSON.stringify(slim));
    fs.renameSync(tmp, indexFile());
  } catch (e) {
    console.error('clipvault 索引保存失败:', e);
    try { fs.unlinkSync(tmp); } catch (e2) {}
  }
}
// 采集可能短时间连发，整份索引重写做 1s 去抖；退出时 flush
function saveIndex() {
  saveDirty = true;
  if (!saveTimer) saveTimer = setTimeout(flushIndex, 1000);
}
function flushIndex() {
  clearTimeout(saveTimer);
  saveTimer = null;
  if (!saveDirty) return;
  saveDirty = false;
  writeIndexNow();
}

// —— 正文/富文本全文存取 ——
// 短内容内联在索引字段中（item.text/html 即全文）；超长内容落独立文件，索引字段只留预览
function fullText(it) {
  if (it.tFile) {
    try { return fs.readFileSync(assetPath(it.tFile), 'utf8'); } catch (e) { return it.text || ''; }
  }
  return it.text || '';
}
function fullHtml(it) {
  if (it.hFile) {
    try { return fs.readFileSync(assetPath(it.hFile), 'utf8'); } catch (e) { return it.html || ''; }
  }
  return it.html || '';
}
function storeText(id, text) {
  if (text.length > INLINE_MAX) {
    const rel = id + '.txt';
    try { fs.writeFileSync(assetPath(rel), text, 'utf8'); return { text: text.slice(0, PREVIEW_MAX), tFile: rel }; }
    catch (e) { return { text: text.slice(0, PREVIEW_MAX) }; }
  }
  return { text };
}
function storeHtml(id, html) {
  if (html.length > INLINE_MAX) {
    const rel = id + '.html';
    try { fs.writeFileSync(assetPath(rel), html, 'utf8'); return { html: html.slice(0, PREVIEW_MAX), hFile: rel }; }
    catch (e) { return { html: html.slice(0, PREVIEW_MAX) }; }
  }
  return { html };
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
// 删除某条目关联的全部资产（单图或 imgs + 超长正文/富文本文件）
function removeItemAssets(it) {
  if (it.imgs && it.imgs.length) {
    it.imgs.forEach(rel => { try { fs.unlinkSync(assetPath(rel)); } catch (e) {} });
  } else if (it.hasImage) {
    try { fs.unlinkSync(imageFile(it.id)); } catch (e) {}
  }
  if (it.tFile) { try { fs.unlinkSync(assetPath(it.tFile)); } catch (e) {} }
  if (it.hFile) { try { fs.unlinkSync(assetPath(it.hFile)); } catch (e) {} }
  thumbs.delete(it.id);
}

// 淘汰超出上限的旧条目。收藏（置顶）条目不参与自动淘汰——否则标星的记录会被悄悄清掉。
function trimToCap(max) {
  const evicted = [];
  while (items.length > max) {
    let idx = -1;
    for (let i = items.length - 1; i >= 0; i--) {
      if (!items[i].pinned) { idx = i; break; }
    }
    if (idx < 0) break; // 全是收藏项，不再淘汰
    const [v] = items.splice(idx, 1);
    removeItemAssets(v);
    evicted.push(v.id);
  }
  return evicted;
}

// —— 采集单次剪贴板 → ClipItem；返回 {added, evicted} 或 null 表示无新内容 / 被忽略 ——
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

    const max = s.clipMaxItems ?? 200;

    // —— 多图 / 图文（来源=剪贴板文件列表）——
    if (fileImgs.length) {
      const sigFile = 'imgf:' + sha(fileImgs[0]);
      if (items.length && items[0]._sig === sigFile) return null; // 与最新一条完全一致 → 不入仓
      const id = uid();
      const stem = assetStem(Date.now());
      const imgs = [];
      let any = false;
      for (let i = 0; i < fileImgs.length; i++) {
        try {
          const bytes = fs.readFileSync(fileImgs[i]);
          const rel = stem + '_' + i + '.png';
          fs.writeFileSync(assetPath(rel), bytes);
          imgs.push(rel);
          any = true;
        } catch (e) { /* 跳过读不到的文件 */ }
      }
      if (any) {
        const it = {
          id, kind: hasText ? 'mixed' : (imgs.length > 1 ? 'images' : 'image'), created: Date.now(), pinned: false,
          ...storeText(id, hasText ? text.slice(0, MAX_TEXT) : ''),
          ...storeHtml(id, (hasText && html) ? html.slice(0, MAX_HTML) : ''),
          hasImage: true, hasHtml: !!(hasText && html),
          imgs, _sig: sigFile,
        };
        items.unshift(it);
        const evicted = trimToCap(max);
        saveIndex();
        return { added: it, evicted };
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

    const id = uid();
    const it = {
      id, kind, created: Date.now(), pinned: false,
      ...storeText(id, text ? text.slice(0, MAX_TEXT) : ''),
      ...storeHtml(id, html ? html.slice(0, MAX_HTML) : ''),
      hasImage, hasHtml: !!html, _sig: sig,
    };
    if (hasImage && pngBuf) {
      const rel = assetStem(it.created) + '.png';
      try { fs.writeFileSync(assetPath(rel), pngBuf); it.imgs = [rel]; } catch (e) { it.hasImage = false; }
    }
    items.unshift(it);
    const evicted = trimToCap(max);
    saveIndex();
    return { added: it, evicted };
  } catch (e) {
    console.error('clip 采集失败:', e);
    return null;
  }
}

// 变化探测：优先用原生剪贴板序列号（零解码、任何格式变化都触发）；无 addon 才退回“文本门控 + 图片定时探测”。
function poll() {
  const s = store.getSettings();
  if (!s.clipEnabled || s.clipPaused) return; // 暂停/关闭时不采

  let seqOk = false, changed = false, q = -1;
  try {
    q = nd.seq(); // 返回 >=0 表示可用；图片-only 复制同样触发
    if (q >= 0) { seqOk = true; changed = (q !== lastSeq); lastSeq = q; }
  } catch (e) { /* addon 缺失 */ }
  if (seqOk) {
    if (!changed) return;
    if (skipNext) { skipNext = false; lastSeq = q; return; } // 本程序自己的写入，跳过
    const r = captureNow();
    if (r && notify) notify(r);
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
  const r = captureNow();
  if (r && notify) notify(r);
}

// —— 对外 API ——
// 单条 → 渲染层载荷（不含缩略图；缩略图由渲染层按需经 clip:thumb 拉取，
// 避免整表载荷携带几百张 base64 图导致 IPC 膨胀）
function formatItem(it) {
  const imgs = it.imgs || [];
  return {
    id: it.id, kind: it.kind, created: it.created, pinned: !!it.pinned,
    hasImage: !!it.hasImage, hasHtml: !!it.hasHtml,
    imageCount: imgs.length || (it.hasImage ? 1 : 0),
    imgs,   // 多图/图文的资产相对名数组
    preview: it.text ? it.text.replace(/\s+/g, ' ').trim().slice(0, 160)
      : (imgs.length > 1 ? '[图片×' + imgs.length + ']'
        : (it.kind === 'images' ? '[多图]' : (it.kind === 'mixed' ? '[图+文]' : '[图片]'))),
    ago: Math.max(1, Math.round((Date.now() - it.created) / 1000)),
  };
}

function list() {
  return items.map(formatItem);
}

// 缩略图懒加载：渲染层建卡时按需取，主进程缓存避免重复解码
function thumb(id) {
  const it = items.find(x => x.id === id);
  if (!it || !it.hasImage) return '';
  if (thumbs.has(id)) return thumbs.get(id);
  const u = loadThumb(it);
  thumbs.set(id, u);
  return u;
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
    const data = { text: fullText(it) };
    if (it.hasHtml && it.html) data.html = fullHtml(it);
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
  return { count: items.length, paused: !!s.clipPaused, enabled: s.clipEnabled !== false, max: s.clipMaxItems ?? 200 };
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
    const id = uid();
    const it = {
      id, kind: hasImage ? (hasText ? 'mixed' : 'image') : (html ? (hasText ? 'rich' : 'html') : 'text'),
      created: Date.now(), pinned: true,
      ...storeText(id, text ? text.slice(0, MAX_TEXT) : ''),
      ...storeHtml(id, html ? html.slice(0, MAX_HTML) : ''),
      hasImage, hasHtml: !!html,
    };
    if (hasImage && pngBuf) { const rel = assetStem(it.created) + '.png'; try { fs.writeFileSync(assetPath(rel), pngBuf); it.imgs = [rel]; } catch (e) { it.hasImage = false; } }
    items.unshift(it);
    trimToCap(store.getSettings().clipMaxItems ?? 200);
    saveIndex();
    return it;
  } catch (e) { console.error('clip 收藏失败:', e); return null; }
}

module.exports = { start, stop, captureNow, favoriteCurrent, list, thumb, formatItem, remove, clear, setPinned, noteSelfWrite, writeBack, materializeImage, materializeImages, imageDataUrl, imageDataRel, getById, buildRichHtml, state };

function start(notifyFn) {
  notify = notifyFn;
  loadIndex();
  lastSeq = -1;
  lastSig = '';
  lastProbe = 0;
  if (!timer) timer = setInterval(poll, POLL_MS);
}
function stop() { if (timer) { clearInterval(timer); timer = null; } flushIndex(); }

function getById(id) {
  const it = items.find(x => x.id === id);
  if (!it) return null;
  return { id, kind: it.kind, text: fullText(it), html: fullHtml(it), hasImage: !!it.hasImage };
}

// 重建“有序富文本”：按原 HTML 中 <img> 的先后，逐个替换成我们仓内的图（file:// 绝对路径），
// 从而保留 “图+文+图+文” 的真实顺序；图片指向本仓副本（不会因 QQ 临时文件清理而失效）。
function buildRichHtml(id) {
  const it = items.find(x => x.id === id);
  if (!it) return '';
  const html = fullHtml(it);
  if (!it.html || !it.imgs || !it.imgs.length) return html;
  let i = 0;
  const out = html.replace(/<img\b[^>]*?\bsrc\s*=\s*["']([^"']*)["']/gi, (whole) => {
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
