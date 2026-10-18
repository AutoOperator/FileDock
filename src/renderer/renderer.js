// 渲染进程主逻辑
'use strict';

// ===== 状态管理 =====
const state = {
  settings: null,
  activePreset: null,
  allPresets: [],          // 所有文件仓（用于底部序号栏）
  files: [],
  viewMode: 'list',
  pinned: false,
  selectedFile: null,
  contextMenuFile: null,
  isDragging: false,
  editMode: false,         // 是否处于编辑模式
  selectedPaths: new Set(), // 编辑模式下选中的文件路径集合
  // 排序状态
  sortDirection: 'asc',    // 'asc' | 'desc'
  sortBy: 'name',          // 'name' | 'time' | 'size'
  // 筛选状态
  filterEnabled: false,         // 是否启用筛选
  filterMode: 'type',           // 'type' 按类型 | 'ext' 按后缀名
  filterChecked: {},            // { 'type:image': true, 'ext:pdf': false, ... }
  // 文件夹导航状态
  folderMode: false,       // 是否处于文件夹浏览模式
  folderStack: [],         // 文件夹路径栈 [{path, name}]
  folderFiles: [],         // 文件夹模式下的文件列表（备份）
  // 文件夹操作模式
  folderOpMode: 'safe',    // 'safe' | 'modify'
  // 临时文件集合（安全模式下拖入的文件路径）
  temporaryPaths: new Set(),
  // 顶栏按钮顺序
  toolbarOrder: ['settings', 'view', 'filter', 'sort', 'edit', 'pin', 'hide', 'close'],
  // 吸附状态
  isSnapped: false,
  // 框选状态
  boxSelecting: false,
  // 编辑模式搜索
  searchQuery: '',        // 关键词（空 = 未搜索）
  searchRecursive: false, // false=仅当前目录级 true=含所有子目录
  searchResults: null,    // 递归搜索结果（null=尚未搜索/搜索中）
};

// 当前文件仓是否为引用仓
function isActiveReferenceDock() {
  return state.activePreset && state.activePreset.type === 'reference';
}

// 当前文件仓是否为剪贴板仓
function isActiveClipboardDock() {
  return state.activePreset && state.activePreset.type === 'clipboard';
}

// 同步 body.clip-dock：剪贴板仓显示 #clip-area、隐藏文件区与文件专用按钮（样式在 styles.css）
function applyClipDockClass() {
  document.body.classList.toggle('clip-dock', isActiveClipboardDock());
}

// 主题装饰高度配置（与 CSS 中的 margin 一致）
const THEME_DECO_PADDING = {
  default: { top: 0, bottom: 0 },
  cat: { top: 46, bottom: 0 },
  popsicle: { top: 0, bottom: 72 },
  glass: { top: 0, bottom: 0 },
};

// ===== DOM 元素 =====
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// HTML 转义：文件名、文件夹名、文件仓名来自磁盘或用户输入，直接拼进 innerHTML 时
// 其中的 < > " 会被当作标签/属性边界解析（文件名里一个引号就能截断属性）。
// 所有插入 innerHTML 的用户数据都要先过这里。
function escHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// 本地文件 → file:// URL（缩略图/预览直接引用原文件用）
function fileUrlOf(p) {
  return 'file:///' + encodeURI(String(p).replace(/\\/g, '/')).replace(/#/g, '%23').replace(/\?/g, '%3F');
}

// 弹层定位后按实际尺寸钳回窗口内，避免超出窗口边界被裁掉
function clampPopup(el, x, y) {
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  const w = el.offsetWidth || 0;
  const h = el.offsetHeight || 0;
  el.style.left = `${Math.max(4, Math.min(x, window.innerWidth - w - 4))}px`;
  el.style.top = `${Math.max(4, Math.min(y, window.innerHeight - h - 4))}px`;
}

const els = {
  app: $('#app'),
  titlebar: $('#titlebar'),
  fileList: $('#file-list'),
  fileArea: $('#file-area'),
  emptyState: $('#empty-state'),
  fileCount: $('#file-count'),
  presetName: $('#preset-name'),
  viewToggleBtn: $('#view-toggle-btn'),
  filterBtn: $('#filter-btn'),
  filterPanel: $('#filter-panel'),
  filterBody: $('#filter-body'),
  filterToggleAll: $('#filter-toggle-all'),
  editBtn: $('#edit-btn'),
  pinBtn: $('#pin-btn'),
  settingsBtn: $('#settings-btn'),
  closeBtn: $('#close-btn'),
  minimizeBtn: $('#minimize-btn'),
  sortBtn: $('#sort-btn'),
  sortMenu: $('#sort-menu'),
  hideBtn: $('#hide-btn'),
  toolbarButtons: $('#toolbar-buttons'),
  settingsPanel: $('#settings-panel'),
  presetPanel: $('#preset-panel'),
  contextMenu: $('#context-menu'),
  emptyContextMenu: $('#empty-context-menu'),
  addPresetBtn: $('#add-preset-btn'),
  editBar: $('#edit-bar'),
  editDeleteBtn: $('#edit-delete'),
  deleteMenuItem: $('.delete-menu-item'),
  breadcrumbBar: $('#breadcrumb-bar'),
  breadcrumbPath: $('#breadcrumb-path'),
  folderBackBtn: $('#folder-back-btn'),
  searchBar: $('#search-bar'),
  searchInput: $('#search-input'),
  searchScopeBtn: $('#search-scope-btn'),
  modeBtn: $('#mode-btn'),
  modeLabel: $('#mode-label'),
  modeIcon: $('#mode-icon'),
  dockTypeIndicator: $('#dock-type-indicator'),
  dockTypeIcon: $('#dock-type-icon'),
  dockTypeLabel: $('#dock-type-label'),
  dockPager: $('#dock-pager'),
  emptyIcon: $('#empty-icon'),
  emptyText: $('#empty-text'),
};

function getFileIconType(ext, isDir) {
  if (isDir) return 'folder';
  // ext 在数据流里有两种历史格式：file-ops 给 '.png' 带点、folder:list 与重命名给 'png' 不带点。
  // 下面按带点比较，故先补点；两种格式都收，避免引用仓/文件夹浏览里的类型判定整体失效。
  const raw = (ext || '').toLowerCase();
  const e = raw.startsWith('.') ? raw : '.' + raw;
  const imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg', '.ico', '.tif', '.tiff'];
  const videoExts = ['.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm', '.m4v', '.mpg', '.mpeg', '.3gp'];
  const audioExts = ['.mp3', '.wav', '.flac', '.aac', '.ogg', '.wma'];
  const docExts = ['.txt', '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.md', '.rtf'];
  const archiveExts = ['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2'];
  const codeExts = ['.js', '.ts', '.py', '.java', '.c', '.cpp', '.h', '.html', '.css', '.json', '.xml', '.sh', '.go', '.rs', '.rb', '.php'];

  if (imageExts.includes(e)) return 'image';
  if (videoExts.includes(e)) return 'video';
  if (audioExts.includes(e)) return 'audio';
  if (docExts.includes(e)) return 'document';
  if (archiveExts.includes(e)) return 'archive';
  if (codeExts.includes(e)) return 'code';
  return 'default';
}

function getFileIcon(file) {
  const type = getFileIconType(file.ext, file.isDirectory);
  const themeName = state.settings ? (state.settings.theme || 'default') : 'default';
  const icons = getThemeIcons(themeName);
  return { type, svg: icons.files[type] || icons.files.default };
}

// ===== 初始化 =====
async function init() {
  // 加载设置
  state.settings = await window.api.settings.get();
  state.folderOpMode = state.settings.folderMode || 'safe';
  state.toolbarOrder = state.settings.toolbarOrder || state.toolbarOrder;
  state.sortDirection = state.settings.sortDirection || 'asc';
  state.sortBy = state.settings.sortBy || 'name';
  state.filterEnabled = state.settings.filterEnabled || false;
  state.filterMode = state.settings.filterMode || 'type';
  state.filterChecked = state.settings.filterChecked || {};

  // 加载预设
  await loadPreset();

  // 应用主题
  applyTheme();

  // 应用模式
  applyFolderOpMode();

  // 应用视图模式（内部会调用 renderFiles）
  applyViewMode();

  // 应用顶栏顺序
  applyToolbarOrder();
  updateSearchScopeBtn();

  // 绑定事件
  bindEvents();

  // 窗口大小变化时更新可点击区域
  window.addEventListener('resize', () => {
    updateWindowShape();
  });

  // 查询吸附状态
  const snapState = await window.api.snap.getState();
  state.isSnapped = !!(snapState && snapState.edge);
  updateHideButton();

  // 监听设置变化
  window.api.settings.onChanged((settings) => {
    state.settings = settings;
    state.folderOpMode = settings.folderMode || 'safe';
    applyTheme();
    applyFolderOpMode();
  });

  // 监听剪贴板采集变化：后台采到新内容时增量插入，避免整表重建打断选中/展开/滚动
  window.api.clip.onChanged((payload) => {
    if (isActiveClipboardDock() && window.__clipUI) window.__clipUI.onChanged(payload);
  });

  // 监听 pin 状态
  window.api.window.onPinChanged((pinned) => {
    state.pinned = pinned;
    updatePinButton();
  });

  // 监听托盘动作
  window.api.actions.onOpenSettings(() => openSettings());
  window.api.actions.onNewPreset(() => openPresetPanel());
  window.api.actions.onManagePresets(() => openPresetPanel());

  // 加载窗口状态
  const winState = await window.api.window.getState();
  if (winState.pinned) {
    state.pinned = true;
    updatePinButton();
  }
  if (winState.viewMode) {
    state.viewMode = winState.viewMode;
    applyViewMode();
  }
}

// ===== 预设管理 =====
async function loadPreset() {
  let preset = await window.api.presets.getActive();

  if (!preset) {
    const settings = state.settings;
    if (settings.startupPreset === 'new') {
      preset = await window.api.presets.create('新文件仓');
      await window.api.presets.setActive(preset.id);
    } else {
      const allPresets = await window.api.presets.getAll();
      if (allPresets.length > 0) {
        preset = allPresets[allPresets.length - 1];
        await window.api.presets.setActive(preset.id);
      } else {
        preset = await window.api.presets.create('默认临时仓');
        await window.api.presets.setActive(preset.id);
      }
    }
  }

  state.activePreset = preset;
  state.allPresets = await window.api.presets.getAll();

  // 切换仓时重置文件夹导航状态，避免面包屑栏残留 / 还原错乱
  resetFolderNavigation();

  // 引用仓：从绑定的文件夹实时读取内容；临时仓：使用存储的文件引用
  if (preset.type === 'reference' && preset.folderPath) {
    await refreshReferenceDock();
  } else {
    state.files = preset.files || [];
    applySort();
  }
  if (preset.viewMode) {
    state.viewMode = preset.viewMode;
  }
  els.presetName.textContent = preset.name;

  // 更新底部状态栏的文件仓相关指示
  updateDockTypeIndicator();
  renderDockPager();
}

// 从引用仓绑定的文件夹实时读取文件列表
async function refreshReferenceDock() {
  const preset = state.activePreset;
  if (!preset || preset.type !== 'reference' || !preset.folderPath) {
    state.files = [];
    return;
  }
  // 正在浏览子文件夹时，刷新的是当前所在目录而不是仓根目录——
  // 否则子文件夹里做完操作，列表会"自动跳回根目录"
  if (state.folderMode && state.folderStack.length > 0) {
    const cur = state.folderStack[state.folderStack.length - 1];
    const r = await window.api.folder.list(cur.path);
    if (r.success) { state.files = r.files; applySort(); }
    await refreshPoolIfSearching();
    return;
  }
  const result = await window.api.folder.list(preset.folderPath);
  if (result.success) {
    state.files = result.files;
    applySort();
  } else {
    // 文件夹失效：显示空状态
    state.files = [];
  }
  await refreshPoolIfSearching(); // 递归搜索池同步刷新
}

async function saveCurrentPreset() {
  if (!state.activePreset || state.folderMode) return;
  // 引用仓的内容来自文件夹实时读取，不需要保存文件列表
  if (state.activePreset.type === 'reference') return;
  await window.api.presets.saveFiles(state.activePreset.id, state.files);
}

// ===== 主题 =====
function applyTheme() {
  const themeName = state.settings.theme || 'default';
  const themeMode = state.settings.themeMode || 'day';
  document.body.className = `theme-${themeName}-${themeMode}`;

  // 强调色：用户设置了就用用户的，否则用主题默认色
  const icons = getThemeIcons(themeName);
  const defaultAccent = themeMode === 'night' ? icons.defaultAccentNight : icons.defaultAccent;
  const accent = state.settings.accentColor || defaultAccent;
  document.documentElement.style.setProperty('--accent', accent);

  // 应用主题图标
  applyThemeIcons();

  // 更新窗口可点击区域（透明区域穿透鼠标）
  updateWindowShape();
}

// 更新窗口可点击区域（让装饰区域外的透明区域鼠标穿透）
function updateWindowShape() {
  const theme = state.settings ? (state.settings.theme || 'default') : 'default';
  const deco = THEME_DECO_PADDING[theme] || THEME_DECO_PADDING.default;
  const w = window.innerWidth;
  const h = window.innerHeight;

  const rects = [];
  // #app 区域（主内容区）
  rects.push({
    x: 0,
    y: deco.top,
    width: w,
    height: Math.max(1, h - deco.top - deco.bottom),
  });
  // 顶部装饰区域（可拖动窗口）
  if (deco.top > 0) {
    rects.push({ x: 0, y: 0, width: w, height: deco.top });
  }
  // 底部装饰区域（可拖动窗口）
  if (deco.bottom > 0) {
    rects.push({ x: 0, y: h - deco.bottom, width: w, height: deco.bottom });
  }

  if (window.api && window.api.window && window.api.window.setShape) {
    window.api.window.setShape(rects);
  }
}

// 应用主题图标到所有按钮和文件项
function applyThemeIcons() {
  const themeName = state.settings.theme || 'default';
  const icons = getThemeIcons(themeName);

  // 替换所有按钮图标
  for (const [btnId, iconKey] of Object.entries(BUTTON_ICON_MAP)) {
    const btn = document.getElementById(btnId);
    if (!btn || !icons.ui[iconKey]) continue;
    // 保留按钮内的 <span> 文本（如 mode-btn 的标签、编辑栏按钮的文字）
    const spans = btn.querySelectorAll('span');
    let spanHtml = '';
    spans.forEach(s => { spanHtml += s.outerHTML; });
    btn.innerHTML = icons.ui[iconKey] + spanHtml;
  }

  // 重新渲染文件项以更新文件图标
  if (state.files.length > 0) {
    renderFiles();
  }

  // 同步模式图标与文件仓类型图标（主题切换后颜色跟随）
  updateModeIcon();
  updateDockTypeIndicator();
  renderEmptyIcon();
  // 视图切换按钮图标随模式变化，主题切换后需重新设置
  updateViewToggleIcon();
}

// ===== 文件夹操作模式 =====
function updateModeIcon() {
  if (!els.modeIcon) return;
  const icons = getThemeIcons(state.settings.theme || 'default');
  const key = state.folderOpMode === 'modify' ? 'mode-modify' : 'mode-safe';
  els.modeIcon.innerHTML = icons.ui[key] || '';
}

function applyFolderOpMode() {
  els.app.classList.toggle('mode-modify', state.folderOpMode === 'modify');
  els.app.classList.toggle('mode-safe', state.folderOpMode === 'safe');
  els.modeLabel.textContent = state.folderOpMode === 'modify' ? '修改' : '安全';
  els.modeBtn.title = state.folderOpMode === 'modify' ? '当前：修改模式（点击切换为安全模式）' : '当前：安全模式（点击切换为修改模式）';
  updateModeIcon();

  // 根据 模式 + 文件仓类型 调整"从磁盘删除 / 从列表移除"的可见性
  updateActionsForDockType();
}

async function toggleFolderOpMode() {
  const nextMode = state.folderOpMode === 'safe' ? 'modify' : 'safe';
  // 切换到修改模式时，若未勾选"不再提示"，显示一次警告
  if (nextMode === 'modify' && !state.settings.modifyModeConfirmed) {
    const result = await showConfirmDialog({
      title: '切换到修改模式',
      message: '修改模式下，引用仓与文件夹内的拖入 / 拖出 / 删除将真实修改对应文件夹，且不会再有提示。确定要切换吗？',
      checkboxLabel: '不再提示',
    });
    if (!result.confirmed) return;
    if (result.checked) {
      state.settings = await window.api.settings.update({ modifyModeConfirmed: true });
    }
  }
  state.folderOpMode = nextMode;
  state.settings = await window.api.settings.update({ folderMode: state.folderOpMode });
  applyFolderOpMode();
  renderFiles();
}

// 根据 文件仓类型 + 操作模式 调整可用操作（隐藏不适用的菜单/按钮）
function updateActionsForDockType() {
  const isRef = isActiveReferenceDock();
  const isModify = state.folderOpMode === 'modify';

  // "从列表移除"：所有仓都显示。
  // 引用仓的真实文件无法"仅从列表移除"（在 batchRemove / removeFileFromList 内部判断并提示），
  // 但安全模式拖入的临时文件可以移除，故按钮需可见。
  const removeItem = document.querySelector('#context-menu .menu-item[data-action="remove"]');
  if (removeItem) removeItem.classList.remove('hidden');
  const editRemoveBtn = document.getElementById('edit-remove');
  if (editRemoveBtn) editRemoveBtn.classList.remove('hidden');

  // "从磁盘删除"：仅修改模式可见（安全模式一律不显示，避免用户误以为可以删除）
  const showDelete = isModify;
  const deleteItem = document.querySelector('#context-menu .menu-item[data-action="delete"]');
  if (deleteItem) deleteItem.classList.toggle('hidden', !showDelete);
  els.editDeleteBtn.classList.toggle('hidden', !showDelete);

  // "重命名"：仅修改模式可见（安全模式不改磁盘）
  const renameItem = document.querySelector('#context-menu .menu-item[data-action="rename"]');
  if (renameItem) renameItem.classList.toggle('hidden', !isModify);

  // "移动到文件夹"：仅修改模式可见（安全模式不改磁盘）
}

// ===== 文件仓类型指示 =====
function updateDockTypeIndicator() {
  if (!els.dockTypeIcon) return;
  const isRef = isActiveReferenceDock();
  const isClip = isActiveClipboardDock();
  const icons = getThemeIcons(state.settings.theme || 'default');
  const key = isRef ? 'dock-ref' : (isClip && icons.ui['dock-clip'] ? 'dock-clip' : 'dock-temp');
  els.dockTypeIcon.innerHTML = icons.ui[key] || '';
  els.dockTypeLabel.textContent = isRef ? '引用' : (isClip ? '剪贴' : '临时');
  els.dockTypeIndicator.title = isRef
    ? `引用仓${state.activePreset?.folderPath ? '：' + state.activePreset.folderPath : ''}`
    : (isClip ? '剪贴仓：自动保存复制的文本 / 图片 / 混排' : '临时仓：仅存文件引用');
  // 同步刷新各操作的可用性（文件仓类型变化时）
  updateActionsForDockType();
}

// ===== 文件仓序号栏（底部圆形序号） =====
function renderDockPager() {
  if (!els.dockPager) return;
  const presets = state.allPresets || [];
  els.dockPager.innerHTML = '';
  const activeId = state.activePreset?.id;

  presets.forEach((preset, index) => {
    const item = document.createElement('button');
    item.className = 'dock-pager-item' + (preset.id === activeId ? ' active' : '');
    item.textContent = String(index + 1);
    item.title = preset.name + (preset.type === 'reference' ? '（引用仓）'
      : preset.type === 'clipboard' ? '（剪贴板仓）' : '（临时仓）');
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      switchToPreset(preset.id);
    });
    els.dockPager.appendChild(item);
  });

  // 滚动当前序号到可见区域
  const activeItem = els.dockPager.querySelector('.dock-pager-item.active');
  if (activeItem) {
    activeItem.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
}

