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
      loadPanel('alta-masiva-view', 'panels/alta-masiva/alta-masiva.html'),
      loadPanel('tareas-view', 'panels/tareas/tareas.html')
    ]);
  } catch (error) {
    console.error('Error cargando paneles:', error);
  }

  gtInit();

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

  addTask(data) {
    const list = this.tasks();
    const t = { id:gtId(), title:'', description:'', projectId:'', status:'todo',
      priority:'medium', dueDate:null, dueTime:null, duration:30, subtasks:[],
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

  getProject(id) { return this.projects().find(p=>p.id===id)||null; },

  seed() {
    if (this.projects().length>0) return;
    const p1 = this.addProject({name:'Personal', color:'#1a1a1a'});
    const p2 = this.addProject({name:'Trabajo',  color:'#3b82f6'});
    const p3 = this.addProject({name:'Salud',    color:'#10b981'});
    const t = gtToday(), [y,m,d]=t.split('-').map(Number);
    const tmrw = gtToYMD(new Date(y,m-1,d+1));
    this.addTask({title:'Revisar correos del equipo', projectId:p2.id, priority:'high', dueDate:t, dueTime:'09:00', duration:30});
    this.addTask({title:'Preparar demo del sprint', projectId:p2.id, status:'in-progress', priority:'high', dueDate:t, dueTime:'14:00', duration:60,
      subtasks:[{id:gtId(),title:'Slides de avances',done:true},{id:gtId(),title:'Demo en vivo',done:false}]});
    this.addTask({title:'Actualizar documentación', projectId:p2.id, priority:'medium', dueDate:tmrw, duration:90});
    this.addTask({title:'Comprar ingredientes', projectId:p1.id, priority:'low', dueDate:t, duration:20});
    this.addTask({title:'Ejercicio 30 min', projectId:p3.id, status:'done', priority:'medium', dueDate:t, dueTime:'07:00', duration:30});
  }
};

// ── UI helpers ────────────────────────────────────────────────────────────────

function gtPrioLabel(p) { return {low:'Baja',medium:'Media',high:'Alta'}[p]||p; }
function gtStatLabel(s) { return {todo:'Por hacer','in-progress':'En progreso',done:'Hecho'}[s]||s; }

function gtPrioBadge(p) {
  const c={low:{bg:'#f0fdf4',t:'#16a34a'},medium:{bg:'#fffbeb',t:'#d97706'},high:{bg:'#fef2f2',t:'#dc2626'}}[p]||{bg:'#f1f5f9',t:'#64748b'};
  return `<span class="gt-badge" style="background:${c.bg};color:${c.t}">${gtPrioLabel(p)}</span>`;
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

// ── Tab: Hoy ─────────────────────────────────────────────────────────────────

function gtRenderHoy() {
  const hour = new Date().getHours();
  const greeting = hour<12?'Buenos días':hour<20?'Buenas tardes':'Buenas noches';
  const grEl=document.getElementById('gt-greeting'), dtEl=document.getElementById('gt-date');
  if (grEl) grEl.textContent=greeting;
  if (dtEl) dtEl.textContent=gtFmtLong(gtToday());

  // Today list
  const todayEl = document.getElementById('gt-today-list');
  if (todayEl) {
    const tasks = GT.tasks().filter(t=>t.dueDate===gtToday())
      .sort((a,b)=>{ const p={high:0,medium:1,low:2}; if(a.status==='done'&&b.status!=='done')return 1; if(a.status!=='done'&&b.status==='done')return-1; return(p[a.priority]||1)-(p[b.priority]||1); });
    todayEl.innerHTML = tasks.length===0 ? '<p style="color:var(--text-secondary);font-size:0.84rem;padding:0.5rem 0">Sin tareas para hoy</p>'
      : tasks.map(t=>`
        <div class="gt-today-item" data-id="${t.id}">
          <button class="gt-check ${t.status==='done'?'checked':''}" data-id="${t.id}">
            <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="3 8 6.5 11 13 4.5"/></svg>
          </button>
          <div class="gt-today-info">
            <span class="gt-today-title" style="${t.status==='done'?'text-decoration:line-through;opacity:0.45':''}">${gtEsc(t.title)}</span>
            ${t.dueTime?`<span class="gt-today-time">${t.dueTime}</span>`:''}
          </div>
          ${gtPrioBadge(t.priority)}
        </div>`).join('');

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

  // Weekly
  const weekEl = document.getElementById('gt-weekly');
  if (weekEl) {
    const wk=gtWeekDates(), all=GT.tasks();
    const wkTasks=all.filter(t=>t.dueDate&&wk.includes(t.dueDate));
    const done=wkTasks.filter(t=>t.status==='done').length, total=wkTasks.length;
    const pct=total>0?Math.round(done/total*100):0;
    const names=['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
    const bars=wk.map((date,i)=>{
      const dt=all.filter(t=>t.dueDate===date), dp=dt.length>0?Math.round(dt.filter(t=>t.status==='done').length/dt.length*100):0;
      return `<div class="gt-day-bar ${gtIsToday(date)?'today-bar':''}">
        <div class="gt-bar-track"><div class="gt-bar-fill" style="height:${dp}%"></div></div>
        <span class="gt-bar-label">${names[i]}</span>
      </div>`;
    }).join('');
    weekEl.innerHTML=`<div class="gt-weekly-summary"><span class="gt-weekly-pct">${pct}%</span><span class="gt-weekly-sub">${done} de ${total} completadas</span></div>
      <div class="gt-day-bars">${bars}</div>`;
  }

  // Projects
  const projEl = document.getElementById('gt-projects');
  if (projEl) {
    const all=GT.tasks();
    projEl.innerHTML=GT.projects().map(p=>{
      const pt=all.filter(t=>t.projectId===p.id), done=pt.filter(t=>t.status==='done').length;
      const pct=pt.length>0?Math.round(done/pt.length*100):0;
      const todayN=pt.filter(t=>t.dueDate===gtToday()&&t.status!=='done').length;
      return `<div class="gt-project-card" data-id="${p.id}">
        <div class="gt-proj-head"><span class="gt-proj-dot" style="background:${p.color}"></span><span class="gt-proj-name">${gtEsc(p.name)}</span></div>
        <div class="gt-proj-bar"><div class="gt-proj-fill" style="width:${pct}%;background:${p.color}"></div></div>
        <div class="gt-proj-foot"><span>${pct}% · ${pt.length} tareas</span>${todayN>0?`<span class="gt-proj-today">${todayN} hoy</span>`:''}</div>
      </div>`;
    }).join('');
    projEl.querySelectorAll('.gt-project-card').forEach(card=>{
      card.addEventListener('click',()=>{
        gtSwitchTab('lista');
        const sel=document.getElementById('gt-filter-project');
        if(sel){sel.value=card.dataset.id; gtFilters.project=card.dataset.id; gtRenderLista();}
      });
    });
  }
}

// ── Tab: Lista / Kanban ───────────────────────────────────────────────────────

let gtListView = 'list';
const gtFilters = { search:'', project:'', status:'' };

function gtRefreshProjectFilter(el) {
  if (!el) return;
  const saved = el.value||gtFilters.project;
  el.innerHTML='<option value="">Todos los proyectos</option>'+GT.projects().map(p=>`<option value="${p.id}">${gtEsc(p.name)}</option>`).join('');
  if (saved) el.value=saved;
}

function gtGetFiltered() {
  let list=GT.tasks();
  if (gtFilters.search) { const s=gtFilters.search.toLowerCase(); list=list.filter(t=>t.title.toLowerCase().includes(s)); }
  if (gtFilters.project) list=list.filter(t=>t.projectId===gtFilters.project);
  if (gtFilters.status)  list=list.filter(t=>t.status===gtFilters.status);
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
    return `<tr class="gt-task-row ${t.status==='done'?'gt-done':''}" data-id="${t.id}">
      <td>${gtStatBadge(t.status)}</td>
      <td><div class="gt-task-cell"><span class="gt-task-title">${gtEsc(t.title)}</span>${sp!==null?`<span class="gt-sub-pct">${sp}%</span>`:''}</div></td>
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
      :tasks.map(t=>`<div class="gt-card-item" data-id="${t.id}" draggable="true">
        <div class="gt-card-item-title">${gtEsc(t.title)}</div>
        <div class="gt-card-item-foot">${gtChip(t.projectId)}${gtPrioBadge(t.priority)}${gtDueSpan(t.dueDate,null)}</div>
      </div>`).join('');
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

function gtRenderCal() {
  const wk=gtWeekDates(gtCalBase);
  const lbl=document.getElementById('gt-cal-label');
  if (lbl) lbl.textContent=`${gtFmtShort(wk[0])} – ${gtFmtShort(wk[6])}`;
  gtRenderCalHeaders(wk);
  gtRenderCalAllDay(wk);
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
      const dt=all.filter(t=>t.dueDate===date&&!t.dueTime);
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
    const dt=all.filter(t=>t.dueDate===date&&t.dueTime&&parseInt(t.dueTime)>=START&&parseInt(t.dueTime)<END);
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
  const data={
    title, description:document.getElementById('gt-description').value.trim(),
    projectId:document.getElementById('gt-project').value,
    status:document.getElementById('gt-status').value,
    priority:document.getElementById('gt-priority').value,
    dueDate:document.getElementById('gt-due-date').value||null,
    dueTime:document.getElementById('gt-due-time').value||null,
    duration:parseInt(document.getElementById('gt-duration').value)||30,
    subtasks
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

function gtSwitchTab(name) {
  document.querySelectorAll('.gt-tab').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('.gt-tab-content').forEach(c=>c.classList.remove('active'));
  document.querySelector(`.gt-tab[data-tab="${name}"]`)?.classList.add('active');
  document.getElementById(`gt-tab-${name}`)?.classList.add('active');
  gtActiveTab=name;
  if (name==='hoy')      gtRenderHoy();
  if (name==='lista')    { gtRefreshProjectFilter(document.getElementById('gt-filter-project')); gtRenderLista(); }
  if (name==='calendario') { gtCalBase=gtCalBase||gtToday(); gtRenderCal(); }
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
    btn.addEventListener('click',()=>gtSwitchTab(btn.dataset.tab));
  });

  // New task button
  document.getElementById('gt-new-task')?.addEventListener('click',()=>gtOpenModal());

  // Lista toolbar
  document.getElementById('gt-search')?.addEventListener('input',e=>{gtFilters.search=e.target.value;gtRenderLista();});
  document.getElementById('gt-filter-project')?.addEventListener('change',e=>{gtFilters.project=e.target.value;gtRenderLista();});
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
    if (e.key==='Escape'){ gtCloseCmd(); gtCloseModal(); }
    if (e.key==='/'&&!['INPUT','TEXTAREA'].includes(document.activeElement.tagName)&&!document.getElementById('gt-modal-overlay')?.classList.contains('gt-visible')){
      e.preventDefault(); gtOpenCmd();
    }
  });

  // Render inicial
  gtRenderHoy();
}
