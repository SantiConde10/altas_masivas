const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    show: false, // Don't show until ready-to-show
    backgroundColor: '#0f172a'
  });

  mainWindow.loadFile('index.html');

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// Handle executing the python script
ipcMain.on('run-python-script', (event) => {
  const pythonPath = path.join(__dirname, '..', '.venv', 'bin', 'python');
  const scriptPath = path.join(__dirname, '..', 'src', 'subir_altas.py');
  const cwdPath = path.join(__dirname, '..');

  console.log(`Ejecutando Python desde: ${pythonPath}`);
  console.log(`Script: ${scriptPath}`);

  // We run python in unbuffered mode (-u) so we get logs immediately
  const pythonProcess = spawn(pythonPath, ['-u', scriptPath], {
    cwd: cwdPath
  });

  pythonProcess.stdout.on('data', (data) => {
    event.reply('python-log', data.toString());
    console.log(`stdout: ${data}`);
  });

  pythonProcess.stderr.on('data', (data) => {
    event.reply('python-error', data.toString());
    console.error(`stderr: ${data}`);
  });

  pythonProcess.on('close', (code) => {
    event.reply('python-finished', code);
    console.log(`Python process exited with code ${code}`);
  });
});
