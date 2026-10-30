'use strict';

// 仅用于开发期自检：向 userData 写入一批演示任务
const fs = require('fs');
const path = require('path');

const dir = path.join(process.env.APPDATA || '.', 'WorkPlan');
fs.mkdirSync(dir, { recursive: true });

const pad = (n) => String(n).padStart(2, '0');
const dt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const now = new Date();

function at(dayOffset, h, m) {
  const d = new Date(now);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(h, m, 0, 0);
  return dt(d);
}

function minsAgo(min) {
  const d = new Date(now.getTime() - min * 60000);
  return dt(d);
}

const tasks = [
  {
    id: 't_demo_1',
    title: '概率论第八周作业',
    note: '第二章习题 3、5、7，交之前对一下答案',
    dueAt: at(1, 18, 0),
    remindAt: null,
    remindFiredAt: null,
    categoryIds: ['homework', 'course'],
    subtasks: [],
    starred: true,
    done: false,
    doneAt: null,
    createdAt: new Date(now.getTime() - 86400000 * 2).toISOString(),
    updatedAt: now.toISOString(),
  },
  {
    id: 't_demo_2',
    title: '离散数学 II homework 5',
    note: '集合基数、数论、归纳递归',
    dueAt: at(0, 23, 59),
    remindAt: null,
    remindFiredAt: null,
    categoryIds: ['homework'],
    subtasks: [
      { id: 's1', title: '第一题 集合基数', done: true, doneAt: now.toISOString() },
      { id: 's2', title: '第二题 数论', done: true, doneAt: now.toISOString() },
      { id: 's3', title: '第三题 归纳递归', done: false, doneAt: null },
    ],
    starred: false,
    done: false,
    doneAt: null,
    createdAt: new Date(now.getTime() - 86400000).toISOString(),
    updatedAt: now.toISOString(),
  },
  {
    id: 't_demo_3',
    title: '高级程序设计作业 6',
    note: '提交 PDF，建议 Markdown 编辑，代码放入代码框',
    dueAt: at(-1, 18, 0),
    remindAt: null,
    remindFiredAt: null,
    categoryIds: ['homework', 'course'],
    subtasks: [],
    starred: false,
    done: false,
    doneAt: null,
    createdAt: new Date(now.getTime() - 86400000 * 3).toISOString(),
    updatedAt: now.toISOString(),
  },
  {
    id: 't_demo_4',
    title: 'ICS PA2-1 实验报告',
    note: '提交实验报告，附运行截图 https://example.com/pa2',
    dueAt: at(3, 23, 0),
    remindAt: minsAgo(0),
    remindFiredAt: null,
    categoryIds: ['lab', 'report'],
    subtasks: [],
    starred: false,
    done: false,
    doneAt: null,
    createdAt: new Date(now.getTime() - 86400000).toISOString(),
    updatedAt: now.toISOString(),
  },
  {
    id: 't_demo_5',
    title: '数据结构 OJ 第一次竞赛',
    note: '',
    dueAt: at(5, 18, 30),
    remindAt: null,
    remindFiredAt: null,
    categoryIds: ['contest'],
    subtasks: [],
    starred: false,
    done: true,
    doneAt: now.toISOString(),
    createdAt: new Date(now.getTime() - 86400000 * 4).toISOString(),
    updatedAt: now.toISOString(),
  },
  {
    id: 't_demo_6',
    title: '课题组例会',
    note: '带上本周进展的三个要点',
    dueAt: at(2, 14, 0),
    remindAt: null,
    remindFiredAt: null,
    categoryIds: ['meeting'],
    subtasks: [],
    starred: true,
    done: false,
    doneAt: null,
    createdAt: new Date(now.getTime() - 86400000).toISOString(),
    updatedAt: now.toISOString(),
  },
];

const data = {
  version: 1,
  settings: { autoLaunch: false, lastCategoryIds: ['homework', 'course'] },
  meta: { lastBackupDay: '' },
  tasks,
};

fs.writeFileSync(path.join(dir, 'data.json'), JSON.stringify(data, null, 2), 'utf8');
console.log('seeded', path.join(dir, 'data.json'), tasks.length, 'tasks');
