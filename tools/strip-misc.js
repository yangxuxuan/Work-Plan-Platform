'use strict';

// 去掉「其他/杂项」兜底标签：只要该任务还有别的分类，就删掉 misc
const fs = require('fs');
const path = require('path');

const file = path.join(process.env.APPDATA, 'WorkPlan', 'data.json');
const data = JSON.parse(fs.readFileSync(file, 'utf8'));

let changed = 0;
for (const t of data.tasks) {
  if (t.categoryIds.length > 1 && t.categoryIds.includes('misc')) {
    t.categoryIds = t.categoryIds.filter((id) => id !== 'misc');
    changed += 1;
  }
}

fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
console.log(`cleaned ${changed} tasks`);
for (const t of data.tasks) console.log(`  ${t.title} -> ${t.categoryIds.join(',')}`);
