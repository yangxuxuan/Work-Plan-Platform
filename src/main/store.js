'use strict';

const fs = require('fs');
const path = require('path');
const { CATEGORIES } = require('./categories');

const VALID_CATEGORY_IDS = new Set(CATEGORIES.map((c) => c.id));
const DT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

function pad(n) {
  return String(n).padStart(2, '0');
}

function toLocalDT(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function nowLocal() {
  return toLocalDT(new Date());
}

function isValidDT(value) {
  if (typeof value !== 'string' || !DT_RE.test(value)) return false;
  const d = new Date(value);
  return !Number.isNaN(d.getTime()) && toLocalDT(d) === value;
}

function newId(prefix) {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function normalizeCategoryIds(input) {
  if (!Array.isArray(input)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of input) {
    const id = String(raw);
    if (VALID_CATEGORY_IDS.has(id) && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

class Store {
  constructor(dir, backupRoot) {
    this.dir = dir;
    this.file = path.join(dir, 'data.json');
    this.backupDir = path.join(dir, 'backups');
    this.backupRoot = backupRoot || null;
    this.lastSnapshot = 0;
    this.data = this.load();
  }

  defaultData() {
    return {
      version: 1,
      settings: { autoLaunch: true },
      meta: { lastBackupDay: '' },
      tasks: [],
    };
  }

  load() {
    fs.mkdirSync(this.dir, { recursive: true });
    let raw = null;
    try {
      raw = fs.readFileSync(this.file, 'utf8');
    } catch {
      return this.defaultData();
    }
    try {
      const parsed = JSON.parse(raw);
      return this.migrate(parsed);
    } catch {
      // 主文件损坏：备份坏文件，尝试最近备份
      try {
        fs.renameSync(this.file, this.file + '.corrupt-' + Date.now());
      } catch {}
      const recovered = this.recoverFromBackup();
      return recovered || this.defaultData();
    }
  }

  recoverFromBackup() {
    try {
      if (!fs.existsSync(this.backupDir)) return null;
      const files = fs
        .readdirSync(this.backupDir)
        .filter((f) => f.endsWith('.json'))
        .sort()
        .reverse();
      for (const f of files) {
        try {
          const parsed = JSON.parse(fs.readFileSync(path.join(this.backupDir, f), 'utf8'));
          return this.migrate(parsed);
        } catch {}
      }
    } catch {}
    return null;
  }

  migrate(data) {
    const base = this.defaultData();
    const out = {
      version: 1,
      settings: Object.assign({}, base.settings, data.settings || {}),
      meta: Object.assign({}, base.meta, data.meta || {}),
      tasks: Array.isArray(data.tasks) ? data.tasks : [],
    };
    out.tasks = out.tasks
      .filter((t) => t && typeof t === 'object' && t.id)
      .map((t) => ({
        id: String(t.id),
        title: String(t.title || '').slice(0, 200),
        note: String(t.note || ''),
        dueAt: isValidDT(t.dueAt) ? t.dueAt : nowLocal(),
        remindAt: isValidDT(t.remindAt) ? t.remindAt : null,
        remindFiredAt: t.remindFiredAt || null,
        categoryIds: normalizeCategoryIds(t.categoryIds).slice(0, 3),
        subtasks: Array.isArray(t.subtasks)
          ? t.subtasks
              .filter((s) => s && s.id)
              .map((s) => ({
                id: String(s.id),
                title: String(s.title || '').slice(0, 200),
                done: !!s.done,
                doneAt: s.doneAt || null,
              }))
          : [],
        starred: !!t.starred,
        done: !!t.done,
        doneAt: t.doneAt || null,
        createdAt: t.createdAt || new Date().toISOString(),
        updatedAt: t.updatedAt || new Date().toISOString(),
      }));
    return out;
  }

  save() {
    fs.mkdirSync(this.dir, { recursive: true });
    const today = toLocalDT(new Date()).slice(0, 10);
    try {
      fs.mkdirSync(this.backupDir, { recursive: true });
      const backupFile = path.join(this.backupDir, `data-${today}.json`);
      if (!fs.existsSync(backupFile) && fs.existsSync(this.file)) {
        fs.copyFileSync(this.file, backupFile);
        this.pruneBackups();
      }
      this.data.meta.lastBackupDay = today;
    } catch {}

    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8');
    try {
      fs.renameSync(tmp, this.file);
    } catch {
      fs.copyFileSync(tmp, this.file);
      try {
        fs.unlinkSync(tmp);
      } catch {}
    }

    this.mirror();
  }

  /** 在数据目录之外再留一份，防止整个 userData 被删 / 损坏 */
  mirror(force) {
    if (!this.backupRoot) return;
    try {
      fs.mkdirSync(this.backupRoot, { recursive: true });
      const payload = JSON.stringify(this.data, null, 2);

      const latest = path.join(this.backupRoot, 'data-latest.json');
      const tmp = latest + '.tmp';
      fs.writeFileSync(tmp, payload, 'utf8');
      fs.renameSync(tmp, latest);

      const now = Date.now();
      if (force || now - this.lastSnapshot > 10 * 60 * 1000) {
        const d = new Date();
        const name = `data-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(
          d.getHours()
        )}${pad(d.getMinutes())}.json`;
        fs.writeFileSync(path.join(this.backupRoot, name), payload, 'utf8');
        this.lastSnapshot = now;
        this.pruneMirror();
      }
    } catch {}
  }

  pruneMirror() {
    try {
      const files = fs
        .readdirSync(this.backupRoot)
        .filter((f) => /^data-\d{8}-\d{4}\.json$/.test(f))
        .sort()
        .reverse();
      for (const f of files.slice(40)) {
        try {
          fs.unlinkSync(path.join(this.backupRoot, f));
        } catch {}
      }
    } catch {}
  }

  pruneBackups() {
    try {
      const files = fs
        .readdirSync(this.backupDir)
        .filter((f) => /^data-\d{4}-\d{2}-\d{2}\.json$/.test(f))
        .sort()
        .reverse();
      for (const f of files.slice(7)) {
        try {
          fs.unlinkSync(path.join(this.backupDir, f));
        } catch {}
      }
    } catch {}
  }

  getTask(id) {
    return this.data.tasks.find((t) => t.id === id) || null;
  }

  serialize() {
    return {
      tasks: this.data.tasks,
      settings: this.data.settings,
    };
  }

  create(input) {
    const title = String(input.title || '').trim();
    if (!title) return { error: '标题不能为空' };
    if (title.length > 200) return { error: '标题最多 200 字' };
    if (!isValidDT(input.dueAt)) return { error: '请先设置截止时间' };

    const categoryIds = normalizeCategoryIds(input.categoryIds);
    if (categoryIds.length === 0) return { error: '请至少选择一个分类' };
    if (categoryIds.length > 3) return { error: '最多选择 3 个分类' };

    let remindAt = null;
    if (input.remindAt) {
      if (!isValidDT(input.remindAt)) return { error: '提醒时间格式不对' };
      remindAt = input.remindAt;
    }

    const now = new Date().toISOString();
    const task = {
      id: newId('t'),
      title,
      note: String(input.note || ''),
      dueAt: input.dueAt,
      remindAt,
      remindFiredAt: null,
      categoryIds,
      subtasks: [],
      starred: !!input.starred,
      done: false,
      doneAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.data.tasks.push(task);
    this.save();
    return { task };
  }

  update(id, patch) {
    const task = this.getTask(id);
    if (!task) return { error: '任务不存在' };

    if (patch.title !== undefined) {
      const title = String(patch.title).trim();
      if (!title) return { error: '标题不能为空' };
      if (title.length > 200) return { error: '标题最多 200 字' };
      task.title = title;
    }
    if (patch.note !== undefined) task.note = String(patch.note);
    if (patch.dueAt !== undefined) {
      if (!isValidDT(patch.dueAt)) return { error: '截止时间不能为空' };
      task.dueAt = patch.dueAt;
    }
    if (patch.remindAt !== undefined) {
      if (patch.remindAt === null || patch.remindAt === '') {
        task.remindAt = null;
        task.remindFiredAt = null;
      } else {
        if (!isValidDT(patch.remindAt)) return { error: '提醒时间格式不对' };
        if (task.remindAt !== patch.remindAt) task.remindFiredAt = null;
        task.remindAt = patch.remindAt;
      }
    }
    if (patch.categoryIds !== undefined) {
      const ids = normalizeCategoryIds(patch.categoryIds);
      if (ids.length === 0) return { error: '请至少保留一个分类' };
      if (ids.length > 3) return { error: '最多选择 3 个分类' };
      task.categoryIds = ids;
    }
    if (patch.starred !== undefined) task.starred = !!patch.starred;
    if (patch.done !== undefined) {
      task.done = !!patch.done;
      task.doneAt = task.done ? new Date().toISOString() : null;
    }
    task.updatedAt = new Date().toISOString();
    this.save();
    return { task };
  }

  remove(id) {
    const idx = this.data.tasks.findIndex((t) => t.id === id);
    if (idx < 0) return { error: '任务不存在' };
    this.data.tasks.splice(idx, 1);
    this.save();
    return { ok: true };
  }

  toggleDone(id) {
    const task = this.getTask(id);
    if (!task) return { error: '任务不存在' };
    return this.update(id, { done: !task.done });
  }

  toggleStar(id) {
    const task = this.getTask(id);
    if (!task) return { error: '任务不存在' };
    return this.update(id, { starred: !task.starred });
  }

  addSubtask(taskId, title) {
    const task = this.getTask(taskId);
    if (!task) return { error: '任务不存在' };
    const text = String(title || '').trim();
    if (!text) return { error: '子任务不能为空' };
    task.subtasks.push({ id: newId('s'), title: text.slice(0, 200), done: false, doneAt: null });
    task.updatedAt = new Date().toISOString();
    this.save();
    return { task };
  }

  updateSubtask(taskId, subId, patch) {
    const task = this.getTask(taskId);
    if (!task) return { error: '任务不存在' };
    const sub = task.subtasks.find((s) => s.id === subId);
    if (!sub) return { error: '子任务不存在' };
    if (patch.title !== undefined) {
      const text = String(patch.title).trim();
      if (!text) return { error: '子任务不能为空' };
      sub.title = text.slice(0, 200);
    }
    if (patch.done !== undefined) {
      sub.done = !!patch.done;
      sub.doneAt = sub.done ? new Date().toISOString() : null;
    }
    task.updatedAt = new Date().toISOString();
    this.save();
    return { task };
  }

  removeSubtask(taskId, subId) {
    const task = this.getTask(taskId);
    if (!task) return { error: '任务不存在' };
    const idx = task.subtasks.findIndex((s) => s.id === subId);
    if (idx < 0) return { error: '子任务不存在' };
    task.subtasks.splice(idx, 1);
    task.updatedAt = new Date().toISOString();
    this.save();
    return { task };
  }

  updateSettings(patch) {
    Object.assign(this.data.settings, patch || {});
    this.save();
    return { settings: this.data.settings };
  }

  markFired(id) {
    const task = this.getTask(id);
    if (!task) return;
    task.remindFiredAt = new Date().toISOString();
    task.updatedAt = task.remindFiredAt;
    this.save();
  }

  snooze(id, minutes) {
    const task = this.getTask(id);
    if (!task) return { error: '任务不存在' };
    const base = new Date();
    base.setMinutes(base.getMinutes() + minutes);
    task.remindAt = toLocalDT(base);
    task.remindFiredAt = null;
    task.updatedAt = new Date().toISOString();
    this.save();
    return { task };
  }
}

module.exports = { Store, toLocalDT, nowLocal, isValidDT };
