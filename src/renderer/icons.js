// 主题图标系统 - 为每套主题提供完整的 UI 和文件图标
'use strict';

// ===== 主题定义 =====
// 每个主题包含: defaultAccent(日间默认强调色), defaultAccentNight(夜间), ui(界面图标), files(文件图标), check(复选框)

// ----- 默认主题（当前图标） -----
const DEFAULT_THEME = {
  defaultAccent: '#2563eb',
  defaultAccentNight: '#3b82f6',
  ui: {
    settings: `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 4.754a3.246 3.246 0 1 0 0 6.492 3.246 3.246 0 0 0 0-6.492zM5.754 8a2.246 2.246 0 1 1 4.492 0 2.246 2.246 0 0 1-4.492 0z"/><path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 0 1-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 0 1-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 0 1 .52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 0 1 1.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 0 1 1.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 0 1 .52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 0 1-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 0 1-1.255-.52l-.094-.319zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 0 0 2.693 1.115l.291-.16c.764-.415 1.6.42 1.184 1.185l-.159.292a1.873 1.873 0 0 0 1.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 0 0-1.115 2.693l.16.291c.415.764-.42 1.6-1.185 1.184l-.291-.159a1.873 1.873 0 0 0-2.693 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 0 0-2.692-1.115l-.292.16c-.764.415-1.6-.42-1.184-1.185l.159-.291A1.873 1.873 0 0 0 1.945 8.93l-.319-.094c-.835-.246-.835-1.428 0-1.674l.319-.094A1.873 1.873 0 0 0 3.06 4.377l-.16-.292c-.415-.764.42-1.6 1.185-1.184l.292.159a1.873 1.873 0 0 0 2.692-1.115l.094-.319z"/></svg>`,
    'view-list': `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="2" width="14" height="2" rx="1"/><rect x="1" y="7" width="14" height="2" rx="1"/><rect x="1" y="12" width="14" height="2" rx="1"/></svg>`,
    'view-grid': `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/><rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg>`,
    filter: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"><path d="M2 3 L14 3 L10 8 L10 13 L6 11 L6 8 Z"/></svg>`,
    sort: `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M3.5 2a.5.5 0 0 0-.5.5v10.793L1.354 11.146a.5.5 0 1 0-.708.708l2 2a.5.5 0 0 0 .708 0l2-2a.5.5 0 0 0-.708-.708L3.5 13.293V2.5a.5.5 0 0 0-.5-.5z"/><path d="M7 3h8a.5.5 0 0 1 0 1H7a.5.5 0 0 1 0-1zm0 3h6a.5.5 0 0 1 0 1H7a.5.5 0 0 1 0-1zm0 3h4a.5.5 0 0 1 0 1H7a.5.5 0 0 1 0-1zm0 3h2a.5.5 0 0 1 0 1H7a.5.5 0 0 1 0-1z"/></svg>`,
    edit: `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M12.146.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1 0 .708l-10 10a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168l10-10zM11.207 2.5L13.5 4.793L14.793 3.5L12.5 1.207L11.207 2.5zm1.586 3L10.5 3.207L4 9.707V10h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.293l6.5-6.5zm-9.769 7.414l-.013.027-.333.667l1.107 1.107l.667-.333l.027-.013l-.013.013L3.5 13.5l.013-.013L3.024 13.914z"/></svg>`,
    pin: `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M9.828 0.172a.586.586 0 0 0-.828 0L6.586 2.586a.586.586 0 0 0 0 .828L7 4 3.5 7.5l-.5-.5a.586.586 0 0 0-.828 0L.172 9a.586.586 0 0 0 0 .828L2 11.657V14a1 1 0 0 0 1 1h2.343L7.172 16.828a.586.586 0 0 0 .828 0L10 14.828a.586.586 0 0 0 0-.828l-.5-.5L14 10l.586.586a.586.586 0 0 0 .828 0L17.828 8a.586.586 0 0 0 0-.828L15.828 5.172a.586.586 0 0 0-.828 0L14.5 5.5 11 2l.586-.586a.586.586 0 0 0 0-.828L9.828 0.172z" transform="scale(0.8) translate(0, 0)"/></svg>`,
    hide: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2.5 L8 9 M5 6 L8 9.5 L11 6"/><path d="M2.5 11 L2.5 13.5 L13.5 13.5 L13.5 11"/></svg>`,
    close: `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/></svg>`,
    minimize: `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="7" width="10" height="2" rx="1"/></svg>`,
    mode: `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 1a6 6 0 1 1 0 12A6 6 0 0 1 8 2z"/><path d="M8 4a.5.5 0 0 1 .5.5v3.5h2.5a.5.5 0 0 1 0 1H8a.5.5 0 0 1-.5-.5V4.5A.5.5 0 0 1 8 4z"/></svg>`,
    'add-preset': `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M2 4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4zm2-1a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1H4z"/><path d="M8 5a.5.5 0 0 1 .5.5v2h2a.5.5 0 0 1 0 1h-2v2a.5.5 0 0 1-1 0v-2h-2a.5.5 0 0 1 0-1h2v-2A.5.5 0 0 1 8 5z"/></svg>`,
    // 空状态：正方形虚线框（拖入提示）
    empty: `<svg width="56" height="56" viewBox="0 0 56 56" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="5 4" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="7" width="42" height="42" rx="5"/></svg>`,
    // 文件仓类型指示
    'dock-temp': `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="3 2" stroke-linejoin="round"><rect x="2.5" y="2.5" width="11" height="11" rx="2"/></svg>`,
    'dock-ref': `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 5 Q2 3.5 3.5 3.5 L6.5 3.5 L8 5 L12.5 5 Q14 5 14 6.5 L14 11.5 Q14 13 12.5 13 L3.5 13 Q2 13 2 11.5 Z"/></svg>`,
    // 模式图标：安全=盾牌，修改=铅笔
    'mode-safe': `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 1.5 L13.5 3.5 L13.5 8 Q13.5 12 8 14.5 Q2.5 12 2.5 8 L2.5 3.5 Z"/><path d="M5.8 8 L7.3 9.5 L10.3 6.2"/></svg>`,
    'mode-modify': `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 2 L14 5 L5.5 13.5 L2 14 L2.5 10.5 Z"/><path d="M9.5 3.5 L12.5 6.5"/></svg>`,
    back: `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M12 8a.5.5 0 0 1-.5.5H5.707l2.147 2.146a.5.5 0 0 1-.708.708l-3-3a.5.5 0 0 1 0-.708l3-3a.5.5 0 1 1 .708.708L5.707 7.5H11.5a.5.5 0 0 1 .5.5z"/></svg>`,
    'edit-select-all': `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M14 1a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h12zM2 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2H2z"/><path d="M5.5 8.5a.5.5 0 0 1 .5.5v3a.5.5 0 0 1-1 0V9a.5.5 0 0 1 .5-.5zm3-2a.5.5 0 0 1 .5.5v5a.5.5 0 0 1-1 0V7a.5.5 0 0 1 .5-.5zm3 1a.5.5 0 0 1 .5.5v4a.5.5 0 0 1-1 0V8a.5.5 0 0 1 .5-.5z"/></svg>`,
    'edit-move-out': `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square"><rect x="2" y="2" width="12" height="12" rx="1"/><path d="M5 5 L11 11 M11 5 L5 11"/></svg>`,
    'edit-remove': `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/><path d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4L4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3h11V2h-11v1z"/></svg>`,
    'edit-done': `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z"/></svg>`,
  },
  files: {
    folder: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>`,
    image: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>`,
    video: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>`,
    audio: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>`,
    document: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>`,
    archive: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.54 5.23l-1.39-1.68C18.88 3.21 18.47 3 18 3H6c-.47 0-.88.21-1.16.55L3.46 5.23C3.17 5.57 3 6.02 3 6.5V19c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6.5c0-.48-.17-.93-.46-1.27zM12 17.5L6.5 12H10v-2h4v2h3.5L12 17.5zM5.12 5l.81-1h12l.94 1H5.12z"/></svg>`,
    code: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z"/></svg>`,
    default: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>`,
  },
  check: `<svg viewBox="0 0 16 16" fill="currentColor"><path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z"/></svg>`,
};

// ----- 猫耳主题（可爱风格） -----
const CAT_THEME = {
  defaultAccent: '#f687b3',  // 粉色
  defaultAccentNight: '#f472b6',
  ui: {
    settings: `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M2.6 2.8 L5.7 5.9 L4.2 7.5 Z"/><path d="M13.4 2.8 L10.3 5.9 L11.8 7.5 Z"/><circle cx="8" cy="9.2" r="4"/><path d="M4.2 9.4 L1.6 8.9 M4.3 10.9 L1.8 11.5 M11.8 9.4 L14.4 8.9 M11.7 10.9 L14.2 11.5" stroke="currentColor" stroke-width="0.5" stroke-linecap="round" fill="none"/></svg>`,
    'view-list': `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="3" width="9" height="1.8" rx="0.9"/><rect x="1" y="7" width="9" height="1.8" rx="0.9"/><rect x="1" y="11" width="9" height="1.8" rx="0.9"/><circle cx="13" cy="4" r="1.5"/><circle cx="13" cy="8" r="1.5"/><circle cx="13" cy="12" r="1.5"/></svg>`,
    'view-grid': `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="1" width="6" height="6" rx="2"/><rect x="9" y="1" width="6" height="6" rx="2"/><rect x="1" y="9" width="6" height="6" rx="2"/><rect x="9" y="9" width="6" height="6" rx="2"/></svg>`,
    filter: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" stroke-linecap="round"><path d="M2 3 L14 3 L11 6 L11 10 L5 8 L5 6 Z"/><path d="M3 5 L5 7 M6 5 L8 7 M9 5 L11 7 M12 5 L14 7" stroke-width="0.6" opacity="0.6"/><circle cx="8" cy="11" r="1" fill="currentColor"/><path d="M8 12 L8 14" stroke-linecap="round"/></svg>`,
    sort: `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M2 4 Q2 2.6 3.4 2.6 L7 2.6 Q8.4 2.6 8.4 4 Q8.4 5.4 7 5.4 L3.4 5.4 Q2 5.4 2 4 Z M8.4 4 L10.6 2.7 L10.6 5.3 Z"/><path d="M1.5 8 Q1.5 6.2 3.3 6.2 L7.8 6.2 Q9.6 6.2 9.6 8 Q9.6 9.8 7.8 9.8 L3.3 9.8 Q1.5 9.8 1.5 8 Z M9.6 8 L12.4 6.4 L12.4 9.6 Z"/><path d="M1 12.5 Q1 10.3 3.2 10.3 L8.7 10.3 Q10.9 10.3 10.9 12.5 Q10.9 14.7 8.7 14.7 L3.2 14.7 Q1 14.7 1 12.5 Z M10.9 12.5 L14.2 10.6 L14.2 14.4 Z"/><circle cx="3.5" cy="3.6" r="0.4" fill="var(--bg-solid)"/><circle cx="3.8" cy="7.5" r="0.5" fill="var(--bg-solid)"/><circle cx="4" cy="11.8" r="0.55" fill="var(--bg-solid)"/></svg>`,
    edit: `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><ellipse cx="8" cy="10.5" rx="3.5" ry="3"/><circle cx="4" cy="6" r="1.4"/><circle cx="7" cy="4" r="1.4"/><circle cx="9" cy="4" r="1.4"/><circle cx="12" cy="6" r="1.4"/></svg>`,
    pin: `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 2 C5.5 2 4.5 4 4.5 6.5 L3.5 10 L12.5 10 L11.5 6.5 C11.5 4 10.5 2 8 2 Z"/><circle cx="8" cy="12" r="1.3"/><line x1="8" y1="0.5" x2="8" y2="2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>`,
    hide: `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M2 9 L2 14 L14 14 L14 9 Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><circle cx="8" cy="7" r="2.2"/><path d="M6.2 5.5 L5.8 4.2 M9.8 5.5 L10.2 4.2" stroke="currentColor" stroke-width="1" stroke-linecap="round"/></svg>`,
    close: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4.5 4.5 L11.5 11.5 M11.5 4.5 L4.5 11.5"/></svg>`,
    minimize: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 8 L12 8"/></svg>`,
    mode: `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="8" cy="9" r="5"/><path d="M5 5 L4 3 M11 5 L12 3"/><path d="M8 9 L8 6 M8 9 L10 10"/></svg>`,
    'add-preset': `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><ellipse cx="5.5" cy="9.5" rx="2.8" ry="2.2"/><circle cx="3" cy="6" r="1.1"/><circle cx="5.5" cy="4.5" r="1.1"/><circle cx="8" cy="6" r="1.1"/><path d="M11 8 L11 14 M8 11 L14 11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
    // 空状态：虚线方框 + 猫耳 + 小猫脸
    empty: `<svg width="56" height="56" viewBox="0 0 56 56" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="5 4" stroke-linecap="round" stroke-linejoin="round"><path d="M14 14 L20 6 M42 14 L36 6"/><rect x="7" y="14" width="42" height="35" rx="6"/></svg><svg width="56" height="56" viewBox="0 0 56 56" fill="currentColor" style="position:absolute;left:0;top:0;pointer-events:none" opacity="0.55"><circle cx="28" cy="33" r="6"/><circle cx="25.5" cy="31.5" r="0.9" fill="var(--bg-solid)" stroke="none"/><circle cx="30.5" cy="31.5" r="0.9" fill="var(--bg-solid)" stroke="none"/><path d="M27 35 Q28 36.5 29 35" stroke="var(--bg-solid)" stroke-width="0.8" fill="none" stroke-linecap="round"/></svg>`,
    back: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4 Q5 4 5 8 Q5 12 9 12"/><path d="M7 6 L5 8 L7 10"/></svg>`,
    'edit-select-all': `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-dasharray="2 1.5"><rect x="1.5" y="1.5" width="13" height="13" rx="2"/></svg><svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style="position:absolute;pointer-events:none"><ellipse cx="8" cy="10" rx="2.5" ry="2"/><circle cx="5.5" cy="7" r="1"/><circle cx="8" cy="5.5" r="1"/><circle cx="10.5" cy="7" r="1"/></svg>`,
    'edit-move-out': `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"><rect x="2" y="2" width="12" height="12" rx="3"/><path d="M5.5 5.5 L10.5 10.5 M10.5 5.5 L5.5 10.5"/></svg>`,
    'edit-remove': `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M5 5 L5 13 Q5 14 6 14 L10 14 Q11 14 11 13 L11 5 Z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M3 5 L13 5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M6 5 L6 3.5 Q6 3 6.5 3 L9.5 3 Q10 3 10 3.5 L10 5" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>`,
    'edit-done': `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><g transform="rotate(45 8 8)"><ellipse cx="8" cy="10.5" rx="3.5" ry="3"/><circle cx="4" cy="6" r="1.4"/><circle cx="7" cy="4" r="1.4"/><circle cx="9" cy="4" r="1.4"/><circle cx="12" cy="6" r="1.4"/></g></svg>`,
  },
  files: {
    folder: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 8 Q3 6 5 6 L9 6 L11 8 L19 8 Q21 8 21 10 L21 18 Q21 20 19 20 L5 20 Q3 20 3 18 Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M8 4 L7 2 M16 4 L17 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/><circle cx="12" cy="14" r="2.5"/></svg>`,
    image: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="3"/><circle cx="8.5" cy="10" r="1.5" fill="currentColor"/><path d="M5 17 L10 12 L14 16 L17 13 L21 17"/></svg>`,
    video: `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="6" width="14" height="12" rx="3" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M17 10 L21 7 L21 17 L17 14 Z"/></svg>`,
    audio: `<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/><path d="M9 18 L9 6 L21 4 L21 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>`,
    document: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M5 3 Q5 2 6 2 L14 2 L20 8 L20 21 Q20 22 19 22 L6 22 Q5 22 5 21 Z"/><path d="M14 2 L14 8 L20 8"/><line x1="8" y1="12" x2="16" y2="12" stroke-width="1"/><line x1="8" y1="16" x2="14" y2="16" stroke-width="1"/></svg>`,
    archive: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><rect x="9" y="10" width="6" height="4" rx="1" fill="currentColor"/></svg>`,
    code: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 8 L4 12 L9 16"/><path d="M15 8 L20 12 L15 16"/></svg>`,
    default: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M5 3 Q5 2 6 2 L14 2 L20 8 L20 21 Q20 22 19 22 L6 22 Q5 22 5 21 Z"/><path d="M14 2 L14 8 L20 8"/></svg>`,
  },
  check: `<svg viewBox="0 0 16 16" fill="currentColor"><ellipse cx="5.5" cy="10" rx="2.8" ry="2.2"/><circle cx="3" cy="6.5" r="1.1"/><circle cx="5.5" cy="5" r="1.1"/><circle cx="8" cy="6.5" r="1.1"/><path d="M9 9 L11 11 L14.5 6.5" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
};

// ----- 冰棍主题（简笔画融化风格） -----
const POPSICLE_THEME = {
  defaultAccent: '#06b6d4',  // 青色
  defaultAccentNight: '#d2691e',  // 巧乐兹夜间：巧克力橙
  ui: {
    settings: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M8 1 L8 15 M1 8 L15 8 M3 3 L13 13 M13 3 L3 13"/><path d="M6.5 1.8 L8 3 L9.5 1.8 M6.5 14.2 L8 13 L9.5 14.2 M1.8 6.5 L3 8 L1.8 9.5 M14.2 6.5 L13 8 L14.2 9.5"/></svg>`,
    'view-list': `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M2 3 Q2 2 3 2 L11 2 Q12 2 12 3 L12 4 Q12 5 11 5 L3 5 Q2 5 2 4 Z"/><path d="M2 7.5 Q2 6.5 3 6.5 L11 6.5 Q12 6.5 12 7.5 L12 8.5 Q12 9.5 11 9.5 L3 9.5 Q2 9.5 2 8.5 Z"/><path d="M2 12 Q2 11 3 11 L11 11 Q12 11 12 12 L12 13 Q12 14 11 14 L3 14 Q2 14 2 13 Z"/></svg>`,
    'view-grid': `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M2 2 Q2 1 3 1 L6 1 Q7 1 7 2 L7 6 Q7 7 6 7 L3 7 Q2 7 2 6 Z"/><path d="M10 2 Q10 1 11 1 L14 1 Q15 1 15 2 L15 6 Q15 7 14 7 L11 7 Q10 7 10 6 Z"/><path d="M2 10 Q2 9 3 9 L6 9 Q7 9 7 10 L7 14 Q7 15 6 15 L3 15 Q2 15 2 14 Z"/><path d="M10 10 Q10 9 11 9 L14 9 Q15 9 15 10 L15 14 Q15 15 14 15 L11 15 Q10 15 10 14 Z"/></svg>`,
    filter: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"><path d="M2 3 Q2 2 3 2 L13 2 Q14 2 14 3 L10 7 Q10 7.5 10 8 L10 13 Q10 14 9 14 L7 13 Q6 12.5 6 12 L6 8 Q6 7.5 6 7 Z"/></svg>`,
    sort: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3 L3 13 M3 13 L1 11 M3 13 L5 11"/><path d="M7 4 L14 4 M7 8 L12 8 M7 12 L10 12"/></svg>`,
    edit: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 13 L5 11 L12 4 L14 6 L7 13 L5 13 Z"/><path d="M11 3 L13 5"/></svg>`,
    pin: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4" y="1" width="8" height="9" rx="4"/><path d="M8 10 L8 15" stroke-linecap="round"/></svg>`,
    hide: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M8 2 L10 4 L12 3 L11 5 L13 7 L11 7 L12 9 L10 8 L8 10 L6 8 L4 9 L5 7 L3 7 L5 5 L4 3 L6 4 Z"/><circle cx="8" cy="6" r="1.5" fill="currentColor"/></svg>`,
    close: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 4 L12 12 M12 4 L4 12"/></svg>`,
    minimize: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 8 L12 8"/></svg>`,
    mode: `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="8" cy="8" r="5.5"/><path d="M8 8 L8 5 M8 8 L10.5 9.5"/></svg>`,
    'add-preset': `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3 Q3 2 4 2 L12 2 Q13 2 13 3 L13 13 Q13 14 12 14 L4 14 Q3 14 3 13 Z"/><path d="M8 6 L8 10 M6 8 L10 8"/></svg>`,
    // 空状态：虚线方框 + 顶部融化波浪（冰棍化）
    empty: `<svg width="56" height="56" viewBox="0 0 56 56" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="5 4" stroke-linecap="round" stroke-linejoin="round"><path d="M7 16 Q14 22 21 16 Q28 10 35 16 Q42 22 49 16 L49 46 Q49 49 46 49 L10 49 Q7 49 7 46 Z"/></svg>`,
    back: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M13 8 L4 8 M7 5 L4 8 L7 11"/></svg>`,
    'edit-select-all': `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" stroke-dasharray="2 1.5"><path d="M2 2 Q1 2 1 3 L1 5 M2 2 L5 2 M11 2 L14 2 Q15 2 15 3 L15 5 M14 2 L11 2 M2 14 Q1 14 1 13 L1 11 M2 14 L5 14 M11 14 L14 14 Q15 14 15 13 L15 11 M14 14 L11 14"/></svg>`,
    'edit-move-out': `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"><rect x="2" y="3" width="12" height="11" rx="2"/><path d="M5 6 L11 12 M11 6 L5 12"/></svg>`,
    'edit-remove': `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" stroke-linecap="round"><path d="M3 5 Q3 4.5 3.5 4.5 L12.5 4.5 Q13 4.5 13 5"/><path d="M4.5 5 L4.5 13 Q4.5 14 5.5 14 L10.5 14 Q11.5 14 11.5 13 L11.5 5"/><path d="M6 5 L6 3.5 Q6 3 6.5 3 L9.5 3 Q10 3 10 3.5 L10 5"/></svg>`,
    'edit-done': `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8 L6.5 11.5 L13 5"/></svg>`,
  },
  files: {
    folder: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M3 6 Q3 4 5 4 L9 4 L11 6 L19 6 Q21 6 21 8 L21 18 Q21 20 19 20 L5 20 Q3 20 3 18 Z"/><path d="M7 12 Q9 10 12 12 Q15 14 17 12" stroke-dasharray="1 1"/></svg>`,
    image: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M3 5 Q3 3 5 3 L19 3 Q21 3 21 5 L21 19 Q21 21 19 21 L5 21 Q3 21 3 19 Z"/><circle cx="8" cy="9" r="1.5"/><path d="M4 18 L9 13 L13 17 L16 14 L20 18" stroke-linecap="round"/></svg>`,
    video: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M3 7 Q3 5 5 5 L15 5 Q17 5 17 7 L17 17 Q17 19 15 19 L5 19 Q3 19 3 17 Z"/><path d="M17 10 L21 7 L21 17 L17 14 Z"/></svg>`,
    audio: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="16" r="2.5"/><path d="M8.5 18 L8.5 7 L20.5 5 L20.5 16"/></svg>`,
    document: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M5 3 Q5 2 6 2 L14 2 L20 8 L20 21 Q20 22 19 22 L6 22 Q5 22 5 21 Z"/><path d="M14 2 L14 8 L20 8"/><path d="M8 12 L16 12 M8 16 L14 16" stroke-linecap="round"/></svg>`,
    archive: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M3 5 Q3 3 5 3 L19 3 Q21 3 21 5 L21 8 Q21 9 20 9 L4 9 Q3 9 3 8 Z"/><path d="M4 9 L4 19 Q4 21 6 21 L18 21 Q20 21 20 19 L20 9"/><rect x="10" y="11" width="4" height="3" rx="0.5" fill="currentColor"/></svg>`,
    code: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 8 L4 12 L9 16"/><path d="M15 8 L20 12 L15 16"/></svg>`,
    default: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M5 3 Q5 2 6 2 L14 2 L20 8 L20 21 Q20 22 19 22 L6 22 Q5 22 5 21 Z"/><path d="M14 2 L14 8 L20 8"/></svg>`,
  },
  check: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8 L6.5 11.5 L13 5"/></svg>`,
};