// 通过序号切换文件仓（dir: -1 左 / +1 右）
async function switchDockByOffset(dir) {
  const presets = state.allPresets || [];
  if (presets.length <= 1) return;
  const activeId = state.activePreset?.id;
  let idx = presets.findIndex(p => p.id === activeId);
  if (idx === -1) idx = 0;
  let next = (idx + dir) % presets.length;
  if (next < 0) next += presets.length;
  await switchToPreset(presets[next].id);
}

// ===== 空状态图标（按主题注入；玻璃窗主题为空字符串=不显示图标与提示） =====
function renderEmptyIcon() {
  if (!els.emptyIcon || !els.emptyText) return;
  const themeName = state.settings.theme || 'default';
  const icons = getThemeIcons(themeName);
  const svg = icons.ui.empty || '';
  els.emptyIcon.innerHTML = svg;
  // 玻璃窗主题：空字符串 -> 隐藏图标与提示文字
  const hide = svg.trim() === '';
  els.emptyIcon.style.display = hide ? 'none' : '';
  els.emptyText.style.display = hide ? 'none' : '';
}

// ===== 视图模式 =====
function applyViewMode() {
  els.fileArea.className = `view-${state.viewMode}`;
  updateViewToggleIcon();
  els.fileList.style.display = '';
  renderFiles();
}

// 视图切换按钮图标随当前视图模式变化（列表→列表图标，网格→网格图标）
function updateViewToggleIcon() {
  if (!els.viewToggleBtn) return;
  const themeName = state.settings ? (state.settings.theme || 'default') : 'default';
  const icons = getThemeIcons(themeName);
  const iconKey = state.viewMode === 'grid' ? 'view-grid' : 'view-list';
  els.viewToggleBtn.innerHTML = icons.ui[iconKey] || icons.ui['view-list'];
  els.viewToggleBtn.title = state.viewMode === 'grid' ? '当前：网格视图（点击切换为列表）' : '当前：列表视图（点击切换为网格）';
}

// ===== 筛选 =====
// 类型/后缀名分组定义（exts 不带点，便于显示与比较）
const FILTER_CATEGORIES = [
  { key: 'image',   label: '图片',   exts: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg', 'ico', 'tif', 'tiff'] },
  { key: 'video',   label: '视频',   exts: ['mp4', 'avi', 'mkv', 'mov', 'wmv', 'flv', 'webm', 'm4v', 'mpg', 'mpeg', '3gp'] },
  { key: 'audio',   label: '音频',   exts: ['mp3', 'wav', 'flac', 'aac', 'ogg', 'wma'] },
  { key: 'document',label: '文档',   exts: ['txt', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'md', 'rtf'] },
  { key: 'archive', label: '压缩包', exts: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2'] },
  { key: 'code',    label: '代码',   exts: ['js', 'ts', 'py', 'java', 'c', 'cpp', 'h', 'html', 'css', 'json', 'xml', 'sh', 'go', 'rs', 'rb', 'php'] },
  { key: 'shortcut',label: '快捷方式', exts: ['lnk', 'url'] },
];
const PREDEFINED_EXTS = new Set(FILTER_CATEGORIES.flatMap(c => c.exts));

// 判断文件是否为快捷方式（.lnk / .url），用于筛选分类
function isShortcutFile(file) {
  if (file.isDirectory) return false;
  const ext = (file.ext || '').toLowerCase().replace(/^\./, '');
  return ext === 'lnk' || ext === 'url';
}

// 是否有筛选项被取消勾选（即筛选正在减少可见文件）
function isFilterReducing() {
  return Object.values(state.filterChecked).some(v => v === false);
}

// ===== 编辑模式搜索 =====
const EMPTY_TEXT_DEFAULT = '拖入文件到这里';
const SEARCH_ICON_FLAT = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M2 5 Q2 3.8 3.2 3.8 L6.2 3.8 L7.6 5.3 L12.8 5.3 Q14 5.3 14 6.5 L14 11.6 Q14 12.8 12.8 12.8 L3.2 12.8 Q2 12.8 2 11.6 Z"/></svg>';
const SEARCH_ICON_DEEP = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M2 4.6 Q2 3.4 3.2 3.4 L6 3.4 L7.4 4.8 L12.8 4.8 Q14 4.8 14 6 L14 7.4 L2 7.4 Z"/><path d="M2.6 8.8 L13.4 8.8 L12.4 12.9 L3.6 12.9 Z" stroke-linecap="round"/></svg>';

function updateSearchScopeBtn() {
  if (!els.searchScopeBtn) return;
  const deep = state.searchRecursive;
  els.searchScopeBtn.innerHTML = deep ? SEARCH_ICON_DEEP : SEARCH_ICON_FLAT;
  els.searchScopeBtn.title = deep ? '当前：含所有子目录（点击改为仅当前目录）' : '当前：仅当前目录（点击改为含所有子目录）';
  els.searchScopeBtn.classList.toggle('active', deep);
}

// 是否处于搜索中（编辑模式 + 关键词非空）
function isSearchActive() {
  return state.editMode && state.searchQuery.trim() !== '';
}
// 递归搜索生效的前提：有真实文件夹上下文（临时仓没有可递归的目录）
function searchRecursiveEffective() {
  return state.searchRecursive && (state.folderMode || isActiveReferenceDock());
}
// 当前列表池：递归搜索时用搜索结果，否则用当前目录列表
function getVisiblePool() {
  if (isSearchActive() && searchRecursiveEffective()) return state.searchResults || [];
  return state.files;
}
async function refreshSearchResults() {
  const root = getCurrentFolderPath();
  if (!root) { state.searchResults = null; return; }
  state.searchResults = null;
  renderFiles(); // 立即反馈“搜索中…”
  const r = await window.api.folder.listRecursive(root);
  state.searchResults = r.success ? r.files : [];
  renderFiles();
}
async function refreshPoolIfSearching() {
  if (isSearchActive() && searchRecursiveEffective()) await refreshSearchResults();
}
function clearSearch() {
  state.searchQuery = '';
  state.searchResults = null;
  if (els.searchInput) els.searchInput.value = '';
}

// 取当前模式下应显示的文件列表（筛选规则 × 搜索关键词 联动）
function getFilteredFiles() {
  const files = getVisiblePool();
  const hasUnchecked = state.filterMode === 'type'
    ? Object.keys(state.filterChecked).some(k => k.startsWith('type:') && state.filterChecked[k] === false)
    : Object.keys(state.filterChecked).some(k => k.startsWith('ext:') && state.filterChecked[k] === false);
  let out;
  if (!hasUnchecked) {
    out = files.slice();
  } else {
    out = files.filter(f => {
      if (state.filterMode === 'type') {
        if (f.isDirectory) return state.filterChecked['type:folder'] !== false;
        // 快捷方式单独分类（.lnk/.url 不归入"其他"）
        if (isShortcutFile(f)) return state.filterChecked['type:shortcut'] !== false;
        const typeKey = getFileIconType(f.ext, f.isDirectory);
        const key = `type:${typeKey === 'default' ? 'other' : typeKey}`;
        return state.filterChecked[key] !== false;
      } else {
        if (f.isDirectory) return state.filterChecked['ext:folder'] !== false;
        const ext = (f.ext || '').toLowerCase().replace(/^\./, '');
        return state.filterChecked[`ext:${ext}`] !== false;
      }
    });
  }
  const q = state.searchQuery.trim().toLowerCase();
  if (q) out = out.filter(f => (f.name || '').toLowerCase().includes(q));
  // 递归结果来自目录遍历，按当前排序规则重排（普通列表本就有序，无需重排）
  if (isSearchActive() && searchRecursiveEffective()) out.sort(compareFiles);
  return out;
}

// 渲染筛选面板内容
function renderFilterBody() {
  if (!els.filterBody) return;
  els.filterBody.innerHTML = '';
  const files = state.files;
  if (state.filterMode === 'type') {
    renderTypeModeFilter(files);
  } else {
    renderExtModeFilter(files);
  }
  updateFilterToggleLabel();
}

// ===== 筛选：全选/全不选 切换条 =====
// 收集当前筛选模式下面板里展示的全部选项 key
function filterVisibleKeys() {
  return Array.from(els.filterBody.querySelectorAll('.filter-item'))
    .map(el => el.dataset.key)
    .filter(Boolean);
}

function updateFilterToggleLabel() {
  if (!els.filterToggleAll) return;
  const keys = filterVisibleKeys();
  const anyUnchecked = keys.length > 0 && keys.some(k => state.filterChecked[k] === false);
  els.filterToggleAll.textContent = anyUnchecked ? '全选' : '全不选';
}

function toggleFilterAll() {
  const keys = filterVisibleKeys();
  if (keys.length === 0) return;
  const anyUnchecked = keys.some(k => state.filterChecked[k] === false);
  if (anyUnchecked) {
    // 全选：清掉所有 false 记录（未记录 = 默认选中）
    keys.forEach(k => { if (state.filterChecked[k] === false) delete state.filterChecked[k]; });
  } else {
    // 全不选：全部记为 false
    keys.forEach(k => { state.filterChecked[k] = false; });
  }
  persistFilter();
  renderFiles();
  renderFilterBody();
  updateFilterButtonState();
}

// 按类型模式
function renderTypeModeFilter(files) {
  const counts = { image: 0, video: 0, audio: 0, document: 0, archive: 0, code: 0, shortcut: 0, folder: 0, other: 0 };
  files.forEach(f => {
    if (f.isDirectory) { counts.folder++; return; }
    // 快捷方式单独计数（.lnk/.url）
    if (isShortcutFile(f)) { counts.shortcut++; return; }
    const t = getFileIconType(f.ext, false);
    if (t === 'default' || !counts.hasOwnProperty(t)) counts.other++;
    else counts[t]++;
  });
  const items = [
    { key: 'image', label: '图片' },
    { key: 'video', label: '视频' },
    { key: 'audio', label: '音频' },
    { key: 'document', label: '文档' },
    { key: 'archive', label: '压缩包' },
    { key: 'code', label: '代码' },
    { key: 'shortcut', label: '快捷方式' },
    { key: 'folder', label: '文件夹' },
    { key: 'other', label: '其他' },
  ];
  items.forEach(it => {
    const filterKey = `type:${it.key}`;
    const checked = state.filterChecked[filterKey] !== false;
    appendFilterItem(els.filterBody, filterKey, it.label, checked, counts[it.key]);
  });
}

// 按后缀名模式
function renderExtModeFilter(files) {
  const extCounts = {};
  let folderCount = 0;
  files.forEach(f => {
    if (f.isDirectory) { folderCount++; return; }
    const ext = (f.ext || '').toLowerCase().replace(/^\./, '');
    if (!ext) return;
    extCounts[ext] = (extCounts[ext] || 0) + 1;
  });

  // 预定义分组：仅显示当前文件夹中存在的后缀名
  FILTER_CATEGORIES.forEach(cat => {
    const present = cat.exts.filter(e => extCounts[e]);
    if (present.length === 0) return;
    appendFilterGroupTitle(els.filterBody, cat.label);
    present.forEach(e => {
      const filterKey = `ext:${e}`;
      const checked = state.filterChecked[filterKey] !== false;
      appendFilterItem(els.filterBody, filterKey, '.' + e, checked, extCounts[e]);
    });
  });

  // 文件夹
  if (folderCount > 0) {
    appendFilterGroupTitle(els.filterBody, '文件夹');
    const filterKey = 'ext:folder';
    const checked = state.filterChecked[filterKey] !== false;
    appendFilterItem(els.filterBody, filterKey, '文件夹', checked, folderCount);
  }

  // 扫描当前文件夹中未覆盖到的后缀名
  const uncovered = Object.keys(extCounts).filter(e => !PREDEFINED_EXTS.has(e)).sort();
  if (uncovered.length > 0) {
    appendFilterGroupTitle(els.filterBody, '其他后缀');
    uncovered.forEach(e => {
      const filterKey = `ext:${e}`;
      const checked = state.filterChecked[filterKey] !== false;
      appendFilterItem(els.filterBody, filterKey, '.' + e, checked, extCounts[e]);
    });
  }

  // 空状态提示
  if (els.filterBody.children.length === 0) {
    const tip = document.createElement('div');
    tip.className = 'filter-empty-tip';
    tip.textContent = '当前文件夹无可筛选文件';
    els.filterBody.appendChild(tip);
  }
}

function appendFilterGroupTitle(container, label) {
  const title = document.createElement('div');
  title.className = 'filter-group-title';
  title.textContent = label;
  container.appendChild(title);
}

function appendFilterItem(container, key, label, checked, count) {
  const item = document.createElement('div');
  item.className = 'filter-item';
  item.dataset.key = key;
  const checkSvg = checked ? (getThemeIcons(state.settings.theme || 'default').check || '') : '';
  item.innerHTML = `
    <div class="filter-checkbox${checked ? ' checked' : ''}">${checkSvg}</div>
    <span class="filter-item-label">${label}</span>
    ${count != null ? `<span class="filter-item-count">${count}</span>` : ''}
  `;
  item.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleFilterItem(key);
  });
  container.appendChild(item);
}

function toggleFilterItem(key) {
  const wasChecked = state.filterChecked[key] !== false;
  state.filterChecked[key] = !wasChecked;
  persistFilter();
  renderFiles();
  updateFilterButtonState();
}

function switchFilterMode(mode) {
  if (state.filterMode === mode) return;
  state.filterMode = mode;
  els.filterPanel.querySelectorAll('.filter-mode-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filtermode === mode);
  });
  persistFilter();
  renderFiles();
}

function openFilterPanel() {
  renderFilterBody();
  const rect = els.filterBtn.getBoundingClientRect();
  els.filterPanel.classList.remove('hidden');
  clampPopup(els.filterPanel, rect.left, rect.bottom + 4);
  els.filterPanel.querySelectorAll('.filter-mode-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filtermode === state.filterMode);
  });
  updateFilterButtonState();
}

function closeFilterPanel() {
  els.filterPanel.classList.add('hidden');
  updateFilterButtonState();
}

function toggleFilterPanel() {
  if (els.filterPanel.classList.contains('hidden')) openFilterPanel();
  else closeFilterPanel();
}

function updateFilterButtonState() {
  if (!els.filterBtn) return;
  const panelOpen = !els.filterPanel.classList.contains('hidden');
  els.filterBtn.classList.toggle('active', panelOpen || isFilterReducing());
}

async function persistFilter() {
  state.settings = await window.api.settings.update({
    filterMode: state.filterMode,
    filterChecked: state.filterChecked,
  });
}

// ===== 文件渲染 =====
function renderFiles() {
  hideFilePreview();
  // 剪贴板仓：交给独立模块渲染，隐藏文件区
  if (isActiveClipboardDock()) {
    applyClipDockClass();
    if (window.__clipUI) window.__clipUI.refresh();
    return;
  }
  applyClipDockClass();
  els.fileList.innerHTML = '';

  const visible = getFilteredFiles();
  const pool = getVisiblePool();
  const searchingNow = isSearchActive() && searchRecursiveEffective() && state.searchResults === null;

  if (pool.length === 0 || visible.length === 0 || searchingNow) {
    els.emptyState.style.display = 'flex';
    els.fileList.style.display = 'none';
    if (searchingNow) els.emptyText.textContent = '搜索中…';
    else if (isSearchActive() && visible.length === 0) els.emptyText.textContent = `无匹配“${state.searchQuery.trim()}”的文件`;
    else els.emptyText.textContent = EMPTY_TEXT_DEFAULT;
    renderEmptyIcon();
  } else {
    els.emptyState.style.display = 'none';
    els.fileList.style.display = '';
    els.emptyText.textContent = EMPTY_TEXT_DEFAULT;
  }

  visible.forEach((file, index) => {
    const item = createFileItem(file, index);
    els.fileList.appendChild(item);
  });

  // 缩略图/系统图标按需挂载（缓存命中立即应用，其余交给 IntersectionObserver）
  mountFileMedia();

  // 文件计数：筛选/搜索生效时显示 "可见/总数"
  if ((isFilterReducing() || isSearchActive()) && visible.length !== pool.length) {
    els.fileCount.textContent = `${visible.length}/${pool.length} 个文件`;
  } else {
    els.fileCount.textContent = `${pool.length} 个文件`;
  }

  // 面板打开时同步刷新筛选项计数
  if (els.filterPanel && !els.filterPanel.classList.contains('hidden')) {
    renderFilterBody();
  }
}

