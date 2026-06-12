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
    const errorEl = document.createElement('p');
    errorEl.className = 'error';
    errorEl.textContent = `Error loading panel: ${error.message}`;
    container.innerHTML = '';
    container.appendChild(errorEl);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  // Listen for auto-update progress
  if (window.electronAPI.onUpdateProgress) {
    window.electronAPI.onUpdateProgress((progress) => {
      const overlay = document.getElementById('update-progress-overlay');
      const fill = document.getElementById('update-progress-fill');
      const percent = document.getElementById('update-progress-percent');
      const speed = document.getElementById('update-progress-speed');

      if (overlay && fill && percent && speed) {
        overlay.classList.add('visible');

        const percentValue = Math.round(progress.percent || 0);
        fill.style.width = percentValue + '%';
        percent.textContent = percentValue + '%';

        if (progress.bytesPerSecond) {
          const mb = (progress.bytesPerSecond / 1024 / 1024).toFixed(2);
          speed.textContent = mb + ' MB/s';
        }
      }
    });
  }

  // Cargar paneles dinámicamente
  try {
    await Promise.all([
      loadPanel('home-view', 'panels/home/home.html'),
      loadPanel('alta-masiva-view', 'panels/alta-masiva/alta-masiva.html'),
      loadPanel('tareas-view', 'panels/tareas/tareas.html'),
      loadPanel('validacion-view', 'panels/validacion/validacion.html')
    ]);
  } catch (error) {
    console.error('Error cargando paneles:', error);
  }

  gtInit();

  // Load App Version
  window.electronAPI.getAppVersion().then(version => {
    const versionEl = document.querySelector('.version');
    if (versionEl) {
      versionEl.textContent = `v${version}`;
    }
  }).catch(err => console.error('Error fetching version:', err));

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

  // SKU Upload Logic
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
  let existingRows = 0;
  let failedSKUs = [];
  let allResults = [];
  let pythonLogBuffer = '';

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
        const estText = result.estimatedTime ? ` (~${result.estimatedTime} min)` : '';
        setStatus('success', `Listo, puedes empezar${estText}`);
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
      existingRows = 0;
      failedSKUs = [];
      allResults = [];
      pythonLogBuffer = '';
      
      const existingCountEl = document.getElementById('existing-count');
      if (existingCountEl) existingCountEl.textContent = '0';
      
      const resultsSection = document.getElementById('results-section');
      if (resultsSection) resultsSection.style.display = 'block';
      renderResultsTable();
      
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
    const processed = successRows + errorRows + existingRows;
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
    pythonLogBuffer += data;
    const lines = pythonLogBuffer.split('\n');
    pythonLogBuffer = lines.pop(); // save the incomplete line for the next chunk

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
        
        const matchSku = trimmed.match(/SKU:\s*([^\s|]+)/);
        const skuStr = matchSku ? matchSku[1] : 'Fila';
        allResults.push({ status: 'éxito', sku: skuStr, reason: '' });
        
        updateProgress();
        renderResultsTable();
      }

      // Check for ERROR result
      if (trimmed.includes('RESULTADO') && trimmed.includes('ESTADO: ERROR')) {
        const matchReason = trimmed.match(/MOTIVO:\s*(.*)/);
        const reasonStr = matchReason ? matchReason[1] : 'Error desconocido';
        const matchSku = trimmed.match(/SKU:\s*([^\s|]+)/);
        const skuStr = matchSku ? matchSku[1] : 'Fila';

        if (reasonStr.toLowerCase().includes('ya existe') || reasonStr.toLowerCase().includes('existente')) {
          existingRows++;
          const existingCountEl = document.getElementById('existing-count');
          if (existingCountEl) existingCountEl.textContent = existingRows;
          allResults.push({ status: 'existente', sku: skuStr, reason: 'El SKU ya estaba registrado' });
        } else {
          errorRows++;
          const errorCountEl = document.getElementById('error-count');
          if (errorCountEl) errorCountEl.textContent = errorRows;
          failedSKUs.push({ sku: skuStr, reason: reasonStr });
          allResults.push({ status: 'fallo', sku: skuStr, reason: reasonStr });
        }

        if (progressSubtextEl) {
          progressSubtextEl.textContent = `Error en SKU ${skuStr}: ${reasonStr}`;
        }
        updateProgress();
        renderResultsTable();
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
    if (pythonLogBuffer.trim()) {
      const trimmed = pythonLogBuffer.trim();
      if (trimmed.includes('RESULTADO') && trimmed.includes('ESTADO: OK')) {
        successRows++;
        const successCountEl = document.getElementById('success-count');
        if (successCountEl) successCountEl.textContent = successRows;
        
        const matchSku = trimmed.match(/SKU:\s*([^\s|]+)/);
        const skuStr = matchSku ? matchSku[1] : 'Fila';
        allResults.push({ status: 'éxito', sku: skuStr, reason: '' });
        
        updateProgress();
        renderResultsTable();
      }
      if (trimmed.includes('RESULTADO') && trimmed.includes('ESTADO: ERROR')) {
        const matchReason = trimmed.match(/MOTIVO:\s*(.*)/);
        const reasonStr = matchReason ? matchReason[1] : 'Error desconocido';
        const matchSku = trimmed.match(/SKU:\s*([^\s|]+)/);
        const skuStr = matchSku ? matchSku[1] : 'Fila';

        if (reasonStr.toLowerCase().includes('ya existe') || reasonStr.toLowerCase().includes('existente')) {
          existingRows++;
          const existingCountEl = document.getElementById('existing-count');
          if (existingCountEl) existingCountEl.textContent = existingRows;
          allResults.push({ status: 'existente', sku: skuStr, reason: 'El SKU ya estaba registrado' });
        } else {
          errorRows++;
          const errorCountEl = document.getElementById('error-count');
          if (errorCountEl) errorCountEl.textContent = errorRows;
          failedSKUs.push({ sku: skuStr, reason: reasonStr });
          allResults.push({ status: 'fallo', sku: skuStr, reason: reasonStr });
        }
        
        updateProgress();
        renderResultsTable();
      }
      pythonLogBuffer = '';
    }

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

  // Funciones para la tabla de resultados
  function renderResultsTable() {
    const tableBody = document.getElementById('results-table-body');
    if (!tableBody) return;

    const searchInput = document.getElementById('search-sku');
    const filterSelect = document.getElementById('filter-status');
    
    const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
    const filterStatus = filterSelect ? filterSelect.value : 'todos';

    tableBody.innerHTML = '';

    allResults.forEach(item => {
      if (filterStatus !== 'todos' && item.status !== filterStatus) return;
      if (searchTerm && !item.sku.toLowerCase().includes(searchTerm)) return;

      const tr = document.createElement('tr');
      
      let statusColor = '#94a3b8';
      let statusBg = '#f1f5f9';
      let statusText = 'Desconocido';
      
      if (item.status === 'éxito') {
        statusColor = '#059669';
        statusBg = '#d1fae5';
        statusText = 'Éxito';
      } else if (item.status === 'existente') {
        statusColor = '#d97706';
        statusBg = '#fef3c7';
        statusText = 'Ya Existe';
      } else if (item.status === 'fallo') {
        statusColor = '#dc2626';
        statusBg = '#fee2e2';
        statusText = 'Fallo';
      }

      const tdStatus = document.createElement('td');
      tdStatus.style.padding = '10px';
      tdStatus.style.borderBottom = '1px solid var(--border-color)';
      tdStatus.innerHTML = `<span style="padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: 600; background: ${statusBg}; color: ${statusColor};">${statusText}</span>`;

      const tdSku = document.createElement('td');
      tdSku.style.padding = '10px';
      tdSku.style.borderBottom = '1px solid var(--border-color)';
      tdSku.style.fontWeight = '500';
      tdSku.textContent = item.sku;

      const tdReason = document.createElement('td');
      tdReason.style.padding = '10px';
      tdReason.style.borderBottom = '1px solid var(--border-color)';
      tdReason.style.color = 'var(--text-secondary)';
      tdReason.textContent = item.reason;

      tr.appendChild(tdStatus);
      tr.appendChild(tdSku);
      tr.appendChild(tdReason);
      
      tableBody.appendChild(tr);
    });
  }

  document.addEventListener('input', (e) => {
    if (e.target.id === 'search-sku') {
      renderResultsTable();
    }
  });

  document.addEventListener('change', (e) => {
    if (e.target.id === 'filter-status') {
      renderResultsTable();
    }
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// GESTOR DE TAREAS
// ─────────────────────────────────────────────────────────────────────────────

// ── Utilidades ───────────────────────────────────────────────────────────────

function gtId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

function gtToday() {
  return new Date().toISOString().split('T')[0];
}

function gtToYMD(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function gtParseDate(str) {
  const s = (str||'').toLowerCase().trim();
  const now = new Date();
  if (s==='hoy') return gtToday();
  if (s==='mañana'||s==='manana') { const d=new Date(now); d.setDate(d.getDate()+1); return gtToYMD(d); }
  const pm = s.match(/^\+(\d+)d?$/);
  if (pm) { const d=new Date(now); d.setDate(d.getDate()+parseInt(pm[1])); return gtToYMD(d); }
  const dayMap={'domingo':0,'lunes':1,'martes':2,'miércoles':3,'miercoles':3,'jueves':4,'viernes':5,'sábado':6,'sabado':6};
  if (dayMap[s]!==undefined) {
    const d=new Date(now), diff=((dayMap[s]-d.getDay())+7)%7||7;
    d.setDate(d.getDate()+diff); return gtToYMD(d);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return null;
}

function gtFmtShort(ymd) {
  if (!ymd) return '';
  const [y,m,d] = ymd.split('-').map(Number);
  const dt = new Date(y,m-1,d);
  const days=['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
  const months=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  return `${days[dt.getDay()]} ${d} ${months[m-1]}`;
}

function gtFmtLong(ymd) {
  if (!ymd) return '';
  const [y,m,d] = ymd.split('-').map(Number);
  const dt = new Date(y,m-1,d);
  const days=['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  const months=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  return `${days[dt.getDay()]}, ${d} de ${months[m-1]}`;
}

function gtIsToday(ymd) { return ymd===gtToday(); }
function gtIsPast(ymd)  { return ymd<gtToday(); }

function gtWeekDates(base) {
  const ref = base ? new Date(base+'T12:00:00') : new Date();
  const diff = ref.getDay()===0 ? -6 : 1-ref.getDay();
  const mon = new Date(ref); mon.setDate(ref.getDate()+diff);
  return Array.from({length:7},(_,i)=>{ const d=new Date(mon); d.setDate(mon.getDate()+i); return gtToYMD(d); });
}

function gtEsc(s) {
  return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Base de datos (localStorage) ─────────────────────────────────────────────

const GT = {
  tasks()    { return JSON.parse(localStorage.getItem('gt_tasks')||'[]'); },
  saveTasks(t){ localStorage.setItem('gt_tasks',JSON.stringify(t)); },
  projects() { return JSON.parse(localStorage.getItem('gt_projects')||'[]'); },
  saveProjects(p){ localStorage.setItem('gt_projects',JSON.stringify(p)); },
  tags()     { return JSON.parse(localStorage.getItem('gt_tags')||'[]'); },
  saveTags(t){ localStorage.setItem('gt_tags',JSON.stringify(t)); },

  addTask(data) {
    const list = this.tasks();
    const t = { id:gtId(), title:'', description:'', projectId:'', status:'todo',
      priority:'medium', dueDate:null, dueTime:null, duration:30, subtasks:[],
      tags:[], recurrence:{type:'none',interval:1,endDate:null},
      createdAt:new Date().toISOString(), updatedAt:new Date().toISOString(), ...data };
    list.push(t); this.saveTasks(list); return t;
  },

  editTask(id, data) {
    const list = this.tasks(), i = list.findIndex(t=>t.id===id);
    if (i<0) return null;
    list[i] = {...list[i], ...data, updatedAt:new Date().toISOString()};
    this.saveTasks(list); return list[i];
  },

  removeTask(id) { this.saveTasks(this.tasks().filter(t=>t.id!==id)); },
  getTask(id)    { return this.tasks().find(t=>t.id===id)||null; },

  addProject(data) {
    const list = this.projects();
    const p = { id:gtId(), name:'', color:'#1a1a1a', createdAt:new Date().toISOString(), ...data };
    list.push(p); this.saveProjects(list); return p;
  },
  editProject(id, data) {
    const list=this.projects(), i=list.findIndex(p=>p.id===id);
    if(i<0) return null;
    list[i]={...list[i],...data}; this.saveProjects(list); return list[i];
  },
  removeProject(id) {
    this.saveProjects(this.projects().filter(p=>p.id!==id));
    this.saveTasks(this.tasks().map(t=>t.projectId===id?{...t,projectId:''}:t));
  },
  getProject(id) { return this.projects().find(p=>p.id===id)||null; },

  prioColors() {
    return JSON.parse(localStorage.getItem('gt_prio_colors')||'null')
           || {critical:'#b91c1c', high:'#dc2626', medium:'#d97706', low:'#16a34a', minimal:'#60a5fa'};
  },
  savePrioColors(c) { localStorage.setItem('gt_prio_colors',JSON.stringify(c)); },

  addTag(data) {
    const list = this.tags();
    const tag = { id:gtId(), name:'', color:'#3b82f6', ...data };
    list.push(tag); this.saveTags(list); return tag;
  },
  editTag(id, data) {
    const list = this.tags(), i = list.findIndex(t=>t.id===id);
    if (i<0) return null;
    list[i] = {...list[i], ...data};
    this.saveTags(list); return list[i];
  },
  removeTag(id) {
    this.saveTags(this.tags().filter(t=>t.id!==id));
    this.saveTasks(this.tasks().map(t=>({...t, tags:(t.tags||[]).filter(tid=>tid!==id)})));
  },
  getTag(id) { return this.tags().find(t=>t.id===id)||null; },

  seed() {
    const SEED_V = '4';
    if (localStorage.getItem('gt_seed_v') === SEED_V) return;

    // ── Etiquetas: reemplazar si siguen siendo los defaults viejos ──
    const OLD_TAGS = new Set(['Urgente','Comercial','Marketing','Hot Sale','Expo','DEVANE']);
    const existingTags = this.tags();
    if (existingTags.length === 0 || existingTags.every(t => OLD_TAGS.has(t.name))) {
      const oldIds = existingTags.map(t => t.id);
      if (oldIds.length > 0)
        this.saveTasks(this.tasks().map(t => ({...t, tags:(t.tags||[]).filter(id=>!oldIds.includes(id))})));
      this.saveTags([]);
      this.addTag({name:'GAIA',   color:'#1a1a1a'});
      this.addTag({name:'Devane', color:'#3b82f6'});
    }

    // ── Proyectos: vaciar si siguen siendo los defaults viejos ──
    const OLD_PROJS = new Set(['Personal','Trabajo','Salud']);
    const existingProjs = this.projects();
    if (existingProjs.length === 0 || existingProjs.every(p => OLD_PROJS.has(p.name))) {
      this.saveProjects([]);
      this.saveTasks([]);
    }

    // ── Prioridad Mínima: actualizar a azul claro si era el gris viejo ──
    const stored = localStorage.getItem('gt_prio_colors');
    if (!stored || JSON.parse(stored).minimal === '#94a3b8') {
      const c = this.prioColors();
      c.minimal = '#60a5fa';
      this.savePrioColors(c);
    }

    localStorage.setItem('gt_seed_v', SEED_V);
  }
};

// ── UI helpers ────────────────────────────────────────────────────────────────

function gtPrioLabel(p) { return {critical:'Crítica',high:'Alta',medium:'Media',low:'Baja',minimal:'Mínima'}[p]||p; }
function gtStatLabel(s) { return {todo:'Por hacer','in-progress':'En progreso',done:'Hecho'}[s]||s; }

const GT_PRIO_ORDER = {critical:0,high:1,medium:2,low:3,minimal:4};

function gtPrioBadge(p) {
  const defaults={critical:'#b91c1c',high:'#dc2626',medium:'#d97706',low:'#16a34a',minimal:'#94a3b8'};
  const color=(GT.prioColors()[p]||defaults[p]||'#64748b');
  return `<span class="gt-badge" style="background:${color}1c;color:${color}">${gtPrioLabel(p)}</span>`;
}

function gtStatBadge(s) {
  const c={todo:{bg:'#f1f5f9',t:'#64748b'},'in-progress':{bg:'#eff6ff',t:'#3b82f6'},done:{bg:'#f0fdf4',t:'#16a34a'}}[s]||{bg:'#f1f5f9',t:'#64748b'};
  return `<span class="gt-badge" style="background:${c.bg};color:${c.t}">${gtStatLabel(s)}</span>`;
}

function gtChip(pid) {
  const p=GT.getProject(pid); if (!p) return '';
  return `<span class="gt-chip" style="background:${p.color}18;color:${p.color};border-color:${p.color}35">${gtEsc(p.name)}</span>`;
}

function gtDueSpan(date,time) {
  if (!date) return '';
  const t=time?` ${time}`:'', cls=gtIsToday(date)?'gt-due-today':gtIsPast(date)?'gt-due-past':'';
  return `<span class="gt-due ${cls}">${gtFmtShort(date)}${t}</span>`;
}

function gtTagChip(tagId) {
  const tag=GT.getTag(tagId); if(!tag) return '';
  return `<span class="gt-tag-chip" style="background:${tag.color}22;color:${tag.color};border-color:${tag.color}44">${gtEsc(tag.name)}</span>`;
}

function gtRecBadge(task) {
  if (!task.recurrence||task.recurrence.type==='none') return '';
  const labels={daily:'Diario',weekly:'Semanal',monthly:'Mensual',yearly:'Anual'};
  const label=labels[task.recurrence.type]||'';
  const n=task.recurrence.interval>1?` c/${task.recurrence.interval}`:'';
  return `<span class="gt-rec-badge" title="Recurrente: ${label}${n}">↻</span>`;
}

// ── Recurrence logic ──────────────────────────────────────────────────────────

function gtGetOccurrencesInRange(task, fromDate, toDate) {
  if (!task.dueDate) return [];
  const rec=task.recurrence||{type:'none'};
  if (rec.type==='none'||!rec.type) {
    return (task.dueDate>=fromDate&&task.dueDate<=toDate)?[task.dueDate]:[];
  }
  const {type, interval=1, endDate} = rec;
  const dates=[];
  let cur=new Date(task.dueDate+'T12:00:00');
  const from=new Date(fromDate+'T12:00:00');
  const to=new Date(toDate+'T12:00:00');
  const recEnd=endDate?new Date(endDate+'T12:00:00'):null;
  let safety=0;
  while (cur<=to&&safety++<500) {
    if (recEnd&&cur>recEnd) break;
    const ds=gtToYMD(cur);
    if (ds>=fromDate) dates.push(ds);
    const n=Math.max(1,interval||1);
    if (type==='daily')   cur.setDate(cur.getDate()+n);
    else if (type==='weekly')  cur.setDate(cur.getDate()+7*n);
    else if (type==='monthly') cur.setMonth(cur.getMonth()+n);
    else if (type==='yearly')  cur.setFullYear(cur.getFullYear()+n);
    else break;
  }
  return dates;
}

function gtTaskOccursOn(task, dateStr) {
  return gtGetOccurrencesInRange(task, dateStr, dateStr).length>0;
}

// ── Tab: Hoy ─────────────────────────────────────────────────────────────────

function gtRenderHoy() {
  const hour = new Date().getHours();
  const greeting = hour<12?'Buenos días':hour<20?'Buenas tardes':'Buenas noches';
  const grEl=document.getElementById('gt-greeting'), dtEl=document.getElementById('gt-date');
  if (grEl) grEl.textContent=greeting;
  if (dtEl) dtEl.textContent=gtFmtLong(gtToday());

  // ── Stats row ─────────────────────────────────────────────
  const allTasks = GT.tasks();
  const todayTasks = allTasks.filter(t=>gtTaskOccursOn(t, gtToday()));
  const todayDone  = todayTasks.filter(t=>t.status==='done').length;
  const todayTotal = todayTasks.length;
  const todayPct   = todayTotal>0 ? Math.round(todayDone/todayTotal*100) : 0;

  const wkDates  = gtWeekDates();
  const wkTasks  = allTasks.filter(t=>wkDates.some(d=>gtTaskOccursOn(t,d)));
  const wkDone   = wkTasks.filter(t=>t.status==='done').length;
  const wkTotal  = wkTasks.length;
  const wkPct    = wkTotal>0 ? Math.round(wkDone/wkTotal*100) : 0;

  const urgentCount  = allTasks.filter(t=>(t.priority==='critical'||t.priority==='high')&&t.status!=='done').length;
  const overdueCount = allTasks.filter(t=>t.dueDate&&t.dueDate<gtToday()&&t.status!=='done').length;

  const setEl = (id,v) => { const el=document.getElementById(id); if(el) el.textContent=v; };
  const setW  = (id,v) => { const el=document.getElementById(id); if(el) el.style.width=v; };

  setEl('db-done-num',   todayDone);
  setEl('db-done-denom', '/'+todayTotal);
  setW('db-done-fill',   todayPct+'%');
  setEl('db-week-num',   wkPct+'%');
  setEl('db-week-sub',   wkDone+' de '+wkTotal+' tareas');
  setW('db-week-fill',   wkPct+'%');
  setEl('db-urgent-num', urgentCount);
  setEl('db-overdue-num',overdueCount);

  // Color dinámico en overdue
  const overdueEl=document.getElementById('db-overdue-num');
  if(overdueEl) overdueEl.className='db-stat-num'+(overdueCount>0?' db-num-red':'');
  const urgentEl=document.getElementById('db-urgent-num');
  if(urgentEl) urgentEl.className='db-stat-num'+(urgentCount>0?' db-num-amber':'');
  const doneEl=document.getElementById('db-done-num');
  if(doneEl) doneEl.className='db-stat-num'+(todayDone>0&&todayDone===todayTotal?' db-num-green':'');

  // Focus badge
  setEl('db-focus-badge', todayDone+'/'+todayTotal);
  // Week badge
  setEl('db-week-badge', wkPct+'%');

  // Today list
  const todayEl = document.getElementById('gt-today-list');
  if (todayEl) {
    const sortFn = (a,b)=>{ if(a.status==='done'&&b.status!=='done')return 1; if(a.status!=='done'&&b.status==='done')return-1; return(GT_PRIO_ORDER[a.priority]??2)-(GT_PRIO_ORDER[b.priority]??2); };
    const todayTasks  = GT.tasks().filter(t=>gtTaskOccursOn(t, gtToday())).sort(sortFn);
    const undatedTasks = GT.tasks().filter(t=>!t.dueDate && t.status!=='done').sort(sortFn);

    const buildItem = t => {
      const tagChips=(t.tags||[]).map(tid=>gtTagChip(tid)).join('');
      return `<div class="gt-today-item" data-id="${t.id}">
        <button class="gt-check ${t.status==='done'?'checked':''}" data-id="${t.id}">
          <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="3 8 6.5 11 13 4.5"/></svg>
        </button>
        <div class="gt-today-info">
          <span class="gt-today-title" style="${t.status==='done'?'text-decoration:line-through;opacity:0.45':''}">${gtRecBadge(t)}${gtEsc(t.title)}</span>
          <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap">
            ${t.dueTime?`<span class="gt-today-time">${t.dueTime}</span>`:''}
            ${tagChips}
          </div>
        </div>
        ${gtPrioBadge(t.priority)}
      </div>`;
    };

    let html = '';
    if (todayTasks.length === 0 && undatedTasks.length === 0) {
      html = '<p style="color:var(--text-secondary);font-size:0.84rem;padding:0.5rem 0">Sin tareas para hoy</p>';
    } else {
      html = todayTasks.map(buildItem).join('');
      if (undatedTasks.length > 0) {
        html += `<div class="gt-today-sep">${todayTasks.length > 0 ? 'Sin fecha' : 'Sin fecha asignada'}</div>`;
        html += undatedTasks.map(buildItem).join('');
      }
    }
    todayEl.innerHTML = html;

    todayEl.querySelectorAll('.gt-today-item').forEach(el=>{
      el.addEventListener('click', e=>{ if (!e.target.closest('.gt-check')) gtOpenModal(el.dataset.id); });
    });
    todayEl.querySelectorAll('.gt-check').forEach(btn=>{
      btn.addEventListener('click', e=>{ e.stopPropagation();
        const task=GT.getTask(btn.dataset.id); if(!task)return;
        GT.editTask(task.id,{status:task.status==='done'?'todo':'done'});
        gtRenderHoy(); if(gtActiveTab==='lista') gtRenderLista();
      });
    });
  }

  // Weekly bars
  const weekEl = document.getElementById('gt-weekly');
  if (weekEl) {
    const wk=gtWeekDates();
    const names=['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
    const bars=wk.map((date,i)=>{
      const dt=allTasks.filter(t=>gtTaskOccursOn(t,date));
      const dp=dt.length>0?Math.round(dt.filter(t=>t.status==='done').length/dt.length*100):0;
      return `<div class="gt-day-bar ${gtIsToday(date)?'today-bar':''}">
        <div class="gt-bar-track"><div class="gt-bar-fill" style="height:${dp}%"></div></div>
        <span class="gt-bar-label">${names[i]}</span>
      </div>`;
    }).join('');
    weekEl.innerHTML=`<div class="gt-weekly-summary"><span class="gt-weekly-pct">${wkPct}%</span><span class="gt-weekly-sub">${wkDone} de ${wkTotal} completadas</span></div>
      <div class="gt-day-bars">${bars}</div>`;
    weekEl.querySelectorAll('.gt-day-bar').forEach((bar, i) => {
      bar.style.cursor='pointer';
      bar.title=`Ver ${gtFmtLong(wk[i])} en Calendario`;
      bar.addEventListener('click', () => { gtCalBase=wk[i]; gtSwitchTab('calendario'); });
    });
  }

  // Projects — compact rows
  const projEl = document.getElementById('gt-projects');
  if (projEl) {
    const projs = GT.projects();
    if (projs.length===0) { projEl.innerHTML='<p class="db-empty">Sin proyectos</p>'; return; }
    projEl.innerHTML=projs.map(p=>{
      const pt=allTasks.filter(t=>t.projectId===p.id);
      const done=pt.filter(t=>t.status==='done').length;
      const pct=pt.length>0?Math.round(done/pt.length*100):0;
      const todayN=pt.filter(t=>gtTaskOccursOn(t,gtToday())&&t.status!=='done').length;
      const countHtml=todayN>0
        ?`<span class="db-proj-today-badge">${todayN} hoy</span>`
        :`<span class="db-proj-tasks">${pt.length} tar.</span>`;
      return `<div class="db-proj-row" data-id="${p.id}">
        <span class="db-proj-dot" style="background:${p.color}"></span>
        <span class="db-proj-name">${gtEsc(p.name)}</span>
        <div class="db-proj-bar"><div class="db-proj-bar-fill" style="width:${pct}%;background:${p.color}"></div></div>
        <span class="db-proj-pct">${pct}%</span>
        ${countHtml}
      </div>`;
    }).join('');
    projEl.querySelectorAll('.db-proj-row').forEach(row=>{
      row.addEventListener('click',()=>{
        gtSwitchTab('lista');
        const sel=document.getElementById('gt-filter-project');
        if(sel){sel.value=row.dataset.id; gtFilters.project=row.dataset.id; gtRenderLista();}
      });
    });
  }

  // Upcoming events
  gtRenderUpcoming();
}

// ── Tab: Lista / Kanban ───────────────────────────────────────────────────────

let gtListView = 'list';
const gtFilters = { search:'', project:'', status:'', tag:'', priority:'' };

function gtRefreshProjectFilter(el) {
  if (!el) return;
  const saved = el.value||gtFilters.project;
  el.innerHTML='<option value="">Todos los proyectos</option>'+GT.projects().map(p=>`<option value="${p.id}">${gtEsc(p.name)}</option>`).join('');
  if (saved) el.value=saved;
}

function gtRefreshTagFilter(el) {
  if (!el) return;
  const saved = el.value||gtFilters.tag;
  el.innerHTML='<option value="">Todas las etiquetas</option>'+GT.tags().map(tag=>`<option value="${tag.id}">${gtEsc(tag.name)}</option>`).join('');
  if (saved) el.value=saved;
}

function gtGetFiltered() {
  let list=GT.tasks();
  if (gtFilters.search) { const s=gtFilters.search.toLowerCase(); list=list.filter(t=>t.title.toLowerCase().includes(s)); }
  if (gtFilters.project) list=list.filter(t=>t.projectId===gtFilters.project);
  if (gtFilters.status==='overdue') list=list.filter(t=>t.dueDate&&t.dueDate<gtToday()&&t.status!=='done');
  else if (gtFilters.status) list=list.filter(t=>t.status===gtFilters.status);
  if (gtFilters.tag) list=list.filter(t=>(t.tags||[]).includes(gtFilters.tag));
  if (gtFilters.priority==='high') list=list.filter(t=>t.priority==='critical'||t.priority==='high');
  else if (gtFilters.priority) list=list.filter(t=>t.priority===gtFilters.priority);
  return list;
}

function gtRenderLista() {
  const listEl=document.getElementById('gt-list-view'), kanbanEl=document.getElementById('gt-kanban-view');
  if (!listEl||!kanbanEl) return;
  if (gtListView==='list') { listEl.classList.remove('gt-hidden'); kanbanEl.classList.add('gt-hidden'); gtRenderTable(); }
  else { listEl.classList.add('gt-hidden'); kanbanEl.classList.remove('gt-hidden'); gtRenderKanban(); }
}

function gtRenderTable() {
  const tbody=document.getElementById('gt-tbody'); if (!tbody) return;
  const tasks=gtGetFiltered().sort((a,b)=>{
    if(a.status==='done'&&b.status!=='done')return 1; if(a.status!=='done'&&b.status==='done')return-1;
    if(a.dueDate&&b.dueDate)return a.dueDate.localeCompare(b.dueDate);
    return a.dueDate?-1:b.dueDate?1:0;
  });
  if (tasks.length===0){tbody.innerHTML=`<tr><td colspan="6" class="gt-empty">No hay tareas que coincidan.</td></tr>`;return;}
  tbody.innerHTML=tasks.map(t=>{
    const sp=t.subtasks.length>0?Math.round(t.subtasks.filter(s=>s.done).length/t.subtasks.length*100):null;
    const tagChips=(t.tags||[]).map(tid=>gtTagChip(tid)).join('');
    return `<tr class="gt-task-row ${t.status==='done'?'gt-done':''}" data-id="${t.id}">
      <td>${gtStatBadge(t.status)}</td>
      <td><div class="gt-task-cell">
        <div><span class="gt-task-title">${gtRecBadge(t)}${gtEsc(t.title)}</span>${sp!==null?`<span class="gt-sub-pct">${sp}%</span>`:''}</div>
        ${tagChips?`<div class="gt-task-tags">${tagChips}</div>`:''}
      </div></td>
      <td>${gtChip(t.projectId)}</td>
      <td>${gtPrioBadge(t.priority)}</td>
      <td>${gtDueSpan(t.dueDate,t.dueTime)}</td>
      <td class="gt-dur">${t.duration?`${t.duration}m`:''}</td>
    </tr>`;
  }).join('');
  tbody.querySelectorAll('.gt-task-row').forEach(row=>row.addEventListener('click',()=>gtOpenModal(row.dataset.id)));
}

function gtRenderKanban() {
  ['todo','in-progress','done'].forEach(status=>{
    const col=document.getElementById(`gt-col-${status}`); if (!col) return;
    const body=col.querySelector('.gt-col-body'); if (!body) return;
    const tasks=gtGetFiltered().filter(t=>t.status===status);
    body.innerHTML=tasks.length===0?'<p class="gt-kanban-empty">Sin tareas</p>'
      :tasks.map(t=>{
        const tagChips=(t.tags||[]).map(tid=>gtTagChip(tid)).join('');
        return `<div class="gt-card-item" data-id="${t.id}" draggable="true">
          <div class="gt-card-item-title">${gtRecBadge(t)}${gtEsc(t.title)}</div>
          <div class="gt-card-item-foot">${gtChip(t.projectId)}${gtPrioBadge(t.priority)}${gtDueSpan(t.dueDate,null)}${tagChips}</div>
        </div>`;
      }).join('');
    body.querySelectorAll('.gt-card-item').forEach(card=>{
      card.addEventListener('click',()=>gtOpenModal(card.dataset.id));
      card.addEventListener('dragstart',e=>{e.dataTransfer.setData('gtTaskId',card.dataset.id);card.classList.add('gt-dragging');});
      card.addEventListener('dragend',()=>card.classList.remove('gt-dragging'));
    });
    col.addEventListener('dragover',e=>{e.preventDefault();col.classList.add('gt-drag-over');});
    col.addEventListener('dragleave',()=>col.classList.remove('gt-drag-over'));
    col.addEventListener('drop',e=>{
      e.preventDefault(); col.classList.remove('gt-drag-over');
      const id=e.dataTransfer.getData('gtTaskId'); if(id){GT.editTask(id,{status:col.dataset.status});gtRenderKanban();}
    });
  });
  document.querySelectorAll('.gt-col-add').forEach(btn=>{
    btn.addEventListener('click',()=>gtOpenModal(null,{status:btn.dataset.status}));
  });
}

// ── Tab: Calendario ───────────────────────────────────────────────────────────

let gtCalBase = null;

function gtRenderCalUndated() {
  const el = document.getElementById('gt-cal-undated');
  if (!el) return;
  const undated = GT.tasks()
    .filter(t => !t.dueDate && t.status !== 'done')
    .sort((a,b) => (GT_PRIO_ORDER[a.priority]??2)-(GT_PRIO_ORDER[b.priority]??2));
  if (undated.length === 0) { el.style.display = 'none'; return; }
  el.style.display = '';
  el.innerHTML = '<div class="gt-cal-time-label" style="font-size:0.58rem;text-transform:uppercase;letter-spacing:0.04em;color:var(--text-secondary)">Sin<br>fecha</div>'
    + '<div class="gt-undated-wrap">'
    + undated.map(t => {
        const p = GT.getProject(t.projectId), color = p ? p.color : '#1a1a1a';
        return `<div class="gt-cal-event" data-id="${t.id}" style="background:${color}20;border-left:3px solid ${color};color:${color}">${gtEsc(t.title)}</div>`;
      }).join('')
    + '</div>';
  el.querySelectorAll('.gt-cal-event').forEach(ev =>
    ev.addEventListener('click', e => { e.stopPropagation(); gtOpenModal(ev.dataset.id); })
  );
}

function gtRenderCal() {
  const wk=gtWeekDates(gtCalBase);
  const lbl=document.getElementById('gt-cal-label');
  if (lbl) lbl.textContent=`${gtFmtShort(wk[0])} – ${gtFmtShort(wk[6])}`;
  gtRenderCalHeaders(wk);
  gtRenderCalAllDay(wk);
  gtRenderCalUndated();
  gtRenderCalSlots(wk);
}

function gtRenderCalHeaders(wk) {
  const el=document.getElementById('gt-cal-headers'); if (!el) return;
  const names=['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
  el.innerHTML='<div class="gt-cal-time-head"></div>'+wk.map((date,i)=>{
    const d=parseInt(date.split('-')[2]), isT=gtIsToday(date);
    return `<div class="gt-cal-day-head ${isT?'gt-today':''}" data-date="${date}">
      <span class="gt-day-name">${names[i]}</span>
      <span class="gt-day-num ${isT?'gt-today-num':''}">${d}</span>
    </div>`;
  }).join('');
}

function gtRenderCalAllDay(wk) {
  const el=document.getElementById('gt-cal-allday'); if (!el) return;
  const all=GT.tasks();
  el.innerHTML='<div class="gt-cal-time-label" style="font-size:0.58rem;text-transform:uppercase;letter-spacing:0.04em">Todo<br>el día</div>'+
    wk.map(date=>{
      const dt=all.filter(t=>gtTaskOccursOn(t,date)&&!t.dueTime);
      return `<div class="gt-allday-cell" data-date="${date}">${dt.map(t=>{
        const p=GT.getProject(t.projectId), color=p?p.color:'#1a1a1a';
        return `<div class="gt-cal-event" data-id="${t.id}" style="background:${color}20;border-left:3px solid ${color};color:${color}">${gtEsc(t.title)}</div>`;
      }).join('')}</div>`;
    }).join('');
  el.querySelectorAll('.gt-cal-event').forEach(ev=>ev.addEventListener('click',e=>{e.stopPropagation();gtOpenModal(ev.dataset.id);}));
  el.querySelectorAll('.gt-allday-cell').forEach(cell=>cell.addEventListener('click',()=>gtOpenModal(null,{dueDate:cell.dataset.date})));
}

function gtRenderCalSlots(wk) {
  const el=document.getElementById('gt-cal-slots'); if (!el) return;
  const START=7, END=21, PX=60, totalH=(END-START)*PX;
  const all=GT.tasks();
  const timeCol=Array.from({length:END-START},(_,i)=>
    `<div class="gt-hour-label" style="height:${PX}px">${String(START+i).padStart(2,'0')}:00</div>`).join('');
  const cols=wk.map(date=>{
    const dt=all.filter(t=>gtTaskOccursOn(t,date)&&t.dueTime&&parseInt(t.dueTime)>=START&&parseInt(t.dueTime)<END);
    const lines=Array.from({length:END-START},(_,i)=>`<div class="gt-hour-line" style="top:${i*PX}px"></div>`).join('');
    const blocks=dt.map(t=>{
      const [h,min]=t.dueTime.split(':').map(Number), top=((h-START)*60+min)/60*PX;
      const height=Math.max(22,(t.duration||30)/60*PX);
      const p=GT.getProject(t.projectId), color=p?p.color:'#1a1a1a';
      return `<div class="gt-event-block" data-id="${t.id}" style="top:${top}px;height:${height}px;background:${color}18;border-left:3px solid ${color};color:${color}">
        <span class="gt-ev-time">${t.dueTime}</span><span class="gt-ev-title">${gtEsc(t.title)}</span>
      </div>`;
    }).join('');
    return `<div class="gt-day-col ${gtIsToday(date)?'gt-today-col':''}" data-date="${date}" style="height:${totalH}px">${lines}${blocks}</div>`;
  }).join('');
  el.innerHTML=`<div class="gt-time-col">${timeCol}</div>${cols}`;
  el.querySelectorAll('.gt-event-block').forEach(ev=>ev.addEventListener('click',e=>{e.stopPropagation();gtOpenModal(ev.dataset.id);}));
  el.querySelectorAll('.gt-day-col').forEach(col=>col.addEventListener('click',e=>{
    if (e.target.closest('.gt-event-block')) return;
    const rect=col.getBoundingClientRect(), relY=e.clientY-rect.top;
    const totalMin=START*60+Math.floor(relY/PX*60);
    const h=Math.min(Math.floor(totalMin/60),END-1), m=Math.floor((totalMin%60)/15)*15;
    gtOpenModal(null,{dueDate:col.dataset.date,dueTime:`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`});
  }));
}

// ── Dashboard: upcoming events ────────────────────────────────────────────────

function gtRenderUpcoming() {
  const el = document.getElementById('db-upcoming');
  const badgeEl = document.getElementById('db-upcoming-badge');
  if (!el) return;

  const today = gtToday();
  const [ty, tm, td] = today.split('-').map(Number);
  const fromDate = gtToYMD(new Date(ty, tm - 1, td + 1));   // mañana
  const toDate   = gtToYMD(new Date(ty, tm - 1, td + 15));  // +15 días

  const allTasks = GT.tasks();
  const events = [];

  allTasks.forEach(task => {
    if (task.status === 'done') return;
    const occs = gtGetOccurrencesInRange(task, fromDate, toDate)
                   .filter(d => d > today);  // garantía extra: excluir hoy
    if (occs.length > 0) events.push({ task, date: occs[0] });
  });

  events.sort((a, b) => a.date.localeCompare(b.date));
  const items = events.slice(0, 8);

  if (badgeEl) badgeEl.textContent = items.length > 0 ? items.length : '';

  if (items.length === 0) {
    el.innerHTML = '<p class="db-empty">Sin eventos en los próximos 14 días</p>';
    return;
  }

  el.innerHTML = items.map(({ task, date }) => {
    const todayD   = new Date(today + 'T12:00:00');
    const eventD   = new Date(date + 'T12:00:00');
    const dayDiff  = Math.round((eventD - todayD) / 86400000);
    const dateLabel = dayDiff === 1 ? 'Mañana' : gtFmtShort(date);
    const isSoon   = dayDiff <= 2;
    const isRec    = task.recurrence && task.recurrence.type !== 'none';
    const proj     = GT.getProject(task.projectId);

    // Prefer first tag chip, fallback to project dot
    const firstTag = (task.tags || []).length > 0 ? GT.getTag(task.tags[0]) : null;
    const metaHtml = firstTag
      ? `<span class="db-upcoming-tag" style="background:${firstTag.color}20;color:${firstTag.color};border-color:${firstTag.color}40">${gtEsc(firstTag.name)}</span>`
      : (proj ? `<span class="db-upcoming-dot" style="background:${proj.color}" title="${gtEsc(proj.name)}"></span>` : '');

    return `<div class="db-upcoming-item" data-id="${task.id}">
      <span class="db-upcoming-date${isSoon ? ' db-date-soon' : ''}">${dateLabel}</span>
      <span class="db-upcoming-title">${isRec ? '↻ ' : ''}${gtEsc(task.title)}</span>
      ${metaHtml}
    </div>`;
  }).join('');

  el.querySelectorAll('.db-upcoming-item').forEach(item => {
    item.addEventListener('click', () => gtOpenModal(item.dataset.id));
  });
}

// ── Tags: modal picker ────────────────────────────────────────────────────────

function gtRenderModalTagsPicker(selectedIds=[]) {
  const container=document.getElementById('gt-modal-tags-picker'); if(!container) return;
  const tags=GT.tags();
  if (tags.length===0) {
    container.innerHTML='<span class="gt-tags-empty-hint">Sin etiquetas. Créalas en la pestaña <b>Configuraciones</b>.</span>';
    return;
  }
  container.innerHTML=tags.map(tag=>{
    const sel=selectedIds.includes(tag.id);
    const selStyle=sel?`background:${tag.color}22;border-color:${tag.color};color:${tag.color}`:'';
    return `<button type="button" class="gt-modal-tag-btn ${sel?'selected':''}" data-tag-id="${tag.id}" data-color="${tag.color}" style="${selStyle}">
      <span class="gt-modal-tag-dot" style="background:${tag.color}"></span>${gtEsc(tag.name)}
    </button>`;
  }).join('');
  container.querySelectorAll('.gt-modal-tag-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const c=btn.dataset.color||'#999';
      btn.classList.toggle('selected');
      if (btn.classList.contains('selected')) {
        btn.style.background=c+'22'; btn.style.borderColor=c; btn.style.color=c;
      } else {
        btn.style.background=''; btn.style.borderColor=''; btn.style.color='';
      }
    });
  });
}

function gtGetModalSelectedTags() {
  return Array.from(document.querySelectorAll('#gt-modal-tags-picker .gt-modal-tag-btn.selected')).map(b=>b.dataset.tagId);
}

// ── Recurrence modal helpers ──────────────────────────────────────────────────

function gtToggleRecurrenceFields() {
  const type=document.getElementById('gt-rec-type')?.value||'none';
  const iWrap=document.getElementById('gt-rec-interval-wrap');
  const eWrap=document.getElementById('gt-rec-end-wrap');
  const unitEl=document.getElementById('gt-rec-unit');
  const show=type!=='none';
  if(iWrap) iWrap.style.display=show?'flex':'none';
  if(eWrap) eWrap.style.display=show?'':'none';
  const units={daily:'días',weekly:'semanas',monthly:'meses',yearly:'años'};
  if(unitEl) unitEl.textContent=units[type]||'';
}

// ── Tags: Etiquetas tab ───────────────────────────────────────────────────────

function gtRenderTagsTab() {
  const listEl=document.getElementById('gt-tags-list');
  const emptyEl=document.getElementById('gt-tags-empty');
  if (!listEl||!emptyEl) return;
  const tags=GT.tags(), allTasks=GT.tasks();
  if (tags.length===0) { listEl.innerHTML=''; emptyEl.style.display=''; return; }
  emptyEl.style.display='none';
  const editSvg=`<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M11 2l3 3L5 14H2v-3L11 2z"/></svg>`;
  const delSvg =`<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><polyline points="3 4 13 4"/><path d="M5 4V2h6v2M4 4l1 10h6l1-10"/></svg>`;
  listEl.innerHTML=tags.map(tag=>{
    const count=allTasks.filter(t=>(t.tags||[]).includes(tag.id)).length;
    return `<div class="cfg-item-row">
      <div class="cfg-item-left">
        <span class="cfg-item-dot" style="background:${tag.color}" data-edit="${tag.id}"></span>
        <span class="cfg-item-name">${gtEsc(tag.name)}</span>
        <span class="gt-tag-chip" style="background:${tag.color}20;color:${tag.color};border-color:${tag.color}40">${gtEsc(tag.name)}</span>
      </div>
      <div class="cfg-item-right">
        <span class="cfg-item-count gt-nav-count" data-tag-nav="${tag.id}" title="Ver tareas con esta etiqueta">${count} ${count===1?'tarea':'tareas'}</span>
        <button class="cfg-icon-btn" data-edit="${tag.id}" title="Editar">${editSvg}</button>
        <button class="cfg-icon-btn cfg-del" data-del="${tag.id}" title="Eliminar">${delSvg}</button>
      </div>
    </div>`;
  }).join('');
  listEl.querySelectorAll('[data-edit]').forEach(el=>{
    el.addEventListener('click',()=>gtOpenTagModal(el.dataset.edit,'tag'));
  });
  listEl.querySelectorAll('[data-tag-nav]').forEach(el=>{
    el.addEventListener('click',()=>gtNavigateToLista({tag:el.dataset.tagNav}));
  });
  listEl.querySelectorAll('.cfg-del[data-del]').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const tag=GT.getTag(btn.dataset.del);
      if(confirm(`¿Eliminar la etiqueta "${tag?.name||''}"?\nSe quitará de todas las tareas.`)){
        GT.removeTag(btn.dataset.del);
        gtRenderTagsTab();
        gtRefreshTagFilter(document.getElementById('gt-filter-tag'));
      }
    });
  });
}

// ── Configuraciones: proyectos ────────────────────────────────────────────────

function gtRenderProjectsSection() {
  const listEl=document.getElementById('cfg-projects-list'); if(!listEl) return;
  const projs=GT.projects(), all=GT.tasks();
  if(projs.length===0){ listEl.innerHTML='<div class="cfg-empty-state">Sin proyectos. Crea el primero.</div>'; return; }
  const editIcon=`<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M11 2l3 3L5 14H2v-3L11 2z"/></svg>`;
  const delIcon =`<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><polyline points="3 4 13 4"/><path d="M5 4V2h6v2M4 4l1 10h6l1-10"/></svg>`;
  listEl.innerHTML=projs.map(p=>{
    const count=all.filter(t=>t.projectId===p.id).length;
    return `<div class="cfg-item-row">
      <div class="cfg-item-left">
        <span class="cfg-item-dot" style="background:${p.color}" data-edit-proj="${p.id}"></span>
        <span class="cfg-item-name">${gtEsc(p.name)}</span>
        <span class="gt-tag-chip" style="background:${p.color}20;color:${p.color};border-color:${p.color}40">${gtEsc(p.name)}</span>
      </div>
      <div class="cfg-item-right">
        <span class="cfg-item-count gt-nav-count" data-proj-nav="${p.id}" title="Ver tareas de este proyecto">${count} tar.</span>
        <button class="cfg-icon-btn" data-edit-proj="${p.id}" title="Editar">${editIcon}</button>
        <button class="cfg-icon-btn cfg-del" data-del-proj="${p.id}" title="Eliminar">${delIcon}</button>
      </div>
    </div>`;
  }).join('');
  listEl.querySelectorAll('[data-edit-proj]').forEach(el=>{
    el.addEventListener('click',()=>gtOpenTagModal(el.dataset.editProj,'project'));
  });
  listEl.querySelectorAll('[data-proj-nav]').forEach(el=>{
    el.addEventListener('click',()=>gtNavigateToLista({project:el.dataset.projNav}));
  });
  listEl.querySelectorAll('[data-del-proj]').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const p=GT.getProject(btn.dataset.delProj);
      if(confirm(`¿Eliminar el proyecto "${p?.name||''}"?\nLas tareas quedarán sin proyecto asignado.`)){
        GT.removeProject(btn.dataset.delProj);
        gtRenderProjectsSection();
        gtRefreshProjectFilter(document.getElementById('gt-filter-project'));
        gtRefreshPanel();
      }
    });
  });
}

