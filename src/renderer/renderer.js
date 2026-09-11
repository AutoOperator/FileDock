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

// ===== 文件类型图标 =====
const FILE_ICONS = {
  folder: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>`,
  image: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>`,
  video: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>`,
  audio: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>`,
  document: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>`,
  archive: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.54 5.23l-1.39-1.68C18.88 3.21 18.47 3 18 3H6c-.47 0-.88.21-1.16.55L3.46 5.23C3.17 5.57 3 6.02 3 6.5V19c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6.5c0-.48-.17-.93-.46-1.27zM12 17.5L6.5 12H10v-2h4v2h3.5L12 17.5zM5.12 5l.81-1h12l.94 1H5.12z"/></svg>`,
  code: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z"/></svg>`,
  default: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>`,
};

function getFileIconType(ext, isDir) {
  if (isDir) return 'folder';
  // ext 在数据流里有两种历史格式：file-ops 给 '.png' 带点、folder:list 与重命名给 'png' 不带点。
  // 下面按带点比较，故先补点；两种格式都收，避免引用仓/文件夹浏览里的类型判定整体失效。
  const raw = (ext || '').toLowerCase();
  const e = raw.startsWith('.') ? raw : '.' + raw;
  const imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg', '.ico'];
  const videoExts = ['.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm'];
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

  // 监听剪贴板采集变化（后台自动采到新内容时刷新列表）
  window.api.clip.onChanged(() => {
    if (isActiveClipboardDock()) renderFiles();
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
  const result = await window.api.folder.list(preset.folderPath);
  if (result.success) {
    state.files = result.files;
    applySort();
  } else {
    // 文件夹失效：显示空状态
    state.files = [];
  }
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
}

// ===== 文件仓类型指示 =====
function updateDockTypeIndicator() {
  if (!els.dockTypeIcon) return;
  const isRef = isActiveReferenceDock();
  const isClip = isActiveClipboardDock();
  const icons = getThemeIcons(state.settings.theme || 'default');
  const key = isRef ? 'dock-ref' : (isClip && icons.ui['dock-clip'] ? 'dock-clip' : 'dock-temp');
  els.dockTypeIcon.innerHTML = icons.ui[key] || '';
  els.dockTypeLabel.textContent = isRef ? '引用' : (isClip ? '剪贴板' : '临时');
  els.dockTypeIndicator.title = isRef
    ? `引用仓${state.activePreset?.folderPath ? '：' + state.activePreset.folderPath : ''}`
    : (isClip ? '剪贴板仓：自动保存复制的文本 / 图片 / 混排' : '临时仓：仅存文件引用');
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
  { key: 'image',   label: '图片',   exts: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg', 'ico'] },
  { key: 'video',   label: '视频',   exts: ['mp4', 'avi', 'mkv', 'mov', 'wmv', 'flv', 'webm'] },
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

// 取当前模式下应显示的文件列表（应用筛选）
function getFilteredFiles() {
  const files = state.files;
  const hasUnchecked = state.filterMode === 'type'
    ? Object.keys(state.filterChecked).some(k => k.startsWith('type:') && state.filterChecked[k] === false)
    : Object.keys(state.filterChecked).some(k => k.startsWith('ext:') && state.filterChecked[k] === false);
  if (!hasUnchecked) return files;

  return files.filter(f => {
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
  const panelW = 220;
  let left = rect.left;
  if (left + panelW > window.innerWidth - 4) left = window.innerWidth - panelW - 4;
  if (left < 4) left = 4;
  els.filterPanel.style.left = left + 'px';
  els.filterPanel.style.top = (rect.bottom + 4) + 'px';
  els.filterPanel.classList.remove('hidden');
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
  // 剪贴板仓：交给独立模块渲染，隐藏文件区
  if (isActiveClipboardDock()) {
    applyClipDockClass();
    if (window.__clipUI) window.__clipUI.refresh();
    return;
  }
  applyClipDockClass();
  els.fileList.innerHTML = '';

  const visible = getFilteredFiles();

  if (state.files.length === 0) {
    els.emptyState.style.display = 'flex';
    els.fileList.style.display = 'none';
    renderEmptyIcon();
  } else if (visible.length === 0) {
    // 有文件但被筛选全部隐藏
    els.emptyState.style.display = 'flex';
    els.fileList.style.display = 'none';
    renderEmptyIcon();
  } else {
    els.emptyState.style.display = 'none';
    els.fileList.style.display = '';
  }

  visible.forEach((file, index) => {
    const item = createFileItem(file, index);
    els.fileList.appendChild(item);
  });

  // 文件计数：筛选生效时显示 "可见/总数"
  if (isFilterReducing() && visible.length !== state.files.length) {
    els.fileCount.textContent = `${visible.length}/${state.files.length} 个文件`;
  } else {
    els.fileCount.textContent = `${state.files.length} 个文件`;
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

  if (state.editMode) {
    item.classList.toggle('checked', checked);
    item.innerHTML = `
      <div class="file-checkbox${checked ? ' checked' : ''}" data-path="${file.path}">
        ${checked ? checkSvg : ''}
      </div>
      <div class="file-icon" data-type="${icon.type}">${icon.svg}</div>
      <div class="file-name" title="${file.name}">${file.name}</div>
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
      <div class="file-icon" data-type="${icon.type}">${icon.svg}</div>
      <div class="file-name" title="${file.name}">${file.name}</div>
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

  // 临时文件标志（真实 DOM 元素，避免 ::after 被冰棍主题 .file-item::after 装饰覆盖导致"临时"消失）
  if (state.temporaryPaths.has(file.path)) {
    const badge = document.createElement('span');
    badge.className = 'temporary-badge';
    badge.textContent = '临时';
    item.appendChild(badge);
  }

  return item;
}

