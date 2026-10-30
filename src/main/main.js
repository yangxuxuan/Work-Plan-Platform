'use strict';

const path = require('path');
const fs = require('fs');
const {
  app,
  BrowserWindow,
  ipcMain,
  Tray,
  Menu,
  Notification,
  nativeImage,
  screen,
  shell,
} = require('electron');

const { Store, toLocalDT } = require('./store');
const { CATEGORIES, CATEGORY_GROUPS } = require('./categories');

const APP_ID = 'com.workplan.desktop';
const ASSETS = path.join(__dirname, '..', '..', 'assets');
const REMINDER_WIDTH = 380;

app.setName('WorkPlan');

const shotArg = process.argv.find((a) => a.startsWith('--screenshot='));

let store = null;
let mainWindow = null;
let reminderWin = null;
let tray = null;
let trayOk = false;
let isQuitting = false;
let tickTimer = null;

/** taskId -> { missed: boolean, firedAt: string } */
const activeReminders = new Map();

const iconPath = (name) => {
  const p = path.join(ASSETS, name);
  return fs.existsSync(p) ? p : undefined;
};

function pad(n) {
  return String(n).padStart(2, '0');
}

function fmtDT(dt) {
  if (!dt) return '';
  const d = new Date(dt);
  if (Number.isNaN(d.getTime())) return dt;
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function buildState() {
  return {
    tasks: store.data.tasks,
    categories: CATEGORIES,
    groups: CATEGORY_GROUPS,
    settings: store.data.settings,
  };
}

function broadcastState() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('state:changed', buildState());
  }
}