// ── Configuraciones: prioridades ──────────────────────────────────────────────

function gtRenderPrioritySection() {
  const el=document.getElementById('cfg-prio-list'); if(!el) return;
  const colors=GT.prioColors();
  const prios=[
    {key:'critical',label:'Crítica'},
    {key:'high',    label:'Alta'},
    {key:'medium',  label:'Media'},
    {key:'low',     label:'Baja'},
    {key:'minimal', label:'Mínima'}
  ];
  el.innerHTML=prios.map(p=>{
    const color=colors[p.key]||'#64748b';
    return `<div class="cfg-item-row">
      <div class="cfg-item-left">
        <input type="color" class="cfg-prio-dot" data-prio="${p.key}" value="${color}" title="Cambiar color">
        <span class="cfg-item-name">${p.label}</span>
        <span class="gt-badge gt-nav-count" id="cfg-pp-${p.key}" data-prio-nav="${p.key}" style="background:${color}1c;color:${color}" title="Ver tareas con esta prioridad">${p.label}</span>
      </div>
      <div class="cfg-item-right">
        <span class="cfg-prio-hex" id="cfg-ph-${p.key}">${color}</span>
      </div>
    </div>`;
  }).join('');
  el.querySelectorAll('.cfg-prio-dot').forEach(input=>{
    input.addEventListener('input',()=>{
      const prio=input.dataset.prio, color=input.value;
      const c=GT.prioColors(); c[prio]=color; GT.savePrioColors(c);
      const badge=document.getElementById(`cfg-pp-${prio}`);
      if(badge){ badge.style.background=color+'1c'; badge.style.color=color; }
      const hexEl=document.getElementById(`cfg-ph-${prio}`);
      if(hexEl) hexEl.textContent=color;
      gtRefreshPanel();
    });
  });
  el.querySelectorAll('[data-prio-nav]').forEach(badge=>{
    badge.addEventListener('click',()=>gtNavigateToLista({priority:badge.dataset.prioNav}));
  });
}