// ----- 像素主题（8-bit 像素风） -----
// 像素辅助：用 rect 构建像素图标
function px(rects, size = 16) {
  const r = rects.map(([x, y, w, h]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}"/>`).join('');
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" fill="currentColor" shape-rendering="crispEdges">${r}</svg>`;
}
function pxFile(rects, size = 24) {
  const r = rects.map(([x, y, w, h]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}"/>`).join('');
  return `<svg viewBox="0 0 ${size} ${size}" fill="currentColor" shape-rendering="crispEdges">${r}</svg>`;
}

// ----- 玻璃窗主题（写实透亮玻璃 + 极窄木框，图标为棱角分明的直角硬边风格） -----
const GLASS_THEME = {
  defaultAccent: '#0ea5e9',       // 天蓝强调色（玻璃折射感）
  defaultAccentNight: '#38bdf8',
  ui: {
    // 玻璃窗主题：空状态不显示图标与提示（玻璃本身即为视觉主体）
    empty: '',
    // 棱角分明版图标：直角、硬边、无圆角，配合玻璃的几何折射感
    settings: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="miter" stroke-linecap="square"><rect x="6" y="6" width="4" height="4"/><path d="M8 1 L8 4 M8 12 L8 15 M1 8 L4 8 M12 8 L15 8 M3 3 L5 5 M11 11 L13 13 M3 13 L5 11 M11 5 L13 3"/></svg>`,
    'view-list': `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="2" width="14" height="2"/><rect x="1" y="7" width="14" height="2"/><rect x="1" y="12" width="14" height="2"/></svg>`,
    'view-grid': `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="1" width="6" height="6"/><rect x="9" y="1" width="6" height="6"/><rect x="1" y="9" width="6" height="6"/><rect x="9" y="9" width="6" height="6"/></svg>`,
    filter: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="miter" stroke-linecap="square"><path d="M2 2 L14 2 L10 7 L10 14 L6 12 L6 7 Z"/></svg>`,
    sort: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square"><path d="M3 2 L3 14 M3 14 L1 12 M3 14 L5 12"/><path d="M7 3 L14 3 M7 7 L12 7 M7 11 L10 11"/></svg>`,
    edit: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="miter" stroke-linecap="square"><path d="M2 14 L2 11 L11 2 L14 5 L5 14 Z"/><path d="M10 3 L13 6"/></svg>`,
    pin: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="miter" stroke-linecap="square"><path d="M4 2 L12 2 L11 7 L12 10 L4 10 L5 7 Z"/><path d="M8 10 L8 15"/></svg>`,
    hide: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square" stroke-linejoin="miter"><path d="M8 2 L8 10 M5 7 L8 10 L11 7"/><path d="M2 12 L2 14 L14 14 L14 12"/></svg>`,
    close: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square"><path d="M4 4 L12 12 M12 4 L4 12"/></svg>`,
    minimize: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square"><path d="M4 8 L12 8"/></svg>`,
    mode: `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square" stroke-linejoin="miter"><rect x="2" y="2" width="12" height="12"/><path d="M8 4 L8 8 L11 10"/></svg>`,
    'add-preset': `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square"><rect x="2" y="2" width="12" height="12"/><path d="M8 5 L8 11 M5 8 L11 8"/></svg>`,
    back: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square" stroke-linejoin="miter"><path d="M13 8 L4 8 M7 5 L4 8 L7 11"/></svg>`,
    'edit-select-all': `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-dasharray="2 1.5"><rect x="1.5" y="1.5" width="13" height="13"/></svg>`,
    'edit-move-out': `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square"><rect x="2" y="2" width="12" height="12"/><path d="M5 5 L11 11 M11 5 L5 11"/></svg>`,
    'edit-remove': `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="miter" stroke-linecap="square"><path d="M3 5 L13 5"/><path d="M4.5 5 L4.5 13 L11.5 13 L11.5 5"/><path d="M6 5 L6 3 L10 3 L10 5"/></svg>`,
    'edit-done': `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square" stroke-linejoin="miter"><path d="M3 8 L6.5 11.5 L13 5"/></svg>`,
  },
  // files / check 沿用默认主题图标
};

// ===== 主题注册表 =====
const THEME_REGISTRY = {
  default: DEFAULT_THEME,
  cat: CAT_THEME,
  popsicle: POPSICLE_THEME,
  glass: GLASS_THEME,
};

// 获取主题图标（合并默认主题作为兜底）
function getThemeIcons(theme) {
  const base = THEME_REGISTRY.default;
  const themed = THEME_REGISTRY[theme] || {};
  return {
    defaultAccent: themed.defaultAccent || base.defaultAccent,
    defaultAccentNight: themed.defaultAccentNight || base.defaultAccentNight,
    ui: { ...base.ui, ...(themed.ui || {}) },
    files: { ...base.files, ...(themed.files || {}) },
    check: themed.check || base.check,
  };
}

// 主题元信息（用于设置面板显示）
const THEME_META = {
  default: { label: '默认', hasDecoration: false },
  cat: { label: '猫耳', hasDecoration: true },
  popsicle: { label: '冰棍', hasDecoration: true },
  glass: { label: '玻璃窗', hasDecoration: true },
};

// 按钮ID → 图标key 映射
// 注：view-toggle-btn 图标随视图模式动态变化，由 updateViewToggleIcon() 单独处理，不在此映射中
const BUTTON_ICON_MAP = {
  'settings-btn': 'settings',
  'filter-btn': 'filter',
  'sort-btn': 'sort',
  'edit-btn': 'edit',
  'pin-btn': 'pin',
  'hide-btn': 'hide',
  'close-btn': 'close',
  'minimize-btn': 'minimize',
  'add-preset-btn': 'add-preset',
  'back-settings': 'back',
  'back-preset': 'back',
  'folder-back-btn': 'back',
  'edit-select-all': 'edit-select-all',
  'edit-move-out': 'edit-move-out',
  'edit-remove': 'edit-remove',
  'edit-delete': 'edit-remove',
  'edit-done': 'edit-done',
};
