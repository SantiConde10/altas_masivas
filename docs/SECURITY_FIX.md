# Security Remediation Guide

## Critical: Remove Hardcoded GitHub Token

### Current State (VULNERABLE)
```javascript
// app/main.js
const ghToken = "%%GH_TOKEN%%";
const isTokenValid = ghToken && ghToken !== "%%" + "GH_TOKEN" + "%%";

if (isTokenValid) {
  autoUpdater.requestHeaders = { "Authorization": `Bearer ${ghToken}` };
}
```

### Fixed Code
```javascript
// app/main.js

// Option 1: Environment variable only (Recommended)
function getGitHubToken() {
  // Only use token from environment, never hardcoded
  const token = process.env.GH_TOKEN;
  
  if (!token || token.startsWith('%%')) {
    console.warn('[AutoUpdater] No GitHub token configured. Updates may fail for private repos.');
    return null;
  }
  
  return token;
}

app.whenReady().then(() => {
  createWindow();
  
  // Set up auto-updater with token from environment
  const ghToken = getGitHubToken();
  
  if (ghToken) {
    autoUpdater.requestHeaders = { "Authorization": `Bearer ${ghToken}` };
  }
  
  autoUpdater.setFeedURL({
    provider: 'github',
    owner: 'SantiConde10',
    repo: 'altas_masivas',
    releaseType: 'release'
  });
  
  // ... rest of code
});
```

---

## Critical: Fix Build Pipeline Secrets Handling

### Current State (VULNERABLE)
```yaml
# .github/workflows/build.yml - Lines 76-88

- name: Build Python Executable
  env:
    APP_USERNAME: ${{ secrets.APP_USERNAME }}
    APP_PASSWORD: ${{ secrets.APP_PASSWORD }}
    APP_URL: ${{ secrets.APP_URL }}
  run: |
    # VULNERABLE: Writing secrets to file
    echo "APP_USERNAME=$APP_USERNAME" > .env
    echo "APP_PASSWORD=$APP_PASSWORD" >> .env
    echo "APP_URL=$APP_URL" >> .env
    
    source .venv/bin/activate
    pyinstaller --onefile --add-data ".env:." src/cli.py
```

### Fixed Code
```yaml
# .github/workflows/build.yml

- name: Build Python Executable
  env:
    APP_USERNAME: ${{ secrets.APP_USERNAME }}
    APP_PASSWORD: ${{ secrets.APP_PASSWORD }}
    APP_URL: ${{ secrets.APP_URL }}
  run: |
    # SECURE: Pass secrets via environment variables only
    export GAIA_APP_USERNAME="$APP_USERNAME"
    export GAIA_APP_PASSWORD="$APP_PASSWORD"
    export GAIA_APP_URL="$APP_URL"
    
    source .venv/bin/activate
    
    # Option 1: Python reads from environment at runtime
    pyinstaller --onefile src/cli.py
    
  # Add cleanup step (important!)
  # - name: Cleanup sensitive files
  #   if: always()
  #   run: |
  #     rm -f .env .env.local .env.*.local
  #     rm -f .envrc
```

### Python Code Changes (src/cli.py)
```python
# Instead of reading from .env file at import time:
# OLD (vulnerable):
# from dotenv import load_dotenv
# load_dotenv('.env')
# USERNAME = os.getenv('APP_USERNAME')

# NEW (secure):
import os

class Config:
    @property
    def username(self):
        """Read credentials from environment at runtime"""
        username = os.getenv('GAIA_APP_USERNAME')
        if not username:
            raise ValueError("GAIA_APP_USERNAME not configured")
        return username
    
    @property
    def password(self):
        """Read credentials from environment at runtime"""
        password = os.getenv('GAIA_APP_PASSWORD')
        if not password:
            raise ValueError("GAIA_APP_PASSWORD not configured")
        return password
    
    @property
    def app_url(self):
        """Read credentials from environment at runtime"""
        url = os.getenv('GAIA_APP_URL')
        if not url:
            raise ValueError("GAIA_APP_URL not configured")
        return url

# Usage in your code:
config = Config()
session = create_session(username=config.username, password=config.password, url=config.app_url)
```