// ── Tag / Project editor modal (shared) ───────────────────────────────────────

let gtCurrentTagId  = null;
let gtCurrentProjId = null;
let gtEditorMode    = 'tag'; // 'tag' | 'project'

function gtOpenTagModal(id=null, mode='tag') {
  gtEditorMode=mode;
  gtCurrentTagId=null; gtCurrentProjId=null;
  const nameEl=document.getElementById('gt-tag-name');
  const colorEl=document.getElementById('gt-tag-color');
  const heading=document.getElementById('gt-tag-modal-heading');
  const delBtn=document.getElementById('gt-tag-delete');
  const labels={ tag:{new:'Nueva etiqueta',edit:'Editar etiqueta'}, project:{new:'Nuevo proyecto',edit:'Editar proyecto'} };

  let name='', color='#3b82f6', isEdit=false;
  if(mode==='project'&&id) {
    const p=GT.getProject(id); if(!p) return;
    gtCurrentProjId=id; name=p.name; color=p.color; isEdit=true;
  } else if(mode==='tag'&&id) {
    const t=GT.getTag(id); if(!t) return;
    gtCurrentTagId=id; name=t.name; color=t.color; isEdit=true;
  }

  if(heading) heading.textContent=labels[mode][isEdit?'edit':'new'];
  if(nameEl)  nameEl.value=name;
  if(colorEl) colorEl.value=color;
  if(delBtn)  delBtn.style.display=isEdit?'':'none';
  gtUpdateTagPreview();
  document.getElementById('gt-tag-modal-overlay')?.classList.add('gt-visible');
  setTimeout(()=>nameEl?.focus(),60);
}

