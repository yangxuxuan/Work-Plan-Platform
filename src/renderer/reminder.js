'use strict';

const ipc = window.api;
const stack = document.getElementById('stack');

let catMap = new Map();

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function cardHtml(item) {
  const chips = (item.categoryIds || [])
    .map((id) => {
      const c = catMap.get(id) || { name: id, color: '#888' };
      return `<span class="chip" style="--c:${c.color}"><span class="dot"></span>${esc(c.name)}</span>`;
    })
    .join('');

  const missed = item.missed ? '<span class="tag-missed">错过的提醒</span>' : '';
  const note = (item.note || '').replace(/\s+/g, ' ').slice(0, 80);

  return `
  <div class="card" data-id="${item.id}">
    <div class="card-top">${chips}${missed}</div>
    <div class="title">${esc(item.title)}</div>
    <div class="meta"><span>截止 <b>${esc(item.dueText)}</b></span></div>
    ${note ? `<div class="note">${esc(note)}</div>` : ''}
    <div class="actions">
      <button class="btn" data-act="snooze">稍后提醒</button>
      <button class="btn primary" data-act="ack">知道了</button>
    </div>
    <div class="snooze-box" hidden>
      <button class="btn" data-min="5">5 分钟</button>
      <button class="btn" data-min="10">10 分钟</button>
      <button class="btn" data-min="30">30 分钟</button>
      <input type="number" min="1" max="1440" placeholder="分钟" data-custom>
      <button class="btn" data-act="custom">确定</button>
    </div>
  </div>`;
}

function resizeToContent() {
  const cards = Array.from(stack.querySelectorAll('.card'));
  let h = 20;
  for (const c of cards) h += c.offsetHeight;
  h += Math.max(0, cards.length - 1) * 9;
  ipc.resizeReminder(Math.ceil(h) + 2);
}

function render(list) {
  if (!list.length) {
    stack.innerHTML = '';
    ipc.resizeReminder(80);
    return;
  }
  stack.innerHTML = list.map(cardHtml).join('');
  requestAnimationFrame(() => {
    stack.scrollTop = stack.scrollHeight;
    resizeToContent();
    setTimeout(resizeToContent, 30);
  });
}

stack.addEventListener('click', async (e) => {
  const card = e.target.closest('.card');
  if (!card) return;
  const id = card.dataset.id;

  const snoozeBtn = e.target.closest('[data-act="snooze"]');
  if (snoozeBtn) {
    const box = card.querySelector('.snooze-box');
    box.hidden = !box.hidden;
    if (!box.hidden) {
      const input = box.querySelector('[data-custom]');
      if (input) setTimeout(() => input.focus(), 0);
    }
    setTimeout(resizeToContent, 20);
    return;
  }

  if (e.target.closest('[data-act="ack"]')) {
    await ipc.ackReminder(id);
    return;
  }

  const minBtn = e.target.closest('[data-min]');
  if (minBtn) {
    await ipc.snoozeReminder(id, Number(minBtn.dataset.min));
    return;
  }

  if (e.target.closest('[data-act="custom"]')) {
    const input = card.querySelector('[data-custom]');
    const v = Math.round(Number(input.value));
    if (!v || v < 1 || v > 1440) {
      input.style.borderColor = '#ff4d4f';
      return;
    }
    await ipc.snoozeReminder(id, v);
  }
});

stack.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const input = e.target.closest('[data-custom]');
  if (!input) return;
  const card = input.closest('.card');
  const v = Math.round(Number(input.value));
  if (!v || v < 1 || v > 1440) {
    input.style.borderColor = '#ff4d4f';
    return;
  }
  ipc.snoozeReminder(card.dataset.id, v);
});

ipc.onReminders(({ list, categories }) => {
  catMap = new Map((categories || []).map((c) => [c.id, c]));
  render(list);
});

// 页面就绪后主动拉一次，避免主进程在 load 完成前推送造成丢消息
ipc
  .getReminders()
  .then((data) => {
    catMap = new Map((data.categories || []).map((c) => [c.id, c]));
    render(data.list || []);
  })
  .catch((err) => console.error('getReminders failed', err));
