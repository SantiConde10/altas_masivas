const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  runPythonScript: () => ipcRenderer.send('run-python-script'),
  onPythonLog: (callback) => ipcRenderer.on('python-log', (_event, value) => callback(value)),
  onPythonError: (callback) => ipcRenderer.on('python-error', (_event, value) => callback(value)),
  onPythonFinished: (callback) => ipcRenderer.on('python-finished', (_event, value) => callback(value))
});