function createFileItem(file, index) {
  const item = document.createElement('div');
  item.className = 'file-item';
  item.dataset.index = index;
  item.dataset.path = file.path;

  // 临时文件标记（安全模式下拖入的）
  if (state.temporaryPaths.has(file.path)) {
    item.classList.add('temporary');
  }

  const icon = getFileIcon(file);
  const checked = state.selectedPaths.has(file.path);
  const checkSvg = getThemeIcons(state.settings.theme || 'default').check;

  // 缩略图/系统图标：图片与视频直接出缩略图（网格大图、列表小图）；
  // 主题没设计的后缀用 Windows 关联应用图标
  const mediaKind = getMediaKind(file);
  const mediaAttr = mediaKind
    ? ` data-media-path="${escHtml(file.path)}" data-media-kind="${mediaKind}"`
    : '';

  if (state.editMode) {
    item.classList.toggle('checked', checked);
    item.innerHTML = `
      <div class="file-checkbox${checked ? ' checked' : ''}" data-path="${escHtml(file.path)}">
        ${checked ? checkSvg : ''}
      </div>
      <div class="file-icon"${mediaAttr} data-type="${icon.type}">${icon.svg}</div>
      <div class="file-name" title="${escHtml(file.name)}">${escHtml(file.name)}</div>
    `;

    item.addEventListener('click', (e) => {
      e.preventDefault();
      if (boxSelectJustEnded || editDragJustEnded) return; // 框选/拖动刚结束，不切换选中
      toggleSelect(file.path);
    });

    // 编辑模式下拖出文件：拖已选中=拖全部，拖未选中=选中并单独拖出
    item.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      startEditDragOut(file, e);
    });
  } else {
    item.innerHTML = `
      <div class="file-icon"${mediaAttr} data-type="${icon.type}">${icon.svg}</div>
      <div class="file-name" title="${escHtml(file.name)}">${escHtml(file.name)}</div>
    `;

    item.addEventListener('dblclick', (e) => {
      e.preventDefault();
      if (file.isDirectory) {
        enterFolder(file.path, file.name);
      } else {
        window.api.files.open(file.path);
      }
    });

    item.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showContextMenu(e.clientX, e.clientY, file, index);
    });

    item.addEventListener('mousedown', (e) => {
      if (e.button === 0 || e.button === 2) {
        const mode = e.button === 0 ? 'move' : 'copy';
        startDragOut(file, mode, e);
      }
    });
  }

  // Ctrl+悬停 预览大图 / 视频片段（仅图片与视频）
  if (isPreviewableFile(file)) {
    item.addEventListener('mousemove', (e) => handlePreviewMouseMove(e, file));
    item.addEventListener('mouseleave', hideFilePreview);
  }

  // 临时文件标志（真实 DOM 元素，避免 ::after 被冰棍主题 .file-item::after 装饰覆盖导致"临时"消失）
  if (state.temporaryPaths.has(file.path)) {
    const badge = document.createElement('span');
    badge.className = 'temporary-badge';
    badge.textContent = '临时';
    item.appendChild(badge);
  }

  return item;
}

// ===== 网格缩略图 / 系统图标 =====
// 图片/视频在网格视图直接显示缩略图；主题没设计的后缀用 Windows 关联应用图标。
// 按需生成：IntersectionObserver 只处理滚进可视区的项；结果缓存避免重渲染时重新生成。
const mediaCache = new Map();    // path → dataURL（'' 表示生成失败，退回主题图标且不再重试）
const mediaPending = new Set();  // 正在生成的 path
let thumbIO = null;

function getMediaKind(file) {
  const type = getFileIconType(file.ext, file.isDirectory);
  if (type === 'image') return 'image';
  if (type === 'video') return 'video';
  if (type === 'default') return 'icon'; // 未知后缀 → 系统关联图标
  return null;                            // 主题已有图标（文件夹/文档/压缩包等）
}

function isPreviewableFile(file) {
  const k = getMediaKind(file);
  return k === 'image' || k === 'video';
}

function applyMedia(node, url) {
  node.classList.add('has-thumb');
  node.classList.remove('thumb-pending');
  node.innerHTML = '<img class="file-thumb" src="' + url + '" draggable="false" alt="">';
}

function ensureThumbObserver() {
  if (thumbIO) return thumbIO;
  thumbIO = new IntersectionObserver((entries) => {
    entries.forEach(en => {
      if (!en.isIntersecting) return;
      thumbIO.unobserve(en.target);
      requestMedia(en.target);
    });
  }, { root: els.fileArea, rootMargin: '80px' });
  return thumbIO;
}

// 让 Chromium 试解码一张图（file URL 或 dataURL），成功返回原 URL，失败返回 ''
function probeImageUrl(u) {
  return new Promise((resolve) => {
    const im = new Image();
    im.onload = () => resolve(u);
    im.onerror = () => resolve('');
    im.src = u;
  });
}

async function requestMedia(node) {
  const p = node.dataset.mediaPath;
  const kind = node.dataset.mediaKind;
  if (!p || !kind || mediaPending.has(p)) return;
  if (mediaCache.has(p)) {
    const u = mediaCache.get(p);
    if (u) applyMedia(node, u);
    return;
  }
  mediaPending.add(p);
  let url = '';
  try {
    if (kind === 'image') {
      // 解码链：nativeImage 缩略图（png/jpg/webp…）→ Chromium 直接解码原文件
      //（gif/svg/伪装成 jpg 的动图等原生解不了的）→ 系统关联图标（tiff/heic 等兜底）
      url = await window.api.files.thumb(p);
      if (!url) url = await probeImageUrl(fileUrlOf(p));
      if (!url) url = await window.api.files.fileIcon(p);
    } else if (kind === 'video') {
      url = await extractVideoFrame(p);
      if (!url) url = await window.api.files.fileIcon(p); // Chromium 解不了的视频（avi/mkv…）退回系统图标
    } else {
      url = await window.api.files.fileIcon(p);
    }
  } catch (e) { url = ''; }
  mediaPending.delete(p);
  if (mediaCache.size > 600) mediaCache.clear();
  mediaCache.set(p, url || '');
  if (url) applyMedia(node, url);
}

// 渲染后挂载：缓存命中立即应用，未命中的交给 IntersectionObserver 懒加载
function mountFileMedia() {
  if (!els.fileList) return;
  ensureThumbObserver().disconnect();
  els.fileList.querySelectorAll('[data-media-path]').forEach(node => {
    const cached = mediaCache.get(node.dataset.mediaPath);
    if (cached) {
      applyMedia(node, cached);
    } else if (!mediaPending.has(node.dataset.mediaPath)) {
      node.classList.add('thumb-pending');
      thumbIO.observe(node);
    }
  });
}

// ===== 视频抽帧（渲染层解码；Chromium 支持的格式才出缩略图，超时/失败返回空串）=====
const videoQueue = [];
let videoRunning = 0;

function extractVideoFrame(filePath, maxW = 320) {
  return new Promise((resolve) => {
    videoQueue.push({ filePath, maxW, resolve });
    pumpVideoQueue();
  });
}

// 最多并发 2 个解码，避免同时加载一堆视频拖垮解码器
function pumpVideoQueue() {
  if (videoRunning >= 2 || !videoQueue.length) return;
  const job = videoQueue.shift();
  videoRunning++;
  doExtractVideoFrame(job.filePath, job.maxW).then((url) => {
    videoRunning--;
    job.resolve(url);
    pumpVideoQueue();
  });
}

function doExtractVideoFrame(filePath, maxW) {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    let done = false;
    const finish = (url) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      v.removeAttribute('src');
      try { v.load(); } catch (e) {}
      resolve(url);
    };
    const timer = setTimeout(() => finish(''), 5000);
    v.muted = true;
    v.preload = 'auto';
    v.onloadedmetadata = () => {
      // 取靠近开头的画面（约 10% 处），跳过纯黑首帧
      try { v.currentTime = Math.min(1, (v.duration || 2) * 0.1); } catch (e) {}
    };
    v.onseeked = () => {
      try {
        const vw = v.videoWidth || 320, vh = v.videoHeight || 180;
        const scale = Math.min(1, maxW / vw);
        const c = document.createElement('canvas');
        c.width = Math.max(2, Math.round(vw * scale));
        c.height = Math.max(2, Math.round(vh * scale));
        c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
        finish(c.toDataURL('image/jpeg', 0.72));
      } catch (e) { finish(''); }
    };
    v.onerror = () => finish('');
    v.src = 'file:///' + encodeURI(filePath.replace(/\\/g, '/')).replace(/#/g, '%23').replace(/\?/g, '%3F');
  });
}

// ===== Ctrl+悬停 预览（独立置顶小窗，不抢焦点，自动避开屏幕边缘）=====
// 即时弹出：无防抖、无过渡动画——面向大量调图场景，越快越好。
// 触发方式走设置项 previewTrigger：'ctrl'（默认）= 按住 Ctrl 悬停；'hover' = 悬停即显。
// 按 L 可把当前预览"钉住"：升级为可拖动、等比缩放的独立小窗，点右上角 × 关闭。
// 钉住窗可同时开多个，钉住后悬停继续工作。
let previewTarget = null;
let previewActive = false;

function handlePreviewMouseMove(e, file) {
  const needCtrl = !state.settings || state.settings.previewTrigger !== 'hover';
  if (needCtrl && !e.ctrlKey) {
    hideFilePreview();
    return;
  }
  if (e.buttons !== 0) {
    // 按住鼠标（拖拽预备 / 框选 / 右键拖动）期间不弹预览
    hideFilePreview();
    return;
  }
  if (previewActive && previewTarget && previewTarget.path === file.path) return;
  previewTarget = { path: file.path, kind: getMediaKind(file) };
  previewActive = true;
  window.api.preview.show({ path: previewTarget.path, kind: previewTarget.kind });
}

// 输入框聚焦 / 面板或对话框打开 = UI 正被使用，不应自动收起
function uiBusy() {
  const ae = document.activeElement;
  const tag = ae && ae.tagName ? ae.tagName.toLowerCase() : '';
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  if (els.app.classList.contains('panel-open')) return true;
  if (document.querySelector('.fd-dialog')) return true;
  return false;
}

function hideFilePreview() {
  previewTarget = null;
  if (!previewActive) return;
  previewActive = false;
  window.api.preview.hide(); // 只收悬停窗；钉住窗由用户 × / Esc 关闭
}

// 剪贴板仓等非文件来源的图片（dataURL）也走同一套预览/钉住
window.__previewFromUrl = (url) => {
  if (!url) return;
  if (previewActive && previewTarget && previewTarget.url === url) return;
  previewTarget = { url, kind: 'image' };
  previewActive = true;
  window.api.preview.show({ url, kind: 'image' });
};
window.__hideFilePreview = hideFilePreview;
window.__previewHoverWantsCtrl = () => !(state.settings && state.settings.previewTrigger === 'hover');

// Ctrl 按下时鼠标可能早已静止在文件上（不会再触发 mousemove），主动看一眼光标下面
let lastMousePos = { x: -1, y: -1 };

function showPreviewUnderCursor() {
  if (state.settings && state.settings.previewTrigger === 'hover') return; // 悬停模式无需 Ctrl
  // 输入框聚焦（重命名/搜索/命名框）时不弹预览——Ctrl+V 粘贴不该触发悬浮
  const ae = document.activeElement;
  const aeTag = ae && ae.tagName ? ae.tagName.toLowerCase() : '';
  if (aeTag === 'input' || aeTag === 'textarea' || aeTag === 'select') return;
  if (lastMousePos.x < 0) return;
  const el = document.elementFromPoint(lastMousePos.x, lastMousePos.y);
  if (!el) return;
  // 剪贴板仓大图（dataURL）
  const clipImg = el.closest ? el.closest('.clip-big') : null;
  if (clipImg && clipImg.src && clipImg.src.startsWith('data:')) {
    window.__previewFromUrl(clipImg.src);
    return;
  }
  const item = el.closest ? el.closest('.file-item') : null;
  if (!item) return;
  const file = state.files.find(f => f.path === item.dataset.path);
  if (!file || !isPreviewableFile(file)) return;
  if (previewActive && previewTarget && previewTarget.path === file.path) return;
  previewTarget = { path: file.path, kind: getMediaKind(file) };
  previewActive = true;
  window.api.preview.show({ path: previewTarget.path, kind: previewTarget.kind });
}

// L 钉住（原生热键轮询与页面 keydown 共用；150ms 去重防双触发）
let lastPinAt = 0;

// 读取钉住热键组合（如 'l' 或 'ctrl+l'），判断 keydown 是否命中
function pinKeyMatches(e) {
  const combo = String((state.settings && state.settings.hotkeys && state.settings.hotkeys.pinKey) || 'l').toLowerCase();
  const parts = combo.split('+');
  const key = parts[parts.length - 1];
  if (e.key.toLowerCase() !== key) return false;
  if (e.ctrlKey !== parts.includes('ctrl')) return false;
  if (e.altKey !== parts.includes('alt')) return false;
  if (e.shiftKey !== parts.includes('shift')) return false;
  return true;
}

// 快捷键录制（设置区）：hkRecording 非空 = 正在录制
let hkRecording = null;

function stopHotkeyRecord(combo) {
  hkRecording = null;
  const box = document.getElementById('setting-hk-pinkey');
  if (box) box.classList.remove('recording');
  renderHotkeyUI();
  if (combo) {
    const hk = Object.assign({}, state.settings.hotkeys || {});
    hk.pinKey = combo;
    window.api.settings.update({ hotkeys: hk }).then(s => { state.settings = s; });
  }
}

function renderHotkeyUI() {
  const box = document.getElementById('setting-hk-pinkey');
  if (box) box.textContent = String((state.settings && state.settings.hotkeys && state.settings.hotkeys.pinKey) || 'l').toUpperCase();
  const sel = document.getElementById('setting-hk-gesture');
  if (sel) sel.value = (state.settings && state.settings.hotkeys && state.settings.hotkeys.dockSwitchGesture) || 'xbutton2+wheel';
}

function tryPinPreview() {
  const now = Date.now();
  if (now - lastPinAt < 150) return;
  if (!previewActive || !previewTarget) return;
  const ae = document.activeElement;
  const tag = ae && ae.tagName ? ae.tagName.toLowerCase() : '';
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
  lastPinAt = now;
  // 图片组：悬浮中的图片在多选集合里、且多选中有多张可预览文件 → 整组钉住；
  // 悬浮的图不在多选里（或只选了一张）→ 正常钉当前这张
  if (previewTarget.path && state.selectedPaths.has(previewTarget.path)) {
    const sel = getSelectedFiles().filter(f => isPreviewableFile(f));
    if (sel.length > 1) {
      const items = sel.map(f => ({ path: f.path, kind: getMediaKind(f), name: f.name || '' }));
      const index = Math.max(0, items.findIndex(it => it.path === previewTarget.path));
      window.api.preview.pin({ items, index });
      return;
    }
  }
  window.api.preview.pin();
}

// ===== 编辑模式 =====
function toggleEditMode() {
  state.editMode = !state.editMode;
  if (!state.editMode) {
    state.selectedPaths.clear();
    clearSearch(); // 退出编辑模式连带清空搜索，列表恢复完整
  }
  els.editBtn.classList.toggle('active', state.editMode);
  els.editBar.classList.toggle('hidden', !state.editMode);
  els.app.classList.toggle('edit-mode', state.editMode);
  renderFiles();
}

function toggleSelect(filePath) {
  const willSelect = !state.selectedPaths.has(filePath);
  if (willSelect) {
    state.selectedPaths.add(filePath);
  } else {
    state.selectedPaths.delete(filePath);
  }
  // 单点更新选中态：整表重渲染会让大目录勾选卡顿
  const item = Array.from(els.fileList.children).find(el => el.dataset.path === filePath);
  if (item) setItemChecked(item, willSelect);
}

function selectAllFiles() {
  const pool = getVisiblePool();
  const allSelected = pool.length > 0 && pool.every(f => state.selectedPaths.has(f.path));
  if (allSelected) {
    pool.forEach(f => state.selectedPaths.delete(f.path));
  } else {
    pool.forEach(f => state.selectedPaths.add(f.path));
  }
  renderFiles();
}

function getSelectedFiles() {
  return getVisiblePool().filter(f => state.selectedPaths.has(f.path));
}

// 全不选：清空当前选择
async function batchMoveOut() {
  if (state.selectedPaths.size === 0) return;
  state.selectedPaths.clear();
  renderFiles();
}

