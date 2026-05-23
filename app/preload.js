const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  runPythonScript: (filePath) => ipcRenderer.send('run-python-script', filePath),
  onPythonLog: (callback) => ipcRenderer.on('python-log', (_event, value) => callback(value)),
  onPythonError: (callback) => ipcRenderer.on('python-error', (_event, value) => callback(value)),
  onPythonFinished: (callback) => ipcRenderer.on('python-finished', (_event, value) => callback(value)),
  selectCSVFile: () => ipcRenderer.invoke('select-csv-file'),
  validateCSVFile: (filePath) => ipcRenderer.invoke('validate-csv-file', filePath)
});