function gtCloseTagModal() {
  document.getElementById('gt-tag-modal-overlay')?.classList.remove('gt-visible');
  gtCurrentTagId=null; gtCurrentProjId=null;
}

function gtUpdateTagPreview() {
  const color=document.getElementById('gt-tag-color')?.value||'#3b82f6';
  const name=document.getElementById('gt-tag-name')?.value||(gtEditorMode==='project'?'Proyecto':'Etiqueta');
  const preview=document.getElementById('gt-tag-preview');
  if(preview) preview.innerHTML=`<span class="gt-tag-chip" style="background:${color}22;color:${color};border-color:${color}44">${gtEsc(name)}</span>`;
}

function gtSaveTagModal() {
  const nameEl=document.getElementById('gt-tag-name');
  const name=(nameEl?.value||'').trim();
  if(!name){nameEl?.classList.add('gt-error');nameEl?.focus();setTimeout(()=>nameEl?.classList.remove('gt-error'),600);return;}
  const color=document.getElementById('gt-tag-color')?.value||'#3b82f6';

  if(gtEditorMode==='project') {
    if(gtCurrentProjId) GT.editProject(gtCurrentProjId,{name,color});
    else GT.addProject({name,color});
    gtCloseTagModal();
    gtRenderProjectsSection();
    gtRefreshProjectFilter(document.getElementById('gt-filter-project'));
    gtRefreshPanel();
  } else {
    if(gtCurrentTagId) GT.editTag(gtCurrentTagId,{name,color});
    else GT.addTag({name,color});
    gtCloseTagModal();
    gtRenderTagsTab();
    gtRefreshTagFilter(document.getElementById('gt-filter-tag'));
    gtRenderModalTagsPicker([]);
  }
}

