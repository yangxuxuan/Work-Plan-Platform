'use strict';

const ipc = window.api;

const state = {
  tasks: [],
  categories: [],
  groups: [],
  settings: {},
};

const ui = {
  view: 'time',
  statusTab: 'undone',
  category: null,
  query: '',
  expanded: new Set(),
  qa: { due: null, cats: [], remind: null },
  focusSubAdd: null,
};

const $ = (sel) => document.querySelector(sel);
const listEl = $('#list');
const emptyEl = $('#empty');
const emptyText = $('#emptyText');
const navEl = $('#nav');
const catListEl = $('#catList');
const statbarEl = $('#statbar');
const tabsEl = $('#statusTabs');
const viewTitleEl = $('#viewTitle');
const searchInput = $('#searchInput');
const qaTitle = $('#qaTitle');
const qaDue = $('#qaDue');
const qaCats = $('#qaCats');
const qaRemind = $('#qaRemind');

const catMap = new Map();

const ICON = {
  clock:
    '<svg class="nav-ico" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.1" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M8 4.7V8l2.3 1.5" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
  list:
    '<svg class="nav-ico" viewBox="0 0 16 16"><path d="M2.6 4.2h6.8M2.6 8h6.8M2.6 11.8h4.2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M10.6 11.2l1.5 1.5 2.5-3.1" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  alert:
    '<svg class="nav-ico" viewBox="0 0 16 16"><path d="M8 2.4l5.6 9.8H2.4L8 2.4z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M8 6.3v3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><circle cx="8" cy="11" r="0.75" fill="currentColor"/></svg>',
  star:
    '<svg class="nav-ico" viewBox="0 0 16 16"><path d="M8 2.6l1.7 3.5 3.8.55-2.75 2.68.65 3.8L8 11.9l-3.4 1.8.65-3.8L2.5 7.2l3.8-.55L8 2.6z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>',
  bell:
    '<svg viewBox="0 0 16 16"><path d="M4.2 6.6a3.8 3.8 0 017.6 0v2.2l1.1 1.9H3.1l1.1-1.9V6.6z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M6.6 12.2a1.45 1.45 0 002.8 0" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>',
  chev:
    '<svg viewBox="0 0 16 16" width="14" height="14"><path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  more:
    '<svg viewBox="0 0 16 16" width="14" height="14"><circle cx="3.4" cy="8" r="1.1" fill="currentColor"/><circle cx="8" cy="8" r="1.1" fill="currentColor"/><circle cx="12.6" cy="8" r="1.1" fill="currentColor"/></svg>',
};

const VIEWS = [
  { id: 'time', name: '按时间', icon: ICON.clock },
  { id: 'status', name: '按完成度', icon: ICON.list },
  { id: 'overdue', name: '逾期任务', icon: ICON.alert },
  { id: 'starred', name: '重要任务', icon: ICON.star },
];

/* ------------------------------------------------------------------ util */

const pad = (n) => String(n).padStart(2, '0');

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function hl(text, q) {
  if (!q) return esc(text);
  const lower = String(text).toLowerCase();
  const lq = q.toLowerCase();
  let out = '';
  let i = 0;
  for (;;) {
    const idx = lower.indexOf(lq, i);
    if (idx < 0) {
      out += esc(String(text).slice(i));
      break;
    }
    out += esc(String(text).slice(i, idx)) + '<mark>' + esc(String(text).slice(idx, idx + q.length)) + '</mark>';
    i = idx + q.length;
  }
  return out;
}

