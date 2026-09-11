// 剪贴板仓 UI（独立模块）—— renderer.js 在 clipboard 类型仓时经 window.__clipUI 调用
// 交互：悬停卡片右侧显示 复制/收藏/删除 三钮；单击卡片展开/收起；
//      展开内容（全文/大图）按需从主进程懒取（clip:get / clip:imageData）。
(function () {
  'use strict';
  const api = window.api.clip;
  const $ = (s) => document.querySelector(s);
  const els = {
    seg: $('#clip-seg'),
    count: $('#clip-count'),
    list: $('#clip-list'),
    empty: $('#clip-empty'),
    pauseBtn: $('#clip-pause'),
    clearBtn: $('#clip-clear'),
    menu: $('#clip-menu'),
    toast: $('#clip-toast'),
  };
  let pausedState = false;
  let mode = 'all';         // 'all' 全部历史 | 'fav' 只看收藏
  let toastTimer = null;
  const DRAG_MOVE = 5;
  const selected = new Set();   // 多选（Ctrl+点击）的 id
  let itemCount = 0;            // 当前列表条数（HUD 用）

  const KIND_LABEL = { text: '文本', rich: '富文本', html: '富文本', image: '图片', images: '多图', mixed: '图片+文字' };
  const KIND_GLYPH = { text: '文', rich: '文', html: '文', image: '图', images: '图', mixed: '混' };
  const ICO = {
    copy: '<svg viewBox="0 0 16 16" fill="currentColor"><rect x="5.5" y="5.5" width="8" height="8" rx="1"/><path d="M11.5 2h-6A1.5 1.5 0 0 0 4 3.5V12h1V3.5a.5.5 0 0 1 .5-.5h6V2z"/></svg>',
    fav: (on) => on
      ? '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 1.5l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.5l-3.8 2 .7-4.3-3.1-3 4.3-.6z"/></svg>'
      : '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M8 1.5l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.5l-3.8 2 .7-4.3-3.1-3 4.3-.6z"/></svg>',
    del: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/><path d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4L4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3h11V2h-11v1z"/></svg>',
    pause: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M5 3h2.2v10H5zM8.8 3H11v10H8.8z"/></svg>',
    play: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M6 3.5a.5.5 0 0 1 .8-.4l6 4.5a.5.5 0 0 1 0 .8l-6 4.5a.5.5 0 0 1-.8-.4v-9z"/></svg>',
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }
  function timeAgo(s) {
    if (s < 60) return s + 's';
    if (s < 3600) return Math.floor(s / 60) + 'm';
    if (s < 86400) return Math.floor(s / 3600) + 'h';
    return Math.floor(s / 86400) + 'd';
  }
  function showToast(msg) {
    if (!els.toast) return;
    els.toast.textContent = msg;
    els.toast.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.add('hidden'), 2200);
  }
  function updatePauseBtn() {
    if (!els.pauseBtn) return;
    els.pauseBtn.innerHTML = pausedState ? ICO.play : ICO.pause;
    els.pauseBtn.classList.toggle('paused', pausedState);
    els.pauseBtn.title = pausedState ? '继续自动采集' : '暂停自动采集';
  }
  function updateSeg() {
    if (!els.seg) return;
    els.seg.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
  }

  function copyItem(it) {
    // 只回写剪贴板，不动列表顺序：连续按顺序粘贴多项时，列表跳动会打乱手感
    api.writeBack(it.id).then(ok => {
      if (ok) showToast('已复制 → 到目标 Ctrl+V');
    });
  }
  function togglePin(it) { api.pin(it.id, !it.pinned).then(refresh); }
  function delItem(it) { if (confirm('删除这条剪贴板内容？')) api.remove(it.id).then(refresh); }

  // —— 多选 + “删除”三态按钮 ——
  function clearSelection() {
    if (!selected.size) return;
    selected.clear();
    els.list.querySelectorAll('.clip-card.selected').forEach(c => c.classList.remove('selected'));
  }
  function updateHud() {
    if (!els.count) return;
    els.count.textContent = pausedState ? '已暂停'
      : (itemCount ? itemCount + ' 条' + (selected.size ? ' · 已选 ' + selected.size : '') : '');
    if (els.clearBtn) {
      const openCard = els.list.querySelector('.clip-card.open');
      els.clearBtn.title = selected.size ? '删除选中的 ' + selected.size + ' 条'
        : (openCard ? '删除已展开这条' : '清空全部');
    }
  }
  async function doDelete() {
    if (selected.size) {
      if (!confirm('删除选中的 ' + selected.size + ' 条？')) return;
      const ids = [...selected];
      clearSelection();
      await Promise.all(ids.map(id => api.remove(id)));
      refresh();
      return;
    }
    const openCard = els.list.querySelector('.clip-card.open');
    if (openCard) {
      if (!confirm('删除已展开这条？')) return;
      await api.remove(openCard.dataset.id);
      refresh();
      return;
    }
    if (confirm('确定清空剪贴板库全部内容？')) api.clear().then(refresh);
  }

  // 展开内容：详情常驻 DOM，仅 .open 显示；全文/大图首次展开时懒取
  function buildDetail(it) {
    let inner = '';
    if (it.kind === 'mixed') {
      // 图文交杂 → 用“流”容器，按 html 里 图↔文 顺序渲染
      inner = '<div class="clip-flow" data-flow></div>';
    } else if (it.hasImage) {
      if (it.imgs && it.imgs.length) {
        inner = it.imgs.map(rel => '<img class="clip-big" data-rel="' + rel + '" alt="">').join('');
      } else {
        inner = '<img class="clip-big" data-big="' + it.id + '" alt="">';
      }
    }
    return '<div class="clip-detail">'
      + '<div class="clip-fields" data-fields></div>'
      + inner
      + '<div class="clip-loading" data-loading>加载全文…</div>'
      + '<pre class="clip-full" data-full></pre>'
      + '</div>';
  }
  function setFields(card, it, extra) {
    const f = card.querySelector('[data-fields]');
    if (!f) return;
    const parts = [];
    if (extra && extra.chars) parts.push(extra.chars + ' 字');
    else if (it && it.hasImage && !extra) parts.push('图片');
    if (it && it.hasImage) parts.push('含图');
    if (it && it.hasHtml) parts.push('富文本');
    f.textContent = parts.join(' · ');
  }
  function ensureBig(card, it) {
    if (!it.hasImage || card.dataset.bigLoaded) return;
    card.dataset.bigLoaded = '1';
    if (it.imgs && it.imgs.length) {
      it.imgs.forEach((rel) => {
        api.imageAt(rel, 720).then((u) => {
          const im = card.querySelector('.clip-big[data-rel="' + rel + '"]');
          if (im && u) im.src = u;
        });
      });
    } else {
      api.imageData(it.id, 760).then((u) => {
        const im = card.querySelector('.clip-big');
        if (im && u) im.src = u;
      });
    }
  }
  // 把 QQ 的 html 切成 图文交错 的顺序段（文本去标签保换行 / <img> 依次取 rel）
  function flowSegments(html, imgs) {
    const segs = [];
    let imgIdx = 0;
    const pushText = (raw) => {
      let s = raw
        .replace(/<\/(p|div|h\d|li)>/gi, '\n')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
      s = s.split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n').trim();
      if (s) segs.push({ t: 't', v: s });
    };
    const re = /<img\b[^>]*>/gi;
    let last = 0, m;
    while ((m = re.exec(html))) {
      pushText(html.slice(last, m.index));
      last = m.index + m[0].length;
      const rel = imgs[imgIdx]; imgIdx++;
      if (rel) segs.push({ t: 'i', v: rel });
    }
    pushText(html.slice(last));
    if (!segs.length && imgs.length) imgs.forEach(r => segs.push({ t: 'i', v: r }));
    return segs;
  }
  function buildFlowInto(container, html, imgs) {
    container.innerHTML = '';
    const segs = flowSegments(html || '', imgs || []);
    if (!segs.length) { container.innerHTML = '(空)'; return; }
    segs.forEach((sg) => {
      if (sg.t === 't') {
        const d = document.createElement('div');
        d.className = 'flow-text';
        d.textContent = sg.v;
        container.appendChild(d);
      } else {
        const img = document.createElement('img');
        img.className = 'clip-big';
        img.dataset.rel = sg.v;
        img.alt = '';
        container.appendChild(img);
        api.imageAt(sg.v, 720).then((u) => { if (img && u && img.isConnected) img.src = u; });
      }
    });
  }
  function ensureContent(card, it) {
    if (card.dataset.loaded) return;
    card.dataset.loaded = '1';
    setFields(card, it);
    api.get(it.id).then((r) => {
      const text = (r && r.text) || '';
      const html = (r && r.html) || '';
      const pre = card.querySelector('[data-full]');
      const load = card.querySelector('[data-loading]');
      if (it.kind === 'mixed') {
        const flow = card.querySelector('[data-flow]');
        if (flow) buildFlowInto(flow, html, it.imgs || []);
        if (pre) pre.style.display = 'none';
        if (load) load.style.display = 'none';
        setFields(card, it, text ? { chars: text.length } : null);
      } else if (text) {
        if (pre) { pre.textContent = text; pre.classList.add('has'); }
        if (load) load.style.display = 'none';
        setFields(card, it, { chars: text.length });
      } else {
        if (pre) pre.style.display = 'none';
        if (load) load.style.display = 'none';
        setFields(card, it);
      }
      if (it.kind !== 'mixed') ensureBig(card, it);
    }).catch(() => {
      const load = card.querySelector('[data-loading]');
      if (load) { load.textContent = '加载失败'; }
    });
  }

  // 按住拖出：图片→原生文件拖；纯文本→进程内 OLE（native_drag）
  function armDrag(d, it) {
    let sx = 0, sy = 0, armed = false, suppressClick = false;
    const move = (ev) => {
      if (armed) return;
      if (Math.hypot(ev.clientX - sx, ev.clientY - sy) > DRAG_MOVE) {
        armed = true; suppressClick = true;
        if (it.hasImage && (it.kind === 'image' || it.kind === 'images')) {
          // 纯图/多图 → 原生文件拖（多图一次拖全部）
          api.materializeAll(it.id).then((paths) => {
            if (paths && paths.length) {
              window.api.files.startDrag(paths.map((p) => ({ path: p, name: p.split(/[\\/]/).pop(), icon: it.thumb || '' })));
            }
          });
        } else {
          // 文本 / 富文本 / 图文混排 → 拖拽会话（拖影跟手，松手贴入光标下窗口，带图文）
          window.api.dnd.startText(it.id).then((r) => {
            // 拖出后同样不改顺序，保持列表稳定（连续拖出多项时不能重排）
            if (r && r.ok) showToast('已贴到目标窗口');
            else showToast((r && (r.reason || r.error)) || '拖出失败');
          });
        }
        cleanup();
      }
    };
    const up = () => cleanup();
    const cleanup = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    d.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if (e.target.closest('.clip-actions')) return; // 三个按钮单独处理
      // 整块（含展开的正文/图）都可长按拖动
      sx = e.clientX; sy = e.clientY; armed = false; suppressClick = false;
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    });
    d.addEventListener('click', (e) => {
      if (suppressClick) { e.stopPropagation(); suppressClick = false; }
    });
  }

  function makeCard(it) {
    const d = document.createElement('div');
    d.className = 'clip-card' + (it.pinned ? ' pinned' : '');
    d.dataset.id = it.id;

    const glyph = '<span class="clip-glyph">' + (KIND_GLYPH[it.kind] || '文') + '</span>';
    const media = it.hasImage && it.thumb
      ? '<img class="clip-thumb" src="' + it.thumb + '" draggable="false" alt="">'
      : glyph;
    const title = it.hasImage && !it.preview
      ? (it.kind === 'mixed' ? '图片 + 文字（混排）' : '图片')
      : (it.preview || '(空)');

    d.innerHTML =
      '<div class="clip-row">'
      + '<div class="clip-media">' + media + '</div>'
      + '<div class="clip-body">'
      +   '<div class="clip-title">' + esc(title) + '</div>'
      +   '<div class="clip-meta">' + (KIND_LABEL[it.kind] || it.kind) + ((it.imageCount || 0) > 1 ? ' ×' + it.imageCount : '') + ' · ' + timeAgo(it.ago) + (it.pinned ? ' · 收藏' : '') + '</div>'
      + '</div>'
      + '<div class="clip-actions">'
      +   '<button class="clip-act" data-act="copy" title="复制回写">' + ICO.copy + '</button>'
      +   '<button class="clip-act' + (it.pinned ? ' faved' : '') + '" data-act="fav" title="' + (it.pinned ? '取消收藏' : '收藏') + '">' + ICO.fav(!!it.pinned) + '</button>'
      +   '<button class="clip-act danger" data-act="del" title="删除">' + ICO.del + '</button>'
      + '</div>'
      + '</div>'
      + buildDetail(it);

    d.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]');
      if (act) {
        const a = act.dataset.act;
        if (a === 'copy') copyItem(it);
        else if (a === 'fav') togglePin(it);
        else if (a === 'del') delItem(it);
        return;
      }
      if (!e.target.closest('.clip-row')) return;
      // Ctrl / Cmd + 点击 = 多选/取消（不触发展开）
      if (e.ctrlKey || e.metaKey) {
        if (selected.has(it.id)) { selected.delete(it.id); d.classList.remove('selected'); }
        else { selected.add(it.id); d.classList.add('selected'); }
        updateHud();
        return;
      }
      // 普通点击：清多选再展开/收起
      if (selected.size) clearSelection();
      const open = d.classList.toggle('open');
      if (open) {
        // 同一时间只展开一张
        els.list.querySelectorAll('.clip-card.open').forEach(c => { if (c !== d) c.classList.remove('open'); });
        ensureContent(d, it);
      }
      updateHud();
    });

    armDrag(d, it);

    d.addEventListener('contextmenu', (e) => {
      e.preventDefault(); e.stopPropagation();
      openMenu(e.clientX, e.clientY, it);
    });
    return d;
  }

  // 右键菜单
  function openMenu(x, y, it) {
    const menu = els.menu;
    menu.innerHTML = '';
    const add = (label, cls, fn) => {
      const m = document.createElement('div');
      m.className = 'menu-item' + (cls ? ' ' + cls : '');
      m.textContent = label;
      m.addEventListener('click', () => { hideMenu(); fn(); });
      menu.appendChild(m);
    };
    const sep = () => { const s = document.createElement('div'); s.className = 'menu-separator'; menu.appendChild(s); };
    add('复制（回写剪贴板）', '', () => copyItem(it));
    add(it.pinned ? '取消收藏' : '收藏', '', () => togglePin(it));
    add('删除这条', 'danger', () => delItem(it));
    sep();
    add('清空全部', 'danger', () => { if (confirm('确定清空剪贴板库全部内容？')) api.clear().then(refresh); });
    menu.classList.remove('hidden');
    const w = menu.offsetWidth || 150, h = menu.offsetHeight || 130;
    menu.style.left = Math.min(x, window.innerWidth - w - 4) + 'px';
    menu.style.top = Math.min(y, window.innerHeight - h - 4) + 'px';
  }
  function hideMenu() { els.menu.classList.add('hidden'); els.menu.innerHTML = ''; }

  async function refresh() {
    hideMenu();
    try {
      const st = await api.state();
      pausedState = !!st.paused;
      updatePauseBtn();
      let items = await api.list();
      if (mode === 'fav') items = items.filter(i => i.pinned);
      itemCount = items.length;
      selected.clear(); // 整表重建，多选失效
      els.list.innerHTML = '';
      if (!items.length) {
        els.empty.style.display = 'flex';
        els.list.style.display = 'none';
        els.empty.innerHTML = mode === 'fav'
          ? '收藏为空 —— 悬停卡片点星号，或右键“收藏”'
          : '复制内容后自动出现在这里<br><span>单击卡片展开全文；悬停看操作；按住可拖出</span>';
      } else {
        els.empty.style.display = 'none';
        els.list.style.display = '';
        items.forEach(it => els.list.appendChild(makeCard(it)));
      }
      updateHud();
    } catch (e) { console.error('clip refresh:', e); }
  }

  function bind() {
    updateSeg();
    els.seg.querySelectorAll('button').forEach(b => {
      b.addEventListener('click', () => { mode = b.dataset.mode; updateSeg(); refresh(); });
    });
    els.pauseBtn.addEventListener('click', async () => {
      await api.pause(!pausedState);
      pausedState = !pausedState; updatePauseBtn(); refresh();
    });
    els.clearBtn.addEventListener('click', doDelete);
    document.addEventListener('click', (e) => {
      if (!els.menu.contains(e.target)) hideMenu();
    });
    $('#clip-area').addEventListener('contextmenu', (e) => {
      if (!e.target.closest('.clip-card')) { e.preventDefault(); hideMenu(); }
    });
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v' && document.body.classList.contains('clip-dock')) {
        api.capture().then(() => refresh());
      }
    });
  }

  window.__clipUI = { refresh, bind };
  bind();
})();
