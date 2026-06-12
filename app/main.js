const { app, BrowserWindow, ipcMain, dialog, nativeImage } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;

function createWindow() {
  const iconPath = path.join(__dirname, 'assets', 'LogotipoGAIA_black.png');
  const appIcon = nativeImage.createFromPath(iconPath);

  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    icon: appIcon,
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
  
  // Configurar electron-updater explícitamente
  const ghToken = "%%GH_TOKEN%%";
  const isTokenValid = ghToken && ghToken !== "%%" + "GH_TOKEN" + "%%";

  if (isTokenValid) {
    autoUpdater.requestHeaders = { "Authorization": `Bearer ${ghToken}` };
    console.log('[AutoUpdater] Token GH configurado');
  } else {
    console.warn('[AutoUpdater] Token GH no inyectado (ambiente dev?)');
  }

  // Configurar repositorio explícitamente
  autoUpdater.setFeedURL({
    provider: 'github',
    owner: 'SantiConde10',
    repo: 'altas_masivas',
    releaseType: 'release'
  });

  let updateWindow = null;

  // Manejo de eventos de actualización
  autoUpdater.on('update-available', (info) => {
    console.log('[AutoUpdater] Actualización disponible:', info);
    dialog.showMessageBox({
      type: 'info',
      title: 'Actualización disponible',
      message: `Nueva versión ${info.version} disponible. Se está descargando en segundo plano...`
    });
  });

  autoUpdater.on('download-progress', (progress) => {
    console.log(`[AutoUpdater] Descarga: ${Math.round(progress.percent)}%`);
    if (mainWindow) {
      mainWindow.webContents.send('update-progress', {
        percent: progress.percent,
        bytesPerSecond: progress.bytesPerSecond,
        total: progress.total,
        transferred: progress.transferred
      });
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('[AutoUpdater] Actualización descargada:', info);
    dialog.showMessageBox({
      type: 'info',
      title: 'Actualización lista',
      message: `Versión ${info.version} está lista para instalar. La aplicación se reiniciará.`,
      buttons: ['Reiniciar y Actualizar', 'Más tarde']
    }).then((result) => {
      if (result.response === 0) {
        console.log('[AutoUpdater] Usuario confirmó instalación');
        autoUpdater.quitAndInstall();
      }
    });
  });

  autoUpdater.on('error', (err) => {
    console.error('[AutoUpdater] Error:', err);
    console.error('[AutoUpdater] Stack:', err.stack);
  });

  autoUpdater.on('checking-for-update', () => {
    console.log('[AutoUpdater] Verificando actualizaciones...');
  });

  autoUpdater.on('update-not-available', () => {
    console.log('[AutoUpdater] Ya está en la versión más reciente');
  });

  // Buscar actualizaciones al iniciar
  console.log('[AutoUpdater] Iniciando búsqueda de actualizaciones');
  autoUpdater.checkForUpdatesAndNotify();

  // Reintentar cada hora
  setInterval(() => {
    console.log('[AutoUpdater] Reintentando búsqueda de actualizaciones');
    autoUpdater.checkForUpdatesAndNotify();
  }, 60 * 60 * 1000);
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// Handle opening a native file selection dialog
ipcMain.handle('get-app-version', () => app.getVersion());

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
    
    let pythonCmd, args, cwdPath;
    
    if (app.isPackaged) {
      pythonCmd = path.join(process.resourcesPath, 'python_bin', isWin ? 'cli.exe' : 'cli');
      args = ['validate', filePath];
      cwdPath = path.dirname(pythonCmd);
    } else {
      pythonCmd = isWin
        ? path.join(__dirname, '..', '.venv', 'Scripts', 'python.exe')
        : path.join(__dirname, '..', '.venv', 'bin', 'python');
      args = ['-u', path.join(__dirname, '..', 'src', 'cli.py'), 'validate', filePath];
      cwdPath = path.join(__dirname, '..');
    }

    const pythonProcess = spawn(pythonCmd, args, {
      cwd: cwdPath
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
        const parts = output.trim().split('|');
        const estTime = parts.length > 1 ? parts[1] : '';
        resolve({ valid: true, estimatedTime: estTime });
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

  let pythonCmd, args, cwdPath;
  
  if (app.isPackaged) {
    pythonCmd = path.join(process.resourcesPath, 'python_bin', isWin ? 'cli.exe' : 'cli');
    args = ['run'];
    cwdPath = path.dirname(pythonCmd);
  } else {
    pythonCmd = isWin
      ? path.join(__dirname, '..', '.venv', 'Scripts', 'python.exe')
      : path.join(__dirname, '..', '.venv', 'bin', 'python');
    args = ['-u', path.join(__dirname, '..', 'src', 'cli.py'), 'run'];
    cwdPath = path.join(__dirname, '..');
  }

  if (filePath) {
    args.push(filePath);
  }

  console.log(`Ejecutando Python desde: ${pythonCmd}`);
  console.log(`Args: ${args.join(' ')}`);

  // We run python in unbuffered mode (-u) so we get logs immediately
  const pythonProcess = spawn(pythonCmd, args, {
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
