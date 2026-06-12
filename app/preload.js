const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  runPythonScript: (filePath) => ipcRenderer.send('run-python-script', filePath),
  onPythonLog: (callback) => ipcRenderer.on('python-log', (_event, value) => callback(value)),
  onPythonError: (callback) => ipcRenderer.on('python-error', (_event, value) => callback(value)),
  onPythonFinished: (callback) => ipcRenderer.on('python-finished', (_event, value) => callback(value)),
  selectCSVFile: () => ipcRenderer.invoke('select-csv-file'),
  validateCSVFile: (filePath) => ipcRenderer.invoke('validate-csv-file', filePath),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  onUpdateProgress: (callback) => ipcRenderer.on('update-progress', (_event, value) => callback(value)),
  onUpdateDownloaded: (callback) => ipcRenderer.on('update-downloaded', (_event) => callback()),
  checkUpdatesElectron: () => ipcRenderer.invoke('check-updates-electron'),
  checkUpdatesGithub: (params) => ipcRenderer.invoke('check-updates-github', params)
});