---

## High: Add Input Validation for CSV Files

### New File: app/validators.js
```javascript
const fs = require('fs');
const path = require('path');

const CSV_MAX_SIZE = 100 * 1024 * 1024; // 100MB
const ALLOWED_EXTENSIONS = ['.csv'];

function validateFilePath(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    throw new Error('Invalid file path');
  }

  // Check file exists
  if (!fs.existsSync(filePath)) {
    throw new Error('File does not exist');
  }

  // Check file extension
  const ext = path.extname(filePath).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    throw new Error(`Only CSV files are allowed (got ${ext})`);
  }

  // Get file stats
  const stats = fs.statSync(filePath);

  // Check if it's a symbolic link (security risk)
  if (stats.isSymbolicLink()) {
    throw new Error('Symbolic links are not allowed');
  }

  // Check file size
  if (stats.size > CSV_MAX_SIZE) {
    throw new Error(`File exceeds maximum size of ${CSV_MAX_SIZE / 1024 / 1024}MB`);
  }

  // Get the real path (resolves symlinks and relative paths)
  const realPath = fs.realpathSync(filePath);

  // Verify the real path still matches our criteria
  const realStats = fs.statSync(realPath);
  if (realStats.size > CSV_MAX_SIZE) {
    throw new Error('File size exceeds limit');
  }

  return realPath;
}

module.exports = { validateFilePath };
```

### Updated main.js
```javascript
const { validateFilePath } = require('./validators');

ipcMain.handle('validate-csv-file', (event, filePath) => {
  return new Promise((resolve) => {
    try {
      // Validate the file path first
      const validatedPath = validateFilePath(filePath);

      const isWin = process.platform === 'win32';
      
      let pythonCmd, args, cwdPath;
      
      if (app.isPackaged) {
        pythonCmd = path.join(process.resourcesPath, 'python_bin', isWin ? 'cli.exe' : 'cli');
        args = ['validate', validatedPath]; // Use validated path
        cwdPath = path.dirname(pythonCmd);
      } else {
        pythonCmd = isWin
          ? path.join(__dirname, '..', '.venv', 'Scripts', 'python.exe')
          : path.join(__dirname, '..', '.venv', 'bin', 'python');
        args = ['-u', path.join(__dirname, '..', 'src', 'cli.py'), 'validate', validatedPath];
        cwdPath = path.join(__dirname, '..');
      }

      // ... rest of validation code
    } catch (err) {
      resolve({ 
        valid: false, 
        reason: err.message 
      });
    }
  });
});
```

---

## High: Enhance BrowserWindow Security

### Updated main.js
```javascript
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
      nodeIntegration: false,
      // Security hardening
      sandbox: true, // Isolate renderer process
      enableRemoteModule: false, // Prevent remote code execution
      allowRunningInsecureContent: false,
      webSecurity: true, // Enforce same-origin policy
      disableHtmlCache: true,
      spellcheck: false // Prevent spell-check data leakage
    },
    show: false,
    backgroundColor: '#0f172a',
    autoHideMenuBar: true
  });

  mainWindow.loadFile('index.html');

  // Add security headers
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    const headers = {
      ...details.responseHeaders,
      'X-Content-Type-Options': ['nosniff'],
      'X-Frame-Options': ['DENY'],
      'X-XSS-Protection': ['1; mode=block'],
      'Referrer-Policy': ['no-referrer'],
      'Permissions-Policy': ['geolocation=(), microphone=(), camera=()']
    };
    callback({ responseHeaders: headers });
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });
}
```

---

## High: Remove Sensitive Data from Logs