/* ------------------------------------------------------------------ */
/* 主窗口                                                              */
/* ------------------------------------------------------------------ */

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 940,
    minHeight: 620,
    backgroundColor: '#0E0E10',
    show: false,
    title: '待办',
    icon: iconPath('icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    if (!process.argv.includes('--hidden')) mainWindow.show();
  });

  mainWindow.on('close', (e) => {
    if (!isQuitting && trayOk) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function showMainWindow() {
  if (!mainWindow) {
    createMainWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

/* ------------------------------------------------------------------ */
/* 提醒弹窗                                                            */
/* ------------------------------------------------------------------ */

function ensureReminderWindow() {
  if (reminderWin && !reminderWin.isDestroyed()) return reminderWin;

  reminderWin = new BrowserWindow({
    width: REMINDER_WIDTH,
    height: 200,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    focusable: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  reminderWin.setAlwaysOnTop(true, 'screen-saver');
  reminderWin.setVisibleOnAllWorkspaces(true);
  reminderWin.loadFile(path.join(__dirname, '..', 'renderer', 'reminder.html'));

  reminderWin.on('closed', () => {
    reminderWin = null;
  });

  return reminderWin;
}

function positionReminderWindow(height) {
  if (!reminderWin || reminderWin.isDestroyed()) return;
  const display = screen.getPrimaryDisplay();
  const wa = display.workArea;
  const margin = 12;
  const maxH = Math.round(wa.height * 0.7);
  const h = Math.max(80, Math.min(height, maxH));
  const w = REMINDER_WIDTH;
  const x = wa.x + wa.width - w - margin;
  const y = wa.y + wa.height - h - margin;
  reminderWin.setBounds({ x, y, width: w, height: h });
}

function currentReminderList() {
  const list = [];
  for (const [id, info] of Array.from(activeReminders.entries())) {
    const t = store.getTask(id);
    if (!t || t.done) {
      activeReminders.delete(id);
      continue;
    }
    list.push({
      id: t.id,
      title: t.title,
      note: t.note,
      dueAt: t.dueAt,
      remindAt: t.remindAt,
      dueText: fmtDT(t.dueAt),
      categoryIds: t.categoryIds,
      missed: !!info.missed,
    });
  }
  return list;
}

function refreshReminderWindow() {
  const list = currentReminderList();
  console.log('[reminder] refresh, count =', list.length);
  if (list.length === 0) {
    if (reminderWin && !reminderWin.isDestroyed()) {
      reminderWin.webContents.send('reminders:update', { list: [], categories: CATEGORIES });
      reminderWin.hide();
    }
    return;
  }
  const win = ensureReminderWindow();
  const send = () => {
    console.log('[reminder] sending to renderer');
    win.webContents.send('reminders:update', {
      list,
      categories: CATEGORIES,
    });
    win.showInactive();
  };
  if (win.webContents.isLoading()) {
    win.webContents.once('did-finish-load', send);
  } else {
    send();
  }
  updateTrayState();
}

function notifySystem(task, missed) {
  if (!Notification.isSupported()) return;
  try {
    const n = new Notification({
      title: (missed ? '错过的提醒 · ' : '待办提醒 · ') + task.title,
      body: `${fmtDT(task.dueAt)} 截止${task.note ? '　' + task.note.slice(0, 40) : ''}`,
      silent: true,
      icon: iconPath('icon.png'),
      timeoutType: 'never',
    });
    n.on('click', () => showMainWindow());
    n.show();
  } catch (err) {
    console.error('notification failed', err);
  }
}

/* ------------------------------------------------------------------ */
/* 调度器                                                              */
/* ------------------------------------------------------------------ */

function tick() {
  const now = new Date();
  let changed = false;

  for (const task of store.data.tasks) {
    if (!task.remindAt || task.remindFiredAt) continue;
    const at = new Date(task.remindAt);
    if (Number.isNaN(at.getTime()) || at > now) continue;

    // 已完成的任务到点静默作废，避免事后取消完成时突然补弹
    if (task.done) {
      store.markFired(task.id);
      changed = true;
      continue;
    }

    const missed = now.getTime() - at.getTime() > 90 * 1000;
    activeReminders.set(task.id, { missed, firedAt: new Date().toISOString() });
    store.markFired(task.id);
    notifySystem(task, missed);
    changed = true;
  }

  if (changed) {
    refreshReminderWindow();
    broadcastState();
  }
  updateTrayState();
}

function startScheduler() {
  tick();
  tickTimer = setInterval(tick, 20000);
}

/* ------------------------------------------------------------------ */
/* 托盘                                                                */
/* ------------------------------------------------------------------ */

function overdueCount() {
  const now = new Date();
  return store.data.tasks.filter((t) => !t.done && new Date(t.dueAt) < now).length;
}

function trayMenu() {
  const login = app.getLoginItemSettings();
  return Menu.buildFromTemplate([
    { label: '打开待办', click: () => showMainWindow() },
    {
      label: `逾期任务 (${overdueCount()})`,
      click: () => {
        showMainWindow();
        if (mainWindow) mainWindow.webContents.send('navigate', { view: 'overdue' });
      },
    },
    { type: 'separator' },
    {
      label: '开机自启',
      type: 'checkbox',
      checked: !!login.openAtLogin,
      click: (item) => setAutoLaunch(item.checked),
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);
}

function setAutoLaunch(enabled) {
  if (!app.isPackaged) {
    // 开发态不写注册表，避免把 electron.exe 塞进开机启动
    if (store) store.updateSettings({ autoLaunch: enabled });
    updateTrayState();
    return;
  }
  try {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      path: process.execPath,
      args: ['--hidden'],
    });
    store.updateSettings({ autoLaunch: enabled });
  } catch (err) {
    console.error('setAutoLaunch failed', err);
  }
  updateTrayState();
}

function updateTrayState() {
  if (!tray) return;
  const alert = activeReminders.size > 0 || overdueCount() > 0;
  const img = iconPath(alert ? 'tray-alert.ico' : 'tray.ico') || iconPath(alert ? 'tray-alert.png' : 'tray.png');
  if (img) tray.setImage(img);
  tray.setToolTip(alert ? `待办 · ${activeReminders.size} 条待处理提醒` : '待办');
  tray.setContextMenu(trayMenu());
}

function createTray() {
  const img = iconPath('tray.ico') || iconPath('tray.png');
  try {
    tray = new Tray(img || nativeImage.createEmpty());
    tray.setToolTip('待办');
    tray.setContextMenu(trayMenu());
    tray.on('click', () => {
      if (mainWindow && mainWindow.isVisible()) mainWindow.hide();
      else showMainWindow();
    });
    trayOk = true;
    updateTrayState();
  } catch (err) {
    trayOk = false;
    tray = null;
    console.error('tray unavailable, falling back to quit-on-close', err);
  }
}

/* ------------------------------------------------------------------ */
/* IPC                                                                 */
/* ------------------------------------------------------------------ */

function handleMutation(type, payload) {
  let result;
  switch (type) {
    case 'create':
      result = store.create(payload || {});
      break;
    case 'update':
      result = store.update(payload.id, payload.patch || {});
      break;
    case 'delete':
      result = store.remove(payload.id);
      activeReminders.delete(payload.id);
      break;
    case 'toggleDone':
      result = store.toggleDone(payload.id);
      break;
    case 'toggleStar':
      result = store.toggleStar(payload.id);
      break;
    case 'subtaskAdd':
      result = store.addSubtask(payload.taskId, payload.title);
      break;
    case 'subtaskUpdate':
      result = store.updateSubtask(payload.taskId, payload.subId, payload.patch || {});
      break;
    case 'subtaskDelete':
      result = store.removeSubtask(payload.taskId, payload.subId);
      break;
    case 'settingsUpdate':
      result = store.updateSettings(payload || {});
      break;
    default:
      result = { error: '未知操作' };
  }

  if (!result.error) {
    const task = result.task;
    if (task && (task.done || !task.remindAt)) activeReminders.delete(task.id);
    if (type === 'update' && payload.patch && payload.patch.remindAt !== undefined) {
      activeReminders.delete(payload.id);
    }
    broadcastState();
    refreshReminderWindow();
    updateTrayState();
  }
  return result;
}

ipcMain.handle('state:get', () => buildState());

ipcMain.handle('mutate', (_e, msg) => {
  try {
    return handleMutation(msg.type, msg.payload);
  } catch (err) {
    console.error('mutate failed', err);
    return { error: String((err && err.message) || err) };
  }
});

ipcMain.handle('reminders:get', () => {
  const list = currentReminderList();
  if (list.length && reminderWin && !reminderWin.isDestroyed()) {
    reminderWin.showInactive();
  }
  return { list, categories: CATEGORIES };
});

ipcMain.handle('reminder:ack', (_e, taskId) => {
  activeReminders.delete(taskId);
  refreshReminderWindow();
  updateTrayState();
  return { ok: true };
});

ipcMain.handle('reminder:snooze', (_e, { taskId, minutes }) => {
  const res = store.snooze(taskId, minutes);
  activeReminders.delete(taskId);
  refreshReminderWindow();
  broadcastState();
  updateTrayState();
  return res;
});

ipcMain.on('reminder:resize', (_e, height) => {
  positionReminderWindow(Math.ceil(height));
});

ipcMain.on('reminder:action-open', () => {
  showMainWindow();
});

ipcMain.handle('app:openExternal', (_e, url) => {
  if (typeof url === 'string' && /^https?:\/\//i.test(url)) shell.openExternal(url);
});

ipcMain.handle('app:openBackupDir', async () => {
  const dir = path.join(app.getPath('documents'), 'WorkPlan备份');
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {}
  await shell.openPath(dir);
  return dir;
});

ipcMain.handle('app:quit', () => {
  isQuitting = true;
  app.quit();
});

ipcMain.handle('app:getAutoLaunch', () => app.getLoginItemSettings().openAtLogin);

ipcMain.handle('app:setAutoLaunch', (_e, enabled) => {
  setAutoLaunch(!!enabled);
  return app.getLoginItemSettings().openAtLogin;
});

/* ------------------------------------------------------------------ */
/* 生命周期                                                            */
/* ------------------------------------------------------------------ */

async function runReminderTest() {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const results = [];
  const log = (n, ok, extra) => results.push({ n, ok: !!ok, extra: extra === undefined ? null : extra });

  try {
    const target = store.data.tasks.find((x) => x.title.includes('ICS')) || store.data.tasks[0];
    if (!target) throw new Error('没有可测试的任务');

    store.update(target.id, { remindAt: toLocalDT(new Date(Date.now() - 60000)) });
    await wait(300);
    tick();
    await wait(2000);

    const win = reminderWin;
    log('R1 弹窗出现', !!(win && win.isVisible()));

    const cards = win ? await win.webContents.executeJavaScript(`document.querySelectorAll('.card').length`) : 0;
    log('R2 卡片渲染', cards === 1, cards);

    const hidden1 = win
      ? await win.webContents.executeJavaScript(`document.querySelector('.card .snooze-box').hidden`)
      : null;
    log('R3 稍后面板默认收起', hidden1 === true);

    await win.webContents.executeJavaScript(`document.querySelectorAll('.card .actions .btn')[0].click()`);
    await wait(350);
    const hidden2 = await win.webContents.executeJavaScript(`document.querySelector('.card .snooze-box').hidden`);
    log('R4 点稍后展开面板', hidden2 === false);

    await win.webContents.executeJavaScript(`document.querySelector('.card [data-min]').click()`);
    await wait(1000);
    const after = store.getTask(target.id);
    log('R5 稍后 5 分钟写回', !!after.remindAt && !after.remindFiredAt, after.remindAt);
    const cardsAfter = await win.webContents.executeJavaScript(`document.querySelectorAll('.card').length`);
    log('R6 稍后后卡片消失', cardsAfter === 0, cardsAfter);
    log('R7 无卡片时窗口隐藏', win.isVisible() === false);

    store.update(target.id, { remindAt: toLocalDT(new Date(Date.now() - 60000)) });
    await wait(300);
    tick();
    await wait(2000);
    const cards2 = await win.webContents.executeJavaScript(`document.querySelectorAll('.card').length`);
    await win.webContents.executeJavaScript(`document.querySelectorAll('.card .actions .btn')[1].click()`);
    await wait(900);
    const after2 = store.getTask(target.id);
    const cards3 = await win.webContents.executeJavaScript(`document.querySelectorAll('.card').length`);
    log('R8 知道了清除', cards2 === 1 && !!after2.remindFiredAt && cards3 === 0, {
      cards2,
      fired: !!after2.remindFiredAt,
      cards3,
    });
  } catch (err) {
    log('异常', false, String((err && err.message) || err));
  }

  const failed = results.filter((r) => !r.ok);
  console.log(
    'REMTEST_RESULT ' + JSON.stringify({ pass: results.length - failed.length, fail: failed.length, results }, null, 2)
  );
  isQuitting = true;
  app.quit();
}

app.setAppUserModelId(APP_ID);

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    showMainWindow();
  });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    store = new Store(
      path.join(app.getPath('userData')),
      path.join(app.getPath('documents'), 'WorkPlan备份')
    );
    createMainWindow();

    if (process.argv.includes('--selftest')) {
      mainWindow.webContents.once('did-finish-load', async () => {
        await new Promise((r) => setTimeout(r, 900));
        try {
          const code = fs.readFileSync(path.join(__dirname, '..', '..', 'tools', 'selftest.js'), 'utf8');
          const res = await mainWindow.webContents.executeJavaScript(code, true);
          console.log('SELFTEST_RESULT ' + JSON.stringify(res, null, 2));
        } catch (err) {
          console.error('SELFTEST_ERROR', err);
        }
        isQuitting = true;
        app.quit();
      });
    }
    createTray();
    startScheduler();

    if (process.argv.includes('--remtest')) {
      setTimeout(runReminderTest, 1500);
    }

    // 首次运行把开机自启与设置对齐（仅安装版写注册表）
    if (app.isPackaged) {
      const login = app.getLoginItemSettings();
      if (!login.openAtLogin && store.data.settings.autoLaunch) {
        setAutoLaunch(true);
      }
    }

    const shotsMode = process.argv.includes('--shots');
    if (shotArg || shotsMode) {
      const target = shotArg ? shotArg.split('=')[1] : null;
      setTimeout(async () => {
        try {
          if (!mainWindow.isVisible()) mainWindow.show();
          await new Promise((r) => setTimeout(r, 500));

          if (shotsMode) {
            const dir = path.join(process.cwd(), 'dist');
            const cap = async (name) => {
              const img = await mainWindow.webContents.capturePage();
              fs.writeFileSync(path.join(dir, name), img.toPNG());
              console.log('shot', name);
            };
            const run = (js) => mainWindow.webContents.executeJavaScript(js, true);

            await cap('ui-01-list.png');
            await run(`document.querySelector('.task [data-act="expand"]').click(); true`);
            await new Promise((r) => setTimeout(r, 450));
            await cap('ui-02-expanded.png');
            await run(`document.querySelector('#nav [data-view="status"]').click(); true`);
            await new Promise((r) => setTimeout(r, 450));
            await cap('ui-03-status.png');
            await run(`document.querySelector('#qaDue').click(); true`);
            await new Promise((r) => setTimeout(r, 450));
            await cap('ui-04-popover.png');
            if (reminderWin && !reminderWin.isDestroyed() && reminderWin.isVisible()) {
              const img2 = await reminderWin.webContents.capturePage();
              fs.writeFileSync(path.join(dir, 'ui-05-reminder.png'), img2.toPNG());
              console.log('shot ui-05-reminder.png');
            }
          } else if (target) {
            const img = await mainWindow.webContents.capturePage();
            fs.writeFileSync(target, img.toPNG());
            console.log('screenshot saved:', target);
            if (reminderWin && !reminderWin.isDestroyed() && reminderWin.isVisible()) {
              const img2 = await reminderWin.webContents.capturePage();
              fs.writeFileSync(target.replace(/\.png$/, '-reminder.png'), img2.toPNG());
            }
          }
        } catch (err) {
          console.error('screenshot failed', err);
        }
        isQuitting = true;
        app.quit();
      }, 1600);
    }
  });
}

app.on('window-all-closed', () => {
  // 常驻托盘，不退出；托盘不可用时退化为关闭即退出
  if (!trayOk) {
    isQuitting = true;
    app.quit();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  if (tickTimer) clearInterval(tickTimer);
  try {
    store.save();
    store.mirror(true);
  } catch {}
});