// ── Modal ─────────────────────────────────────────────────────────────────────

let gtCurrentTaskId = null;

function gtOpenModal(taskId, defaults={}) {
  gtCurrentTaskId=taskId||null;

  // Refresh project select
  const pSel=document.getElementById('gt-project');
  if (pSel) pSel.innerHTML='<option value="">Sin proyecto</option>'+GT.projects().map(p=>`<option value="${p.id}">${gtEsc(p.name)}</option>`).join('');

  // Reset
  ['gt-title','gt-description','gt-due-date','gt-due-time'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('gt-status').value='todo';
  document.getElementById('gt-priority').value='medium';
  document.getElementById('gt-duration').value='30';
  document.getElementById('gt-subtasks-list').innerHTML='';
  document.getElementById('gt-delete').style.display='none';
  document.getElementById('gt-modal-heading').textContent='Nueva tarea';
  const recType=document.getElementById('gt-rec-type');
  const recInterval=document.getElementById('gt-rec-interval');
  const recEnd=document.getElementById('gt-rec-end');
  if(recType) recType.value='none';
  if(recInterval) recInterval.value='1';
  if(recEnd) recEnd.value='';
  gtToggleRecurrenceFields();
  gtRenderModalTagsPicker([]);

  if (taskId) {
    const t=GT.getTask(taskId); if (!t) return;
    document.getElementById('gt-modal-heading').textContent='Editar tarea';
    document.getElementById('gt-title').value=t.title;
    document.getElementById('gt-description').value=t.description||'';
    if (pSel) pSel.value=t.projectId||'';
    document.getElementById('gt-status').value=t.status;
    document.getElementById('gt-priority').value=t.priority;
    document.getElementById('gt-due-date').value=t.dueDate||'';
    document.getElementById('gt-due-time').value=t.dueTime||'';
    document.getElementById('gt-duration').value=t.duration||30;
    document.getElementById('gt-delete').style.display='';
    (t.subtasks||[]).forEach(s=>gtAddSubtask(s.title,s.done,s.id));
    const rec=t.recurrence||{type:'none',interval:1,endDate:null};
    if(recType) recType.value=rec.type||'none';
    if(recInterval) recInterval.value=rec.interval||1;
    if(recEnd) recEnd.value=rec.endDate||'';
    gtToggleRecurrenceFields();
    gtRenderModalTagsPicker(t.tags||[]);
  } else {
    if (defaults.dueDate) document.getElementById('gt-due-date').value=defaults.dueDate;
    if (defaults.dueTime) document.getElementById('gt-due-time').value=defaults.dueTime;
    if (defaults.title)   document.getElementById('gt-title').value=defaults.title;
    if (defaults.status)  document.getElementById('gt-status').value=defaults.status;
  }

  document.getElementById('gt-modal-overlay').classList.add('gt-visible');
  setTimeout(()=>document.getElementById('gt-title')?.focus(),60);
}

function gtCloseModal() {
  document.getElementById('gt-modal-overlay')?.classList.remove('gt-visible');
  gtCurrentTaskId=null;
}

function gtAddSubtask(title='',done=false,id=null) {
  const list=document.getElementById('gt-subtasks-list'); if (!list) return;
  const rowId=id||gtId();
  const row=document.createElement('div');
  row.className='gt-subtask-row'; row.dataset.id=rowId;
  row.innerHTML=`
    <input type="checkbox" class="gt-subtask-check" ${done?'checked':''}>
    <input type="text" class="gt-subtask-input" value="${gtEsc(title)}" placeholder="Subtarea...">
    <button class="gt-subtask-rm" title="Eliminar">
      <svg viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
        <line x1="3" y1="3" x2="13" y2="13"/><line x1="13" y1="3" x2="3" y2="13"/>
      </svg>
    </button>`;
  row.querySelector('.gt-subtask-rm').addEventListener('click',()=>row.remove());
  row.querySelector('.gt-subtask-input').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();gtAddSubtask();}});
  list.appendChild(row);
  if (!id) row.querySelector('.gt-subtask-input').focus();
}

