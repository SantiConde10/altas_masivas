const { app, BrowserWindow, ipcMain, dialog, nativeImage } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const { spawn } = require('child_process');
const https = require('https');

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

// Validation Tab IPC Handlers
ipcMain.handle('check-updates-electron', async () => {
  return new Promise((resolve) => {
    const logs = [];
    const start = Date.now();

    logs.push(`[${new Date().toLocaleTimeString()}] Iniciando verificación con electron-updater...`);
    logs.push(`Versión actual: ${app.getVersion()}`);
    logs.push(`Repositorio: SantiConde10/altas_masivas`);

    // Clear previous listeners to avoid duplicates
    autoUpdater.removeAllListeners('update-available');
    autoUpdater.removeAllListeners('update-not-available');
    autoUpdater.removeAllListeners('error');

    let resolved = false;

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        logs.push(`Error: Timeout después de 30 segundos`);
        resolve({ success: false, logs, availableVersion: null });
      }
    }, 30000);

    autoUpdater.once('update-available', (info) => {
      if (resolved) return;
      logs.push(`✓ Actualización disponible: ${info.version}`);
      logs.push(`Archivo: ${info.files?.[0]?.url || 'No especificado'}`);
      logs.push(`Tamaño: ${info.files?.[0]?.size ? (info.files[0].size / 1024 / 1024).toFixed(2) + ' MB' : 'No disponible'}`);
      logs.push(`Tiempo de búsqueda: ${Date.now() - start}ms`);
      resolve({ success: true, logs, availableVersion: info.version });
    });

    autoUpdater.once('update-not-available', () => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      logs.push(`✓ Ya está en la versión más reciente`);
      logs.push(`Tiempo de búsqueda: ${Date.now() - start}ms`);
      resolve({ success: true, logs, availableVersion: null });
    });

    autoUpdater.once('error', (err) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      logs.push(`✗ Error: ${err.message}`);
      logs.push(`Stack: ${err.stack}`);
      resolve({ success: false, logs, availableVersion: null, error: err.message });
    });

    logs.push('Conectando con GitHub releases...');
    autoUpdater.checkForUpdates().catch((err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        logs.push(`✗ Error de conexión: ${err.message}`);
        resolve({ success: false, logs, availableVersion: null, error: err.message });
      }
    });
  });
});

ipcMain.handle('check-updates-github', async (event, { token, owner, repo }) => {
  const logs = [];
  const start = Date.now();

  logs.push(`[${new Date().toLocaleTimeString()}] Iniciando verificación con GitHub API...`);
  logs.push(`Versión actual: ${app.getVersion()}`);
  logs.push(`Repositorio: ${owner}/${repo}`);

  try {
    // Use provided token or try GH_TOKEN environment variable
    const authToken = token || process.env.GH_TOKEN;
    const headers = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'GAIA-Updater'
    };

    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
      logs.push(`✓ Token de autenticación configurado`);
    } else {
      logs.push(`⚠ Sin token de autenticación (sin token: acceso limitado)`);
    }

    logs.push('Obteniendo releases de GitHub...');

    const releases = await new Promise((resolve, reject) => {
      https.get(
        `https://api.github.com/repos/${owner}/${repo}/releases?per_page=5`,
        { headers },
        (response) => {
          let data = '';

          if (response.statusCode !== 200) {
            reject(new Error(`GitHub API responded with ${response.statusCode}: ${response.statusMessage}`));
            return;
          }

          response.on('data', (chunk) => {
            data += chunk;
          });

          response.on('end', () => {
            try {
              const parsed = JSON.parse(data);
              resolve(parsed);
            } catch (e) {
              reject(new Error(`Invalid JSON response: ${e.message}`));
            }
          });
        }
      ).on('error', reject);
    });

    logs.push(`✓ Conexión exitosa con GitHub API`);
    logs.push(`Total de releases obtenidos: ${releases.length}`);

    if (releases.length === 0) {
      logs.push(`⚠ No hay releases en el repositorio`);
      return { success: false, logs, availableVersion: null };
    }

    // Filter out pre-releases and drafts
    const validReleases = releases.filter(r => !r.prerelease && !r.draft);

    if (validReleases.length === 0) {
      logs.push(`⚠ No hay releases estables (solo pre-releases o drafts)`);
      return { success: false, logs, availableVersion: null };
    }

    const latestRelease = validReleases[0];
    logs.push(`\nÚltimo release:`);
    logs.push(`  Versión: ${latestRelease.tag_name}`);
    logs.push(`  Publicado: ${new Date(latestRelease.published_at).toLocaleString()}`);
    logs.push(`  Descripción: ${latestRelease.body?.substring(0, 100) || 'N/A'}...`);

    // Parse version numbers for comparison
    const currentVersion = app.getVersion();
    const latestVersion = latestRelease.tag_name.replace(/^v/, '');

    const currentParts = currentVersion.split('.').map(Number);
    const latestParts = latestVersion.split('.').map(Number);

    let isNewer = false;
    for (let i = 0; i < Math.max(currentParts.length, latestParts.length); i++) {
      const current = currentParts[i] || 0;
      const latest = latestParts[i] || 0;
      if (latest > current) {
        isNewer = true;
        break;
      } else if (latest < current) {
        isNewer = false;
        break;
      }
    }

    logs.push(`\nComparación de versiones:`);
    logs.push(`  Actual: ${currentVersion}`);
    logs.push(`  Última: ${latestVersion}`);
    logs.push(`  Estado: ${isNewer ? '✓ Actualización disponible' : '✓ Ya está en la versión más reciente'}`);

    // Get asset info
    if (latestRelease.assets && latestRelease.assets.length > 0) {
      logs.push(`\nArchivos disponibles (${latestRelease.assets.length}):`);
      latestRelease.assets.slice(0, 3).forEach(asset => {
        const sizeMB = (asset.size / 1024 / 1024).toFixed(2);
        logs.push(`  - ${asset.name} (${sizeMB} MB)`);
      });
      if (latestRelease.assets.length > 3) {
        logs.push(`  ... y ${latestRelease.assets.length - 3} más`);
      }
    }

    logs.push(`\nTiempo total: ${Date.now() - start}ms`);

    return {
      success: true,
      logs,
      availableVersion: isNewer ? latestVersion : null,
      releaseInfo: {
        tag: latestRelease.tag_name,
        name: latestRelease.name,
        published: latestRelease.published_at,
        assetCount: latestRelease.assets?.length || 0
      }
    };
  } catch (error) {
    logs.push(`✗ Error: ${error.message}`);
    logs.push(`Tipo: ${error.code || error.name}`);
    logs.push(`Tiempo: ${Date.now() - start}ms`);

    if (error.message.includes('404')) {
      logs.push(`\nVerifica que el repositorio existe: ${owner}/${repo}`);
    }

    return { success: false, logs, availableVersion: null, error: error.message };
  }
});

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