// 批量从列表移除
function batchRemove() {
  const selected = getSelectedFiles();
  if (selected.length === 0) {
    alert('请先选择文件');
    return;
  }
  // 引用仓：仅能移除安全模式拖入的临时文件；真实文件来自绑定文件夹，无法"仅从列表移除"
  if (isActiveReferenceDock()) {
    const tempSelected = selected.filter(f => state.temporaryPaths.has(f.path));
    const realSelected = selected.filter(f => !state.temporaryPaths.has(f.path));
    if (tempSelected.length === 0) {
      // 选中的全是真实文件，提示并清空选择
      showInfoDialog('无法移除', '引用仓中的文件来自绑定的文件夹，无法仅从列表移除。如需删除请使用"从磁盘删除"。');
      state.selectedPaths.clear();
      renderFiles();
      return;
    }
    // 移除临时文件
    const tempPaths = new Set(tempSelected.map(f => f.path));
    state.files = state.files.filter(f => !tempPaths.has(f.path));
    tempSelected.forEach(f => state.temporaryPaths.delete(f.path));
    state.selectedPaths.clear();
    renderFiles();
    // 若同时选中了真实文件，提示用户真实文件未被移除
    if (realSelected.length > 0) {
      showInfoDialog('部分未移除', `已移除 ${tempSelected.length} 个临时文件；${realSelected.length} 个真实文件无法仅从列表移除。`);
    }
    return;
  }
  state.files = state.files.filter(f => !state.selectedPaths.has(f.path));
  // 同时清理临时标记
  selected.forEach(f => state.temporaryPaths.delete(f.path));
  state.selectedPaths.clear();
  renderFiles();
  saveCurrentPreset();
}

// 批量删除文件（实际删除，仅修改模式可用）
async function batchDelete() {
  const selected = getSelectedFiles();
  if (selected.length === 0) {
    alert('请先选择文件');
    return;
  }

  // 引用仓：安全模式禁止删除；修改模式走回收站+带确认
  if (isActiveReferenceDock()) {
    if (state.folderOpMode !== 'modify') {
      await showInfoDialog('安全模式提示', '当前处于安全模式，无法删除引用仓中的文件。请切换到修改模式后再操作。');
      return;
    }
    if (!confirm(`确定要将选中的 ${selected.length} 个文件移入回收站吗？`)) return;
    if (!await ensureModifyConfirmed()) return;
    const results = await window.api.files.delete(selected.map(f => f.path));
    const failed = results.filter(r => !r.success);
    if (failed.length > 0) alert(`${failed.length} 个文件删除失败`);
    state.selectedPaths.clear();
    await refreshReferenceDock();
    renderFiles();
    return;
  }

  // 临时仓：与右键删除一致，安全模式禁止；修改模式走回收站
  if (state.folderOpMode !== 'modify') {
    await showInfoDialog('安全模式提示', '当前处于安全模式，无法删除文件。请切换到修改模式后再操作。');
    return;
  }
  if (!confirm(`确定要将选中的 ${selected.length} 个文件移入回收站吗？`)) return;
  if (!await ensureModifyConfirmed()) return;

  const results = await window.api.files.delete(selected.map(f => f.path));
  const failed = results.filter(r => !r.success);
  if (failed.length > 0) {
    alert(`${failed.length} 个文件删除失败`);
  }
  state.files = state.files.filter(f => !state.selectedPaths.has(f.path));
  selected.forEach(f => state.temporaryPaths.delete(f.path));
  state.selectedPaths.clear();
  renderFiles();
  saveCurrentPreset();
}

// 仅信息提示对话框（单按钮"知道了"）
function showInfoDialog(title, message) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;z-index:9999;';
    overlay.className = 'fd-dialog';
    overlay.innerHTML = `
      <div style="background:var(--bg);border-radius:8px;padding:20px;max-width:320px;box-shadow:0 8px 24px rgba(0,0,0,0.2);">
        <h3 style="margin:0 0 12px;font-size:14px;">${title}</h3>
        <p style="margin:0 0 16px;font-size:12px;color:var(--text-secondary);line-height:1.5;">${message}</p>
        <div style="display:flex;gap:8px;justify-content:flex-end;">
          <button id="dialog-ok" style="padding:6px 14px;border:none;background:var(--accent);color:#fff;border-radius:4px;cursor:pointer;font-size:12px;">知道了</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#dialog-ok').addEventListener('click', () => {
      document.body.removeChild(overlay);
      resolve();
    });
  });
}

// 输入对话框（用于"新建文件夹 / 新建文件"等需要用户输入名称的场景）
// 返回用户输入的字符串；取消则返回 null
function showPromptDialog(title, label, defaultValue = '') {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;z-index:9999;';
    overlay.className = 'fd-dialog';
    overlay.innerHTML = `
      <div style="background:var(--bg);border-radius:8px;padding:20px;max-width:320px;box-shadow:0 8px 24px rgba(0,0,0,0.2);">
        <h3 style="margin:0 0 12px;font-size:14px;">${title}</h3>
        <label style="display:block;margin:0 0 8px;font-size:12px;color:var(--text-secondary);">${label}</label>
        <input id="prompt-input" value="${defaultValue.replace(/"/g, '&quot;')}" style="width:100%;box-sizing:border-box;padding:6px 8px;border:1px solid var(--border);border-radius:4px;background:var(--input-bg);color:var(--text);font-size:12px;outline:none;" />
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">
          <button id="prompt-cancel" style="padding:6px 14px;border:1px solid var(--border);background:transparent;color:var(--text);border-radius:4px;cursor:pointer;font-size:12px;">取消</button>
          <button id="prompt-ok" style="padding:6px 14px;border:none;background:var(--accent);color:#fff;border-radius:4px;cursor:pointer;font-size:12px;">确定</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const input = overlay.querySelector('#prompt-input');
    input.focus();
    input.select();
    const close = (val) => {
      document.body.removeChild(overlay);
      resolve(val);
    };
    overlay.querySelector('#prompt-ok').addEventListener('click', () => {
      const v = input.value.trim();
      close(v || null);
    });
    overlay.querySelector('#prompt-cancel').addEventListener('click', () => close(null));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') overlay.querySelector('#prompt-ok').click();
      if (e.key === 'Escape') close(null);
    });
  });
}

// 修改模式首次操作确认
async function ensureModifyConfirmed() {
  if (state.settings.modifyModeConfirmed) return true;
  const result = await showConfirmDialog({
    title: '修改模式提示',
    message: '当前处于修改模式，此操作将真实修改文件夹中的文件。确定继续吗？',
    checkboxLabel: '记住我的选择，不再询问',
  });
  if (result.confirmed) {
    if (result.checked) {
      state.settings = await window.api.settings.update({ modifyModeConfirmed: true });
    }
    return true;
  }
  return false;
}

