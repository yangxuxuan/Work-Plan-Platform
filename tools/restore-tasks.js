'use strict';

// 按 16:27 截图重建被误删的 6 条任务
const fs = require('fs');
const path = require('path');

const dir = path.join(process.env.APPDATA, 'WorkPlan');
fs.mkdirSync(dir, { recursive: true });

const now = new Date().toISOString();

const tasks = [
  {
    id: 't_restore_1',
    title: '发布比赛事宜',
    note: '',
    dueAt: '2026-10-30T18:00',
    remindAt: '2026-10-30T17:45',
    remindFiredAt: null,
    categoryIds: ['misc', 'sports'],
    subtasks: [],
    starred: true,
    done: false,
    doneAt: null,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 't_restore_2',
    title: '英语六级听力一篇',
    note: '',
    dueAt: '2026-10-30T23:59',
    remindAt: null,
    remindFiredAt: null,
    categoryIds: ['misc', 'selfstudy'],
    subtasks: [],
    starred: true,
    done: false,
    doneAt: null,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 't_restore_3',
    title: '线性代数16年期中试卷',
    note: '',
    dueAt: '2026-10-30T23:59',
    remindAt: null,
    remindFiredAt: null,
    categoryIds: ['misc', 'review', 'exam'],
    subtasks: [],
    starred: true,
    done: false,
    doneAt: null,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 't_restore_4',
    title: '数据库系统概论第11次作业',
    note: '',
    dueAt: '2026-11-01T23:59',
    remindAt: null,
    remindFiredAt: null,
    categoryIds: ['misc', 'homework'],
    subtasks: [],
    starred: false,
    done: false,
    doneAt: null,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 't_restore_5',
    title: '计算系统基础作业5',
    note: '',
    dueAt: '2026-11-03T23:59',
    remindAt: null,
    remindFiredAt: null,
    categoryIds: ['misc', 'homework'],
    subtasks: [],
    starred: false,
    done: false,
    doneAt: null,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 't_restore_6',
    title: '人工智能导论作业3',
    note: '',
    dueAt: '2026-11-15T23:59',
    remindAt: null,
    remindFiredAt: null,
    categoryIds: ['misc', 'homework', 'lab'],
    subtasks: [],
    starred: false,
    done: false,
    doneAt: null,
    createdAt: now,
    updatedAt: now,
  },
];

const data = {
  version: 1,
  settings: { autoLaunch: true },
  meta: { lastBackupDay: '' },
  tasks,
};

fs.writeFileSync(path.join(dir, 'data.json'), JSON.stringify(data, null, 2), 'utf8');
console.log('restored', tasks.length, 'tasks ->', path.join(dir, 'data.json'));