function linkify(text) {
  const src = String(text);
  const parts = [];
  const re = /(https?:\/\/[^\s<>"']+)/g;
  let last = 0;
  let m;
  while ((m = re.exec(src))) {
    parts.push(esc(src.slice(last, m.index)));
    parts.push(`<a class="link" data-href="${esc(m[1])}">${esc(m[1])}</a>`);
    last = m.index + m[1].length;
  }
  parts.push(esc(src.slice(last)));
  return parts.join('');
}

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function fmtDateTime(s) {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  const now = new Date();
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const diff = Math.round((startOfDay(d) - startOfDay(now)) / 86400000);
  if (diff === 0) return `今天 ${hm}`;
  if (diff === 1) return `明天 ${hm}`;
  if (diff === -1) return `昨天 ${hm}`;
  if (d.getFullYear() === now.getFullYear()) return `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${hm}`;
}

function fmtDateShort(s) {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  const now = new Date();
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const diff = Math.round((startOfDay(d) - startOfDay(now)) / 86400000);
  if (diff === 0) return `今天 ${hm}`;
  if (diff === 1) return `明天 ${hm}`;
  if (d.getFullYear() === now.getFullYear()) return `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

function overdueLabel(dueAt) {
  const ms = Date.now() - new Date(dueAt).getTime();
  const mins = Math.max(1, Math.floor(ms / 60000));
  if (mins < 60) return `逾期 ${mins} 分钟`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `逾期 ${h} 小时`;
  return `逾期 ${Math.floor(h / 24)} 天`;
}

function statusOf(t) {
  if (t.done) return 'done';
  if (t.subtasks && t.subtasks.some((s) => s.done)) return 'partial';
  return 'undone';
}

function isOverdue(t) {
  return !t.done && new Date(t.dueAt).getTime() < Date.now();
}

function sortTasks(a, b) {
  const da = new Date(a.dueAt).getTime();
  const db = new Date(b.dueAt).getTime();
  if (da !== db) return da - db;
  const rank = { undone: 0, partial: 1, done: 2 };
  const ra = rank[statusOf(a)];
  const rb = rank[statusOf(b)];
  if (ra !== rb) return ra - rb;
  return new Date(a.createdAt) - new Date(b.createdAt);
}

function catById(id) {
  return catMap.get(id) || { id, name: id, color: '#8A8A8A' };
}

/* ----------------------------------------------------------------- toast */

let toastTimer = null;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.hidden = true;
  }, 2200);
}

/* --------------------------------------------------------------- popover */

let popoverEl = null;
let popoverCleanup = null;

function closePopover() {
  if (popoverCleanup) {
    popoverCleanup();
    popoverCleanup = null;
  }
  if (popoverEl && popoverEl.parentNode) popoverEl.parentNode.removeChild(popoverEl);
  popoverEl = null;
}

function openPopover(anchor, node, opts = {}) {
  closePopover();
  const pop = document.createElement('div');
  pop.className = 'popover';
  if (opts.width) pop.style.width = opts.width + 'px';
  pop.appendChild(node);
  document.getElementById('popoverRoot').appendChild(pop);

  const r = anchor.getBoundingClientRect();
  const pw = pop.offsetWidth;
  const ph = pop.offsetHeight;
  let left = r.left;
  if (left + pw > window.innerWidth - 12) left = Math.max(12, window.innerWidth - pw - 12);
  let top = r.bottom + 6;
  if (top + ph > window.innerHeight - 12) top = Math.max(12, r.top - ph - 6);
  pop.style.left = left + 'px';
  pop.style.top = top + 'px';

  popoverEl = pop;

  const onDown = (e) => {
    if (!pop.contains(e.target) && !anchor.contains(e.target)) closePopover();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') closePopover();
  };
  setTimeout(() => {
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
  }, 0);
  popoverCleanup = () => {
    document.removeEventListener('mousedown', onDown);
    document.removeEventListener('keydown', onKey);
  };
  return pop;
}

function toInputValue(dt) {
  if (!dt) return '';
  const d = new Date(dt);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromInputValue(v) {
  return v && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v) ? v : null;
}

function quickDate(kind, base) {
  const d = base ? new Date(base) : new Date();
  const cur = new Date();
  if (!base) {
    d.setHours(18, 0, 0, 0);
    if (d.getTime() < cur.getTime()) d.setDate(d.getDate() + 1);
  }
  if (kind === 'today') return d;
  if (kind === 'tomorrow') {
    d.setDate(d.getDate() + 1);
    return d;
  }
  if (kind === 'after') {
    d.setDate(d.getDate() + 2);
    return d;
  }
  if (kind === 'nextweek') {
    const day = d.getDay();
    const delta = ((8 - day) % 7) || 7;
    d.setDate(d.getDate() + delta);
    return d;
  }
  return d;
}

/* ------------------------------------------------------------- date pick */

function datePickerNode(opts) {
  const wrap = document.createElement('div');
  const allowClear = opts.allowClear !== false;
  wrap.innerHTML = `
    <div class="pop-title"><span>${esc(opts.title || '截止时间')}</span></div>
    <div class="pop-quick">
      <button type="button" data-q="today">今天</button>
      <button type="button" data-q="tomorrow">明天</button>
      <button type="button" data-q="after">后天</button>
      <button type="button" data-q="nextweek">下周一</button>
    </div>
    <input class="pop-input" type="datetime-local" step="60" value="${esc(toInputValue(opts.value))}">
    <div class="pop-actions">
      ${allowClear ? '<button class="btn" type="button" data-x="clear">清除</button>' : ''}
      <button class="btn primary" type="button" data-x="ok">确定</button>
    </div>`;

  const input = wrap.querySelector('input');
  wrap.addEventListener('click', (e) => {
    const q = e.target.closest('[data-q]');
    if (q) {
      const d = quickDate(q.dataset.q, fromInputValue(input.value));
      input.value = toInputValue(d.toISOString());
      return;
    }
    const x = e.target.closest('[data-x]');
    if (!x) return;
    if (x.dataset.x === 'clear') {
      opts.onClear && opts.onClear();
      closePopover();
      return;
    }
    const v = fromInputValue(input.value);
    if (!v) {
      toast('请选择日期和时间');
      return;
    }
    opts.onConfirm && opts.onConfirm(v);
    closePopover();
  });

  return wrap;
}

/* ----------------------------------------------------------- date labels */

function setFieldLabel(btn, text, empty) {
  btn.textContent = text;
  btn.dataset.empty = empty ? '1' : '0';
}

function updateQuickAddLabels() {
  setFieldLabel(qaDue, ui.qa.due ? fmtDateShort(ui.qa.due) : '截止时间', !ui.qa.due);

  if (ui.qa.cats.length) {
    qaCats.innerHTML = ui.qa.cats
      .map((id) => {
        const c = catById(id);
        return `<span class="chip" style="--c:${c.color}"><span class="cdot"></span>${esc(c.name)}</span>`;
      })
      .join('');
    qaCats.dataset.empty = '0';
  } else {
    qaCats.textContent = '分类';
    qaCats.dataset.empty = '1';
  }

  setFieldLabel(qaRemind, ui.qa.remind ? fmtDateShort(ui.qa.remind) : '提醒', !ui.qa.remind);
}

/* ------------------------------------------------------------- rendering */

function visibleTasks() {
  const now = Date.now();
  let list = state.tasks.slice();

  if (ui.view === 'status') {
    list = list.filter((t) => statusOf(t) === ui.statusTab);
  } else if (ui.view === 'overdue') {
    list = list.filter((t) => !t.done && new Date(t.dueAt).getTime() < now);
  } else if (ui.view === 'starred') {
    list = list.filter((t) => t.starred);
  }

  if (ui.category) list = list.filter((t) => t.categoryIds.includes(ui.category));

  if (ui.query) {
    const q = ui.query.toLowerCase();
    list = list.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        (t.note || '').toLowerCase().includes(q) ||
        (t.subtasks || []).some((s) => s.title.toLowerCase().includes(q))
    );
  }

  return list.sort(sortTasks);
}

function renderNav() {
  const now = Date.now();
  const counts = {
    time: state.tasks.length,
    status: state.tasks.length,
    overdue: state.tasks.filter((t) => !t.done && new Date(t.dueAt).getTime() < now).length,
    starred: state.tasks.filter((t) => t.starred).length,
  };
  navEl.innerHTML = VIEWS.map(
    (v) => `
    <button class="nav-item ${ui.view === v.id ? 'active' : ''}" data-view="${v.id}">
      ${v.icon}
      <span>${v.name}</span>
      <span class="nav-count">${counts[v.id] || ''}</span>
    </button>`
  ).join('');
}

function renderCategories() {
  const html = state.groups
    .map((g) => {
      const cats = state.categories.filter((c) => c.group === g.id);
      if (!cats.length) return '';
      const chips = cats
        .map((c) => {
          const on = ui.category === c.id;
          return `<button class="cat-chip ${on ? 'active' : ''}" data-cat="${c.id}" style="--c:${c.color}">
            <span class="dot"></span><span class="nm">${esc(c.name)}</span>
          </button>`;
        })
        .join('');
      return `<div class="cat-group"><div class="cat-group-name">${esc(g.name)}</div><div class="cat-chips">${chips}</div></div>`;
    })
    .join('');
  catListEl.innerHTML = html;
}

function renderHeader() {
  const view = VIEWS.find((v) => v.id === ui.view);
  viewTitleEl.textContent = view ? view.name : '按时间';
  if (ui.category) {
    const c = catById(ui.category);
    viewTitleEl.innerHTML = `${esc(view.name)} <span class="chip" style="--c:${c.color};vertical-align:2px;margin-left:6px"><span class="cdot"></span>${esc(c.name)}</span>`;
  }
}

function renderStatbar() {
  const list = visibleTasks();
  const undone = list.filter((t) => statusOf(t) === 'undone').length;
  const partial = list.filter((t) => statusOf(t) === 'partial').length;
  const done = list.filter((t) => statusOf(t) === 'done').length;
  const overdue = list.filter(isOverdue).length;

  statbarEl.innerHTML = `
    <span>共 <b>${list.length}</b> 条</span><span class="sep"></span>
    <span>未完成 <b>${undone}</b></span>
    <span>部分完成 <b>${partial}</b></span>
    <span>已完成 <b>${done}</b></span>
    <span class="sep"></span>
    <span class="${overdue ? 'warn' : ''}">逾期 <b>${overdue}</b></span>`;
}

function renderTabs() {
  if (ui.view !== 'status') {
    tabsEl.hidden = true;
    tabsEl.innerHTML = '';
    return;
  }
  tabsEl.hidden = false;
  const counts = { undone: 0, partial: 0, done: 0 };
  for (const t of state.tasks) counts[statusOf(t)] += 1;
  const defs = [
    ['undone', '未完成'],
    ['partial', '部分完成'],
    ['done', '已完成'],
  ];
  tabsEl.innerHTML = defs
    .map(
      ([id, name]) =>
        `<button class="tab ${ui.statusTab === id ? 'active' : ''}" data-tab="${id}">${name}<span class="n">${counts[id]}</span></button>`
    )
    .join('');
}

function taskHtml(t) {
  const st = statusOf(t);
  const overdue = isOverdue(t);
  const expanded = ui.expanded.has(t.id);
  const chips = t.categoryIds
    .map((id) => {
      const c = catById(id);
      return `<span class="chip" style="--c:${c.color}"><span class="cdot"></span>${esc(c.name)}</span>`;
    })
    .join('');

  const subDone = (t.subtasks || []).filter((s) => s.done).length;
  const subTotal = (t.subtasks || []).length;
  const subHtml = subTotal
    ? `<span class="sub-progress ${subDone === subTotal ? 'complete' : ''}">${subDone}/${subTotal}</span>`
    : '';

  const remindHtml = t.remindAt
    ? `<span class="meta-item remind">${ICON.bell}${esc(fmtDateShort(t.remindAt))}</span>`
    : '';

  const dueClass = `${overdue ? 'overdue' : ''} ${t.done ? 'done' : ''}`;
  const dueInner = `${esc(fmtDateShort(t.dueAt))}${overdue ? `<small>${esc(overdueLabel(t.dueAt))}</small>` : ''}`;

  const checkClass = `check ${st === 'done' ? 'on' : ''} ${st === 'partial' ? 'partial' : ''}`;

  return `
  <div class="task ${t.done ? 'done' : ''}" data-id="${t.id}">
    <button class="icon-btn star ${t.starred ? 'on' : ''}" data-act="star" title="重要">${t.starred ? '★' : '☆'}</button>
    <button class="${checkClass}" data-act="toggle" title="完成"></button>
    <div class="task-body">
      <div class="task-title" contenteditable="true" spellcheck="false" data-edit="title">${hl(t.title, ui.query)}</div>
      <div class="task-meta">${chips}${subHtml}${remindHtml}</div>
    </div>
    <div class="task-tail">
      <span class="due ${dueClass}" data-act="due" title="修改截止时间">${dueInner}</span>
      <button class="icon-btn" data-act="expand" title="展开">${ICON.chev}</button>
      <button class="icon-btn" data-act="menu" title="更多">${ICON.more}</button>
    </div>
    ${expanded ? detailHtml(t) : ''}
  </div>`;
}

function detailHtml(t) {
  const note = t.note || '';
  const noteBody = note ? linkify(note) : '<span class="ph">点击添加备注，可粘贴链接</span>';
  const remindText = t.remindAt ? fmtDateTime(t.remindAt) : '未设置提醒';

  const subs = (t.subtasks || [])
    .map(
      (s) => `
      <div class="sub ${s.done ? 'on' : ''}" data-sub="${s.id}">
        <button class="sub-check" data-act="subToggle"></button>
        <span class="sub-title" contenteditable="true" spellcheck="false" data-edit="subTitle">${hl(s.title, ui.query)}</span>
        <button class="sub-del" data-act="subDelete" title="删除子任务">×</button>
      </div>`
    )
    .join('');

  return `
  <div class="task-detail">
    <div class="detail-row">
      <span class="detail-label">备注</span>
      <div class="note-view" data-act="note">${noteBody}</div>
    </div>
    <div class="detail-row">
      <span class="detail-label">提醒</span>
      <button class="mini-btn" data-act="remind">${esc(remindText)}</button>
      ${t.remindAt ? '<button class="mini-btn danger" data-act="clearRemind">清除</button>' : ''}
    </div>
    <div class="detail-row">
      <span class="detail-label">子任务</span>
      <div class="sub-list">
        ${subs}
        <input class="sub-add" placeholder="添加子任务，回车确认" spellcheck="false">
      </div>
    </div>
  </div>`;
}

function renderList() {
  const list = visibleTasks();
  if (!list.length) {
    listEl.innerHTML = '';
    emptyEl.hidden = false;
    emptyText.textContent = ui.query
      ? '没有匹配的任务'
      : ui.view === 'overdue'
      ? '没有逾期任务'
      : ui.view === 'starred'
      ? '还没有标记重要'
      : ui.view === 'status' && ui.statusTab === 'done'
      ? '还没有已完成的任务'
      : '暂无任务';
  } else {
    emptyEl.hidden = true;
    listEl.innerHTML = list.map(taskHtml).join('');
  }

  if (ui.focusSubAdd) {
    const id = ui.focusSubAdd;
    ui.focusSubAdd = null;
    const el = listEl.querySelector(`.task[data-id="${id}"] .sub-add`);
    if (el) el.focus();
  }
}

function render() {
  renderNav();
  renderCategories();
  renderHeader();
  renderStatbar();
  renderTabs();
  renderList();
  updateQuickAddLabels();
}

/* --------------------------------------------------------------- mutate */

async function mutate(type, payload) {
  const res = (await ipc.mutate(type, payload)) || {};
  if (res.error) toast(res.error);
  return res;
}

/* ------------------------------------------------------------ list event */

function taskById(id) {
  return state.tasks.find((t) => t.id === id) || null;
}

async function saveTitle(el, task, isSub, subId) {
  if (el.dataset.saving) return;
  const text = el.textContent.trim();
  if (!text) {
    el.textContent = isSub ? (task.subtasks.find((s) => s.id === subId) || {}).title || '' : task.title;
    return;
  }
  const origin = isSub ? (task.subtasks.find((s) => s.id === subId) || {}).title : task.title;
  if (text === origin) return;
  el.dataset.saving = '1';
  if (isSub) await mutate('subtaskUpdate', { taskId: task.id, subId, patch: { title: text } });
  else await mutate('update', { id: task.id, patch: { title: text } });
}

function openDuePicker(anchor, task) {
  openPopover(
    anchor,
    datePickerNode({
      title: '截止时间',
      value: task.dueAt,
      allowClear: false,
      onConfirm: (v) => mutate('update', { id: task.id, patch: { dueAt: v } }),
    })
  );
}

function openRemindPicker(anchor, task) {
  openPopover(
    anchor,
    datePickerNode({
      title: '提醒时间',
      value: task.remindAt,
      allowClear: true,
      onConfirm: (v) => {
        if (new Date(v).getTime() < Date.now()) toast('该时间已过，将立即提醒');
        mutate('update', { id: task.id, patch: { remindAt: v } });
      },
      onClear: () => mutate('update', { id: task.id, patch: { remindAt: null } }),
    })
  );
}

function openCategoryPicker(anchor, task) {
  const wrap = document.createElement('div');
  const selected = new Set(task.categoryIds);
  const groupsHtml = state.groups
    .map((g) => {
      const cats = state.categories.filter((c) => c.group === g.id);
      if (!cats.length) return '';
      const btns = cats
        .map(
          (c) =>
            `<button type="button" data-c="${c.id}" style="--c:${c.color}" class="${selected.has(c.id) ? 'on' : ''}"><span class="dot"></span>${esc(c.name)}</button>`
        )
        .join('');
      return `<div class="pop-cat-group"><div class="gn">${esc(g.name)}</div><div class="cat-opt">${btns}</div></div>`;
    })
    .join('');

  wrap.innerHTML = `
    <div class="pop-title"><span>分类（最多 3 个）</span><span data-count>${selected.size}/3</span></div>
    <div class="pop-cats">${groupsHtml}</div>
    <div class="pop-actions"><button class="btn primary" type="button" data-x="ok">完成</button></div>`;

  wrap.addEventListener('click', (e) => {
    const x = e.target.closest('[data-x]');
    if (x) {
      closePopover();
      return;
    }
    const btn = e.target.closest('[data-c]');
    if (!btn) return;
    const id = btn.dataset.c;
    if (selected.has(id)) {
      if (selected.size <= 1) {
        toast('至少保留一个分类');
        return;
      }
      selected.delete(id);
      btn.classList.remove('on');
    } else {
      if (selected.size >= 3) {
        toast('最多选择 3 个分类');
        return;
      }
      selected.add(id);
      btn.classList.add('on');
    }
    wrap.querySelector('[data-count]').textContent = `${selected.size}/3`;
    mutate('update', { id: task.id, patch: { categoryIds: Array.from(selected) } });
  });

  openPopover(anchor, wrap, { width: 330 });
}

async function openTaskMenu(anchor, task) {
  const wrap = document.createElement('div');
  wrap.innerHTML = `<button class="ghost-btn" style="color:var(--danger)" data-x="del">删除任务</button>`;
  wrap.addEventListener('click', async (e) => {
    if (!e.target.closest('[data-x="del"]')) return;
    closePopover();
    const ok = await confirmModal({
      title: '删除任务',
      message: `「${task.title}」删除后无法恢复。`,
      okText: '删除',
      danger: true,
    });
    if (ok) await mutate('delete', { id: task.id });
  });
  openPopover(anchor, wrap, { width: 170 });
}

function enterNoteEdit(taskEl, task) {
  const view = taskEl.querySelector('.note-view');
  if (!view) return;
  const ta = document.createElement('textarea');
  ta.className = 'note-edit';
  ta.value = task.note || '';
  ta.placeholder = '补充说明，可粘贴链接';
  view.replaceWith(ta);
  ta.focus();
  ta.setSelectionRange(ta.value.length, ta.value.length);

  let done = false;
  const commit = async (save) => {
    if (done) return;
    done = true;
    if (save && ta.value !== (task.note || '')) {
      await mutate('update', { id: task.id, patch: { note: ta.value } });
    } else {
      render();
    }
  };
  ta.addEventListener('blur', () => commit(true));
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      ta.value = task.note || '';
      ta.blur();
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      ta.blur();
    }
  });
}

function bindListEvents() {
  listEl.addEventListener('click', async (e) => {
    const link = e.target.closest('a.link');
    if (link) {
      e.preventDefault();
      ipc.openExternal(link.dataset.href);
      return;
    }

    const taskEl = e.target.closest('.task');
    if (!taskEl) return;
    const id = taskEl.dataset.id;
    const task = taskById(id);
    if (!task) return;

    const actEl = e.target.closest('[data-act]');
    if (!actEl) return;
    const act = actEl.dataset.act;

    if (act === 'toggle') return mutate('toggleDone', { id });
    if (act === 'star') return mutate('toggleStar', { id });
    if (act === 'expand') {
      if (ui.expanded.has(id)) ui.expanded.delete(id);
      else ui.expanded.add(id);
      render();
      return;
    }
    if (act === 'menu') return openTaskMenu(actEl, task);
    if (act === 'due') return openDuePicker(actEl, task);
    if (act === 'remind') return openRemindPicker(actEl, task);
    if (act === 'clearRemind') return mutate('update', { id, patch: { remindAt: null } });
    if (act === 'note') return enterNoteEdit(taskEl, task);
    if (act === 'subToggle') {
      const subEl = e.target.closest('.sub');
      const sub = task.subtasks.find((s) => s.id === subEl.dataset.sub);
      if (!sub) return;
      return mutate('subtaskUpdate', { taskId: id, subId: sub.id, patch: { done: !sub.done } });
    }
    if (act === 'subDelete') {
      const subEl = e.target.closest('.sub');
      return mutate('subtaskDelete', { taskId: id, subId: subEl.dataset.sub });
    }
  });

  listEl.addEventListener('keydown', async (e) => {
    const title = e.target.closest('.task-title');
    if (title && e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      title.blur();
      return;
    }
    const subTitle = e.target.closest('.sub-title');
    if (subTitle && e.key === 'Enter') {
      e.preventDefault();
      subTitle.blur();
      return;
    }
    const subAdd = e.target.closest('.sub-add');
    if (subAdd && e.key === 'Enter') {
      e.preventDefault();
      const value = subAdd.value.trim();
      if (!value) return;
      const taskEl = subAdd.closest('.task');
      ui.focusSubAdd = taskEl.dataset.id;
      await mutate('subtaskAdd', { taskId: taskEl.dataset.id, title: value });
      const again = listEl.querySelector(`.task[data-id="${taskEl.dataset.id}"] .sub-add`);
      if (again) again.focus();
      return;
    }
    if (subAdd && e.key === 'Escape') subAdd.blur();
  });

  listEl.addEventListener('focusout', async (e) => {
    const el = e.target;
    if (!el || !el.dataset || !el.dataset.edit) return;
    const taskEl = el.closest('.task');
    if (!taskEl) return;
    const task = taskById(taskEl.dataset.id);
    if (!task) return;
    if (el.dataset.edit === 'title') await saveTitle(el, task, false);
    else if (el.dataset.edit === 'subTitle') {
      const subEl = el.closest('.sub');
      await saveTitle(el, task, true, subEl.dataset.sub);
    }
  });

  listEl.addEventListener('paste', (e) => {
    const el = e.target;
    if (el.isContentEditable) {
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData('text');
      document.execCommand('insertText', false, text);
    }
  });
}

/* --------------------------------------------------------------- modals */

function confirmModal({ title, message, okText = '确定', cancelText = '取消', danger = false }) {
  return new Promise((resolve) => {
    const root = document.getElementById('modalRoot');
    const back = document.createElement('div');
    back.className = 'modal-backdrop';
    back.innerHTML = `
      <div class="modal">
        <h3>${esc(title)}</h3>
        <p>${esc(message)}</p>
        <div class="modal-actions">
          <button class="btn" data-x="cancel">${esc(cancelText)}</button>
          <button class="btn ${danger ? 'danger' : 'primary'}" data-x="ok">${esc(okText)}</button>
        </div>
      </div>`;
    root.appendChild(back);
    const close = (val) => {
      back.remove();
      resolve(val);
    };
    back.addEventListener('click', (e) => {
      if (e.target === back) close(false);
      const x = e.target.closest('[data-x]');
      if (!x) return;
      close(x.dataset.x === 'ok');
    });
    back.querySelector('[data-x="ok"]').focus();
  });
}

async function openSettings() {
  const auto = await ipc.getAutoLaunch();
  const root = document.getElementById('modalRoot');
  const back = document.createElement('div');
  back.className = 'modal-backdrop';
  back.innerHTML = `
    <div class="modal" style="width:420px">
      <h3>设置</h3>
      <div class="setting-row">
        <div><div>开机自动启动</div><div class="desc">启动后静默进托盘，到点照常提醒</div></div>
        <button class="switch ${auto ? 'on' : ''}" data-x="auto"></button>
      </div>
      <div class="setting-row">
        <div><div>自动备份</div><div class="desc">每次修改都会另存一份到「文档\\WorkPlan备份」，数据目录被删也能找回</div></div>
        <button class="mini-btn" data-x="backup">打开备份目录</button>
      </div>
      <div class="setting-row">
        <div><div>关闭窗口</div><div class="desc">收进系统托盘，提醒继续在后台运行</div></div>
      </div>
      <div class="setting-row">
        <div><div>提醒声音</div><div class="desc">已关闭，不会发出任何提示音</div></div>
      </div>
      <div class="modal-actions">
        <button class="btn primary" data-x="close">关闭</button>
      </div>
    </div>`;
  root.appendChild(back);
  back.addEventListener('click', async (e) => {
    if (e.target === back) return back.remove();
    const sw = e.target.closest('[data-x="auto"]');
    if (sw) {
      const next = !sw.classList.contains('on');
      const real = await ipc.setAutoLaunch(next);
      sw.classList.toggle('on', !!real);
      return;
    }
    const bk = e.target.closest('[data-x="backup"]');
    if (bk) {
      await ipc.openBackupDir();
      return;
    }
    if (e.target.closest('[data-x="close"]')) back.remove();
  });
}

/* ------------------------------------------------------------ quick add */

function qaPickDue() {
  openPopover(
    qaDue,
    datePickerNode({
      title: '截止时间',
      value: ui.qa.due,
      allowClear: false,
      onConfirm: (v) => {
        ui.qa.due = v;
        updateQuickAddLabels();
        qaDue.classList.remove('invalid');
      },
    })
  );
}

function qaPickCats() {
  const wrap = document.createElement('div');
  const selected = new Set(ui.qa.cats);
  const groupsHtml = state.groups
    .map((g) => {
      const cats = state.categories.filter((c) => c.group === g.id);
      if (!cats.length) return '';
      const btns = cats
        .map(
          (c) =>
            `<button type="button" data-c="${c.id}" style="--c:${c.color}" class="${selected.has(c.id) ? 'on' : ''}"><span class="dot"></span>${esc(c.name)}</button>`
        )
        .join('');
      return `<div class="pop-cat-group"><div class="gn">${esc(g.name)}</div><div class="cat-opt">${btns}</div></div>`;
    })
    .join('');
  wrap.innerHTML = `
    <div class="pop-title"><span>分类（最多 3 个）</span><span data-count>${selected.size}/3</span></div>
    <div class="pop-cats">${groupsHtml}</div>
    <div class="pop-actions"><button class="btn primary" type="button" data-x="ok">完成</button></div>`;

  wrap.addEventListener('click', (e) => {
    if (e.target.closest('[data-x]')) return closePopover();
    const btn = e.target.closest('[data-c]');
    if (!btn) return;
    const id = btn.dataset.c;
    if (selected.has(id)) {
      if (selected.size <= 1) {
        toast('至少保留一个分类');
        return;
      }
      selected.delete(id);
      btn.classList.remove('on');
    } else {
      if (selected.size >= 3) return toast('最多选择 3 个分类');
      selected.add(id);
      btn.classList.add('on');
    }
    wrap.querySelector('[data-count]').textContent = `${selected.size}/3`;
    ui.qa.cats = Array.from(selected);
    updateQuickAddLabels();
  });

  openPopover(qaCats, wrap, { width: 330 });
}

function qaPickRemind() {
  openPopover(
    qaRemind,
    datePickerNode({
      title: '提醒时间（可留空）',
      value: ui.qa.remind,
      allowClear: true,
      onConfirm: (v) => {
        ui.qa.remind = v;
        if (new Date(v).getTime() < Date.now()) toast('该时间已过，将立即提醒');
        updateQuickAddLabels();
      },
      onClear: () => {
        ui.qa.remind = null;
        updateQuickAddLabels();
      },
    })
  );
}

async function submitQuickAdd() {
  const title = qaTitle.value.trim();
  if (!title) {
    toast('请输入任务标题');
    qaTitle.focus();
    return;
  }
  if (!ui.qa.due) {
    toast('请先设置截止时间');
    qaDue.classList.add('invalid');
    qaPickDue();
    return;
  }
  const autoMisc = !ui.qa.cats.length;
  const categoryIds = autoMisc ? ['misc'] : ui.qa.cats;

  const res = await mutate('create', {
    title,
    dueAt: ui.qa.due,
    remindAt: ui.qa.remind,
    categoryIds,
  });
  if (res.error) return;

  if (autoMisc) toast('未选分类，已归到「其他/杂项」');

  qaTitle.value = '';
  ui.qa.due = null;
  ui.qa.remind = null;
  ui.qa.cats = [];
  updateQuickAddLabels();
  qaTitle.focus();
}

/* ----------------------------------------------------------------- init */

function applyState(s) {
  state.tasks = s.tasks || [];
  state.categories = s.categories || [];
  state.groups = s.groups || [];
  state.settings = s.settings || {};
  catMap.clear();
  for (const c of state.categories) catMap.set(c.id, c);
}

function bindUI() {
  navEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-view]');
    if (!btn) return;
    ui.view = btn.dataset.view;
    render();
  });

  catListEl.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-cat]');
    if (!chip) return;
    ui.category = ui.category === chip.dataset.cat ? null : chip.dataset.cat;
    render();
  });

  tabsEl.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-tab]');
    if (!tab) return;
    ui.statusTab = tab.dataset.tab;
    render();
  });

  searchInput.addEventListener('input', () => {
    ui.query = searchInput.value.trim();
    renderList();
    renderStatbar();
  });

  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      searchInput.value = '';
      ui.query = '';
      render();
      searchInput.blur();
    }
  });

  qaTitle.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submitQuickAdd();
    }
  });
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
      e.preventDefault();
      qaTitle.focus();
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      searchInput.focus();
      searchInput.select();
    }
  });

  qaDue.addEventListener('click', qaPickDue);
  qaCats.addEventListener('click', qaPickCats);
  qaRemind.addEventListener('click', qaPickRemind);
  $('#qaAdd').addEventListener('click', submitQuickAdd);
  $('#btnSettings').addEventListener('click', openSettings);

  bindListEvents();
}

(async function init() {
  const s = await ipc.getState();
  applyState(s);
  bindUI();
  render();

  ipc.onState((next) => {
    applyState(next);
    render();
  });

  ipc.onNavigate((payload) => {
    if (payload && payload.view) {
      ui.view = payload.view;
      render();
    }
  });

  window.addEventListener('focus', () => {
    renderStatbar();
    renderList();
  });

  setInterval(() => {
    const ae = document.activeElement;
    const busy =
      ae &&
      (ae.tagName === 'INPUT' ||
        ae.tagName === 'TEXTAREA' ||
        ae.isContentEditable ||
        popoverEl ||
        document.querySelector('.modal-backdrop'));
    if (!busy) {
      renderStatbar();
      renderNav();
      renderList();
    }
  }, 60000);
})();