function gtSaveModal() {
  const titleEl=document.getElementById('gt-title'), title=titleEl.value.trim();
  if (!title){ titleEl.classList.add('gt-error'); titleEl.focus(); setTimeout(()=>titleEl.classList.remove('gt-error'),600); return; }
  const subtasks=Array.from(document.querySelectorAll('#gt-subtasks-list .gt-subtask-row')).map(row=>({
    id:row.dataset.id, title:row.querySelector('.gt-subtask-input').value.trim(), done:row.querySelector('.gt-subtask-check').checked
  })).filter(s=>s.title);
  const recT=document.getElementById('gt-rec-type')?.value||'none';
  const recI=parseInt(document.getElementById('gt-rec-interval')?.value)||1;
  const recE=document.getElementById('gt-rec-end')?.value||null;
  const recurrence={type:recT,interval:recI,endDate:recE};
  const tags=gtGetModalSelectedTags();
  const data={
    title, description:document.getElementById('gt-description').value.trim(),
    projectId:document.getElementById('gt-project').value,
    status:document.getElementById('gt-status').value,
    priority:document.getElementById('gt-priority').value,
    dueDate:document.getElementById('gt-due-date').value||null,
    dueTime:document.getElementById('gt-due-time').value||null,
    duration:parseInt(document.getElementById('gt-duration').value)||30,
    subtasks, tags, recurrence
  };
  if (gtCurrentTaskId) GT.editTask(gtCurrentTaskId,data); else GT.addTask(data);
  gtCloseModal(); gtRefreshPanel();
}

