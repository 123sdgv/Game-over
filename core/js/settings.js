// 仿 iOS 的设置 App
import { store, on, emit } from './store.js';
import { h, fmtTime, fmtMinutes, alert } from './ui.js';
import { games } from '../../games/registry.js';
import { resolveSettings, settingsKey, statsKey } from '../../games/_shared/hub.js';
import { APPS, iconOf, destroyWindow, goHome } from './apps.js';
import { WALLPAPERS, getWallpaper, setWallpaper, setCustomImage, wallpaperCSS, customImageURL } from './wallpaper.js';
import { guardState, RULES } from './guard.js';
import { exportData, importData, factoryReset } from './backup.js';
import { fillGap, isStandalone } from './fill.js';
import { defaultLayout, editHomeNow } from './home.js';

/* ---------- 图形 ---------- */
const G = {
  wallpaper: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M4.5 16.5l4.5-4.5 3.5 3.5 2.5-2.5 4.5 4.5"/><circle cx="15.5" cy="8.5" r="1.6"/>',
  home: '<rect x="4.5" y="4.5" width="6" height="6" rx="1.8"/><rect x="13.5" y="4.5" width="6" height="6" rx="1.8"/><rect x="4.5" y="13.5" width="6" height="6" rx="1.8"/><rect x="13.5" y="13.5" width="6" height="6" rx="1.8"/>',
  time: '<path d="M7 4h10M7 20h10M8 4c0 4 8 4 8 8s-8 4-8 8M16 4c0 4-8 4-8 8s8 4 8 8"/>',
  general: '<circle cx="12" cy="12" r="3"/><path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6 6l1.6 1.6M16.4 16.4L18 18M6 18l1.6-1.6M16.4 7.6L18 6"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.6v.2"/>',
  transfer: '<path d="M7 5v14M7 5L4 8M7 5l3 3M17 19V5M17 19l-3-3M17 19l3-3"/>',
  phone: '<rect x="7" y="3" width="10" height="18" rx="3"/><path d="M10.5 18h3"/>',
  plus: '<path d="M12 6v12M6 12h12"/>',
};
const glyph = (name, tone = 'g1') =>
  h('span', { class: `glyph ${tone}`, html: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${G[name]}</svg>` });

/* ---------- 列表组件 ---------- */
const group = (opts, ...rows) => h('div', { class: 'sgroup' },
  opts.header && h('div', { class: 'sgroup-h' }, opts.header),
  h('div', { class: 'scard' }, rows),
  opts.footer && h('div', { class: 'sgroup-f' }, opts.footer));

function row({ icon, title, sub, detail, chevron, onClick, right, tone }) {
  return h(onClick ? 'button' : 'div', { class: `srow ${tone || ''} ${icon ? 'has-icon' : ''}`, onclick: onClick },
    icon,
    h('span', { class: 'srow-main' },
      h('span', { class: 'srow-title' }, title),
      sub && h('span', { class: 'srow-sub' }, sub)),
    detail != null && h('span', { class: 'srow-detail' }, detail),
    right,
    chevron && h('span', { class: 'chev', html: '<svg viewBox="0 0 8 14"><path d="M1.5 1.5L6.5 7l-5 5.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>' }));
}

function toggle(value, onChange) {
  const el = h('button', { class: `toggle ${value ? 'on' : ''}`, role: 'switch', 'aria-checked': String(!!value) }, h('i'));
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    value = !value;
    el.classList.toggle('on', value);
    el.setAttribute('aria-checked', String(value));
    onChange(value);
  });
  return el;
}

function stepper(value, min, max, onChange, inc = 1) {
  const minus = h('button', { 'aria-label': '减少' }, '−');
  const plus = h('button', { 'aria-label': '增加' }, '+');
  const sync = () => { minus.disabled = value <= min; plus.disabled = value >= max; };
  let rep;
  const step = (d) => { const v = Math.min(max, Math.max(min, value + d)); if (v !== value) { value = v; sync(); onChange(v); } };
  const hold = (btn, d) => {
    btn.addEventListener('pointerdown', () => { step(d); let n = 0; rep = setInterval(() => step(d * (++n > 8 ? 2 : 1)), 140); });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => btn.addEventListener(ev, () => clearInterval(rep)));
  };
  hold(minus, -inc); hold(plus, inc);
  sync();
  return h('span', { class: 'stepper' }, minus, h('i'), plus);
}

function slider(value, min, max, onInput) {
  const input = h('input', { type: 'range', min, max, step: 1, value, class: 'slider' });
  const paint = () => input.style.setProperty('--p', `${((input.value - min) / (max - min)) * 100}%`);
  input.addEventListener('input', () => { paint(); onInput(+input.value); });
  paint();
  return input;
}

/* ---------- 导航栈 ---------- */
export function createSettings() {
  const root = h('div', { class: 'settings' });
  const stack = [];

  function makePage(def) {
    const back = stack.length ? h('button', { class: 'snav-back', onclick: () => pop() },
      h('span', { html: '<svg viewBox="0 0 12 20"><path d="M10 2L2 10l8 8" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>' }),
      stack[stack.length - 1].def.title) : null;
    const navTitle = h('div', { class: 'snav-title' }, def.title);
    const nav = h('div', { class: 'snav' }, back, navTitle);
    const content = h('div', { class: 'scontent' });
    const scroll = h('div', { class: 'sscroll' }, def.large ? h('h1', { class: 'slarge' }, def.title) : null, content);
    const el = h('div', { class: 'spage' }, nav, scroll);
    const page = {
      def, el, cleanup: [],
      refresh() {
        page.cleanup.forEach((f) => f()); page.cleanup = [];
        const top = scroll.scrollTop;
        content.replaceChildren();
        def.build(content, page);
        scroll.scrollTop = top;
      },
    };
    if (def.large) {
      nav.classList.add('large');
      scroll.addEventListener('scroll', () => nav.classList.toggle('scrolled', scroll.scrollTop > 36), { passive: true });
    } else {
      scroll.addEventListener('scroll', () => nav.classList.toggle('scrolled', scroll.scrollTop > 4), { passive: true });
    }
    page.refresh();
    return page;
  }

  function push(def) {
    const prev = stack[stack.length - 1];
    const page = makePage(def);
    root.append(page.el);
    stack.push(page);
    if (prev) {
      const opts = { duration: 380, easing: 'cubic-bezier(.2,.85,.25,1)' };
      page.el.animate([{ transform: 'translateX(100%)' }, { transform: 'none' }], opts);
      prev.el.animate([{ transform: 'none', opacity: 1 }, { transform: 'translateX(-28%)', opacity: 0.6 }], { ...opts, fill: 'forwards' });
      prev.el.style.pointerEvents = 'none';
    }
  }

  function pop(fromX = 0) {
    if (stack.length < 2) return;
    const page = stack.pop();
    const prev = stack[stack.length - 1];
    page.cleanup.forEach((f) => f());
    const opts = { duration: 320, easing: 'cubic-bezier(.25,.8,.3,1)' };
    const w = root.clientWidth || 1;
    page.el.animate([{ transform: `translateX(${fromX}px)` }, { transform: 'translateX(100%)' }], opts).onfinish = () => page.el.remove();
    prev.el.getAnimations().forEach((a) => a.cancel());
    prev.el.animate([{ transform: `translateX(${-28 + (fromX / w) * 28}%)`, opacity: 0.6 + (fromX / w) * 0.4 }, { transform: 'none', opacity: 1 }], opts);
    prev.el.style.pointerEvents = '';
    prev.refresh();
  }

  // 从左边缘右滑返回
  let sw = null;
  root.addEventListener('pointerdown', (e) => {
    const r = root.getBoundingClientRect();
    if (stack.length > 1 && e.clientX - r.left < 22) sw = { x0: e.clientX, page: stack[stack.length - 1], prev: stack[stack.length - 2], dx: 0, id: e.pointerId };
  });
  root.addEventListener('pointermove', (e) => {
    if (!sw) return;
    sw.dx = Math.max(0, e.clientX - sw.x0);
    if (sw.dx > 3) { try { root.setPointerCapture(sw.id); } catch {} }
    const w = root.clientWidth;
    sw.prev.el.getAnimations().forEach((a) => a.cancel());
    sw.page.el.style.transform = `translateX(${sw.dx}px)`;
    sw.prev.el.style.transform = `translateX(${-28 + (sw.dx / w) * 28}%)`;
    sw.prev.el.style.opacity = 0.6 + (sw.dx / w) * 0.4;
  });
  const swEnd = () => {
    if (!sw) return;
    const { dx, page, prev } = sw; sw = null;
    page.el.style.transform = ''; prev.el.style.transform = ''; prev.el.style.opacity = '';
    if (dx > root.clientWidth / 3) pop(dx);
    else if (dx > 0) {
      page.el.animate([{ transform: `translateX(${dx}px)` }, { transform: 'none' }], { duration: 220, easing: 'ease-out' });
      prev.el.animate([{ transform: 'translateX(-28%)', opacity: 0.6 }, { transform: 'translateX(-28%)', opacity: 0.6 }], { duration: 1, fill: 'forwards' });
    }
  };
  root.addEventListener('pointerup', swEnd);
  root.addEventListener('pointercancel', swEnd);

  const ctx = { push, pop };
  push(rootPage(ctx));
  on('guard', () => { const p = stack[stack.length - 1]; if (p.def.live) p.refresh(); });
  return root;
}

/* ---------- 页面 ---------- */
const totalPlayed = () => games.reduce((n, g) => n + (store.get(statsKey(g.id), {}).played || 0), 0);
const wpName = () => {
  const w = getWallpaper();
  return w.id === 'custom' ? '我的照片' : (WALLPAPERS.find((x) => x.id === w.id) || WALLPAPERS[0]).name;
};

function rootPage(ctx) {
  return {
    title: '设置', large: true,
    build(c) {
      const g = guardState();
      c.append(
        h('button', { class: 'scard me', onclick: () => ctx.push(aboutPage(ctx)) },
          h('img', { src: 'core/assets/icon-512.png', alt: '' }),
          h('span', { class: 'me-text' },
            h('span', { class: 'me-name' }, store.get('device.name', '小手机')),
            h('span', { class: 'me-sub' }, `${games.length} 款游戏，共玩了 ${totalPlayed()} 局`)),
          h('span', { class: 'chev', html: '<svg viewBox="0 0 8 14"><path d="M1.5 1.5L6.5 7l-5 5.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>' })),
        group({},
          row({ icon: glyph('wallpaper', 'g2'), title: '墙纸', detail: wpName(), chevron: true, onClick: () => ctx.push(wallpaperPage(ctx)) }),
          row({ icon: glyph('home', 'g3'), title: '主屏幕', chevron: true, onClick: () => ctx.push(homePage(ctx)) })),
        group({},
          row({ icon: glyph('time', 'g1'), title: '屏幕使用时间', detail: g.locked ? '休息中' : `连续 ${Math.floor(g.used / 60000)} 分钟`, chevron: true, onClick: () => ctx.push(timePage(ctx)) })),
        group({ header: 'App' },
          games.map((gm) => row({
            icon: h('span', { class: 'glyph img' }, h('img', { src: iconOf(APPS.find((a) => a.id === gm.id)), alt: '' })),
            title: gm.name, chevron: true, onClick: () => ctx.push(gamePage(ctx, gm)),
          }))),
        group({},
          row({ icon: glyph('general', 'g4'), title: '通用', chevron: true, onClick: () => ctx.push(generalPage(ctx)) })),
      );
    },
  };
}

function generalPage(ctx) {
  return {
    title: '通用',
    build(c) {
      c.append(
        group({},
          row({ icon: glyph('info', 'g4'), title: '关于本机', chevron: true, onClick: () => ctx.push(aboutPage(ctx)) })),
        group({},
          row({ icon: glyph('transfer', 'g1'), title: '传输或还原', chevron: true, onClick: () => ctx.push(transferPage(ctx)) })),
      );
    },
  };
}

function aboutPage(ctx) {
  return {
    title: '关于本机',
    build(c) {
      const name = h('input', { class: 'srow-input', value: store.get('device.name', '小手机'), maxlength: 12, enterkeyhint: 'done' });
      name.addEventListener('change', () => store.set('device.name', name.value.trim() || '小手机'));
      name.addEventListener('keydown', (e) => { if (e.key === 'Enter') name.blur(); });
      let bytes = 0;
      for (const k of store.keys()) bytes += (localStorage.getItem('pp.' + k) || '').length * 2;
      c.append(
        h('div', { class: 'about-hero' }, h('img', { src: 'core/assets/icon-512.png', alt: '' })),
        group({}, row({ title: '名称', right: name })),
        group({},
          row({ title: '游戏', detail: String(games.length) }),
          row({ title: '已玩局数', detail: String(totalPlayed()) }),
          row({ title: '设置与记录', detail: `${(bytes / 1024).toFixed(1)} KB` }),
          row({ title: '版本', detail: '1.0' })),
        group({ footer: '这是一台装在手机里的手机。所有数据只保存在这台设备的浏览器里。' }),
      );
    },
  };
}

function transferPage(ctx) {
  return {
    title: '传输或还原',
    build(c) {
      c.append(
        group({ footer: '导出的备份包含壁纸、主屏幕布局、图标和游戏记录。换手机或清理浏览器前先导出一份。' },
          row({ title: '导出数据', onClick: exportData, tone: 'action' }),
          row({ title: '导入数据', onClick: importData, tone: 'action' })),
        group({},
          row({
            title: '还原主屏幕布局', tone: 'action', onClick: async () => {
              const ok = await alert({ title: '还原主屏幕布局？', message: '图标会回到默认位置，其他设置不变。', buttons: [{ label: '取消', value: false }, { label: '还原', value: true, style: 'bold' }] });
              if (ok) { store.set('layout', defaultLayout()); emit('layout'); }
            },
          })),
        group({}, row({ title: '抹掉所有内容和设置', onClick: factoryReset, tone: 'danger' })),
      );
    },
  };
}

function wallpaperPage(ctx) {
  return {
    title: '墙纸',
    build(c, page) {
      const w = getWallpaper();
      const preview = h('div', { class: 'wp-preview' });
      const previewBg = h('div', { class: 'wp-preview-bg' });
      preview.append(previewBg, h('div', { class: 'wp-preview-icons' },
        APPS.slice(0, 3).map((a) => h('img', { src: iconOf(a), alt: '' }))), h('div', { class: 'wp-preview-dock' }));
      const paintPreview = async () => {
        const cur = getWallpaper();
        previewBg.style.background = await wallpaperCSS(cur.id);
        previewBg.style.filter = cur.blur ? `blur(${cur.blur * 0.42}px)` : '';
        previewBg.style.transform = cur.blur ? `scale(${1 + cur.blur / 100})` : '';
      };
      paintPreview();

      const grid = h('div', { class: 'wp-grid' });
      const fileInput = h('input', { type: 'file', accept: 'image/*', style: { display: 'none' } });
      fileInput.addEventListener('change', async () => {
        if (fileInput.files[0]) { await setCustomImage(fileInput.files[0]); page.refresh(); }
      });
      grid.append(h('button', { class: 'wp-tile add', onclick: () => fileInput.click() },
        h('span', { class: 'wp-swatch' }, glyph('plus', 'bare')), h('span', { class: 'wp-name' }, '从相册选取')));
      customImageURL().then((u) => {
        if (!u) return;
        const t = h('button', { class: `wp-tile ${w.id === 'custom' ? 'on' : ''}`, onclick: () => { setWallpaper({ id: 'custom' }); page.refresh(); } },
          h('span', { class: 'wp-swatch', style: { background: `url("${u}") center/cover` } }), h('span', { class: 'wp-name' }, '我的照片'));
        grid.children[0].after(t);
      });
      for (const wp of WALLPAPERS) {
        grid.append(h('button', { class: `wp-tile ${w.id === wp.id ? 'on' : ''}`, onclick: () => { setWallpaper({ id: wp.id }); page.refresh(); } },
          h('span', { class: 'wp-swatch', style: { background: wp.css() } }), h('span', { class: 'wp-name' }, wp.name)));
      }

      const blurVal = h('span', { class: 'srow-detail' }, w.blur ? `${w.blur}` : '关');
      const blur = slider(w.blur, 0, 30, (v) => {
        blurVal.textContent = v ? `${v}` : '关';
        setWallpaper({ blur: v });
        paintPreview();
      });

      c.append(preview, fileInput,
        group({ header: '选择墙纸' }, h('div', { class: 'wp-wrap' }, grid)),
        group({ header: '模糊', footer: '照片只保存在这台设备上，导出备份时会一起带走。' },
          h('div', { class: 'srow slider-row' }, h('span', { class: 'slider-ico s' }), blur, h('span', { class: 'slider-ico l' }), blurVal)),
      );
    },
  };
}

function fillNote() {
  const gap = fillGap();
  const base = '添加到主屏幕后，有些 iOS 版本会在最底下留一条空白，这是系统的问题。打开试试能不能铺满；如果底部的东西被挡住了，就关掉。';
  return isStandalone() && gap ? `${base}（这台手机的空白约 ${gap} 点）` : base;
}

function homePage(ctx) {
  return {
    title: '主屏幕',
    build(c) {
      c.append(
        group({},
          row({ title: '显示 App 名称', right: toggle(store.get('home.labels', true) !== false, (v) => { store.set('home.labels', v); emit('labels'); }) })),
        group({ footer: '在主屏幕长按任意图标也可以进入整理。拖到底部的 Dock 可以固定常用的 App，Dock 最多放 4 个。' },
          row({ title: '整理主屏幕', tone: 'action', onClick: () => { goHome(); setTimeout(editHomeNow, 450); } }),
          row({
            title: '还原主屏幕布局', tone: 'action', onClick: () => { store.set('layout', defaultLayout()); emit('layout'); },
          })),
        group({ footer: fillNote() },
          row({ title: '铺满屏幕底部', right: toggle(store.get('display.fill', false), (v) => { store.set('display.fill', v); emit('fill'); }) })),
        ...(games.some((gm) => gm.icons.length > 1) ? [group({ header: 'App 图标', footer: '在下面的 App 页面里也能换。' },
          games.filter((gm) => gm.icons.length > 1).map((gm) => iconPicker(gm)))] : []),
      );
    },
  };
}

function iconPicker(gm) {
  const app = APPS.find((a) => a.id === gm.id);
  const cur = store.get('icons', {})[gm.id] || 0;
  const wrap = h('div', { class: 'icon-pick' }, h('div', { class: 'icon-pick-name' }, gm.name));
  const list = h('div', { class: 'icon-pick-list' });
  app.icons.forEach((src, i) => {
    const b = h('button', { class: `icon-opt ${i === cur ? 'on' : ''}`, 'aria-label': `图标 ${i + 1}` }, h('img', { src, alt: '' }));
    b.addEventListener('click', () => {
      store.set('icons', { ...store.get('icons', {}), [gm.id]: i });
      list.querySelectorAll('.icon-opt').forEach((x) => x.classList.toggle('on', x === b));
      emit('icons');
    });
    list.append(b);
  });
  wrap.append(list);
  return wrap;
}

function timePage(ctx) {
  return {
    title: '屏幕使用时间', live: true,
    build(c, page) {
      const g = guardState();
      const pct = Math.min(1, g.used / RULES.limit);
      const leftMs = Math.max(0, RULES.limit - g.used);
      const day = (off) => { const d = new Date(Date.now() - off * 864e5); return { k: `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`, d }; };
      const week = [6, 5, 4, 3, 2, 1, 0].map((o) => { const { k, d } = day(o); return { ms: g.days[k] || 0, label: o === 0 ? '今' : '日一二三四五六'[d.getDay()] }; });
      const max = Math.max(30 * 60e3, ...week.map((x) => x.ms));
      const todayMs = week[6].ms;

      c.append(
        h('div', { class: 'scard st-hero' },
          h('div', { class: 'st-label' }, '本次连续使用'),
          h('div', { class: 'st-big' }, `${Math.floor(g.used / 60000)}`, h('small', {}, ' / 30 分钟')),
          h('div', { class: 'st-bar' }, h('i', { style: { width: `${pct * 100}%` } })),
          h('div', { class: 'st-note' }, g.locked ? `休息中，还剩 ${fmtTime(g.lockUntil - Date.now())}` : `再玩 ${Math.ceil(leftMs / 60000)} 分钟会自动锁定`)),
        h('div', { class: 'scard st-week' },
          h('div', { class: 'st-label' }, `今天 ${fmtMinutes(todayMs)}`),
          h('div', { class: 'st-bars' }, week.map((x, i) => h('div', { class: `st-col ${i === 6 ? 'today' : ''}` },
            h('div', { class: 'st-colbar' }, h('i', { style: { height: `${Math.max(2, (x.ms / max) * 100)}%` } })),
            h('span', {}, x.label))))),
        group({ header: '规则', footer: '防沉迷不能关闭，也不会被"抹掉所有内容和设置"清除。' },
          row({ title: '连续使用上限', detail: '30 分钟' }),
          row({ title: '锁定时长', detail: '30 分钟' }),
          row({ title: '离开多久算休息', detail: '10 分钟' })),
      );
      const t = setInterval(() => page.refresh(), 15000);
      page.cleanup.push(() => clearInterval(t));
    },
  };
}

function gamePage(ctx, gm) {
  return {
    title: gm.name,
    build(c, page) {
      const app = APPS.find((a) => a.id === gm.id);
      const stored = store.get(settingsKey(gm.id), {});
      const s = resolveSettings(gm, stored);
      const save = (patch) => {
        const next = resolveSettings(gm, { ...s, ...patch });
        store.set(settingsKey(gm.id), next);
        Object.assign(s, next);
      };
      const stats = store.get(statsKey(gm.id), {});

      const head = h('div', { class: 'game-head' }, h('img', { src: iconOf(app), alt: '' }), h('div', { class: 'game-head-name' }, gm.name));

      const rows = (gm.settings || []).map((f) => {
        if (f.type === 'toggle') return row({ title: f.label, right: toggle(s[f.key], (v) => save({ [f.key]: v })) });
        if (f.type === 'stepper') {
          const max = typeof f.max === 'function' ? f.max(s) : f.max;
          const show = (v) => (f.display ? f.display(v) : `${v}${f.unit || ''}`);
          const val = h('span', { class: 'srow-detail num' }, show(s[f.key]));
          return row({
            title: f.label, sub: f.sub || (typeof f.max === 'function' ? `最多 ${max}` : null), detail: val,
            right: stepper(s[f.key], f.min, max, (v) => {
              save({ [f.key]: v });
              val.textContent = show(v);
              clearTimeout(page.refreshTimer);
              page.refreshTimer = setTimeout(() => page.refresh(), 700);
            }, f.step || 1),
          });
        }
        return null;
      });

      const presets = gm.presets && h('div', { class: 'chips' }, gm.presets.map((p) => {
        const on = Object.entries(p.values).every(([k, v]) => s[k] === v);
        return h('button', { class: `chip ${on ? 'on' : ''}`, onclick: () => { save(p.values); page.refresh(); } },
          h('b', {}, p.label), p.note && h('span', {}, p.note));
      }));

      const cfgKey = (gm.settings || []).filter((f) => f.type === 'stepper').map((f) => s[f.key]).join('x');
      const statRows = (gm.stats || []).map((st) => {
        let v = stats[st.key];
        if (st.format === 'ratio') v = stats.played ? `${v || 0}（${Math.round(((v || 0) / stats.played) * 100)}%）` : '0';
        else if (st.format === 'best') v = stats.bests && stats.bests[cfgKey] ? fmtTime(stats.bests[cfgKey]) : '—';
        return row({ title: st.label, detail: String(v ?? 0) });
      });

      c.append(...[head,
        ...(gm.icons.length > 1 ? [h('div', { class: 'sgroup' }, h('div', { class: 'sgroup-h' }, '图标'), h('div', { class: 'scard' }, iconPicker(gm)))] : []),
        presets && group({ header: '快速设置' }, presets),
        rows.length && group({ header: '游戏设置', footer: gm.settingsNote || '改动会在下一局生效；如果这一局还没开始，会立刻换成新棋盘。' }, rows),
        statRows.length && group({ header: '记录' }, statRows),
        group({}, row({
          title: '清除游戏记录', tone: 'danger', onClick: async () => {
            const ok = await alert({ title: `清除${gm.name}的记录？`, message: '局数、胜率和最快用时都会清零，设置保留。', buttons: [{ label: '取消', value: false }, { label: '清除', value: true, style: 'danger' }] });
            if (!ok) return;
            store.del(statsKey(gm.id));
            destroyWindow(gm.id);
            page.refresh();
          },
        })),
      ].filter(Boolean));
    },
  };
}