// 自定义确认对话框（带复选框）
function showConfirmDialog({ title, message, checkboxLabel }) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;z-index:9999;';
    overlay.className = 'fd-dialog';
    overlay.innerHTML = `
      <div style="background:var(--bg);border-radius:8px;padding:20px;max-width:320px;box-shadow:0 8px 24px rgba(0,0,0,0.2);">
        <h3 style="margin:0 0 12px;font-size:14px;">${title}</h3>
        <p style="margin:0 0 16px;font-size:12px;color:var(--text-secondary);line-height:1.5;">${message}</p>
        <label style="display:flex;align-items:center;gap:6px;margin-bottom:16px;font-size:12px;cursor:pointer;">
          <input type="checkbox" id="dialog-checkbox">
          <span>${checkboxLabel}</span>
        </label>
        <div style="display:flex;gap:8px;justify-content:flex-end;">
          <button id="dialog-cancel" style="padding:6px 14px;border:1px solid var(--border);background:transparent;color:var(--text);border-radius:4px;cursor:pointer;font-size:12px;">取消</button>
          <button id="dialog-ok" style="padding:6px 14px;border:none;background:var(--accent);color:#fff;border-radius:4px;cursor:pointer;font-size:12px;">确定</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const cleanup = (result) => {
      document.body.removeChild(overlay);
      resolve(result);
    };
    overlay.querySelector('#dialog-ok').addEventListener('click', () => {
      cleanup({ confirmed: true, checked: overlay.querySelector('#dialog-checkbox').checked });
    });
    overlay.querySelector('#dialog-cancel').addEventListener('click', () => {
      cleanup({ confirmed: false, checked: false });
    });
  });
}

// ===== 排序 =====
function compareFiles(a, b) {
  let cmp = 0;
  if (state.sortBy === 'name') {
    cmp = (a.name || '').localeCompare(b.name || '', 'zh');
  } else if (state.sortBy === 'time') {
    cmp = (a.mtime || 0) - (b.mtime || 0);
  } else if (state.sortBy === 'size') {
    cmp = (a.size || 0) - (b.size || 0);
  }
  if (a.isDirectory !== b.isDirectory) {
    return a.isDirectory ? -1 : 1;
  }
  return cmp * (state.sortDirection === 'asc' ? 1 : -1);
}

function applySort() {
  state.files.sort(compareFiles);
}

function updateSortMenuUI() {
  els.sortMenu.querySelectorAll('.sort-item').forEach(item => {
    item.classList.remove('active');
    if (item.dataset.sort === state.sortDirection) item.classList.add('active');
    if (item.dataset.sortby === state.sortBy) item.classList.add('active');
  });
}

function showSortMenu(x, y) {
  updateSortMenuUI();
  els.sortMenu.classList.remove('hidden');
  clampPopup(els.sortMenu, x, y);
}

function handleSortSelect(action, value) {
  if (action === 'sort') {
    state.sortDirection = value;
  } else if (action === 'sortby') {
    state.sortBy = value;
  }
  applySort();
  renderFiles();
  if (!state.folderMode) saveCurrentPreset();
  // 持久化排序状态
  window.api.settings.update({ sortDirection: state.sortDirection, sortBy: state.sortBy });
  els.sortMenu.classList.add('hidden');
}

// ===== 文件夹导航 =====
// 重置文件夹导航状态：切换/新建文件仓时调用，避免面包屑栏残留 + exitFolder 把旧仓 folderFiles 还原进新仓
function resetFolderNavigation() {
  state.folderMode = false;
  state.folderStack = [];
  state.folderFiles = [];
  state.temporaryPaths.clear();
  clearSearch();
  els.app.classList.remove('folder-mode');
  updateBreadcrumb();
}

async function enterFolder(folderPath, folderName) {
  try {
    const result = await window.api.folder.list(folderPath);
    if (!result.success) {
      alert('无法打开文件夹: ' + (result.error || '未知错误'));
      return;
    }
    if (!state.folderMode) {
      state.folderFiles = state.files.slice();
      state.folderMode = true;
      els.app.classList.add('folder-mode');
    }
    clearSearch(); // 目录切换后搜索范围失效，清空重来
    state.folderStack.push({ path: folderPath, name: folderName });
    state.temporaryPaths.clear();
    state.files = result.files;
    applySort();
    renderFiles();
    updateBreadcrumb();
  } catch (err) {
    alert('打开文件夹失败: ' + err.message);
  }
}

async function exitFolder() {
  if (state.folderStack.length === 0) return;
  state.folderStack.pop();
  state.temporaryPaths.clear();
  clearSearch();
  if (state.folderStack.length === 0) {
    state.folderMode = false;
    els.app.classList.remove('folder-mode');
    state.files = state.folderFiles;
    state.folderFiles = [];
  } else {
    const parent = state.folderStack[state.folderStack.length - 1];
    const result = await window.api.folder.list(parent.path);
    if (result.success) {
      state.files = result.files;
      applySort();
    }
  }
  renderFiles();
  updateBreadcrumb();
}

async function navigateToCrumb(index) {
  if (index < 0 || index >= state.folderStack.length) return;
  if (index === -1 + 0 && state.folderStack.length === 1) {
    // 点击第一个面包屑，退出文件夹
    await exitFolder();
    return;
  }
  state.folderStack = state.folderStack.slice(0, index + 1);
  if (state.folderStack.length === 0) {
    await exitFolder();
    return;
  }
  clearSearch();
  const target = state.folderStack[state.folderStack.length - 1];
  const result = await window.api.folder.list(target.path);
  if (result.success) {
    state.files = result.files;
    state.temporaryPaths.clear();
    applySort();
    renderFiles();
    updateBreadcrumb();
  }
}

function updateBreadcrumb() {
  if (!state.folderMode || state.folderStack.length === 0) {
    els.breadcrumbBar.classList.add('hidden');
    return;
  }
  els.breadcrumbBar.classList.remove('hidden');
  let html = '';
  state.folderStack.forEach((item, i) => {
    html += `<span class="breadcrumb-item" data-index="${i}">${escHtml(item.name)}</span>`;
    if (i < state.folderStack.length - 1) {
      html += '<span class="breadcrumb-sep">›</span>';
    }
  });
  els.breadcrumbPath.innerHTML = html;
  els.breadcrumbPath.querySelectorAll('.breadcrumb-item').forEach(crumb => {
    crumb.addEventListener('click', () => {
      navigateToCrumb(parseInt(crumb.dataset.index));
    });
  });
}

// ===== 拖出拖影：缩略图（有图类）或类型色块 + 下方文件名 =====
function roundedRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// 画拖影画布：上方图片（按比例适配）或类型色块，下方深色药丸里放文件名
function drawDragCanvas(imgEl, fileName, count, fallbackColor) {
  const W = 132;
  const IMG_H = 112;
  const H = IMG_H + 34;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');

  if (imgEl) {
    const iw = imgEl.naturalWidth || imgEl.width || 1;
    const ih = imgEl.naturalHeight || imgEl.height || 1;
    const scale = Math.min((W - 8) / iw, (IMG_H - 4) / ih, 4);
    const dw = Math.max(2, Math.round(iw * scale));
    const dh = Math.max(2, Math.round(ih * scale));
    ctx.drawImage(imgEl, (W - dw) / 2, (IMG_H - dh) / 2 + 2, dw, dh);
  } else {
    // 无图可显示（文件夹/未知类型）：类型色圆角块
    ctx.fillStyle = fallbackColor || '#6b7280';
    roundedRectPath(ctx, (W - 56) / 2, (IMG_H - 56) / 2 + 2, 56, 56, 10);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    roundedRectPath(ctx, (W - 56) / 2 + 10, (IMG_H - 56) / 2 + 12, 20, 6, 3);
    ctx.fill();
  }

  // 多选拖出：右上角 ×N 角标
  if (count > 1) {
    ctx.fillStyle = 'rgba(28,28,30,0.88)';
    ctx.beginPath();
    ctx.arc(W - 14, 14, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '11px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('×' + count, W - 14, 15);
  }

  // 文件名药丸
  let label = String(fileName || '');
  ctx.font = '12px "Microsoft YaHei", "PingFang SC", sans-serif';
  const maxTextW = W - 24;
  while (ctx.measureText(label).width > maxTextW && label.length > 1) {
    label = label.slice(0, -2) + '…';
  }
  const tw = Math.min(ctx.measureText(label).width, maxTextW);
  const pillW = tw + 18, pillH = 22, pillY = IMG_H + 6;
  ctx.fillStyle = 'rgba(28,28,30,0.88)';
  roundedRectPath(ctx, (W - pillW) / 2, pillY, pillW, pillH, 7);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, W / 2, pillY + pillH / 2 + 1);

  return c.toDataURL('image/png');
}

// 组装拖影：有缓存的缩略图直接用（瞬时），没缓存限时补取，超时退回色块
async function getDragIconDataUrl(files) {
  const first = files && files[0];
  if (!first) return '';
  const kind = getMediaKind(first);
  let imgUrl = '';
  if (kind === 'image' || kind === 'video') {
    imgUrl = mediaCache.get(first.path) || '';
    if (!imgUrl) {
      try {
        imgUrl = await Promise.race([
          kind === 'image' ? window.api.files.thumb(first.path) : extractVideoFrame(first.path, 240),
          new Promise(r => setTimeout(() => r(''), 160)),
        ]) || '';
      } catch (e) { imgUrl = ''; }
    }
  }
  let imgEl = null;
  if (imgUrl) {
    try {
      imgEl = await Promise.race([
        new Promise((res, rej) => {
          const im = new Image();
          im.onload = () => res(im);
          im.onerror = () => rej(new Error('img load fail'));
          im.src = imgUrl;
        }),
        new Promise((res, rej) => setTimeout(() => rej(new Error('img load timeout')), 200)),
      ]);
    } catch (e) { imgEl = null; }
  }
  const colors = {
    folder: '#f59e0b', image: '#10b981', video: '#ef4444', audio: '#8b5cf6',
    document: '#3b82f6', archive: '#6366f1', code: '#14b8a6', default: '#6b7280',
  };
  const fallbackColor = colors[getFileIconType(first.ext, first.isDirectory)] || colors.default;
  return drawDragCanvas(imgEl, first.name, files.length, fallbackColor);
}

function startDragOut(file, mode, mouseEvent) {
  // mode: 'move' = 左键拖出，'copy' = 右键拖出
  const startX = mouseEvent.clientX;
  const startY = mouseEvent.clientY;
  let dragStarted = false;

  const onMouseMove = (e) => {
    if (dragStarted) return;
    if (state.boxSelecting) { cleanup(); return; }
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > 5) {
      dragStarted = true;
      cleanup();
      e.preventDefault();
      hideFilePreview(); // 开始拖拽时收起悬浮预览

      getDragIconDataUrl([file]).then((iconDataUrl) => {
        return window.api.files.startDrag([{ path: file.path, name: file.name, icon: iconDataUrl }]);
      }).then(async () => {
        // 根据上下文决定列表变化
        if (state.folderMode) {
          if (state.folderOpMode === 'modify') {
            // 修改模式：真实移动文件，需要刷新文件夹
            if (mode === 'move') {
              // 真实移动已完成，刷新当前文件夹
              const current = state.folderStack[state.folderStack.length - 1];
              if (current) {
                const result = await window.api.folder.list(current.path);
                if (result.success) {
                  state.files = result.files;
                  applySort();
                  renderFiles();
                }
              }
            }
            // 右键复制：列表不变（文件还在原位）
          } else {
            // 安全模式：列表完全不变
          }
        } else if (isActiveReferenceDock()) {
          // 引用仓：左键拖出（move）由 OS 默认 copy 到目标位置。
          // 修改模式要让"移出"语义成立：把源文件移入回收站（可恢复），再刷新引用仓。
          // 安全模式拖出仅复制（列表不变），与"安全模式不改磁盘"语义一致。
          // 拖出又放回自家窗口 = 取消拖出，不回收源文件（否则文件会凭空消失）。
          if (state.folderOpMode === 'modify' && mode === 'move' && !justDroppedSelf()) {
            try {
              await window.api.files.delete([file.path]);
            } catch (err) {
              console.error('移出失败:', err);
            }
          }
          if (state.folderOpMode === 'modify') {
            await refreshReferenceDock();
            renderFiles();
          }
        } else {
          // 临时仓：左键拖出时根据设置决定是否从仓中移除引用
          // 放回自家窗口 = 取消拖出，引用保留
          if (mode === 'move' && state.settings.removeOnDragOutFromTemp !== false && !justDroppedSelf()) {
            // 左键移出：从列表移除引用
            removeFileFromList(file.path);
          }
          // 右键复制 / 关闭移除选项：列表不变
        }
      });
    }
  };

  const onMouseUp = () => cleanup();
  const cleanup = () => {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  };

  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
}

// 编辑模式下拖出文件
// 规则：拖已选中的文件 = 拖出全部选中；拖未选中的文件 = 选中并单独拖出
function startEditDragOut(file, mouseEvent) {
  const startX = mouseEvent.clientX;
  const startY = mouseEvent.clientY;
  const wasSelected = state.selectedPaths.has(file.path);
  let dragStarted = false;

  const onMouseMove = (e) => {
    if (dragStarted) return;
    if (state.boxSelecting) { cleanup(); return; }
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (Math.sqrt(dx * dx + dy * dy) > 5) {
      dragStarted = true;
      cleanup();
      e.preventDefault();

      let filesToDrag;
      if (wasSelected) {
        // 拖已选中文件 → 拖出全部选中文件
        filesToDrag = getSelectedFiles();
      } else {
        // 拖未选中文件 → 选中它并单独拖出
        state.selectedPaths.add(file.path);
        renderFiles();
        filesToDrag = [file];
      }

      // 标记拖动刚结束（在 startDrag 完成后），阻止 click 切换选中
      editDragJustEnded = true;
      setTimeout(() => { editDragJustEnded = false; }, 50);

      dragOutFiles(filesToDrag, 'move');
    }
  };

  const onMouseUp = () => cleanup();
  const cleanup = () => {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  };

  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
}

// 通用拖出文件（编辑模式多选拖出 / 移出按钮共用）
async function dragOutFiles(filesToDrag, mode) {
  if (!filesToDrag || filesToDrag.length === 0) return;
  hideFilePreview();
  const icon = await getDragIconDataUrl(filesToDrag);
  const items = filesToDrag.map(file => ({
    path: file.path,
    name: file.name,
    icon,
  }));
  await window.api.files.startDrag(items);

  const draggedPaths = new Set(filesToDrag.map(f => f.path));

  if (state.folderMode) {
    if (state.folderOpMode === 'modify') {
      // 修改模式：真实移动已完成，刷新当前文件夹
      if (mode === 'move') {
        const current = state.folderStack[state.folderStack.length - 1];
        if (current) {
          const result = await window.api.folder.list(current.path);
          if (result.success) {
            state.files = result.files;
            applySort();
          }
        }
      }
      // 右键复制：列表不变
    }
    // 安全模式：列表不变
  } else if (isActiveReferenceDock()) {
    // 引用仓：修改模式左键拖出 / 移除按钮 = 真移出（OS 已 copy 到目标，源文件移入回收站，可恢复）
    // 安全模式拖出仅复制（列表不变）
    // 拖出又放回自家窗口 = 取消拖出，不回收源文件
    if (state.folderOpMode === 'modify' && mode === 'move') {
      if (!justDroppedSelf()) {
        for (const p of draggedPaths) {
          try { await window.api.files.delete([p]); } catch (err) { console.error('移出失败:', err); }
        }
      }
      await refreshReferenceDock();
    }
  } else {
    // 临时仓：左键拖出时根据设置决定是否从列表移除引用
    // 放回自家窗口 = 取消拖出，引用保留
    if (mode === 'move' && state.settings.removeOnDragOutFromTemp !== false && !justDroppedSelf()) {
      state.files = state.files.filter(f => !draggedPaths.has(f.path));
    }
  }

  // 清理已拖出文件的选中状态
  draggedPaths.forEach(p => state.selectedPaths.delete(p));
  renderFiles();
  saveCurrentPreset();
}

// ===== 文件拖入 =====
function handleDragEnter(e) {
  e.preventDefault();
  els.fileArea.classList.add('drag-over');
  els.emptyState.classList.add('drag-over');
}

function handleDragOver(e) {
  e.preventDefault();
  // 修改模式下拖到文件夹项上 = 移入：文件夹项高亮、dropEffect 显示 move
  els.fileList.querySelectorAll('.file-item.drop-target').forEach(x => x.classList.remove('drop-target'));
  const overFolder = state.folderOpMode === 'modify' && (state.folderMode || isActiveReferenceDock());
  if (overFolder) {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const item = el && el.closest ? el.closest('.file-item') : null;
    const f = item && state.files.find(x => x.path === item.dataset.path);
    if (f && f.isDirectory) {
      item.classList.add('drop-target');
      e.dataTransfer.dropEffect = 'move';
      return;
    }
  }
  e.dataTransfer.dropEffect = 'copy';
}

function handleDragLeave(e) {
  if (e.target === els.fileArea || !els.fileArea.contains(e.relatedTarget)) {
    els.fileArea.classList.remove('drag-over');
    els.emptyState.classList.remove('drag-over');
  }
}

// 拖出后放回自家窗口 = 取消拖出：记录投放时间，拖出完成逻辑据此跳过回收/移除。
// （startDrag 的 promise 在 OLE 拖放结束后才 resolve，此时 drop 事件刚同步发生过）
let lastSelfDropAt = 0;
const justDroppedSelf = () => Date.now() - lastSelfDropAt < 1500;

async function handleDrop(e) {
  e.preventDefault();
  lastSelfDropAt = Date.now();
  if (isActiveClipboardDock()) return;
  els.fileArea.classList.remove('drag-over');
  els.emptyState.classList.remove('drag-over');

  const files = Array.from(e.dataTransfer.files);
  if (files.length === 0) return;

  // 资源管理器式移动：修改模式下，把文件直接拖放到某个文件夹项上 = 移入该文件夹
  if (state.folderOpMode === 'modify' && (state.folderMode || isActiveReferenceDock())) {
    const dropEl = document.elementFromPoint(e.clientX, e.clientY);
    const itemEl = dropEl && dropEl.closest ? dropEl.closest('.file-item') : null;
    const target = itemEl && state.files.find(f => f.path === itemEl.dataset.path);
    if (target && target.isDirectory) {
      if (!await ensureModifyConfirmed()) return;
      const norm = (p2) => String(p2).replace(/[\\/]+/g, '\\').replace(/[\\/]+$/, '').toLowerCase();
      const destN = norm(target.path);
      let failed = 0, moved = 0;
      for (const src of realPaths) {
        const srcN = norm(src);
        if (srcN === destN) continue; // 放回原位 = 取消
        if (srcN && destN.startsWith(srcN + '\\')) { failed++; continue; } // 文件夹移入自身内部
        const r = await window.api.files.move(src, target.path);
        r.success ? moved++ : failed++;
      }
      els.fileList.querySelectorAll('.file-item.drop-target').forEach(x => x.classList.remove('drop-target'));
      await refreshCurrent();
      if (failed) await showInfoDialog('部分移动失败', failed + ' 个文件未能移动。');
      return;
    }
    els.fileList.querySelectorAll('.file-item.drop-target').forEach(x => x.classList.remove('drop-target'));
  }

  // 资源管理器式移动：修改模式下，把文件直接拖放到某个文件夹项上 = 移入该文件夹
  if (state.folderOpMode === 'modify' && (state.folderMode || isActiveReferenceDock())) {
    const dropEl = document.elementFromPoint(e.clientX, e.clientY);
    const itemEl = dropEl && dropEl.closest ? dropEl.closest('.file-item') : null;
    const target = itemEl && state.files.find(f => f.path === itemEl.dataset.path);
    if (target && target.isDirectory) {
      if (!await ensureModifyConfirmed()) return;
      const norm = (p2) => String(p2).replace(/[\\/]+/g, '\\').replace(/[\\/]+$/, '').toLowerCase();
      const destN = norm(target.path);
      let failed = 0, moved = 0;
      for (const src of realPaths) {
        const srcN = norm(src);
        if (srcN === destN) continue; // 放回原位 = 取消
        if (srcN && destN.startsWith(srcN + '\\')) { failed++; continue; } // 文件夹移入自身内部
        const r = await window.api.files.move(src, target.path);
        r.success ? moved++ : failed++;
      }
      els.fileList.querySelectorAll('.file-item.drop-target').forEach(x => x.classList.remove('drop-target'));
      await refreshCurrent();
      if (failed) await showInfoDialog('部分移动失败', failed + ' 个文件未能移动。');
      return;
    }
    els.fileList.querySelectorAll('.file-item.drop-target').forEach(x => x.classList.remove('drop-target'));
  }

  // 资源管理器式移动：修改模式下，把文件直接拖放到某个文件夹项上 = 移入该文件夹
  if (state.folderOpMode === 'modify' && (state.folderMode || isActiveReferenceDock())) {
    const dropEl = document.elementFromPoint(e.clientX, e.clientY);
    const itemEl = dropEl && dropEl.closest ? dropEl.closest('.file-item') : null;
    const target = itemEl && state.files.find(f => f.path === itemEl.dataset.path);
    if (target && target.isDirectory) {
      if (!await ensureModifyConfirmed()) return;
      const norm = (p2) => String(p2).replace(/[\\/]+/g, '\\').replace(/[\\/]+$/, '').toLowerCase();
      const destN = norm(target.path);
      let failed = 0, moved = 0;
      for (const src of realPaths) {
        const srcN = norm(src);
        if (srcN === destN) continue; // 放回原位 = 取消
        if (srcN && destN.startsWith(srcN + '\\')) { failed++; continue; } // 文件夹移入自身内部
        const r = await window.api.files.move(src, target.path);
        r.success ? moved++ : failed++;
      }
      els.fileList.querySelectorAll('.file-item.drop-target').forEach(x => x.classList.remove('drop-target'));
      await refreshCurrent();
      if (failed) await showInfoDialog('部分移动失败', failed + ' 个文件未能移动。');
      return;
    }
    els.fileList.querySelectorAll('.file-item.drop-target').forEach(x => x.classList.remove('drop-target'));
  }

  // 区分真实文件与“虚拟文件”（zip 压缩包内、邮件附件等：没有真实路径，只有内容）
  const realPaths = [];
  const virtualFiles = [];
  for (const f of files) {
    if (f.path) realPaths.push(f.path);
    else virtualFiles.push(f);
  }
  // 安全模式 + 有绑定文件夹的上下文：虚拟文件必须落盘才能收纳，与安全模式语义冲突，直接提示
  if (virtualFiles.length && (state.folderMode || isActiveReferenceDock()) && state.folderOpMode !== 'modify') {
    await showInfoDialog('安全模式提示', '拖入的文件来自压缩包内（或虚拟来源），没有真实路径，安全模式下无法收纳。请切换到修改模式后再拖入。');
    return;
  }

  if (state.folderMode && state.folderOpMode === 'modify') {
    // 修改模式文件夹层：真实移动/复制文件到当前文件夹
    if (!await ensureModifyConfirmed()) return;
    const currentFolder = state.folderStack[state.folderStack.length - 1];
    if (!currentFolder) return;
    for (const p of realPaths) {
      // 默认移动（左键拖入）
      const result = await window.api.files.move(p, currentFolder.path);
      if (!result.success) {
        console.error('移动失败:', result.error);
      }
    }
    // 压缩包内文件：由渲染层读出内容，直接写入当前文件夹
    for (const f of virtualFiles) {
      await materializeDroppedFile(f, currentFolder.path);
    }
    // 刷新当前文件夹
    const result = await window.api.folder.list(currentFolder.path);
    if (result.success) {
      state.files = result.files;
      applySort();
      await refreshPoolIfSearching();
      renderFiles();
    }
  } else if (state.folderMode && state.folderOpMode === 'safe') {
    // 安全模式文件夹层：临时显示，标记为临时（虚拟文件已在上方提示并返回）
    await addRealEntries(realPaths, true);
    applySort();
    renderFiles();
  } else if (isActiveReferenceDock()) {
    // 引用仓：安全模式下临时显示拖入的文件（标记为临时，与文件夹层安全模式一致）；
    //         修改模式真实移动到绑定文件夹
    if (state.folderOpMode !== 'modify') {
      // 安全模式：临时加入列表并标记，不写入绑定文件夹
      await addRealEntries(realPaths, true);
      applySort();
      renderFiles();
      return;
    }
    const targetFolder = state.activePreset.folderPath;
    for (const p of realPaths) {
      const result = await window.api.files.move(p, targetFolder);
      if (!result.success) {
        console.error('移动失败:', result.error);
      }
    }
    for (const f of virtualFiles) {
      await materializeDroppedFile(f, targetFolder);
    }
    await refreshReferenceDock();
    renderFiles();
  } else {
    // 临时仓：添加文件引用到列表；压缩包内文件落到配置目录 drop-inbox 后引用
    await addRealEntries(realPaths, false);
    for (const f of virtualFiles) {
      const saved = await materializeDroppedFile(f, null);
      if (saved) await addRealEntries([saved], false);
    }
    applySort();
    renderFiles();
    saveCurrentPreset();
  }
}

// 把真实路径的文件加入列表；markTemp=true 时同时标记为临时（安全模式）
async function addRealEntries(paths, markTemp) {
  if (!paths || paths.length === 0) return;
  const fileInfos = await window.api.files.getInfo(paths);
  for (const info of fileInfos) {
    if (!state.files.find(f => f.path === info.path)) {
      state.files.push(info);
      if (markTemp) state.temporaryPaths.add(info.path);
    }
  }
}

// 虚拟文件（zip 内/邮件附件等）落盘：destDir 为空时写入配置目录的 drop-inbox/
async function materializeDroppedFile(file, destDir) {
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const r = await window.api.files.saveDropped(file.name || '未命名', bytes, destDir || null);
    if (!r.success) {
      console.error('虚拟文件落盘失败:', r.error);
      await showInfoDialog('收纳失败', '压缩包内文件写入失败：' + (r.error || '未知错误'));
      return null;
    }
    return r.path;
  } catch (err) {
    console.error('虚拟文件读取失败:', err);
    return null;
  }
}

// ===== 文件操作 =====
function removeFileFromList(filePath) {
  // 引用仓：仅能移除安全模式拖入的临时文件；真实文件来自绑定文件夹，无法"仅从列表移除"
  if (isActiveReferenceDock()) {
    if (state.temporaryPaths.has(filePath)) {
      state.files = state.files.filter(f => f.path !== filePath);
      state.temporaryPaths.delete(filePath);
      renderFiles();
    } else {
      showInfoDialog('无法移除', '引用仓中的文件来自绑定的文件夹，无法仅从列表移除。如需删除请使用"从磁盘删除"。');
    }
    return;
  }
  state.files = state.files.filter(f => f.path !== filePath);
  state.temporaryPaths.delete(filePath);
  renderFiles();
  saveCurrentPreset();
}

async function deleteFileFromDisk(filePath, fileName) {
  // 引用仓：安全模式禁止删除；修改模式走回收站+带确认
  if (isActiveReferenceDock()) {
    if (state.folderOpMode !== 'modify') {
      await showInfoDialog('安全模式提示', '当前处于安全模式，无法删除引用仓中的文件。请切换到修改模式后再操作。');
      return;
    }
    if (!confirm(`确定要将文件 "${fileName}" 移入回收站吗？`)) return;
    if (!await ensureModifyConfirmed()) return;
    const results = await window.api.files.delete([filePath]);
    if (!results[0].success) {
      alert('删除失败: ' + results[0].error);
      return;
    }
    await refreshReferenceDock();
    renderFiles();
    return;
  }

  // 临时仓 / 文件夹浏览：保留原有确认流程
  if (state.folderOpMode !== 'modify') {
    alert('请切换到修改模式后再删除文件');
    return;
  }
  if (!confirm(`确定要将文件 "${fileName}" 移入回收站吗？`)) return;
  if (!await ensureModifyConfirmed()) return;

  const results = await window.api.files.delete([filePath]);
  if (!results[0].success) {
    alert('删除失败: ' + results[0].error);
    return;
  }
  // 如果在文件夹模式，刷新文件夹；否则从列表移除
  if (state.folderMode) {
    const current = state.folderStack[state.folderStack.length - 1];
    if (current) {
      const result = await window.api.folder.list(current.path);
      if (result.success) {
        state.files = result.files;
        applySort();
        await refreshPoolIfSearching();
        renderFiles();
      }
    }
  } else {
    removeFileFromList(filePath);
  }
}

// ===== 右键菜单 =====
function showContextMenu(x, y, file, index) {
  state.contextMenuFile = { file, index };
  // 显示前刷新菜单项可见性（确保安全模式下隐藏"从磁盘删除"/"重命名"）
  updateActionsForDockType();
  els.contextMenu.classList.remove('hidden');
  clampPopup(els.contextMenu, x, y);
}

function hideContextMenu() {
  els.contextMenu.classList.add('hidden');
  state.contextMenuFile = null;
}

// ===== 空白处右键菜单 =====
// 获取当前所在文件夹路径：
// - 文件夹模式：返回栈顶文件夹
// - 引用仓根 dock：返回绑定的 folderPath
// - 临时仓根 dock：返回 null（无关联文件夹，新建/在资源管理器中打开 不可用）
function getCurrentFolderPath() {
  if (state.folderMode && state.folderStack.length > 0) {
    return state.folderStack[state.folderStack.length - 1].path;
  }
  if (isActiveReferenceDock() && state.activePreset.folderPath) {
    return state.activePreset.folderPath;
  }
  return null;
}

function showEmptyContextMenu(x, y) {
  const cwd = getCurrentFolderPath();
  // 没有关联文件夹时隐藏"新建"和"在资源管理器中打开"
  const hasFolder = !!cwd;
  els.emptyContextMenu.querySelector('[data-action="newFolder"]').style.display = hasFolder ? '' : 'none';
  els.emptyContextMenu.querySelector('[data-action="newTextFile"]').style.display = hasFolder ? '' : 'none';
  els.emptyContextMenu.querySelector('[data-action="newMarkdown"]').style.display = hasFolder ? '' : 'none';
  els.emptyContextMenu.querySelector('[data-action="openInExplorer"]').style.display = hasFolder ? '' : 'none';
  // 没有任何项可显示时不弹菜单
  const visibleItems = els.emptyContextMenu.querySelectorAll('.menu-item:not([style*="display: none"])');
  if (visibleItems.length === 0) return;
  els.emptyContextMenu.classList.remove('hidden');
  clampPopup(els.emptyContextMenu, x, y);
}

function hideEmptyContextMenu() {
  els.emptyContextMenu.classList.add('hidden');
}

// 是否允许新建（修改模式才允许写入；安全模式新建会创建实际文件，与"安全模式不修改磁盘"语义冲突）
function canCreateInCurrent() {
  if (!getCurrentFolderPath()) return false;
  return state.folderOpMode === 'modify';
}

async function handleEmptyContextAction(action) {
  switch (action) {
    case 'newFolder':
      await createNewChild('新建文件夹', true, '新建文件夹');
      break;
    case 'newTextFile':
      await createNewChild('新建文本文件', false, '文本文档.txt');
      break;
    case 'newMarkdown':
      await createNewChild('新建 Markdown 文档', false, '文档.md');
      break;
    case 'refresh':
      await refreshCurrent();
      break;
    case 'openInExplorer':
      await openCurrentInExplorer();
      break;
  }
  hideEmptyContextMenu();
}

// 新建子文件夹或空文件，创建后刷新当前目录
async function createNewChild(title, isDir, defaultName) {
  const cwd = getCurrentFolderPath();
  if (!cwd) {
    await showInfoDialog('提示', '当前文件仓没有关联的文件夹，无法新建。');
    return;
  }
  if (!canCreateInCurrent()) {
    await showInfoDialog('安全模式提示', '当前处于安全模式，无法新建。请切换到修改模式后再操作。');
    return;
  }
  const name = await showPromptDialog(title, '名称', defaultName);
  if (!name) return;
  // 简单校验：禁止路径分隔符和非法字符
  if (/[\\/:*?"<>|]/.test(name)) {
    await showInfoDialog('名称非法', '名称不能包含 \\ / : * ? " < > | 等字符。');
    return;
  }
  const result = await window.api.folder.createChild(cwd, name, isDir);
  if (!result.success) {
    await showInfoDialog('创建失败', result.error || '未知错误');
    return;
  }
  // 刷新当前列表
  await refreshCurrent();
}

// 刷新当前内容：引用仓重新读取绑定文件夹；文件夹模式重新读取栈顶文件夹；临时仓重新载入预设
async function refreshCurrent() {
  if (isActiveClipboardDock()) {
    applyClipDockClass();
    if (window.__clipUI) window.__clipUI.refresh();
    return;
  }
  if (state.folderMode && state.folderStack.length > 0) {
    const current = state.folderStack[state.folderStack.length - 1];
    const result = await window.api.folder.list(current.path);
    if (result.success) {
      state.files = result.files;
      state.temporaryPaths.clear();
      applySort();
      await refreshPoolIfSearching();
      renderFiles();
    } else {
      await showInfoDialog('刷新失败', result.error || '未知错误');
    }
    return;
  }
  if (isActiveReferenceDock()) {
    await refreshReferenceDock();
    renderFiles();
    return;
  }
  // 临时仓：重新从预设载入
  const preset = state.activePreset;
  if (preset) {
    state.files = preset.files || [];
    state.temporaryPaths.clear();
    applySort();
    renderFiles();
  }
}

// 在系统资源管理器中打开当前文件夹
async function openCurrentInExplorer() {
  const cwd = getCurrentFolderPath();
  if (!cwd) {
    await showInfoDialog('提示', '当前文件仓没有关联的文件夹。');
    return;
  }
  const result = await window.api.folder.openInExplorer(cwd);
  if (!result.success) {
    await showInfoDialog('打开失败', result.error || '未知错误');
  }
}

// 复制文件绝对路径到剪贴板
async function copyFilePath(file) {
  if (!file.path) {
    await showInfoDialog('无法复制', '该文件来自压缩包等虚拟来源，没有真实路径。');
    return;
  }
  try {
    await navigator.clipboard.writeText(file.path);
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = file.path;
    ta.style.cssText = 'position:fixed;opacity:0;';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e2) {}
    document.body.removeChild(ta);
  }
}

function handleContextAction(action) {
  const ctx = state.contextMenuFile;
  if (!ctx) return;
  const file = ctx.file;
  switch (action) {
    case 'open':
      window.api.files.open(file.path);
      break;
    case 'openFolder':
      window.api.files.showInFolder(file.path);
      break;
    case 'copyPath':
      copyFilePath(file);
      break;
    case 'rename':
      renameFile(file);
      break;
    case 'remove':
      removeFileFromList(file.path);
      break;
    case 'delete':
      deleteFileFromDisk(file.path, file.name);
      break;
  }
  hideContextMenu();
}

// 重命名文件/文件夹（修改模式才允许：临时仓改真实文件名并更新引用，
// 引用仓 / 文件夹模式改真实文件名后刷新列表）
async function renameFile(file) {
  if (state.folderOpMode !== 'modify') {
    await showInfoDialog('安全模式提示', '当前处于安全模式，无法重命名。请切换到修改模式后再操作。');
    return;
  }
  const newName = await showPromptDialog('重命名', '新名称', file.name);
  if (!newName || newName === file.name) return;
  const result = await window.api.folder.rename(file.path, newName);
  if (!result.success) {
    await showInfoDialog('重命名失败', result.error || '未知错误');
    return;
  }
  // 临时文件路径变了：同步更新 temporaryPaths
  const wasTemp = state.temporaryPaths.has(file.path);
  if (wasTemp) {
    state.temporaryPaths.delete(file.path);
    state.temporaryPaths.add(result.path);
  }
  if (state.folderMode || isActiveReferenceDock()) {
    // 引用仓 / 文件夹模式：刷新读取真实列表
    await refreshCurrent();
  } else {
    // 临时仓：直接更新 state.files 中对应项，避免完全刷新导致列表跳动
    const target = state.files.find(f => f.path === file.path);
    if (target) {
      target.path = result.path;
      target.name = result.name;
      target.ext = target.isDirectory ? '' : result.name.slice(result.name.lastIndexOf('.') + 1).toLowerCase();
    }
    applySort();
    renderFiles();
    saveCurrentPreset();
  }
}

// ===== 设置面板 =====
function openSettings() {
  closeAllPanels();
  loadSettingsUI();
  els.settingsPanel.classList.remove('hidden');
  els.app.classList.add('panel-open');
}

function loadSettingsUI() {
  const s = state.settings;
  $('#setting-theme').value = s.theme || 'default';
  $('#setting-themeMode').value = s.themeMode || 'day';
  // 强调色：空值时显示主题默认色
  const icons = getThemeIcons(s.theme || 'default');
  const defaultAccent = (s.themeMode === 'night') ? icons.defaultAccentNight : icons.defaultAccent;
  $('#setting-accentColor').value = s.accentColor || defaultAccent;
  $('#setting-folderMode').value = s.folderMode || 'safe';
  $('#setting-removeOnDragOutFromTemp').checked = s.removeOnDragOutFromTemp !== false;
  $('#setting-snapEnabled').checked = s.snapEnabled;
  $('#setting-autoHideOnSnap').checked = s.autoHideOnSnap;
  $('#setting-triggerSize').value = s.triggerSize;
  // 触点颜色：空值时显示主题默认色（与强调色一致）
  $('#setting-triggerColor').value = s.triggerColor || defaultAccent;
  $('#setting-triggerAction').value = s.triggerAction;
  $('#setting-previewTrigger').value = s.previewTrigger || 'ctrl';
  $('#setting-pinShowName').checked = !!s.pinShowName;
  renderHotkeyUI();
  $('#setting-hideDelay').value = s.hideDelay;
  $('#hideDelay-value').textContent = formatMs(s.hideDelay);
  $('#setting-alwaysOnTop').checked = s.alwaysOnTop;
  $('#setting-closeToTray').checked = s.closeToTray;
  $('#setting-startupPreset').value = s.startupPreset;
  // 加载图标选择器
  loadIconPicker();
}

// 毫秒格式化
function formatMs(ms) {
  if (ms === 0) return '0毫秒';
  if (ms < 1000) return `${ms}毫秒`;
  return `${(ms / 1000).toFixed(1)}秒`;
}

function closeSettings() {
  els.settingsPanel.classList.add('hidden');
  els.app.classList.remove('panel-open');
}

// ===== 图标选择器 =====
async function loadIconPicker() {
  const container = $('#icon-picker');
  container.innerHTML = '';
  try {
    const data = await window.api.icon.list();
    const current = data.current;
    for (const icon of data.icons) {
      const item = document.createElement('div');
      item.className = 'icon-option' + (icon.name === current ? ' selected' : '');
      item.title = icon.label + (icon.isCustom ? '（自定义）' : '');
      item.innerHTML = `<img src="${icon.dataUrl}" alt="${icon.label}"><span class="icon-option-label">${icon.label}</span>`;
      item.addEventListener('click', async () => {
        await window.api.icon.set(icon.name);
        // 更新选中状态
        container.querySelectorAll('.icon-option').forEach(o => o.classList.remove('selected'));
        item.classList.add('selected');
      });
      // 自定义图标支持右键删除
      if (icon.isCustom) {
        item.addEventListener('contextmenu', async (e) => {
          e.preventDefault();
          if (confirm(`删除自定义图标"${icon.label}"？`)) {
            await window.api.icon.remove(icon.name);
            loadIconPicker();
          }
        });
      }
      container.appendChild(item);
    }
  } catch (err) {
    container.innerHTML = '<div class="setting-tip">图标加载失败</div>';
  }
}

function setupIconUpload() {
  const btn = $('#upload-icon-btn');
  const input = $('#icon-file-input');
  btn.addEventListener('click', () => input.click());
  input.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    // 读取为 dataUrl
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result;
      const result = await window.api.icon.upload(dataUrl, file.name);
      if (result.success) {
        loadIconPicker();
      } else {
        alert('上传失败: ' + (result.error || '未知错误'));
      }
    };
    reader.readAsDataURL(file);
    input.value = ''; // 允许重复上传同名文件
  });
}

// ===== 滑块数值双击编辑 =====
// 让滑块右侧的数值标签支持双击后输入数值
function setupSliderEditable(sliderId, valueId, min, max, step, onChange, formatter) {
  const slider = $(`#${sliderId}`);
  const valueEl = $(`#${valueId}`);
  if (!slider || !valueEl) return;

  valueEl.style.cursor = 'pointer';
  valueEl.title = '双击输入数值';
  valueEl.addEventListener('dblclick', () => {
    const current = parseInt(slider.value);
    const input = document.createElement('input');
    input.type = 'number';
    input.min = min;
    input.max = max;
    input.step = step;
    input.value = current;
    input.className = 'slider-edit-input';
    input.style.width = '64px';
    valueEl.replaceWith(input);
    input.focus();
    input.select();

    const commit = () => {
      let v = parseInt(input.value);
      if (isNaN(v)) v = current;
      v = Math.max(min, Math.min(max, v));
      slider.value = v;
      valueEl.textContent = formatter(v);
      input.replaceWith(valueEl);
      onChange(v);
    };

    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      if (e.key === 'Escape') { input.replaceWith(valueEl); }
    });
  });
}