// ── Command palette ───────────────────────────────────────────────────────────

function gtOpenCmd() {
  const ov=document.getElementById('gt-cmd-overlay'), inp=document.getElementById('gt-cmd-input');
  ov?.classList.add('gt-visible'); if(inp){inp.value='';inp.focus();}
}

function gtCloseCmd() { document.getElementById('gt-cmd-overlay')?.classList.remove('gt-visible'); }

// ── Tab switching ─────────────────────────────────────────────────────────────

let gtActiveTab = 'hoy';

function gtNavigateToLista({ search='', project='', status='', tag='', priority='' } = {}) {
  gtFilters.search=search; gtFilters.project=project;
  gtFilters.status=status; gtFilters.tag=tag; gtFilters.priority=priority;
  gtSwitchTab('lista');
  const searchEl=document.getElementById('gt-search');
  const tagEl=document.getElementById('gt-filter-tag');
  const statusEl=document.getElementById('gt-filter-status');
  const prioEl=document.getElementById('gt-filter-priority');
  if(searchEl) searchEl.value=search;
  if(tagEl) tagEl.value=tag;
  if(statusEl) statusEl.value=status;
  if(prioEl) prioEl.value=priority;
}

function gtSwitchTab(name) {
  document.querySelectorAll('.gt-tab').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('.gt-tab-content').forEach(c=>c.classList.remove('active'));
  document.querySelector(`.gt-tab[data-tab="${name}"]`)?.classList.add('active');
  document.getElementById(`gt-tab-${name}`)?.classList.add('active');
  gtActiveTab=name;
  if (name==='hoy')        gtRenderHoy();
  if (name==='lista') {
    gtRefreshProjectFilter(document.getElementById('gt-filter-project'));
    gtRefreshTagFilter(document.getElementById('gt-filter-tag'));
    const statusEl=document.getElementById('gt-filter-status');
    const prioEl=document.getElementById('gt-filter-priority');
    if(statusEl) statusEl.value=gtFilters.status;
    if(prioEl) prioEl.value=gtFilters.priority;
    gtRenderLista();
  }
  if (name==='calendario') { gtCalBase=gtCalBase||gtToday(); gtRenderCal(); }
  if (name==='etiquetas')  { gtRenderTagsTab(); gtRenderProjectsSection(); gtRenderPrioritySection(); }
}

function gtRefreshPanel() {
  if (gtActiveTab==='hoy')        gtRenderHoy();
  else if (gtActiveTab==='lista') gtRenderLista();
  else if (gtActiveTab==='calendario') gtRenderCal();
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

function gtInit() {
  GT.seed();

  // Tabs
  document.querySelectorAll('.gt-tab').forEach(btn=>{
    btn.addEventListener('click',()=>{
      if (btn.dataset.tab === 'lista') {
        gtFilters.search=''; gtFilters.project=''; gtFilters.status=''; gtFilters.tag=''; gtFilters.priority='';
        const searchEl=document.getElementById('gt-search');
        if(searchEl) searchEl.value='';
      }
      gtSwitchTab(btn.dataset.tab);
    });
  });

  // New task button
  document.getElementById('gt-new-task')?.addEventListener('click',()=>gtOpenModal());
  document.getElementById('db-add-today')?.addEventListener('click',()=>gtOpenModal(null,{dueDate:gtToday()}));

  // Dashboard stat card navigation
  document.getElementById('db-stat-week')?.addEventListener('click',()=>{ gtCalBase=gtCalBase||gtToday(); gtSwitchTab('calendario'); });
  document.getElementById('db-stat-urgent')?.addEventListener('click',()=>gtNavigateToLista({priority:'high'}));
  document.getElementById('db-stat-overdue')?.addEventListener('click',()=>gtNavigateToLista({status:'overdue'}));

  // Dashboard quick nav links
  document.getElementById('db-nav-tareas')?.addEventListener('click',()=>{
    gtFilters.search=''; gtFilters.project=''; gtFilters.status=''; gtFilters.tag=''; gtFilters.priority='';
    const searchEl=document.getElementById('gt-search');
    if(searchEl) searchEl.value='';
    gtSwitchTab('lista');
  });
  document.getElementById('db-nav-calendario')?.addEventListener('click',()=>{ gtCalBase=gtCalBase||gtToday(); gtSwitchTab('calendario'); });
  document.getElementById('db-nav-configuraciones')?.addEventListener('click',()=>gtSwitchTab('etiquetas'));

  // Lista toolbar
  document.getElementById('gt-search')?.addEventListener('input',e=>{gtFilters.search=e.target.value;gtRenderLista();});
  document.getElementById('gt-filter-project')?.addEventListener('change',e=>{gtFilters.project=e.target.value;gtRenderLista();});
  document.getElementById('gt-filter-tag')?.addEventListener('change',e=>{gtFilters.tag=e.target.value;gtRenderLista();});
  document.getElementById('gt-filter-priority')?.addEventListener('change',e=>{gtFilters.priority=e.target.value;gtRenderLista();});
  document.getElementById('gt-filter-status')?.addEventListener('change',e=>{gtFilters.status=e.target.value;gtRenderLista();});
  document.getElementById('gt-btn-list')?.addEventListener('click',()=>{
    gtListView='list'; document.getElementById('gt-btn-list')?.classList.add('active'); document.getElementById('gt-btn-kanban')?.classList.remove('active'); gtRenderLista();
  });
  document.getElementById('gt-btn-kanban')?.addEventListener('click',()=>{
    gtListView='kanban'; document.getElementById('gt-btn-kanban')?.classList.add('active'); document.getElementById('gt-btn-list')?.classList.remove('active'); gtRenderLista();
  });

  // Calendario nav
  document.getElementById('gt-cal-prev')?.addEventListener('click',()=>{
    const [y,m,d]=(gtCalBase||gtToday()).split('-').map(Number);
    gtCalBase=gtToYMD(new Date(y,m-1,d-7)); gtRenderCal();
  });
  document.getElementById('gt-cal-next')?.addEventListener('click',()=>{
    const [y,m,d]=(gtCalBase||gtToday()).split('-').map(Number);
    gtCalBase=gtToYMD(new Date(y,m-1,d+7)); gtRenderCal();
  });
  document.getElementById('gt-cal-today')?.addEventListener('click',()=>{gtCalBase=gtToday();gtRenderCal();});

  // Modal
  document.getElementById('gt-modal-close')?.addEventListener('click',gtCloseModal);
  document.getElementById('gt-cancel')?.addEventListener('click',gtCloseModal);
  document.getElementById('gt-modal-overlay')?.addEventListener('click',e=>{if(e.target.id==='gt-modal-overlay')gtCloseModal();});
  document.getElementById('gt-save')?.addEventListener('click',gtSaveModal);
  document.getElementById('gt-delete')?.addEventListener('click',()=>{
    if (gtCurrentTaskId&&confirm('¿Eliminar esta tarea?')){ GT.removeTask(gtCurrentTaskId); gtCloseModal(); gtRefreshPanel(); }
  });
  document.getElementById('gt-add-subtask')?.addEventListener('click',()=>gtAddSubtask());
  document.getElementById('gt-title')?.addEventListener('keydown',e=>{
    if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();gtSaveModal();}
    if(e.key==='Escape')gtCloseModal();
  });
  document.getElementById('gt-rec-type')?.addEventListener('change',gtToggleRecurrenceFields);

  // Configuraciones tab
  document.getElementById('gt-new-tag')?.addEventListener('click',()=>gtOpenTagModal(null,'tag'));
  document.getElementById('cfg-new-project')?.addEventListener('click',()=>gtOpenTagModal(null,'project'));
  document.getElementById('cfg-clear-tasks')?.addEventListener('click',()=>{
    if(confirm('¿Borrar TODAS las tareas? Esta acción no se puede deshacer.')){
      GT.saveTasks([]);
      gtRefreshPanel();
      gtRenderHoy();
    }
  });

  // Tag editor modal
  document.getElementById('gt-tag-modal-close')?.addEventListener('click',gtCloseTagModal);
  document.getElementById('gt-tag-cancel')?.addEventListener('click',gtCloseTagModal);
  document.getElementById('gt-tag-modal-overlay')?.addEventListener('click',e=>{if(e.target.id==='gt-tag-modal-overlay')gtCloseTagModal();});
  document.getElementById('gt-tag-save')?.addEventListener('click',gtSaveTagModal);
  document.getElementById('gt-tag-delete')?.addEventListener('click',()=>{
    if(gtEditorMode==='project'&&gtCurrentProjId) {
      const p=GT.getProject(gtCurrentProjId);
      if(confirm(`¿Eliminar el proyecto "${p?.name||''}"?\nLas tareas quedarán sin proyecto asignado.`)){
        GT.removeProject(gtCurrentProjId); gtCloseTagModal();
        gtRenderProjectsSection();
        gtRefreshProjectFilter(document.getElementById('gt-filter-project'));
        gtRefreshPanel();
      }
    } else if(gtCurrentTagId&&confirm('¿Eliminar esta etiqueta?')){
      GT.removeTag(gtCurrentTagId); gtCloseTagModal();
      gtRenderTagsTab(); gtRefreshTagFilter(document.getElementById('gt-filter-tag'));
    }
  });
  document.getElementById('gt-tag-name')?.addEventListener('input',gtUpdateTagPreview);
  document.getElementById('gt-tag-color')?.addEventListener('input',gtUpdateTagPreview);
  document.getElementById('gt-tag-name')?.addEventListener('keydown',e=>{
    if(e.key==='Enter'){e.preventDefault();gtSaveTagModal();}
    if(e.key==='Escape')gtCloseTagModal();
  });

  // Command palette
  document.getElementById('gt-cmd-btn')?.addEventListener('click',gtOpenCmd);
  document.getElementById('gt-cmd-overlay')?.addEventListener('click',e=>{if(e.target.id==='gt-cmd-overlay')gtCloseCmd();});
  document.getElementById('gt-cmd-form')?.addEventListener('submit',e=>{
    e.preventDefault();
    const raw=document.getElementById('gt-cmd-input').value.trim(); if (!raw) return;
    let title=raw, dueDate=null;
    const at=raw.match(/@(\S+)/);
    if (at){const p=gtParseDate(at[1]);if(p){dueDate=p;title=raw.replace(at[0],'').trim();}}
    gtCloseCmd(); gtOpenModal(null,{title,dueDate});
  });

  // Keyboard shortcuts (solo cuando el panel de tareas está activo)
  document.addEventListener('keydown',e=>{
    const tareasActive=document.getElementById('tareas-view')?.classList.contains('active');
    if (!tareasActive) return;
    if (e.key==='Escape'){ gtCloseCmd(); gtCloseModal(); gtCloseTagModal(); }
    if (e.key==='/'&&!['INPUT','TEXTAREA'].includes(document.activeElement.tagName)&&!document.getElementById('gt-modal-overlay')?.classList.contains('gt-visible')){
      e.preventDefault(); gtOpenCmd();
    }
  });

  // Render inicial
  gtRenderHoy();

  // Validation Tab Logic
  initValidationPanel();
}