// ===== 编辑模式 =====
function toggleEditMode() {
  state.editMode = !state.editMode;
  if (!state.editMode) {
    state.selectedPaths.clear();
  }
  els.editBtn.classList.toggle('active', state.editMode);
  els.editBar.classList.toggle('hidden', !state.editMode);
  els.app.classList.toggle('edit-mode', state.editMode);
  renderFiles();
}

function toggleSelect(filePath) {
  if (state.selectedPaths.has(filePath)) {
    state.selectedPaths.delete(filePath);
  } else {
    state.selectedPaths.add(filePath);
  }
  renderFiles();
}

function selectAllFiles() {
  if (state.selectedPaths.size === state.files.length) {
    state.selectedPaths.clear();
  } else {
    state.files.forEach(f => state.selectedPaths.add(f.path));
  }
  renderFiles();
}

function getSelectedFiles() {
  return state.files.filter(f => state.selectedPaths.has(f.path));
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
function applySort() {
  const dir = state.sortDirection === 'asc' ? 1 : -1;
  state.files.sort((a, b) => {
    let cmp = 0;
    if (state.sortBy === 'name') {
      cmp = a.name.localeCompare(b.name, 'zh');
    } else if (state.sortBy === 'time') {
      cmp = (a.mtime || 0) - (b.mtime || 0);
    } else if (state.sortBy === 'size') {
      cmp = (a.size || 0) - (b.size || 0);
    }
    if (a.isDirectory !== b.isDirectory) {
      return a.isDirectory ? -1 : 1;
    }
    return cmp * dir;
  });
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
  els.sortMenu.style.left = `${x}px`;
  els.sortMenu.style.top = `${y}px`;
  els.sortMenu.classList.remove('hidden');
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
    html += `<span class="breadcrumb-item" data-index="${i}">${item.name}</span>`;
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

// ===== 拖出文件 =====
function generateDragIcon(file) {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');

  const type = getFileIconType(file.ext, file.isDirectory);
  const colors = {
    folder: '#f59e0b', image: '#10b981', video: '#ef4444',
    audio: '#8b5cf6', document: '#3b82f6', archive: '#6366f1',
    code: '#14b8a6', default: '#6b7280',
  };
  const color = colors[type] || colors.default;

  ctx.fillStyle = color;
  ctx.fillRect(4, 4, 24, 28);
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.beginPath();
  ctx.moveTo(20, 4);
  ctx.lineTo(28, 12);
  ctx.lineTo(20, 12);
  ctx.closePath();
  ctx.fill();

  return canvas.toDataURL('image/png');
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

      const iconDataUrl = generateDragIcon(file);

      window.api.files.startDrag([{ path: file.path, name: file.name, icon: iconDataUrl }]).then(async () => {
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
          if (state.folderOpMode === 'modify' && mode === 'move') {
            try {
              await window.api.files.delete([file.path]);
            } catch (err) {
              console.error('移出失败:', err);
            }
            await refreshReferenceDock();
            renderFiles();
          }
        } else {
          // 临时仓：左键拖出时根据设置决定是否从仓中移除引用
          if (mode === 'move' && state.settings.removeOnDragOutFromTemp !== false) {
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
  const items = filesToDrag.map(file => ({
    path: file.path,
    name: file.name,
    icon: generateDragIcon(file),
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
    if (state.folderOpMode === 'modify' && mode === 'move') {
      for (const p of draggedPaths) {
        try { await window.api.files.delete([p]); } catch (err) { console.error('移出失败:', err); }
      }
      await refreshReferenceDock();
    }
  } else {
    // 临时仓：左键拖出时根据设置决定是否从列表移除引用
    if (mode === 'move' && state.settings.removeOnDragOutFromTemp !== false) {
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
  e.dataTransfer.dropEffect = 'copy';
}

function handleDragLeave(e) {
  if (e.target === els.fileArea || !els.fileArea.contains(e.relatedTarget)) {
    els.fileArea.classList.remove('drag-over');
    els.emptyState.classList.remove('drag-over');
  }
}

async function handleDrop(e) {
  e.preventDefault();
  if (isActiveClipboardDock()) return;
  els.fileArea.classList.remove('drag-over');
  els.emptyState.classList.remove('drag-over');

  const files = Array.from(e.dataTransfer.files);
  if (files.length === 0) return;

  const paths = files.map(f => f.path);

  if (state.folderMode && state.folderOpMode === 'modify') {
    // 修改模式文件夹层：真实移动/复制文件到当前文件夹
    if (!await ensureModifyConfirmed()) return;
    const currentFolder = state.folderStack[state.folderStack.length - 1];
    if (!currentFolder) return;
    for (const p of paths) {
      // 默认移动（左键拖入）
      const result = await window.api.files.move(p, currentFolder.path);
      if (!result.success) {
        console.error('移动失败:', result.error);
      }
    }
    // 刷新当前文件夹
    const result = await window.api.folder.list(currentFolder.path);
    if (result.success) {
      state.files = result.files;
      applySort();
      renderFiles();
    }
  } else if (state.folderMode && state.folderOpMode === 'safe') {
    // 安全模式文件夹层：临时显示，标记为临时
    const fileInfos = await window.api.files.getInfo(paths);
    for (const info of fileInfos) {
      if (!state.files.find(f => f.path === info.path)) {
        state.files.push(info);
        state.temporaryPaths.add(info.path);
      }
    }
    applySort();
    renderFiles();
  } else if (isActiveReferenceDock()) {
    // 引用仓：安全模式下临时显示拖入的文件（标记为临时，与文件夹层安全模式一致）；
    //         修改模式真实移动到绑定文件夹
    if (state.folderOpMode !== 'modify') {
      // 安全模式：临时加入列表并标记，不写入绑定文件夹
      const fileInfos = await window.api.files.getInfo(paths);
      for (const info of fileInfos) {
        if (!state.files.find(f => f.path === info.path)) {
          state.files.push(info);
          state.temporaryPaths.add(info.path);
        }
      }
      applySort();
      renderFiles();
      return;
    }
    const targetFolder = state.activePreset.folderPath;
    for (const p of paths) {
      const result = await window.api.files.move(p, targetFolder);
      if (!result.success) {
        console.error('移动失败:', result.error);
      }
    }
    await refreshReferenceDock();
    renderFiles();
  } else {
    // 临时仓：添加文件引用到列表
    const fileInfos = await window.api.files.getInfo(paths);
    for (const info of fileInfos) {
      if (!state.files.find(f => f.path === info.path)) {
        state.files.push(info);
      }
    }
    applySort();
    renderFiles();
    saveCurrentPreset();
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
  els.contextMenu.style.left = `${x}px`;
  els.contextMenu.style.top = `${y}px`;
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
  els.emptyContextMenu.style.left = `${x}px`;
  els.emptyContextMenu.style.top = `${y}px`;
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
        <div class="preset-name">${preset.name} <span class="preset-type-tag">${typeLabel}</span></div>
        <div class="preset-info" title="${(preset.folderPath || '').replace(/"/g, '&quot;')}">${infoText}</div>
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

function setupBoxSelection() {
  els.fileArea.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return; // 只响应左键
    if (state.files.length === 0) return; // 无文件不框选
    // 在文件项上按下时不启动框选（让文件拖出/点击工作）
    if (e.target.closest('.file-item')) return;

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

  document.addEventListener('mouseup', () => {
    if (boxSelectStarted) {
      // 只有真正拖动了框选才结束框选
      endBoxSelection();
      boxSelectJustEnded = true;
      setTimeout(() => { boxSelectJustEnded = false; }, 50);
    }
    // 单击（未拖动）不进入编辑模式，直接清理
    boxSelectPending = false;
    boxSelectStarted = false;
    state.boxSelecting = false;
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
  // 如果不在编辑模式，自动切换到编辑模式
  if (!state.editMode) {
    state.editMode = true;
    state.selectedPaths.clear();
    els.editBtn.classList.add('active');
    els.editBar.classList.remove('hidden');
    els.app.classList.add('edit-mode');
    renderFiles();
  } else {
    // 已在编辑模式，清空之前的选择
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

  state.selectedPaths.clear();
  items.forEach(item => {
    const itemRect = item.getBoundingClientRect();
    if (rectIntersect(rect, itemRect)) {
      const path = item.dataset.path;
      if (path) {
        state.selectedPaths.add(path);
        setItemChecked(item, true);
      } else {
        setItemChecked(item, false);
      }
    } else {
      setItemChecked(item, false);
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
      const files = e.dataTransfer && e.dataTransfer.files;
      if (!files || files.length === 0) return;
      const firstFile = files[0];
      // 通过 file.path 获取真实路径（Electron 暴露）
      const filePath = firstFile.path;
      if (!filePath) return;
      // 判断拖入的是文件夹还是文件：用 folder.list 探测，成功=文件夹
      const probe = await window.api.folder.list(filePath);
      if (!probe.success) {
        alert('请拖入文件夹，而不是文件。\n此功能获取的是文件夹本身的路径和名称。');
        return;
      }
      // 是文件夹：直接用文件夹路径填入
      $('#new-dock-path').value = filePath;
      // 名称空时自动填入文件夹名
      const nameInput = $('#new-preset-name');
      if (nameInput && !nameInput.value.trim()) {
        const sep = filePath.includes('\\') ? '\\' : '/';
        const parts = filePath.split(sep).filter(Boolean);
        nameInput.value = parts[parts.length - 1] || '';
      }
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
  $('#setting-accentColor').addEventListener('input', (e) => updateSetting('accentColor', e.target.value));
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
  $('#setting-triggerColor').addEventListener('input', (e) => updateSetting('triggerColor', e.target.value));
  $('#reset-triggerColor').addEventListener('click', () => {
    updateSetting('triggerColor', '');
    // 同步显示主题默认色（与强调色的"主题默认"逻辑一致）
    const s = state.settings;
    const icons = getThemeIcons(s.theme || 'default');
    const defaultAccent = (s.themeMode === 'night') ? icons.defaultAccentNight : icons.defaultAccent;
    $('#setting-triggerColor').value = defaultAccent;
  });
  $('#setting-triggerAction').addEventListener('change', (e) => updateSetting('triggerAction', e.target.value));
  $('#setting-hideDelay').addEventListener('input', (e) => {
    $('#hideDelay-value').textContent = formatMs(parseInt(e.target.value));
    updateSetting('hideDelay', parseInt(e.target.value));
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
    window.api.window.mouseLeave();
  });

  // 顶栏拖动排序
  setupToolbarDragSort();

  // 框选文件
  setupBoxSelection();
}

// ===== 启动 =====
init().catch(err => console.error('初始化失败:', err));