async function updateSetting(key, value) {
  state.settings = await window.api.settings.update({ [key]: value });
  // 主题/强调色/日夜间变化时重新应用主题和图标
  if (key === 'theme' || key === 'themeMode' || key === 'accentColor') {
    applyTheme();
    // 切换主题后同步设置面板的强调色与触点色显示
    if (key === 'theme' || key === 'themeMode') {
      const s = state.settings;
      const icons = getThemeIcons(s.theme || 'default');
      const defaultAccent = (s.themeMode === 'night') ? icons.defaultAccentNight : icons.defaultAccent;
      $('#setting-accentColor').value = s.accentColor || defaultAccent;
      $('#setting-triggerColor').value = s.triggerColor || defaultAccent;
    }
  }
  if (key === 'folderMode') {
    state.folderOpMode = value;
    applyFolderOpMode();
  }
  if (key === 'alwaysOnTop') {
    await window.api.window.toggleAlwaysOnTop(value);
  }
}

// 取色器拖动、滑块拖动会以每秒几十次的频率触发 input 事件，而每次 updateSetting 都是一次
// 「同步重写配置文件 + 向所有窗口广播 + 主题重应用（含文件列表整表重渲染）」。
// 这里按 key 做节流：首次立即生效保证跟手，之后的连续变化合并到 100ms 后补一次。
const SETTING_THROTTLE_MS = 100;
const settingThrottle = new Map();

function updateSettingThrottled(key, value) {
  let st = settingThrottle.get(key);
  if (!st) {
    st = { lastRun: 0, timer: null, pending: undefined, hasPending: false };
    settingThrottle.set(key, st);
  }
  st.pending = value;
  st.hasPending = true;

  const since = Date.now() - st.lastRun;
  if (since >= SETTING_THROTTLE_MS) {
    st.lastRun = Date.now();
    st.hasPending = false;
    updateSetting(key, st.pending);
    return;
  }
  if (st.timer) return;
  st.timer = setTimeout(() => {
    st.timer = null;
    if (!st.hasPending) return;
    st.hasPending = false;
    st.lastRun = Date.now();
    updateSetting(key, st.pending);
  }, SETTING_THROTTLE_MS - since);
}

// ===== 预设面板 =====
async function openPresetPanel() {
  closeAllPanels();
  await renderPresetList();
  els.presetPanel.classList.remove('hidden');
  els.app.classList.add('panel-open');
}

function closePresetPanel() {
  els.presetPanel.classList.add('hidden');
  els.app.classList.remove('panel-open');
}

async function renderPresetList() {
  const container = $('#preset-list-container');
  container.innerHTML = '';

  const presets = await window.api.presets.getAll();
  state.allPresets = presets;
  const activeId = state.activePreset?.id;

  for (const preset of presets) {
    const isRef = preset.type === 'reference';
    const isClip = preset.type === 'clipboard';
    const typeLabel = isRef ? '引用仓' : (isClip ? '剪贴板仓' : '临时仓');
    const infoText = isRef
      ? (preset.folderPath ? `引用仓 · ${preset.folderPath}` : '引用仓 · 未绑定')
      : (isClip ? '剪贴板历史 + 收藏（文本 / 图片 / 混排）' : `${(preset.files || []).length} 个文件`);
    const item = document.createElement('div');
    item.className = 'preset-item' + (preset.id === activeId ? ' active' : '');
    item.innerHTML = `
      <div style="flex:1;min-width:0;">
        <div class="preset-name">${escHtml(preset.name)} <span class="preset-type-tag">${typeLabel}</span></div>
        <div class="preset-info" title="${escHtml(preset.folderPath || '')}">${escHtml(infoText)}</div>
      </div>
      <div class="preset-actions">
        <button class="icon-btn small preset-rename" title="重命名">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M12.146.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1 0 .708l-10 10a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168l10-10zM11.207 2.5L13.5 4.793L14.793 3.5L12.5 1.207L11.207 2.5zm1.586 3L10.5 3.207L4 9.707V10h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.293l6.5-6.5z"/></svg>
        </button>
        <button class="icon-btn small preset-delete" title="删除">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/><path d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4L4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3h11V2h-11v1z"/></svg>
        </button>
      </div>
    `;

    // 重命名：行内编辑文件仓名
    item.querySelector('.preset-rename').addEventListener('click', async (e) => {
      e.stopPropagation();
      const nameEl = item.querySelector('.preset-name');
      if (!nameEl) return;
      // 取原始名称（去掉类型标签）
      const oldName = preset.name;
      const input = document.createElement('input');
      input.type = 'text';
      input.value = oldName;
      input.className = 'preset-rename-input';
      input.style.cssText = 'width:100%;font-size:12px;padding:2px 4px;border:1px solid var(--accent);border-radius:3px;background:var(--input-bg);color:var(--text);';
      nameEl.innerHTML = '';
      nameEl.appendChild(input);
      input.focus();
      input.select();
      let committed = false;
      const commit = async () => {
        if (committed) return; // 防 Enter + blur 双触发导致重复渲染/重复改名
        committed = true;
        const newName = (input.value || '').trim() || oldName;
        if (newName !== oldName) {
          await window.api.presets.rename(preset.id, newName);
          preset.name = newName;
          if (state.activePreset && state.activePreset.id === preset.id) {
            state.activePreset.name = newName;
            updateTitlebarPresetName();
          }
        }
        await renderPresetList();
        renderDockPager();
      };
      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') { ev.preventDefault(); commit(); }
        else if (ev.key === 'Escape') { renderPresetList(); }
      });
      input.addEventListener('blur', commit);
    });

    item.querySelector('.preset-delete').addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirm(`删除文件仓 "${preset.name}"？${isRef ? '（仅删除文件仓记录，不会删除引用的真实文件夹及其内容）' : ''}`)) {
        await window.api.presets.delete(preset.id);
        await renderPresetList();
        renderDockPager();
        if (preset.id === activeId) {
          await loadPreset();
          renderFiles();
        }
      }
    });

    item.addEventListener('click', async () => {
      await switchToPreset(preset.id);
      closePresetPanel();
    });

    container.appendChild(item);
  }
}