function initValidationPanel() {
  const checkUpdatesElectron = document.getElementById('check-updates-electron');
  const checkUpdatesGithub = document.getElementById('check-updates-github');
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');
  const clearLogsBtn = document.getElementById('clear-logs');
  const logsContainer = document.getElementById('logs-container');

  // Tab switching
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const method = btn.dataset.method;

      // Update active tab
      tabBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      document.querySelector(`.tab-content[data-method="${method}"]`)?.classList.add('active');

      addLog(`Cambiado a método: ${method === 'electron-updater' ? 'Electron Updater' : 'GitHub API'}`, 'info');
    });
  });

  // Clear logs
  clearLogsBtn?.addEventListener('click', () => {
    logsContainer.innerHTML = '<div class="log-entry initial">Logs borrados. Sistema listo.</div>';
  });

  // Electron Updater Check
  checkUpdatesElectron?.addEventListener('click', async () => {
    checkUpdatesElectron.disabled = true;
    checkUpdatesElectron.classList.add('loading');

    addLog('Iniciando verificación con Electron Updater...', 'info');

    try {
      const result = await window.electronAPI.checkUpdatesElectron();

      // Add logs from result
      if (result.logs && Array.isArray(result.logs)) {
        result.logs.forEach(log => {
          const type = log.includes('✓') ? 'success' :
                      log.includes('✗') ? 'error' :
                      log.includes('⚠️') || log.includes('⚠') ? 'warning' : 'info';
          addLog(log, type);
        });
      }

      // Update status
      const statusEl = document.getElementById('update-status');
      const availableVersionEl = document.getElementById('available-version');

      if (result.warning) {
        statusEl.textContent = 'No disponible en dev';
        statusEl.className = 'status-value status-error';
        availableVersionEl.textContent = 'Ver GitHub API';
        addLog(`⚠️ ${result.warning}`, 'warning');
      } else if (result.success) {
        if (result.availableVersion) {
          statusEl.textContent = 'Actualización disponible';
          statusEl.className = 'status-value status-available';
          availableVersionEl.textContent = result.availableVersion;
        } else {
          statusEl.textContent = 'Actualizado';
          statusEl.className = 'status-value status-idle';
          availableVersionEl.textContent = 'Ninguna';
        }
      } else {
        statusEl.textContent = 'Error en verificación';
        statusEl.className = 'status-value status-error';
        availableVersionEl.textContent = 'Error';
      }

      // Show result box
      const outputSection = document.getElementById('electron-output');
      outputSection?.classList.remove('hidden');
      const outputLog = document.getElementById('electron-log');
      if (outputLog) {
        outputLog.innerHTML = (result.logs || []).join('\n');
      }
    } catch (error) {
      addLog(`Error: ${error.message}`, 'error');
    } finally {
      checkUpdatesElectron.disabled = false;
      checkUpdatesElectron.classList.remove('loading');
    }
  });

  // GitHub API Check
  checkUpdatesGithub?.addEventListener('click', async () => {
    checkUpdatesGithub.disabled = true;
    checkUpdatesGithub.classList.add('loading');

    addLog('Iniciando verificación con GitHub API...', 'info');

    try {
      const token = document.getElementById('github-token')?.value || '';
      const owner = document.getElementById('github-owner')?.value || 'SantiConde10';
      const repo = document.getElementById('github-repo')?.value || 'altas_masivas';

      addLog(`Parámetros: owner=${owner}, repo=${repo}, token=${token ? 'configurado' : 'no configurado'}`, 'info');

      const result = await window.electronAPI.checkUpdatesGithub({ token, owner, repo });

      // Add logs from result
      if (result.logs && Array.isArray(result.logs)) {
        result.logs.forEach(log => {
          const type = log.includes('✓') ? 'success' : log.includes('✗') ? 'error' : 'info';
          addLog(log, type);
        });
      }

      // Update status
      const statusEl = document.getElementById('update-status');
      const availableVersionEl = document.getElementById('available-version');

      if (result.success) {
        if (result.availableVersion) {
          statusEl.textContent = 'Actualización disponible';
          statusEl.className = 'status-value status-available';
          availableVersionEl.textContent = result.availableVersion;
        } else {
          statusEl.textContent = 'Actualizado';
          statusEl.className = 'status-value status-idle';
          availableVersionEl.textContent = 'Ninguna';
        }
      } else {
        statusEl.textContent = 'Error en verificación';
        statusEl.className = 'status-value status-error';
        availableVersionEl.textContent = 'Error';
      }

      // Show result box
      const outputSection = document.getElementById('github-output');
      outputSection?.classList.remove('hidden');
      const outputLog = document.getElementById('github-log');
      if (outputLog) {
        outputLog.innerHTML = (result.logs || []).join('\n');
      }
    } catch (error) {
      addLog(`Error: ${error.message}`, 'error');
    } finally {
      checkUpdatesGithub.disabled = false;
      checkUpdatesGithub.classList.remove('loading');
    }
  });

  // Load current version
  window.electronAPI.getAppVersion().then(version => {
    const currentVersionEl = document.getElementById('current-version');
    if (currentVersionEl) {
      currentVersionEl.textContent = `v${version}`;
    }
    addLog(`Versión actual cargada: v${version}`, 'success');
  }).catch(err => {
    addLog(`Error al cargar versión: ${err.message}`, 'error');
  });

  function addLog(message, type = 'info') {
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    logsContainer?.appendChild(entry);
    logsContainer?.scrollTo(0, logsContainer.scrollHeight);
  }
}
