'use strict';

// 分类由开发者维护；任务只存 id，改 name 历史任务自动跟随。
const CATEGORY_GROUPS = [
  { id: 'study', name: '学业' },
  { id: 'affair', name: '事务' },
  { id: 'life', name: '生活' },
  { id: 'contest', name: '竞赛' },
  { id: 'welfare', name: '公益' },
  { id: 'misc', name: '其他' },
];

const CATEGORIES = [
  { id: 'course', name: '课程', group: 'study', color: '#7C9CF5' },
  { id: 'homework', name: '作业', group: 'study', color: '#6FA8F0' },
  { id: 'review', name: '复习', group: 'study', color: '#5FB8D9' },
  { id: 'exam', name: '考试', group: 'study', color: '#4FC0B0' },
  { id: 'lab', name: '实验', group: 'study', color: '#5BC49A' },
  { id: 'lecture', name: '讲座', group: 'study', color: '#7CC97A' },
  { id: 'report', name: '报告', group: 'study', color: '#A5CF6B' },
  { id: 'thesis', name: '论文/毕设', group: 'study', color: '#C9C85E' },
  { id: 'project', name: '小组项目', group: 'study', color: '#D9B85C' },
  { id: 'defense', name: '答辩', group: 'study', color: '#E0A25C' },
  { id: 'research', name: '科研', group: 'study', color: '#D98E6E' },
  { id: 'selfstudy', name: '自学', group: 'study', color: '#D97E7E' },
  { id: 'meeting', name: '会议/例会', group: 'affair', color: '#D97AA8' },
  { id: 'club', name: '社团/学生工作', group: 'affair', color: '#C87AC4' },
  { id: 'career', name: '实习/求职', group: 'affair', color: '#AE7CD9' },
  { id: 'payment', name: '缴费', group: 'affair', color: '#907CD9' },
  { id: 'medical', name: '就医', group: 'affair', color: '#7C86D9' },
  { id: 'sports', name: '运动', group: 'life', color: '#7C97D9' },
  { id: 'shopping', name: '购物', group: 'life', color: '#6E9BC9' },
  { id: 'social', name: '聚餐/社交', group: 'life', color: '#76AEC0' },
  { id: 'travel', name: '出行', group: 'life', color: '#86B59A' },
  { id: 'fun', name: '娱乐', group: 'life', color: '#9CB08A' },
  { id: 'contest', name: '竞赛', group: 'contest', color: '#D4A017' },
  { id: 'volunteer', name: '公益', group: 'welfare', color: '#4FA3A3' },
  { id: 'misc', name: '其他/杂项', group: 'misc', color: '#8A8A8A' },
];

const CATEGORY_MAP = new Map(CATEGORIES.map((c) => [c.id, c]));

module.exports = { CATEGORY_GROUPS, CATEGORIES, CATEGORY_MAP };