async function switchToPreset(id) {
  await saveCurrentPreset();
  const preset = await window.api.presets.setActive(id);
  if (preset) {
    state.activePreset = preset;
    state.allPresets = await window.api.presets.getAll();
    // 切换仓时重置文件夹导航状态，避免面包屑栏残留 / 还原错乱
    resetFolderNavigation();
    // 引用仓：从绑定的文件夹实时读取；临时仓：使用存储的文件引用
    if (preset.type === 'reference' && preset.folderPath) {
      await refreshReferenceDock();
    } else {
      state.files = preset.files || [];
      applySort();
    }
    if (preset.viewMode) {
      state.viewMode = preset.viewMode;
      applyViewMode();
    }
    els.presetName.textContent = preset.name;
    updateDockTypeIndicator();
    renderDockPager();
    renderFiles();
  }
}

// 更新标题栏文件仓名显示
function updateTitlebarPresetName() {
  if (state.activePreset && els.presetName) {
    els.presetName.textContent = state.activePreset.name;
  }
}

// 主界面双击文件仓名进入行内编辑
function bindTitlebarPresetDblClick() {
  const nameWrap = document.querySelector('.titlebar-preset');
  if (!nameWrap) return;
  nameWrap.addEventListener('dblclick', () => {
    if (!state.activePreset) return;
    if (els.app.classList.contains('panel-open')) return;
    const span = $('#preset-name');
    if (!span) return;
    const oldName = state.activePreset.name;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = oldName;
    input.style.cssText = 'font-size:12px;font-weight:500;padding:0 4px;border:1px solid var(--accent);border-radius:3px;background:var(--input-bg);color:var(--text);width:140px;height:20px;-webkit-app-region:no-drag;';
    span.textContent = '';
    span.appendChild(input);
    input.focus();
    input.select();
    const commit = async () => {
      const newName = (input.value || '').trim() || oldName;
      if (newName !== oldName) {
        await window.api.presets.rename(state.activePreset.id, newName);
        state.activePreset.name = newName;
      }
      els.presetName.textContent = newName;
      renderDockPager();
    };
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') { ev.preventDefault(); commit(); }
      else if (ev.key === 'Escape') { els.presetName.textContent = oldName; }
    });
    input.addEventListener('blur', commit);
    input.addEventListener('click', (ev) => ev.stopPropagation());
  });
}

async function createPreset() {
  const nameInput = $('#new-preset-name');
  const typeSelect = $('#new-dock-type');
  const pathInput = $('#new-dock-path');
  const type = typeSelect ? typeSelect.value : 'temporary';
  const name = nameInput.value.trim() || (type === 'reference' ? `引用仓 ${Date.now()}`
    : type === 'clipboard' ? `剪贴板仓 ${Date.now()}` : `临时仓 ${Date.now()}`);

  let folderPath = '';
  if (type === 'reference') {
    folderPath = pathInput ? pathInput.value.trim() : '';
    if (!folderPath) {
      // 空路径提示：将创建一个空文件夹（由主进程在配置目录下自动生成）
      const ok = await showConfirmDialog({
        title: '创建引用仓',
        message: '未填写文件夹路径，将创建一个空文件夹作为引用仓的绑定目录。是否继续？',
        checkboxLabel: '',
      });
      if (!ok.confirmed) return;
      // folderPath 保持空，交由主进程 createPreset 生成默认路径
    } else {
      // 非空路径：确保目录存在（不存在则创建）
      const ensure = await window.api.folder.ensureDir(folderPath);
      if (!ensure.success) {
        alert('创建文件夹失败: ' + ensure.error);
        return;
      }
      folderPath = ensure.path;
    }
  }

  await saveCurrentPreset();
  const preset = await window.api.presets.create(name, { type, folderPath });
  await window.api.presets.setActive(preset.id);
  state.activePreset = preset;
  state.allPresets = await window.api.presets.getAll();
  // 切换仓时重置文件夹导航状态，避免面包屑栏残留 / 还原错乱
  resetFolderNavigation();
  // 引用仓：读取文件夹内容；临时仓：空列表
  if (type === 'reference') {
    await refreshReferenceDock();
  } else {
    state.files = [];
  }
  els.presetName.textContent = preset.name;
  updateDockTypeIndicator();
  renderDockPager();
  renderFiles();
  // 清空表单
  nameInput.value = '';
  if (pathInput) pathInput.value = '';
  await renderPresetList();
}

// ===== 面板控制 =====
function closeAllPanels() {
  els.settingsPanel.classList.add('hidden');
  els.presetPanel.classList.add('hidden');
  els.app.classList.remove('panel-open');
}

// ===== Pin 按钮 =====
function updatePinButton() {
  els.pinBtn.classList.toggle('pinned', state.pinned);
  els.pinBtn.title = state.pinned ? '取消固定' : '固定窗口';
}

async function togglePin() {
  state.pinned = !state.pinned;
  await window.api.window.pin(state.pinned);
  updatePinButton();
}

// ===== 快速隐藏按钮 =====
function updateHideButton() {
  els.hideBtn.classList.toggle('hidden', !state.isSnapped);
}

async function quickHide() {
  hideFilePreview();
  await window.api.snap.collapse();
}

// ===== 顶栏拖动排序 =====
function applyToolbarOrder() {
  const container = els.toolbarButtons;
  const buttons = Array.from(container.querySelectorAll('.toolbar-btn'));
  // 按 toolbarOrder 排序
  buttons.sort((a, b) => {
    const ia = state.toolbarOrder.indexOf(a.dataset.id);
    const ib = state.toolbarOrder.indexOf(b.dataset.id);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  buttons.forEach(btn => container.appendChild(btn));
}

// 长按拖动排序（优化版：使用 pointer 事件，减少卡顿）
let dragSortTimer = null;
let dragSortBtn = null;
let dragSortGhost = null;

function setupToolbarDragSort() {
  els.toolbarButtons.addEventListener('mousedown', (e) => {
    const btn = e.target.closest('.toolbar-btn');
    if (!btn) return;
    // 长按 500ms 进入拖拽排序
    dragSortTimer = setTimeout(() => {
      dragSortBtn = btn;
      btn.classList.add('dragging');
      e.preventDefault();
    }, 500);
  });

  els.toolbarButtons.addEventListener('mouseup', () => {
    if (dragSortTimer) {
      clearTimeout(dragSortTimer);
      dragSortTimer = null;
    }
    if (dragSortBtn) {
      dragSortBtn.classList.remove('dragging');
      dragSortBtn = null;
      saveToolbarOrder();
    }
  });

  els.toolbarButtons.addEventListener('mousemove', (e) => {
    if (!dragSortBtn) return;
    const target = e.target.closest('.toolbar-btn');
    if (!target || target === dragSortBtn) return;

    // 获取所有按钮的矩形，判断鼠标在 target 的左半还是右半
    const targetRect = target.getBoundingClientRect();
    const isLeftHalf = e.clientX < targetRect.left + targetRect.width / 2;

    const container = els.toolbarButtons;
    if (isLeftHalf) {
      container.insertBefore(dragSortBtn, target);
    } else {
      container.insertBefore(dragSortBtn, target.nextSibling);
    }
  });
}

async function saveToolbarOrder() {
  const buttons = Array.from(els.toolbarButtons.querySelectorAll('.toolbar-btn'));
  state.toolbarOrder = buttons.map(b => b.dataset.id);
  state.settings = await window.api.settings.update({ toolbarOrder: state.toolbarOrder });
}

// ===== 框选文件（按下后明显拖动才触发，避免单击/微移误触） =====
const BOX_SELECT_THRESHOLD = 6;  // 鼠标至少移动 N px 才认为用户想框选
let boxSelectRect = null;
let boxStartPos = null;
let boxSelectPending = false;   // 已在空白处按下左键，等待移动阈值判定
let boxSelectStarted = false;    // 已实际开始拖动框选（创建了选框）
let boxSelectJustEnded = false;
let editDragJustEnded = false;
let boxSelectButton = 0;         // 0=左键（替换式框选） 2=右键（叠加式连续选择）
let rightBoxBase = null;         // 右键框选开始时的既有选择（叠加基线）
let rightBoxDragged = false;     // 本次右键框选确实拖动过（用于抑制右键菜单）
let suppressCtxMenu = false;

function setupBoxSelection() {
  els.fileArea.addEventListener('mousedown', (e) => {
    if (getVisiblePool().length === 0) return; // 无文件不框选
    // 编辑模式的右键拖动：从哪儿起手都行（包括文件项上）——扫选时最自然的起手位置
    // 就在某个文件上，早先只允许空白处起手，导致这个功能"看起来没做"
    if (e.button === 2 && state.editMode) {
      boxSelectButton = 2;
      rightBoxBase = new Set(state.selectedPaths);
      rightBoxDragged = false;
      boxStartPos = { x: e.clientX, y: e.clientY };
      boxSelectPending = true;
      boxSelectStarted = false;
      return;
    }
    // 左键：在文件项上按下时不启动框选（让文件拖出/点击工作）
    if (e.target.closest('.file-item')) return;
    if (e.button !== 0) return;
    boxSelectButton = 0;
    boxStartPos = { x: e.clientX, y: e.clientY };
    boxSelectPending = true;
    boxSelectStarted = false;
  });

  document.addEventListener('mousemove', (e) => {
    if (!boxSelectPending || boxSelectStarted) {
      if (boxSelectStarted) updateBoxSelection(e.clientX, e.clientY);
      return;
    }
    if (!boxStartPos) return;
    const dx = e.clientX - boxStartPos.x;
    const dy = e.clientY - boxStartPos.y;
    // 移动超过阈值才真正开始框选，避免单击/微移误触
    if (Math.sqrt(dx * dx + dy * dy) > BOX_SELECT_THRESHOLD) {
      boxSelectStarted = true;
      state.boxSelecting = true;
      startBoxSelection(boxStartPos);
      updateBoxSelection(e.clientX, e.clientY);
    }
  });

  document.addEventListener('mouseup', (e) => {
    if (boxSelectStarted) {
      // 只有真正拖动了框选才结束框选
      endBoxSelection();
      boxSelectJustEnded = true;
      setTimeout(() => { boxSelectJustEnded = false; }, 50);
      if (boxSelectButton === 2 && rightBoxDragged) {
        // 右键拖动结束：吞掉随后触发的右键菜单
        suppressCtxMenu = true;
      }
    }
    // 单击（未拖动）不进入编辑模式，直接清理
    boxSelectPending = false;
    boxSelectStarted = false;
    state.boxSelecting = false;
    boxSelectButton = 0;
    rightBoxBase = null;
  });

  // 编辑模式下双击空白处退出编辑
  els.fileArea.addEventListener('dblclick', (e) => {
    if (!state.editMode) return;
    // 只在双击空白处（非文件项）时退出
    if (e.target.closest('.file-item')) return;
    toggleEditMode();
  });
}

function startBoxSelection(pos) {
  // 如果不在编辑模式，自动切换到编辑模式（右键框选只在编辑模式内启动，不会走到这里）
  if (!state.editMode) {
    state.editMode = true;
    state.selectedPaths.clear();
    els.editBtn.classList.add('active');
    els.editBar.classList.remove('hidden');
    els.app.classList.add('edit-mode');
    renderFiles();
  } else if (boxSelectButton !== 2) {
    // 左键框选：清空之前的选择重新框；右键框选为叠加模式，保留既有选择
    state.selectedPaths.clear();
    renderFiles();
  }

  // 创建选框元素
  boxSelectRect = document.createElement('div');
  boxSelectRect.className = 'box-select-rect';
  boxSelectRect.style.left = pos.x + 'px';
  boxSelectRect.style.top = pos.y + 'px';
  boxSelectRect.style.width = '0px';
  boxSelectRect.style.height = '0px';
  document.body.appendChild(boxSelectRect);

  boxStartPos = pos;
}

function updateBoxSelection(clientX, clientY) {
  if (!boxSelectRect) return;

  const left = Math.min(boxStartPos.x, clientX);
  const top = Math.min(boxStartPos.y, clientY);
  const width = Math.abs(clientX - boxStartPos.x);
  const height = Math.abs(clientY - boxStartPos.y);

  boxSelectRect.style.left = left + 'px';
  boxSelectRect.style.top = top + 'px';
  boxSelectRect.style.width = width + 'px';
  boxSelectRect.style.height = height + 'px';

  // 检测哪些文件项在选框内
  const rect = { left, top, right: left + width, bottom: top + height };
  const items = els.fileList.querySelectorAll('.file-item');

  // 左键框选 = 替换式（先清空）；右键框选 = 叠加式（在既有选择上连续累选，
  // 扫出选框的项保持选中，可以多扫几把凑齐一批）
  if (boxSelectButton !== 2) state.selectedPaths.clear();
  items.forEach(item => {
    const itemRect = item.getBoundingClientRect();
    const path = item.dataset.path;
    if (rectIntersect(rect, itemRect)) {
      if (path) {
        state.selectedPaths.add(path);
        setItemChecked(item, true);
        if (boxSelectButton === 2) rightBoxDragged = true;
      } else {
        setItemChecked(item, false);
      }
    } else if (boxSelectButton !== 2 || !rightBoxBase || !rightBoxBase.has(path)) {
      setItemChecked(item, false);
    } else {
      setItemChecked(item, true); // 叠加基线里已选中的项保持勾选显示
    }
  });
}

function endBoxSelection() {
  if (boxSelectRect) {
    document.body.removeChild(boxSelectRect);
    boxSelectRect = null;
  }
}

function rectIntersect(a, b) {
  return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
}

// 直接更新文件项的选中状态（避免完整 re-render 提升性能）
function setItemChecked(item, checked) {
  item.classList.toggle('checked', checked);
  const cb = item.querySelector('.file-checkbox');
  if (cb) {
    cb.classList.toggle('checked', checked);
    cb.innerHTML = checked
      ? getThemeIcons(state.settings.theme || 'default').check
      : '';
  }
}

// ===== 事件绑定 =====
function bindEvents() {
  // 主界面双击文件仓名可编辑
  bindTitlebarPresetDblClick();
  // 视图切换（单按钮：点一次列表，再点一次网格）
  els.viewToggleBtn.addEventListener('click', () => {
    state.viewMode = state.viewMode === 'list' ? 'grid' : 'list';
    applyViewMode();
    saveCurrentPreset();
    if (state.activePreset) {
      window.api.presets.update(state.activePreset.id, { viewMode: state.viewMode });
    }
  });

  // 筛选按钮：点开/收起筛选面板
  els.filterBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleFilterPanel();
  });

  // 筛选模式切换（按类型 / 按后缀名）
  els.filterPanel.querySelectorAll('.filter-mode-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      switchFilterMode(btn.dataset.filtermode);
    });
  });

  // 全选/全不选 切换条
  if (els.filterToggleAll) {
    els.filterToggleAll.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFilterAll();
    });
  }

  // —— 快捷方式：手势切仓 + 钉住按键 ——
  let lastGestureSwitch = 0;
  // 部分环境的 wheel 事件 buttons 位不含侧键，需单独按下/松开跟踪
  let x1Down = false, x2Down = false;
  window.addEventListener('mousedown', (e) => { if (e.button === 3) x1Down = true; if (e.button === 4) x2Down = true; });
  window.addEventListener('mouseup', (e) => { if (e.button === 3) x1Down = false; if (e.button === 4) x2Down = false; });
  window.addEventListener('blur', () => { x1Down = false; x2Down = false; });
