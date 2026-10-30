'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getState: () => ipcRenderer.invoke('state:get'),
  mutate: (type, payload) => ipcRenderer.invoke('mutate', { type, payload }),

  onState: (cb) => {
    const handler = (_e, state) => cb(state);
    ipcRenderer.on('state:changed', handler);
    return () => ipcRenderer.removeListener('state:changed', handler);
  },

  onNavigate: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on('navigate', handler);
    return () => ipcRenderer.removeListener('navigate', handler);
  },

  onReminders: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on('reminders:update', handler);
    return () => ipcRenderer.removeListener('reminders:update', handler);
  },

  ackReminder: (taskId) => ipcRenderer.invoke('reminder:ack', taskId),
  snoozeReminder: (taskId, minutes) =>
    ipcRenderer.invoke('reminder:snooze', { taskId, minutes }),
  getReminders: () => ipcRenderer.invoke('reminders:get'),
  resizeReminder: (height) => ipcRenderer.send('reminder:resize', height),

  openExternal: (url) => ipcRenderer.invoke('app:openExternal', url),
  openBackupDir: () => ipcRenderer.invoke('app:openBackupDir'),
  quit: () => ipcRenderer.invoke('app:quit'),
  getAutoLaunch: () => ipcRenderer.invoke('app:getAutoLaunch'),
  setAutoLaunch: (enabled) => ipcRenderer.invoke('app:setAutoLaunch', enabled),
});
