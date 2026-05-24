const { app, BrowserWindow, ipcMain, dialog } = require('electron');
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
    backgroundColor: '#0f172a',
    autoHideMenuBar: true
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

// Handle opening a native file selection dialog
ipcMain.handle('select-csv-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'CSV Files', extensions: ['csv'] }]
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
});

// Handle validating the CSV file schema and columns before starting
ipcMain.handle('validate-csv-file', (event, filePath) => {
  return new Promise((resolve) => {
    const isWin = process.platform === 'win32';
    const pythonPath = isWin
      ? path.join(__dirname, '..', '.venv', 'Scripts', 'python.exe')
      : path.join(__dirname, '..', '.venv', 'bin', 'python');
    const scriptDir = path.join(__dirname, '..');

    const code = `
import sys
import os
sys.path.insert(0, os.path.abspath('src'))
from lectura_csv import transformar_df
try:
    df = transformar_df(sys.argv[1])
    if df is not None and len(df) > 0:
        print("OK")
        sys.exit(0)
    else:
        print("Error: El archivo no contiene datos validos o fallo la transformacion.")
        sys.exit(1)
except Exception as e:
    print(f"Error: {str(e)}")
    sys.exit(1)
`;

    const pythonProcess = spawn(pythonPath, ['-c', code, filePath], {
      cwd: scriptDir
    });

    let output = '';
    let errorOutput = '';

    pythonProcess.stdout.on('data', (data) => {
      output += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    pythonProcess.on('close', (exitCode) => {
      if (exitCode === 0 && output.includes('OK')) {
        resolve({ valid: true });
      } else {
        const lines = output.split('\\n').concat(errorOutput.split('\\n'))
          .map(l => l.trim())
          .filter(l => l && !l.startsWith('Leyendo archivo') && !l.startsWith('Se cargaran') && l !== 'OK');
        const reason = lines.join(' | ') || 'Error de validación desconocido';
        resolve({ valid: false, reason });
      }
    });
  });
});

// Handle executing the python script
ipcMain.on('run-python-script', (event, filePath) => {
  const isWin = process.platform === 'win32';
  const pythonPath = isWin
    ? path.join(__dirname, '..', '.venv', 'Scripts', 'python.exe')
    : path.join(__dirname, '..', '.venv', 'bin', 'python');
  const scriptPath = path.join(__dirname, '..', 'src', 'subir_altas.py');
  const cwdPath = path.join(__dirname, '..');

  console.log(`Ejecutando Python desde: ${pythonPath}`);
  console.log(`Script: ${scriptPath}`);
  if (filePath) {
    console.log(`Con archivo seleccionado: ${filePath}`);
  }

  const args = ['-u', scriptPath];
  if (filePath) {
    args.push(filePath);
  }

  // We run python in unbuffered mode (-u) so we get logs immediately
  const pythonProcess = spawn(pythonPath, args, {
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