### Updated main.js (check-updates-github)
```javascript
ipcMain.handle('check-updates-github', async (event, { token, owner, repo }) => {
  const logs = [];
  const start = Date.now();

  logs.push(`[${new Date().toLocaleTimeString()}] Iniciando verificación con GitHub API...`);
  logs.push(`Versión actual: ${app.getVersion()}`);
  logs.push(`Repositorio: ${owner}/${repo}`);

  try {
    const authToken = token || process.env.GH_TOKEN;
    const headers = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'GAIA-Updater'
    };

    if (authToken) {
      // SECURE: Never log the actual token
      headers['Authorization'] = `Bearer ${authToken}`;
      logs.push(`✓ Token de autenticación configurado`); // Don't show token details
    } else {
      logs.push(`⚠ Sin token de autenticación (acceso limitado)`);
    }

    logs.push('Obteniendo releases de GitHub...');

    // ... rest of code

    // SECURE: Never send full stack traces to renderer
    return { success: true, logs, /* ... */ };
    
  } catch (error) {
    // Log full details to console (dev only), but not to user
    if (process.env.NODE_ENV !== 'production') {
      console.error('[AutoUpdater] Full error:', error);
    }
    
    logs.push(`✗ Error: ${error.message}`);
    
    if (process.env.NODE_ENV === 'production') {
      // Don't send stack trace in production
      return { 
        success: false, 
        logs, 
        availableVersion: null, 
        error: 'Failed to check updates. Please try again.' 
      };
    }
    
    logs.push(`Stack: ${error.stack}`); // Only in dev
    return { 
      success: false, 
      logs, 
      availableVersion: null, 
      error: error.message 
    };
  }
});
```

---

## Moderate: Sanitize Dynamic HTML Loading

### Updated renderer.js
```javascript
async function loadPanel(id, htmlPath) {
  const container = document.getElementById(id);
  
  try {
    const response = await fetch(htmlPath);
    if (!response.ok) {
      throw new Error(`Error loading panel ${htmlPath}: ${response.statusText}`);
    }
    
    const htmlText = await response.text();
    
    // Use DOMParser for safer parsing
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlText, 'text/html');
    
    // Check for parsing errors
    if (doc.documentElement.nodeName === 'parsererror') {
      throw new Error(`Failed to parse HTML from ${htmlPath}`);
    }
    
    // Clear container and append parsed content
    container.innerHTML = '';
    
    // Move all child nodes from parsed document to container
    while (doc.body.firstChild) {
      container.appendChild(doc.body.firstChild);
    }
    
  } catch (error) {
    console.error('Error loading panel:', error);
    container.innerHTML = `<p class="error">Error loading panel: ${error.message}</p>`;
  }
}
```

---

## Testing After Remediation

```bash
# 1. Verify no secrets in code
grep -r "GH_TOKEN\|APP_PASSWORD" app/main.js

# 2. Verify no .env files
ls -la | grep "\.env"

# 3. Test file validation with various inputs
# - Valid CSV file
# - Oversized CSV
# - .txt file instead of .csv
# - Symbolic link

# 4. Run npm audit
npm audit

# 5. Check git history for any exposed secrets
git log --all --pretty=format: --name-only | xargs grep -l "password\|token" 2>/dev/null

# 6. Verify environment variable reading
NODE_ENV=production npm start
```

---

## Summary of Changes

| Finding | Severity | Status | File(s) |
|---------|----------|--------|---------|
| Hardcoded GitHub Token | CRITICAL | Fix needed | app/main.js |
| Secrets in .env file | CRITICAL | Fix needed | .github/workflows/build.yml, src/cli.py |
| Sensitive logs | HIGH | Fix needed | app/main.js |
| Process validation | HIGH | Fix needed | app/main.js, app/validators.js (new) |
| Security headers | HIGH | Fix needed | app/main.js |
| Dynamic HTML | MODERATE | Fix needed | app/renderer.js |
| Error disclosure | MODERATE | Fix needed | app/main.js |

---

**Next Step:** After implementing these fixes, run the security audit again to verify all issues are resolved.
