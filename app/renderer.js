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
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');
  const fileNameDisplay = document.getElementById('file-name-display');

  let isRunning = false;
  let selectedFilePath = null;
  let totalRows = 0;
  let successRows = 0;
  let errorRows = 0;
  let failedSKUs = [];

  function setStatus(status, text) {
    if (statusIndicator) {
      statusIndicator.className = `status ${status}`;
      const statusText = statusIndicator.querySelector('.status-text');
      if (statusText) statusText.textContent = text;
    }
  }

  // Handle file selection / drop
  if (dropZone) {
    dropZone.addEventListener('click', async (e) => {
      if (isRunning) return;
      
      const removeBtn = e.target.closest('#remove-file-btn');
      if (removeBtn) {
        selectedFilePath = null;
        if (fileInput) fileInput.value = '';
        
        const dropInstructions = document.getElementById('drop-zone-instructions');
        const fileSelectedContainer = document.getElementById('file-selected-container');
        const dropIcon = document.getElementById('drop-icon');
        
        if (dropInstructions) dropInstructions.style.display = 'block';
        if (dropIcon) dropIcon.style.display = 'block';
        if (fileSelectedContainer) fileSelectedContainer.style.display = 'none';
        if (fileNameDisplay) {
            fileNameDisplay.textContent = 'Ningún archivo seleccionado';
            fileNameDisplay.classList.remove('active');
        }
        
        if (runBtn) runBtn.disabled = true;
        setStatus('idle', 'Selecciona un archivo CSV');
        return;
      }

      if (selectedFilePath) return;

      try {
        const filePath = await window.electronAPI.selectCSVFile();
        if (filePath) {
          const pathParts = filePath.split(/[/\\]/);
          const fileName = pathParts[pathParts.length - 1];
          handleFileSelectionWithPath(filePath, fileName);
        }
      } catch (err) {
        console.error('Error selecting file via dialog:', err);
        if (fileInput) fileInput.click();
      }
    });

    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
          handleFileSelection(e.target.files[0]);
        }
      });
    }

    ['dragenter', 'dragover'].forEach(eventName => {
      dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (isRunning) return;
        dropZone.classList.add('dragover');
      }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.remove('dragover');
      }, false);
    });

    dropZone.addEventListener('drop', (e) => {
      if (isRunning) return;
      if (selectedFilePath) return;
      const dt = e.dataTransfer;
      const files = dt.files;
      if (files.length > 0) {
        handleFileSelection(files[0]);
      }
    }, false);
  }

  async function handleFileSelectionWithPath(filePath, fileName) {
    selectedFilePath = filePath;
    fileNameDisplay.textContent = fileName;
    fileNameDisplay.classList.add('active');
    
    const dropInstructions = document.getElementById('drop-zone-instructions');
    const fileSelectedContainer = document.getElementById('file-selected-container');
    const dropIcon = document.getElementById('drop-icon');
    
    if (dropInstructions) dropInstructions.style.display = 'none';
    if (dropIcon) dropIcon.style.display = 'none';
    if (fileSelectedContainer) fileSelectedContainer.style.display = 'flex';

    if (runBtn) runBtn.disabled = true;
    setStatus('running', 'Validando estructura del archivo...');

    try {
      const result = await window.electronAPI.validateCSVFile(filePath);
      if (result.valid) {
        if (runBtn) runBtn.disabled = false;
        setStatus('success', 'Listo, puedes empezar');
      } else {
        selectedFilePath = null;
        if (fileInput) fileInput.value = '';
        if (dropInstructions) dropInstructions.style.display = 'block';
        if (dropIcon) dropIcon.style.display = 'block';
        if (fileSelectedContainer) fileSelectedContainer.style.display = 'none';

        fileNameDisplay.textContent = 'Ningún archivo seleccionado';
        fileNameDisplay.classList.remove('active');
        if (runBtn) runBtn.disabled = true;
        setStatus('error', `Archivo inválido: ${result.reason}`);
        alert(`Error al validar archivo: ${result.reason}`);
      }
    } catch (err) {
      console.error('Validation error:', err);
      if (runBtn) runBtn.disabled = false;
      setStatus('idle', 'Listo para iniciar');
    }
  }

  function handleFileSelection(file) {
    if (!file.name.endsWith('.csv')) {
      alert('Por favor, selecciona un archivo CSV válido.');
      return;
    }
    const path = file.path;
    if (!path) {
      alert('No se pudo obtener la ruta real del archivo mediante drag and drop. Por favor, haz click en el recuadro para seleccionarlo mediante el diálogo del sistema.');
      return;
    }
    handleFileSelectionWithPath(path, file.name);
  }

  if (runBtn) {
    runBtn.addEventListener('click', () => {
      if (isRunning || !selectedFilePath) return;

      isRunning = true;
      runBtn.disabled = true;
      if (dropZone) dropZone.style.pointerEvents = 'none';
      if (btnText) btnText.textContent = 'Ejecutando...';
      setStatus('running', 'Procesando altas...');

      // Reset values
      totalRows = 0;
      successRows = 0;
      errorRows = 0;
      failedSKUs = [];
      
      const successCountEl = document.getElementById('success-count');
      const errorCountEl = document.getElementById('error-count');
      const progressBarFillEl = document.getElementById('progress-bar-fill');
      const progressCountEl = document.getElementById('progress-count');
      const progressPercentageEl = document.getElementById('progress-percentage');
      const progressSubtextEl = document.getElementById('progress-subtext');
      const progressPanelEl = document.getElementById('progress-panel');

      if (successCountEl) successCountEl.textContent = '0';
      if (errorCountEl) errorCountEl.textContent = '0';
      if (progressBarFillEl) progressBarFillEl.style.width = '0%';
      if (progressCountEl) progressCountEl.textContent = '0 / 0';
      if (progressPercentageEl) progressPercentageEl.textContent = '0%';
      if (progressSubtextEl) progressSubtextEl.textContent = 'Iniciando proceso...';
      if (progressPanelEl) progressPanelEl.style.display = 'flex';

      window.electronAPI.runPythonScript(selectedFilePath);
    });
  }

  function updateProgress() {
    const processed = successRows + errorRows;
    const progressCountEl = document.getElementById('progress-count');
    const progressPercentageEl = document.getElementById('progress-percentage');
    const progressBarFillEl = document.getElementById('progress-bar-fill');

    if (totalRows > 0) {
      const percentage = Math.min(100, Math.round((processed / totalRows) * 100));
      if (progressCountEl) progressCountEl.textContent = `${processed} / ${totalRows}`;
      if (progressPercentageEl) progressPercentageEl.textContent = `${percentage}%`;
      if (progressBarFillEl) progressBarFillEl.style.width = `${percentage}%`;
    } else {
      if (progressCountEl) progressCountEl.textContent = `${processed} procesados`;
    }
  }

  // Listen for logs from Python
  window.electronAPI.onPythonLog((data) => {
    const lines = data.split('\n');
    lines.forEach(line => {
      const trimmed = line.trim();
      if (!trimmed) return;

      const progressSubtextEl = document.getElementById('progress-subtext');

      // Check for total rows line
      if (trimmed.includes('Total de SKUs a subir (cantidad de filas):')) {
        const match = trimmed.match(/Total de SKUs a subir \(cantidad de filas\):\s*(\d+)/);
        if (match) {
          totalRows = parseInt(match[1], 10);
          updateProgress();
          if (progressSubtextEl) {
            progressSubtextEl.textContent = `Se detectaron ${totalRows} SKUs. Iniciando Playwright...`;
          }
        }
      }

      // Check for current processing row
      if (trimmed.startsWith('--- Fila') && trimmed.includes('/')) {
        const cleanMessage = trimmed.replace(/---/g, '').trim();
        if (progressSubtextEl) progressSubtextEl.textContent = cleanMessage;
      }

      // Check for OK result
      if (trimmed.includes('RESULTADO') && trimmed.includes('ESTADO: OK')) {
        successRows++;
        const successCountEl = document.getElementById('success-count');
        if (successCountEl) successCountEl.textContent = successRows;
        updateProgress();
      }

      // Check for ERROR result
      if (trimmed.includes('RESULTADO') && trimmed.includes('ESTADO: ERROR')) {
        errorRows++;
        const errorCountEl = document.getElementById('error-count');
        if (errorCountEl) errorCountEl.textContent = errorRows;
        
        const matchReason = trimmed.match(/MOTIVO:\s*(.*)/);
        const reasonStr = matchReason ? matchReason[1] : 'Error desconocido';
        const matchSku = trimmed.match(/SKU:\s*([^\s|]+)/);
        const skuStr = matchSku ? matchSku[1] : 'Fila';

        failedSKUs.push({ sku: skuStr, reason: reasonStr });

        if (progressSubtextEl) {
          progressSubtextEl.textContent = `Error en SKU ${skuStr}: ${reasonStr}`;
        }
        updateProgress();
      }
    });
  });

  window.electronAPI.onPythonError((data) => {
    console.error('Python error:', data);
    const progressSubtextEl = document.getElementById('progress-subtext');
    if (progressSubtextEl && (data.includes('Traceback') || data.includes('Error'))) {
      const lines = data.split('\n');
      const lastLine = lines.filter(l => l.trim()).pop() || '';
      progressSubtextEl.textContent = `Error: ${lastLine.trim()}`;
    }
  });

  window.electronAPI.onPythonFinished((code) => {
    isRunning = false;
    if (runBtn) runBtn.disabled = false;
    if (dropZone) dropZone.style.pointerEvents = 'auto';
    if (btnText) btnText.textContent = 'Iniciar Carga Masiva';
    
    const progressSubtextEl = document.getElementById('progress-subtext');

    if (code === 0) {
      if (failedSKUs.length > 0) {
        setStatus('error', `Finalizado con ${failedSKUs.length} error(es)`);
        const summary = failedSKUs.map(e => `SKU ${e.sku}: ${e.reason}`).join(' | ');
        if (progressSubtextEl) {
          progressSubtextEl.textContent = `Errores detectados: ${summary}`;
        }
      } else {
        setStatus('success', 'Proceso completado con éxito');
        if (progressSubtextEl) progressSubtextEl.textContent = 'Carga finalizada correctamente.';
      }
    } else {
      setStatus('error', `Error en el proceso (Código ${code})`);
      if (progressSubtextEl) {
        if (failedSKUs.length > 0) {
          const summary = failedSKUs.map(e => `SKU ${e.sku}: ${e.reason}`).join(' | ');
          progressSubtextEl.textContent = `El proceso terminó con error (Código ${code}). Errores: ${summary}`;
        } else {
          progressSubtextEl.textContent = `El proceso terminó con error (Código ${code}).`;
        }
      }
    }
  });
});
