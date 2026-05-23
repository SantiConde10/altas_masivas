async function loadPanel(id, htmlPath) {
  const container = document.getElementById(id);
  const response = await fetch(htmlPath);
  if (!response.ok) {
    throw new Error(`Error loading panel ${htmlPath}: ${response.statusText}`);
  }
  container.innerHTML = await response.text();
}

document.addEventListener('DOMContentLoaded', async () => {
  // Cargar paneles dinámicamente
  try {
    await Promise.all([
      loadPanel('home-view', 'panels/home/home.html'),
      loadPanel('alta-masiva-view', 'panels/alta-masiva/alta-masiva.html')
    ]);
  } catch (error) {
    console.error('Error cargando paneles:', error);
  }

  // Splash Screen Transition
  const splashScreen = document.getElementById('splash-screen');
  const appLayout = document.getElementById('app-layout');

  setTimeout(() => {
    // Start fade out animation
    splashScreen.classList.add('fade-out');
    // Fade in app layout
    appLayout.classList.add('show');
    
    // Completely remove splash screen from flow after transitions finish
    setTimeout(() => {
      splashScreen.style.display = 'none';
    }, 800); // match transition duration (0.8s)
  }, 3800); // duration of loader progress (3s + buffer)

  // Navigation Logic
  const navBtns = document.querySelectorAll('.nav-btn');
  const viewSections = document.querySelectorAll('.view-section');

  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      // Remove active from all
      navBtns.forEach(b => b.classList.remove('active'));
      viewSections.forEach(v => v.classList.remove('active'));

      // Add active to clicked
      btn.classList.add('active');
      const targetId = btn.getAttribute('data-target');
      document.getElementById(targetId).classList.add('active');
    });
  });

  // Alta Masiva Logic
  const runBtn = document.getElementById('run-btn');
  const btnText = document.getElementById('btn-text');
  const statusIndicator = document.getElementById('status-indicator');
  const statusText = statusIndicator.querySelector('.status-text');
  const consoleOutput = document.getElementById('console-output');
  const clearBtn = document.getElementById('clear-btn');

  let isRunning = false;

  function appendLog(message, type = 'normal') {
    const logLine = document.createElement('div');
    logLine.className = `log-line ${type}`;
    logLine.textContent = message;
    consoleOutput.appendChild(logLine);
    
    // Auto scroll to bottom
    consoleOutput.scrollTop = consoleOutput.scrollHeight;
  }

  function setStatus(status, text) {
    statusIndicator.className = `status ${status}`;
    statusText.textContent = text;
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      consoleOutput.innerHTML = '';
    });
  }

  if (runBtn) {
    runBtn.addEventListener('click', () => {
      if (isRunning) return;

      isRunning = true;
      runBtn.disabled = true;
      btnText.textContent = 'Ejecutando...';
      setStatus('running', 'Procesando altas...');
      
      appendLog('--- Iniciando carga masiva ---', 'info');
      
      // Call main process to run python
      window.electronAPI.runPythonScript();
    });
  }

  // Listen for logs from Python
  window.electronAPI.onPythonLog((data) => {
    appendLog(data.trim());
  });

  window.electronAPI.onPythonError((data) => {
    appendLog(data.trim(), 'error');
  });

  window.electronAPI.onPythonFinished((code) => {
    isRunning = false;
    runBtn.disabled = false;
    if (btnText) btnText.textContent = 'Iniciar Carga Masiva';
    
    if (code === 0) {
      setStatus('success', 'Proceso completado con éxito');
      appendLog(`--- Proceso finalizado (Código ${code}) ---`, 'success');
    } else {
      setStatus('error', `Error en el proceso (Código ${code})`);
      appendLog(`--- Proceso fallido con código ${code} ---`, 'error');
    }
  });
});