window.addEventListener('wheel', (e) => {
    if (els.app.classList.contains('panel-open')) return;
    const gesture = state.settings && state.settings.hotkeys ? state.settings.hotkeys.dockSwitchGesture : 'xbutton2+wheel';
    if (!gesture || gesture === 'none') return;
    const mask = gesture === 'xbutton1+wheel' ? 8 : 16;
    const held = mask === 8 ? x1Down : x2Down;
    if (!(e.buttons & mask) && !held) return;
    e.preventDefault();
    const now = Date.now();
    if (now - lastGestureSwitch < 140 || Math.abs(e.deltaY) < 4) return;
    lastGestureSwitch = now;
    switchDockByOffset(e.deltaY > 0 ? 1 : -1);
  }, { passive: false });

  // 编辑模式搜索：与筛选规则联动；scope 按钮切换 当前级/含子目录
  let searchDebounce = null;
  els.searchInput.addEventListener('input', () => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      state.searchQuery = els.searchInput.value;
      if (isSearchActive() && searchRecursiveEffective()) {
        refreshSearchResults();
      } else {
        renderFiles();
      }
    }, 150);
  });
  els.searchInput.addEventListener('keydown', (e) => {
    e.stopPropagation(); // 输入时不触发全局快捷键（←/→ 切仓、L 钉住等）
    if (e.key === 'Escape') {
      els.searchInput.value = '';
      state.searchQuery = '';
      state.searchResults = null;
      renderFiles();
    }
  });
  els.searchScopeBtn.addEventListener('click', () => {
    state.searchRecursive = !state.searchRecursive;
    updateSearchScopeBtn();
    if (isSearchActive()) {
      if (searchRecursiveEffective()) {
        refreshSearchResults();
      } else {
        state.searchResults = null;
        renderFiles();
      }
    }
  });

  // Pin
  els.pinBtn.addEventListener('click', togglePin);

  // 关闭按钮
  els.closeBtn.addEventListener('click', () => {
    window.api.window.close();
  });

  // 最小化按钮：从当前窗口位置实时探测吸附边缘（主进程原子处理）
  // - 处于吸附边缘：若已固定则取消固定 + 吸附折叠为触点
  // - 不在吸附边缘：最小化到托盘（固定状态不变）
  els.minimizeBtn.addEventListener('click', async () => {
    await window.api.window.minimizeOrSnap();
  });

  // 快速隐藏
  els.hideBtn.addEventListener('click', quickHide);

  // 模式切换
  els.modeBtn.addEventListener('click', toggleFolderOpMode);

  // 编辑模式
  els.editBtn.addEventListener('click', toggleEditMode);
  $('#edit-select-all').addEventListener('click', selectAllFiles);
  $('#edit-move-out').addEventListener('click', batchMoveOut);
  $('#edit-remove').addEventListener('click', batchRemove);
  $('#edit-delete').addEventListener('click', batchDelete);
  $('#edit-done').addEventListener('click', toggleEditMode);

  // 排序按钮（再次点击关闭菜单）
  els.sortBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    // 菜单已打开时，第二次点击关闭它
    if (!els.sortMenu.classList.contains('hidden')) {
      els.sortMenu.classList.add('hidden');
      return;
    }
    const rect = els.sortBtn.getBoundingClientRect();
    showSortMenu(rect.left, rect.bottom + 4);
  });

  els.sortMenu.addEventListener('click', (e) => {
    e.stopPropagation();
    const item = e.target.closest('.sort-item');
    if (item) {
      if (item.dataset.sort) {
        handleSortSelect('sort', item.dataset.sort);
      } else if (item.dataset.sortby) {
        handleSortSelect('sortby', item.dataset.sortby);
      }
    }
  });

  // 文件夹返回按钮
  els.folderBackBtn.addEventListener('click', exitFolder);

  // 设置
  els.settingsBtn.addEventListener('click', openSettings);
  $('#back-settings').addEventListener('click', closeSettings);

  // 说明书展开/折叠
  const guideHeader = $('#guide-header');
  const guideContent = $('#guide-content');
  const guideSection = guideHeader?.closest('.guide-section');
  if (guideHeader && guideContent) {
    guideHeader.addEventListener('click', () => {
      guideContent.classList.toggle('hidden');
      if (guideSection) {
        guideSection.classList.toggle('open');
      }
    });
  }

  // 预设
  els.addPresetBtn.addEventListener('click', openPresetPanel);
  $('#back-preset').addEventListener('click', closePresetPanel);
  $('#create-preset-btn').addEventListener('click', createPreset);
  $('#new-preset-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') createPreset();
  });

  // 新建文件仓：类型切换时显示/隐藏路径行与拖入区；浏览按钮选择文件夹（名称空则自动填）；拖入文件获取路径
  const dockTypeSelect = $('#new-dock-type');
  const dockPathRow = $('#new-dock-path-row');
  const dockDropZone = $('#dock-drop-zone');
  function syncDockPathVisibility() {
    const isRef = dockTypeSelect && dockTypeSelect.value === 'reference';
    if (dockPathRow) dockPathRow.style.display = isRef ? '' : 'none';
    if (dockDropZone) dockDropZone.style.display = isRef ? '' : 'none';
  }
  if (dockTypeSelect) {
    dockTypeSelect.addEventListener('change', syncDockPathVisibility);
    syncDockPathVisibility();
  }
  // 浏览选择文件夹：若名称为空，自动用文件夹名填入
  const browseBtn = $('#browse-dock-path');
  if (browseBtn) {
    browseBtn.addEventListener('click', async () => {
      const result = await window.api.folder.pick();
      if (result.success && result.path) {
        $('#new-dock-path').value = result.path;
        // 名称空时自动填入文件夹名
        const nameInput = $('#new-preset-name');
        if (nameInput && !nameInput.value.trim()) {
          const sep = result.path.includes('\\') ? '\\' : '/';
          const parts = result.path.split(sep).filter(Boolean);
          nameInput.value = parts[parts.length - 1] || '';
        }
      }
    });
  }
  // 把拖入的第一项填进“新建引用仓”表单：文件夹 → 填路径（名称空则自动取名），文件 → 提示
  async function fillDockPathFromDrop(dataTransfer) {
    const files = dataTransfer && dataTransfer.files;
    if (!files || files.length === 0) return false;
    // 通过 file.path 获取真实路径（Electron 暴露）
    const filePath = files[0].path;
    if (!filePath) return false;
    // 判断拖入的是文件夹还是文件：用 folder.list 探测，成功=文件夹
    const probe = await window.api.folder.list(filePath);
    if (!probe.success) {
      alert('请拖入文件夹，而不是文件。\n此功能获取的是文件夹本身的路径和名称。');
      return false;
    }
    $('#new-dock-path').value = filePath;
    // 名称空时自动填入文件夹名
    const nameInput = $('#new-preset-name');
    if (nameInput && !nameInput.value.trim()) {
      const parts = filePath.split(/[\\/]+/).filter(Boolean);
      nameInput.value = parts[parts.length - 1] || '';
    }
    return true;
  }

  // 整个“文件仓管理”面板都接受拖入文件夹取路径，不只虚线框那一片——
  // 拖到“文件夹路径”输入框等位置同样生效（此前会触发 Electron 默认行为弹出怪窗口）
  els.presetPanel.addEventListener('dragover', (e) => {
    if (!e.dataTransfer) return;
    e.preventDefault();
    els.presetPanel.classList.add('drag-over');
  });
  els.presetPanel.addEventListener('dragleave', (e) => {
    if (e.target === els.presetPanel) els.presetPanel.classList.remove('drag-over');
  });
  els.presetPanel.addEventListener('drop', async (e) => {
    e.preventDefault();
    els.presetPanel.classList.remove('drag-over');
    await fillDockPathFromDrop(e.dataTransfer);
  });

  // 拖入文件到虚线框：获取所在文件夹路径填入
  if (dockDropZone) {
    dockDropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dockDropZone.classList.add('drag-over');
    });
    dockDropZone.addEventListener('dragleave', () => {
      dockDropZone.classList.remove('drag-over');
    });
    dockDropZone.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      dockDropZone.classList.remove('drag-over');
      await fillDockPathFromDrop(e.dataTransfer);
    });
  }
  // 清空按钮：清空名称和文件夹路径，方便填错时重填
  const clearFormBtn = $('#clear-dock-form');
  if (clearFormBtn) {
    clearFormBtn.addEventListener('click', () => {
      const nameInput = $('#new-preset-name');
      const pathInput = $('#new-dock-path');
      if (nameInput) nameInput.value = '';
      if (pathInput) pathInput.value = '';
      if (nameInput) nameInput.focus();
    });
  }

  // 键盘 ← / → 切换文件仓（焦点在窗口内且未在输入框/面板时生效）
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    // 输入框/选择框中不拦截
    const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    // 面板打开 / 文件夹浏览内不切换
    if (els.app.classList.contains('panel-open')) return;
    if (els.app.classList.contains('folder-mode')) return;
    e.preventDefault();
    switchDockByOffset(e.key === 'ArrowLeft' ? -1 : 1);
  });

  // 文件拖入
  els.fileArea.addEventListener('dragenter', handleDragEnter);
  els.fileArea.addEventListener('dragover', handleDragOver);
  els.fileArea.addEventListener('dragleave', handleDragLeave);
  els.fileArea.addEventListener('drop', handleDrop);

  // 右键菜单
  els.contextMenu.addEventListener('click', (e) => {
    const item = e.target.closest('.menu-item');
    if (item) {
      handleContextAction(item.dataset.action);
    }
  });

  // 空白处右键菜单
  els.emptyContextMenu.addEventListener('click', (e) => {
    const item = e.target.closest('.menu-item');
    if (item && item.dataset.action) {
      handleEmptyContextAction(item.dataset.action);
    }
  });

  // 点击其他地方关闭菜单
  document.addEventListener('click', (e) => {
    if (!els.contextMenu.contains(e.target)) {
      hideContextMenu();
    }
    if (!els.emptyContextMenu.contains(e.target)) {
      hideEmptyContextMenu();
    }
    if (!els.sortMenu.contains(e.target) && !els.sortBtn.contains(e.target)) {
      els.sortMenu.classList.add('hidden');
    }
    if (!els.filterPanel.contains(e.target) && !els.filterBtn.contains(e.target)) {
      closeFilterPanel();
    }
  });

  // 右键事件：文件项走文件菜单（item 自身监听），空白处走空白菜单
  document.addEventListener('contextmenu', (e) => {
    // 右键框选刚结束：吞掉这次右键菜单
    if (suppressCtxMenu) {
      suppressCtxMenu = false;
      e.preventDefault();
      return;
    }
    // 文件项：item 自身监听器已 preventDefault + showContextMenu，这里不再处理
    if (e.target.closest('.file-item')) return;
    // 仅在文件区域（含空状态）内弹出空白右键菜单
    if (e.target.closest('#file-area')) {
      e.preventDefault();
      hideContextMenu(); // 关闭可能存在的文件菜单
      showEmptyContextMenu(e.clientX, e.clientY);
    }
  });

  // 设置项变更
  $('#setting-theme').addEventListener('change', (e) => updateSetting('theme', e.target.value));
  $('#setting-themeMode').addEventListener('change', (e) => updateSetting('themeMode', e.target.value));
  $('#setting-accentColor').addEventListener('input', (e) => updateSettingThrottled('accentColor', e.target.value));
  $('#reset-accentColor').addEventListener('click', () => {
    updateSetting('accentColor', '');
    // 同步显示主题默认色
    const s = state.settings;
    const icons = getThemeIcons(s.theme || 'default');
    const defaultAccent = (s.themeMode === 'night') ? icons.defaultAccentNight : icons.defaultAccent;
    $('#setting-accentColor').value = defaultAccent;
  });
  $('#setting-folderMode').addEventListener('change', (e) => updateSetting('folderMode', e.target.value));
  $('#setting-removeOnDragOutFromTemp').addEventListener('change', (e) => updateSetting('removeOnDragOutFromTemp', e.target.checked));
  $('#setting-snapEnabled').addEventListener('change', (e) => updateSetting('snapEnabled', e.target.checked));
  $('#setting-autoHideOnSnap').addEventListener('change', (e) => updateSetting('autoHideOnSnap', e.target.checked));
  $('#setting-triggerSize').addEventListener('change', (e) => updateSetting('triggerSize', e.target.value));
  $('#setting-triggerColor').addEventListener('input', (e) => updateSettingThrottled('triggerColor', e.target.value));
  $('#reset-triggerColor').addEventListener('click', () => {
    updateSetting('triggerColor', '');
    // 同步显示主题默认色（与强调色的"主题默认"逻辑一致）
    const s = state.settings;
    const icons = getThemeIcons(s.theme || 'default');
    const defaultAccent = (s.themeMode === 'night') ? icons.defaultAccentNight : icons.defaultAccent;
    $('#setting-triggerColor').value = defaultAccent;
  });
  $('#setting-triggerAction').addEventListener('change', (e) => updateSetting('triggerAction', e.target.value));
  $('#setting-previewTrigger').addEventListener('change', (e) => updateSetting('previewTrigger', e.target.value));
  $('#setting-pinShowName').addEventListener('change', (e) => updateSetting('pinShowName', e.target.checked));

  // —— 快捷方式设置区 ——
  renderHotkeyUI();
  const hkGesture = document.getElementById('setting-hk-gesture');
  if (hkGesture) {
    hkGesture.addEventListener('change', (e) => {
      const hk = Object.assign({}, state.settings.hotkeys || {});
      hk.dockSwitchGesture = e.target.value;
      updateSetting('hotkeys', hk);
    });
  }
  document.querySelectorAll('.hotkey-reset').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const hk = Object.assign({}, state.settings.hotkeys || {});
      hk[btn.dataset.hk] = btn.dataset.hk === 'dockSwitchGesture' ? 'xbutton2+wheel' : 'l';
      state.settings = await window.api.settings.update({ hotkeys: hk });
      renderHotkeyUI();
    });
  });
  const resetAll = document.getElementById('hotkey-reset-all');
  if (resetAll) {
    resetAll.addEventListener('click', async () => {
      const r = await showConfirmDialog({ title: '重置快捷方式', message: '所有快捷方式将恢复为默认值，确定继续吗？', checkboxLabel: '' });
      if (!r.confirmed) return;
      state.settings = await window.api.settings.update({ hotkeys: { dockSwitchGesture: 'xbutton2+wheel', pinKey: 'l' } });
      renderHotkeyUI();
    });
  }
  $('#setting-hideDelay').addEventListener('input', (e) => {
    $('#hideDelay-value').textContent = formatMs(parseInt(e.target.value));
    updateSettingThrottled('hideDelay', parseInt(e.target.value));
  });
  $('#setting-alwaysOnTop').addEventListener('change', (e) => updateSetting('alwaysOnTop', e.target.checked));
  $('#setting-closeToTray').addEventListener('change', (e) => updateSetting('closeToTray', e.target.checked));
  $('#setting-startupPreset').addEventListener('change', (e) => updateSetting('startupPreset', e.target.value));

  // 滑块数值双击编辑
  setupSliderEditable('setting-hideDelay', 'hideDelay-value', 0, 3000, 100,
    (v) => updateSetting('hideDelay', v), formatMs);

  // 图标上传
  setupIconUpload();

  // 窗口鼠标事件（吸附后自动隐藏）
  // mouseEnter 同时触发一次内容刷新：用户在 dock 隐藏期间可能在 OS 资源管理器中
  // 改了文件（新建 / 重命名 / 删除），唤起时刷新一次让 dock 反映真实状态。
  // 节流：600ms 内只刷一次，避免鼠标抖动频繁刷新。
  let lastRefreshOnEnter = 0;
  els.app.addEventListener('mouseenter', () => {
    window.api.window.mouseEnter();
    const now = Date.now();
    if (now - lastRefreshOnEnter < 600) return;
    lastRefreshOnEnter = now;
    // 仅引用仓 / 文件夹模式有真实文件夹可刷新；临时仓的文件引用是用户拖入的，不需要重读
    if (state.folderMode || isActiveReferenceDock()) {
      refreshCurrent().catch(err => console.error('mouseenter 刷新失败:', err));
    }
  });
  els.app.addEventListener('mouseleave', () => {
    hideFilePreview();
    // 命名框/输入框/面板/对话框使用中时不自动收起——否则打字打到一半
    // 整个仓会缩回边缘
    if (uiBusy()) {
      window.api.window.mouseEnter(); // 取消可能已挂起的自动隐藏计时
    } else {
      window.api.window.mouseLeave();
    }
  });
  // 输入框获得焦点同样取消挂起的自动隐藏（光标先前已离开窗口的情况）
  document.addEventListener('focusin', (e) => {
    const tag = e.target && e.target.tagName ? e.target.tagName.toLowerCase() : '';
    if (tag === 'input' || tag === 'textarea' || tag === 'select') window.api.window.mouseEnter();
  });

  // 松开 Ctrl 收起预览（仅 Ctrl 触发模式；悬停模式由 mouseleave 收起）
  document.addEventListener('keyup', (e) => {
    if (e.key === 'Control' && (!state.settings || state.settings.previewTrigger !== 'hover')) hideFilePreview();
  });
  window.addEventListener('blur', hideFilePreview);
  // 任何鼠标按下（含右键）都收起预览：预览是悬停态辅助，一旦开始交互就退场
  document.addEventListener('mousedown', hideFilePreview);
  // 记录光标位置：Ctrl 静止按下时要用 elementFromPoint 找光标下的文件
  document.addEventListener('mousemove', (e) => {
    lastMousePos.x = e.clientX;
    lastMousePos.y = e.clientY;
  }, true);
  // 快捷键录制：capture 相捕获，避免录制按键触发应用其它行为
  document.addEventListener('keydown', (e) => {
    if (!hkRecording) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape') { stopHotkeyRecord(null); return; }
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase();
    if (!/^[a-z0-9]$/.test(k) && !/^f\d+$/.test(k) && !['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) return;
    const mods = [];
    if (e.ctrlKey) mods.push('ctrl');
    if (e.altKey) mods.push('alt');
    if (e.shiftKey) mods.push('shift');
    stopHotkeyRecord(mods.concat([k]).join('+'));
  }, true);
  // Ctrl / L 热键：原生轮询（不依赖焦点，主路径）+ 页面 keydown（无原生模块时兜底）
  if (window.api.hotkeys) {
    window.api.hotkeys.onCtrl(() => showPreviewUnderCursor());
    // 松开 Ctrl 即收起悬浮（悬浮的前提 = 按住 Ctrl + 位置正确）；悬停模式不适用
    window.api.hotkeys.onCtrlUp(() => {
      if (!state.settings || state.settings.previewTrigger !== 'hover') hideFilePreview();
    });
    window.api.hotkeys.onL(() => tryPinPreview());
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Control' && !e.repeat) showPreviewUnderCursor();
  });
  // 按 L 钉住当前预览 → 独立小窗（可拖动 / 等比缩放 / × 关闭）；可连按钉住多个
  document.addEventListener('keydown', (e) => {
    const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if (pinKeyMatches(e)) {
      e.preventDefault();
      tryPinPreview();
    }
  });

  // 全局兜底：Electron 默认会把拖入窗口的文件当页面导航打开（表现为弹出奇怪的窗口）。
  // 具体区域（文件区/引用仓路径/管理面板）各自的 drop 处理器已 preventDefault，
  // 这里拦下其余所有位置的默认行为。
  document.addEventListener('dragover', (e) => e.preventDefault());
  document.addEventListener('drop', (e) => e.preventDefault());

  // 顶栏拖动排序
  setupToolbarDragSort();

  // 框选文件
  setupBoxSelection();
}

// ===== 启动 =====
init().catch(err => console.error('初始化失败:', err));
