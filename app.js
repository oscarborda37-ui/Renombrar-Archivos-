/**
 * RENOMBRADOR PRO ALFANUMÉRICO - LÓGICA PRINCIPAL
 * Levapan S.A.
 */

// ESTADO GLOBAL DE LA APLICACIÓN
const AppState = {
  files: [],              // Lista de archivos en memoria
  filteredFiles: [],      // Archivos filtrados para vista
  directoryHandle: null,  // Handle de la carpeta (File System Access API)
  folderName: '',         // Nombre de la carpeta actual
  history: [],            // Historial de lotes
  detectedSerial: null,   // Último serial detectado en la carpeta
  theme: localStorage.getItem('theme') || 'dark',
  isAutoRenameActive: false, // Estado del centinela de auto-renombrado
  knownFilesSet: new Set()   // Archivos ya procesados para evitar re-renombrado
};

// ==========================================================================
// INICIALIZACIÓN
// ==========================================================================

document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  initEventListeners();
  loadHistoryFromStorage();
  updateLivePreview();
  await initRememberedFolder();
  setupAutoWatcher();
});

// GESTIÓN DE TEMA (DARK / LIGHT)
function initTheme() {
  document.documentElement.setAttribute('data-theme', AppState.theme);
  const themeBtn = document.getElementById('theme-toggle');
  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      AppState.theme = AppState.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', AppState.theme);
      localStorage.setItem('theme', AppState.theme);
    });
  }
}

// ==========================================================================
// REGISTRO DE EVENTOS (LISTENERS)
// ==========================================================================

function initEventListeners() {
  // Navegación de pestañas
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      const targetId = tab.getAttribute('data-target');
      switchView(targetId, tab);
    });
  });

  // Botón Abrir Carpeta en Disco
  const btnOpenFolder = document.getElementById('btn-open-folder');
  if (btnOpenFolder) {
    btnOpenFolder.addEventListener('click', handleOpenDirectory);
  }

  // Explorar archivos sueltos
  const btnBrowseFiles = document.getElementById('btn-browse-files');
  const fileInputManual = document.getElementById('file-input-manual');
  if (btnBrowseFiles && fileInputManual) {
    btnBrowseFiles.addEventListener('click', () => fileInputManual.click());
    fileInputManual.addEventListener('change', handleFileInputChange);
  }

  // Drag and Drop
  const dropzone = document.getElementById('dropzone');
  if (dropzone) {
    ['dragenter', 'dragover'].forEach(name => {
      dropzone.addEventListener(name, (e) => {
        e.preventDefault();
        dropzone.classList.add('drag-over');
      });
    });
    ['dragleave', 'drop'].forEach(name => {
      dropzone.addEventListener(name, (e) => {
        e.preventDefault();
        dropzone.classList.remove('drag-over');
      });
    });
    dropzone.addEventListener('drop', handleFileDrop);
  }

  // Chips de etiquetas para patrón
  document.querySelectorAll('.tag-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const tag = chip.getAttribute('data-tag');
      const patternInput = document.getElementById('input-pattern');
      const start = patternInput.selectionStart;
      const end = patternInput.selectionEnd;
      const text = patternInput.value;
      patternInput.value = text.substring(0, start) + tag + text.substring(end);
      patternInput.focus();
      patternInput.setSelectionRange(start + tag.length, start + tag.length);
      updateLivePreview();
    });
  });

  // Inputs reactivos para actualizar vista previa en vivo
  const reactiveInputs = [
    'input-start-serial', 'select-increment-mode', 'input-serial-step',
    'input-min-digits', 'input-pattern', 'select-case-transform',
    'select-space-transform', 'input-extra-prefix', 'input-extra-suffix',
    'filter-extension', 'sort-order'
  ];

  reactiveInputs.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', () => updateLivePreview());
      el.addEventListener('change', () => updateLivePreview());
    }
  });

  // Búsqueda en la tabla
  const searchInput = document.getElementById('preview-search');
  if (searchInput) {
    searchInput.addEventListener('input', () => filterTableRows(searchInput.value));
  }

  // Selección maestra de checkboxes
  const checkMaster = document.getElementById('check-master');
  if (checkMaster) {
    checkMaster.addEventListener('change', () => {
      const isChecked = checkMaster.checked;
      AppState.files.forEach(f => f.isSelected = isChecked);
      updateLivePreview();
    });
  }

  const btnSelectAll = document.getElementById('btn-select-all');
  if (btnSelectAll) {
    btnSelectAll.addEventListener('click', () => {
      const allSelected = AppState.files.every(f => f.isSelected);
      AppState.files.forEach(f => f.isSelected = !allSelected);
      if (checkMaster) checkMaster.checked = !allSelected;
      updateLivePreview();
    });
  }

  // Limpiar lista
  const btnClearTable = document.getElementById('btn-clear-table');
  if (btnClearTable) {
    btnClearTable.addEventListener('click', () => {
      AppState.files = [];
      AppState.directoryHandle = null;
      AppState.folderName = '';
      updateFolderBadge('Ninguna carpeta vinculada', false);
      updateLivePreview();
      showToast('Lista de archivos vaciada', 'info');
    });
  }

  // Aplicar serial detectado automáticamente
  const btnApplyDetected = document.getElementById('btn-apply-detected-serial');
  if (btnApplyDetected) {
    btnApplyDetected.addEventListener('click', () => {
      if (AppState.detectedSerial && AppState.detectedSerial.nextSerial) {
        document.getElementById('input-start-serial').value = AppState.detectedSerial.nextSerial;
        showToast(`Serial actualizado a: ${AppState.detectedSerial.nextSerial}`);
        updateLivePreview();
      }
    });
  }

  // Reiniciar serial al último recordado
  const btnResetSerial = document.getElementById('btn-reset-serial');
  if (btnResetSerial) {
    btnResetSerial.addEventListener('click', () => {
      const lastSaved = localStorage.getItem('last_saved_serial') || 'LEV-0001';
      document.getElementById('input-start-serial').value = lastSaved;
      showToast(`Serial restablecido a: ${lastSaved}`);
      updateLivePreview();
    });
  }

  // Botón Principal: Ejecutar Renombrado
  const btnExecute = document.getElementById('btn-execute-rename');
  if (btnExecute) {
    btnExecute.addEventListener('click', openConfirmModal);
  }

  // Modal de confirmación
  const btnConfirmModal = document.getElementById('modal-btn-confirm');
  const btnCancelModal = document.getElementById('modal-btn-cancel');
  if (btnConfirmModal) btnConfirmModal.addEventListener('click', executeBatchRename);
  if (btnCancelModal) btnCancelModal.addEventListener('click', closeConfirmModal);

  // Exportar script (.bat / .ps1)
  const btnExportScript = document.getElementById('btn-export-script');
  if (btnExportScript) {
    btnExportScript.addEventListener('click', exportRenameScript);
  }

  // Historial actions
  const btnClearHist = document.getElementById('btn-clear-history');
  if (btnClearHist) {
    btnClearHist.addEventListener('click', clearHistory);
  }

  const btnExportCsv = document.getElementById('btn-export-history-csv');
  if (btnExportCsv) {
    btnExportCsv.addEventListener('click', exportHistoryCSV);
  }
}

// CAMBIO DE PESTAÑAS
function switchView(targetId, activeTab) {
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.view-content').forEach(v => v.style.display = 'none');

  if (activeTab) activeTab.classList.add('active');
  const targetView = document.getElementById(targetId);
  if (targetView) targetView.style.display = 'block';

  if (targetId === 'view-history') {
    renderHistoryView();
  }
}

// ==========================================================================
// MEMORIA DE CARPETA EN INDEXEDDB (RECORDAR RUTA PREVIA)
// ==========================================================================

const DB_NAME = 'RenombradorLevapanDB';
const DB_VERSION = 1;
const STORE_NAME = 'folderStore';

function getDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveStoredFolderHandle(dirHandle) {
  try {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    await store.put({
      id: 'last_used_folder',
      handle: dirHandle,
      name: dirHandle.name,
      savedAt: new Date().toISOString()
    });
    localStorage.setItem('last_remembered_folder_name', dirHandle.name);
  } catch (err) {
    console.warn('Error guardando carpeta en IndexedDB:', err);
  }
}

async function getStoredFolderHandle() {
  try {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    return new Promise((resolve) => {
      const req = store.get('last_used_folder');
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch (err) {
    return null;
  }
}

async function clearStoredFolderHandle() {
  try {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete('last_used_folder');
    localStorage.removeItem('last_remembered_folder_name');
  } catch (err) {}
}

async function initRememberedFolder() {
  const stored = await getStoredFolderHandle();
  const card = document.getElementById('remembered-folder-card');
  const nameEl = document.getElementById('remembered-folder-name');
  const reconnectBtn = document.getElementById('btn-reconnect-folder');
  const forgetBtn = document.getElementById('btn-forget-folder');

  if (stored && stored.handle && stored.name) {
    if (nameEl) nameEl.textContent = stored.name;
    if (card) card.style.display = 'flex';

    if (reconnectBtn) {
      reconnectBtn.onclick = async () => {
        try {
          const perm = await stored.handle.requestPermission({ mode: 'readwrite' });
          if (perm === 'granted') {
            await connectToDirectory(stored.handle, stored.name);
            showToast(`Reconectado a "${stored.name}" exitosamente.`);
          } else {
            showToast('Permiso denegado para acceder a la carpeta.', 'warning');
          }
        } catch (e) {
          showToast('No se pudo reconectar: ' + e.message, 'error');
        }
      };
    }

    if (forgetBtn) {
      forgetBtn.onclick = async () => {
        await clearStoredFolderHandle();
        if (card) card.style.display = 'none';
        showToast('Carpeta olvidada de la memoria.');
      };
    }

    // Comprobar si ya tiene permisos concedidos previamente
    try {
      const queryPerm = await stored.handle.queryPermission({ mode: 'readwrite' });
      if (queryPerm === 'granted') {
        await connectToDirectory(stored.handle, stored.name);
        showToast(`Conectado automáticamente a "${stored.name}"`);
      }
    } catch (e) {}
  } else {
    if (card) card.style.display = 'none';
  }
}

// ==========================================================================
// CARGA Y SELECCIÓN DE ARCHIVOS
// ==========================================================================

async function handleOpenDirectory() {
  if (!('showDirectoryPicker' in window)) {
    showToast('Tu navegador no soporta File System Access API. Se recomienda Microsoft Edge o Google Chrome.', 'warning');
    document.getElementById('file-input-manual').click();
    return;
  }

  try {
    const dirHandle = await window.showDirectoryPicker({
      mode: 'readwrite',
      startIn: 'documents'
    });

    await connectToDirectory(dirHandle, dirHandle.name);
    await saveStoredFolderHandle(dirHandle);

    // Actualizar tarjeta de carpeta recordada
    const card = document.getElementById('remembered-folder-card');
    const nameEl = document.getElementById('remembered-folder-name');
    if (card && nameEl) {
      nameEl.textContent = dirHandle.name;
      card.style.display = 'flex';
    }

  } catch (err) {
    if (err.name !== 'AbortError') {
      console.error('Error al abrir carpeta:', err);
      showToast('No se pudo acceder a la carpeta: ' + err.message, 'error');
    }
  }
}

async function connectToDirectory(dirHandle, folderName) {
  AppState.directoryHandle = dirHandle;
  AppState.folderName = folderName;
  updateFolderBadge(folderName, true);

  await reloadDirectoryFilesList();

  // Si el centinela estaba activado previamente, refrescar sondeo
  if (AppState.isAutoRenameActive) {
    activateAutoWatcher();
  }
}

async function reloadDirectoryFilesList() {
  if (!AppState.directoryHandle) return;

  const loadedFiles = [];
  const existingFileNames = [];

  for await (const [name, handle] of AppState.directoryHandle.entries()) {
    if (handle.kind === 'file') {
      existingFileNames.push(name);
      AppState.knownFilesSet.add(name);
      const fileObj = await handle.getFile();
      const ext = getExtension(name);
      const base = getBaseName(name);

      loadedFiles.push({
        id: 'file-' + Math.random().toString(36).substr(2, 9),
        fileHandle: handle,
        file: fileObj,
        originalName: name,
        originalExt: ext,
        baseName: base,
        size: fileObj.size,
        lastModified: fileObj.lastModified,
        newName: name,
        serial: '',
        isSelected: true,
        status: 'ready'
      });
    }
  }

  AppState.files = loadedFiles;

  // DETECCIÓN INTELIGENTE DE SERIAL EN ARCHIVOS EXISTENTES
  detectExistingSerialInFolder(existingFileNames);
  updateLivePreview();
}

// ==========================================================================
// MODO CENTINELA: AUTO-RENOMBRADO EN TIEMPO REAL
// ==========================================================================

let autoWatcherInterval = null;

function setupAutoWatcher() {
  const toggle = document.getElementById('toggle-auto-rename');
  if (!toggle) return;

  toggle.addEventListener('change', () => {
    if (toggle.checked) {
      if (!AppState.directoryHandle) {
        showToast('Debes abrir o reconectar una carpeta primero para activar el Centinela.', 'warning');
        toggle.checked = false;
        return;
      }
      activateAutoWatcher();
    } else {
      deactivateAutoWatcher();
    }
  });
}

function activateAutoWatcher() {
  AppState.isAutoRenameActive = true;
  const toggle = document.getElementById('toggle-auto-rename');
  if (toggle) toggle.checked = true;

  const card = document.getElementById('card-auto-watcher');
  const statusText = document.getElementById('watcher-status-text');
  const pulseBadge = document.getElementById('watcher-badge-pulse');
  const headerBadge = document.getElementById('header-watcher-badge');

  if (card) card.classList.add('active');
  if (statusText) statusText.textContent = `Vigilando "${AppState.folderName}" en tiempo real (cada 2s)`;
  if (pulseBadge) pulseBadge.style.display = 'inline-flex';
  if (headerBadge) headerBadge.style.display = 'flex';

  // Registrar todos los archivos ya existentes para no renombrarlos de nuevo
  AppState.files.forEach(f => {
    AppState.knownFilesSet.add(f.originalName);
    AppState.knownFilesSet.add(f.newName);
  });

  if (autoWatcherInterval) clearInterval(autoWatcherInterval);

  autoWatcherInterval = setInterval(async () => {
    if (!AppState.isAutoRenameActive || !AppState.directoryHandle) return;
    await checkAndRenameNewIncomingFiles();
  }, 2000);

  showToast('⚡ Centinela Activo: Cualquier archivo nuevo que llegue a la carpeta se renombrará automáticamente.', 'info');
}

function deactivateAutoWatcher() {
  AppState.isAutoRenameActive = false;
  const toggle = document.getElementById('toggle-auto-rename');
  if (toggle) toggle.checked = false;

  if (autoWatcherInterval) {
    clearInterval(autoWatcherInterval);
    autoWatcherInterval = null;
  }
  const card = document.getElementById('card-auto-watcher');
  const statusText = document.getElementById('watcher-status-text');
  const pulseBadge = document.getElementById('watcher-badge-pulse');
  const headerBadge = document.getElementById('header-watcher-badge');

  if (card) card.classList.remove('active');
  if (statusText) statusText.textContent = 'Inactivo (esperando activación)';
  if (pulseBadge) pulseBadge.style.display = 'none';
  if (headerBadge) headerBadge.style.display = 'none';

  showToast('Centinela desactivado.');
}

async function checkAndRenameNewIncomingFiles() {
  if (!AppState.directoryHandle) return;

  try {
    for await (const [name, handle] of AppState.directoryHandle.entries()) {
      if (handle.kind === 'file') {
        if (!AppState.knownFilesSet.has(name)) {
          AppState.knownFilesSet.add(name);
          await autoRenameSingleIncomingFile(name, handle);
        }
      }
    }
  } catch (err) {
    console.warn('Error en sondeo del Centinela:', err);
  }
}

async function autoRenameSingleIncomingFile(name, handle) {
  try {
    // Pausa breve para esperar que Windows termine de escribir el archivo
    await new Promise(r => setTimeout(r, 450));

    const fileObj = await handle.getFile();
    const ext = getExtension(name);
    const base = getBaseName(name);

    // Obtener configuración activa en la interfaz
    const startSerialInput = document.getElementById('input-start-serial');
    const currentSerial = startSerialInput.value.trim() || 'LEV-0001';
    const incrementMode = document.getElementById('select-increment-mode').value;
    const step = parseInt(document.getElementById('input-serial-step').value, 10) || 1;
    const minDigits = document.getElementById('input-min-digits').value;
    const pattern = document.getElementById('input-pattern').value.trim() || '{SERIAL}_{ORIGINAL}';
    const caseTransform = document.getElementById('select-case-transform').value;
    const spaceTransform = document.getElementById('select-space-transform').value;
    const extraPrefix = document.getElementById('input-extra-prefix').value;
    const extraSuffix = document.getElementById('input-extra-suffix').value;

    const config = {
      startSerial: currentSerial, incrementMode, step, minDigits, pattern,
      caseTransform, spaceTransform, extraPrefix, extraSuffix
    };

    const dummyItem = {
      baseName: base,
      originalExt: ext
    };

    const newName = applyPattern(dummyItem, currentSerial, 0, config);

    if (newName !== name) {
      if (typeof handle.move === 'function') {
        await handle.move(newName);
      } else {
        const newHandle = await AppState.directoryHandle.getFileHandle(newName, { create: true });
        const writable = await newHandle.createWritable();
        await writable.write(fileObj);
        await writable.close();
        await AppState.directoryHandle.removeEntry(name);
      }
    }

    AppState.knownFilesSet.add(newName);

    // Calcular y guardar el siguiente consecutivo
    const nextSerial = calculateAlphanumericSerial(currentSerial, 1, incrementMode, step, minDigits);
    startSerialInput.value = nextSerial;
    localStorage.setItem('last_saved_serial', nextSerial);

    // Registrar en el historial de lotes
    const batchRecord = {
      id: 'auto-' + Date.now(),
      timestamp: new Date().toLocaleString(),
      folderName: AppState.folderName,
      count: 1,
      startSerial: currentSerial,
      endSerial: currentSerial,
      nextSerial: nextSerial,
      items: [{ originalName: name, newName: newName, serial: currentSerial }],
      reverted: false,
      isAuto: true
    };
    AppState.history.unshift(batchRecord);
    saveHistoryToStorage();

    // Refrescar la tabla
    await reloadDirectoryFilesList();

    showToast(`⚡ ¡Archivo detectado y renombrado automáticamente!: "${name}" → "${newName}"`, 'success');
  } catch (err) {
    console.error('Error al auto-renombrar:', err);
    showToast(`Error al auto-renombrar "${name}": ${err.message}`, 'error');
  }
}

function handleFileInputChange(e) {
  const fileList = Array.from(e.target.files);
  loadFilesFromArray(fileList);
  e.target.value = '';
}

function handleFileDrop(e) {
  const droppedFiles = [];
  if (e.dataTransfer.items) {
    for (let i = 0; i < e.dataTransfer.items.length; i++) {
      const item = e.dataTransfer.items[i];
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) droppedFiles.push(file);
      }
    }
  } else if (e.dataTransfer.files) {
    droppedFiles.push(...Array.from(e.dataTransfer.files));
  }

  if (droppedFiles.length > 0) {
    loadFilesFromArray(droppedFiles);
  }
}

function loadFilesFromArray(fileList) {
  AppState.files = fileList.map(f => {
    const ext = getExtension(f.name);
    const base = getBaseName(f.name);
    return {
      id: 'file-' + Math.random().toString(36).substr(2, 9),
      fileHandle: null,
      file: f,
      originalName: f.name,
      originalExt: ext,
      baseName: base,
      size: f.size,
      lastModified: f.lastModified,
      newName: f.name,
      serial: '',
      isSelected: true,
      status: 'ready'
    };
  });

  AppState.directoryHandle = null;
  AppState.folderName = 'Archivos Cargados Manualmente';
  updateFolderBadge('Archivos Sueltos (' + AppState.files.length + ')', false);

  detectExistingSerialInFolder(fileList.map(f => f.name));
  updateLivePreview();
  showToast(`Se importaron ${AppState.files.length} archivos.`);
}

function updateFolderBadge(name, isConnected) {
  const badgeDot = document.getElementById('folder-status-dot');
  const badgeText = document.getElementById('folder-name-display');
  if (badgeDot && badgeText) {
    badgeText.textContent = name;
    if (isConnected) {
      badgeDot.className = 'status-dot connected';
    } else {
      badgeDot.className = 'status-dot disconnected';
    }
  }
}

// ==========================================================================
// MOTOR DE DETECCIÓN INTELIGENTE DE SERIALES EN LA CARPETA
// ==========================================================================

function detectExistingSerialInFolder(fileNames) {
  const banner = document.getElementById('detection-banner');
  const tokenVal = document.getElementById('detected-token-val');
  const nextVal = document.getElementById('detected-next-val');
  const currentSeed = document.getElementById('input-start-serial').value.trim();

  // Buscar el mayor serial numérico o alfanumérico en los nombres
  // Extrae prefijo y número, ej: LEV-0045, DOC_0012, FAC-104
  let highestPrefix = '';
  let highestNum = -1;
  let highestFullToken = '';
  let highestDigitsLen = 4;

  const serialRegex = /([a-zA-Z0-9_\-]+?)[-_ ]?([0-9]{2,8})/g;

  for (const name of fileNames) {
    let match;
    while ((match = serialRegex.exec(name)) !== null) {
      const prefix = match[1];
      const numStr = match[2];
      const num = parseInt(numStr, 10);
      if (num > highestNum) {
        highestNum = num;
        highestPrefix = prefix;
        highestFullToken = match[0];
        highestDigitsLen = numStr.length;
      }
    }
  }

  if (highestNum >= 0 && highestFullToken) {
    const nextNumber = highestNum + 1;
    const nextNumStr = String(nextNumber).padStart(highestDigitsLen, '0');
    // Reconstruir siguiente serial respetando el formato
    const nextSerial = highestFullToken.replace(/[0-9]{2,8}$/, nextNumStr);

    AppState.detectedSerial = {
      highestToken: highestFullToken,
      nextSerial: nextSerial
    };

    if (tokenVal) tokenVal.textContent = highestFullToken;
    if (nextVal) nextVal.textContent = nextSerial;
    if (banner) banner.style.display = 'flex';
  } else {
    AppState.detectedSerial = null;
    if (banner) banner.style.display = 'none';
  }
}

// ==========================================================================
// MOTOR DE INCREMENTO ALFANUMÉRICO
// ==========================================================================

/**
 * Genera el siguiente serial a partir de una semilla, índice, modo y paso.
 */
function calculateAlphanumericSerial(seed, index, mode, step, minDigitsSetting) {
  if (index === 0) return seed;

  const totalIncrement = index * step;

  if (mode === 'smart_numeric') {
    // Detecta la última secuencia de dígitos en la semilla
    const match = seed.match(/^(.*?)(\d+)([^\d]*)$/);
    if (match) {
      const prefix = match[1];
      const digitsStr = match[2];
      const suffix = match[3];

      const initialVal = parseInt(digitsStr, 10);
      const newVal = initialVal + totalIncrement;

      let padding = digitsStr.length;
      if (minDigitsSetting !== 'auto') {
        const customDigits = parseInt(minDigitsSetting, 10);
        if (!isNaN(customDigits) && customDigits > 0) {
          padding = customDigits;
        }
      }

      const formattedVal = String(newVal).padStart(padding, '0');
      return `${prefix}${formattedVal}${suffix}`;
    } else {
      // Si no contiene dígitos, agrega el número con guión
      const padding = minDigitsSetting === 'auto' ? 4 : parseInt(minDigitsSetting, 10);
      return `${seed}-${String(1 + totalIncrement).padStart(padding || 4, '0')}`;
    }
  }

  if (mode === 'pure_alphanumeric') {
    // Incremento Alfanumérico Base-36 (0-9, A-Z)
    return incrementBase36(seed, totalIncrement);
  }

  if (mode === 'alphabetical') {
    // Incremento Alfabético puro (A -> B ... Z -> AA)
    return incrementExcelColumn(seed, totalIncrement);
  }

  return seed;
}

/**
 * Incrementa caracteres alfanuméricos base-36 (0-9, A-Z)
 */
function incrementBase36(str, increment) {
  const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let arr = str.toUpperCase().split('');
  let carry = increment;

  for (let i = arr.length - 1; i >= 0 && carry > 0; i--) {
    let char = arr[i];
    let idx = chars.indexOf(char);
    if (idx === -1) continue; // Si es guión o símbolo, lo salta

    let sum = idx + carry;
    arr[i] = chars[sum % chars.length];
    carry = Math.floor(sum / chars.length);
  }

  if (carry > 0) {
    arr.unshift(chars[carry % chars.length]);
  }
  return arr.join('');
}

/**
 * Incrementa al estilo columnas de Excel (A, B, C ... Z, AA, AB)
 */
function incrementExcelColumn(str, increment) {
  const letters = str.toUpperCase().replace(/[^A-Z]/g, '') || 'A';
  let num = 0;
  for (let i = 0; i < letters.length; i++) {
    num = num * 26 + (letters.charCodeAt(i) - 64);
  }
  num += increment;

  let result = '';
  while (num > 0) {
    let rem = (num - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    num = Math.floor((num - 1) / 26);
  }
  return result;
}

// ==========================================================================
// MOTOR DE TRANSFORMACIÓN DE NOMBRES Y PATRONES
// ==========================================================================

function applyPattern(fileItem, serial, index, config) {
  let name = config.pattern;

  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');

  const dateStr = `${yyyy}-${mm}-${dd}`;
  const timeStr = `${hh}${min}${ss}`;

  // Reemplazo de variables
  name = name.replace(/{SERIAL}/g, serial);
  name = name.replace(/{ORIGINAL}/g, fileItem.baseName);
  name = name.replace(/{FECHA}/g, dateStr);
  name = name.replace(/{HORA}/g, timeStr);
  name = name.replace(/{INDICE}/g, String(index + 1));
  name = name.replace(/{EXT}/g, fileItem.originalExt);

  // Agregar prefijo y sufijo extra si existen
  if (config.extraPrefix) name = config.extraPrefix + name;
  if (config.extraSuffix) name = name + config.extraSuffix;

  // Manejo de espacios
  if (config.spaceTransform === 'underscore') {
    name = name.replace(/\s+/g, '_');
  } else if (config.spaceTransform === 'hyphen') {
    name = name.replace(/\s+/g, '-');
  } else if (config.spaceTransform === 'remove') {
    name = name.replace(/\s+/g, '');
  }

  // Transformación de mayúsculas / minúsculas
  if (config.caseTransform === 'upper') {
    name = name.toUpperCase();
  } else if (config.caseTransform === 'lower') {
    name = name.toLowerCase();
  } else if (config.caseTransform === 'title') {
    name = toTitleCase(name);
  }

  // Sanitización de caracteres prohibidos en Windows: \ / : * ? " < > |
  name = name.replace(/[\\/:*?"<>|]/g, '-');

  // Asegurar extensión correcta
  if (!name.toLowerCase().endsWith(fileItem.originalExt.toLowerCase())) {
    name += fileItem.originalExt;
  }

  return name;
}

function toTitleCase(str) {
  return str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
}

function getExtension(fileName) {
  const lastDot = fileName.lastIndexOf('.');
  return lastDot !== -1 ? fileName.substring(lastDot) : '';
}

function getBaseName(fileName) {
  const lastDot = fileName.lastIndexOf('.');
  return lastDot !== -1 ? fileName.substring(0, lastDot) : fileName;
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// ==========================================================================
// VISTA PREVIA EN VIVO (LIVE PREVIEW & DIFF TABLE)
// ==========================================================================

function updateLivePreview() {
  const startSerial = document.getElementById('input-start-serial').value.trim() || 'LEV-0001';
  const incrementMode = document.getElementById('select-increment-mode').value;
  const step = parseInt(document.getElementById('input-serial-step').value, 10) || 1;
  const minDigits = document.getElementById('input-min-digits').value;
  const pattern = document.getElementById('input-pattern').value.trim() || '{SERIAL}_{ORIGINAL}';
  const caseTransform = document.getElementById('select-case-transform').value;
  const spaceTransform = document.getElementById('select-space-transform').value;
  const extraPrefix = document.getElementById('input-extra-prefix').value;
  const extraSuffix = document.getElementById('input-extra-suffix').value;
  const filterExt = document.getElementById('filter-extension').value;
  const sortOrder = document.getElementById('sort-order').value;

  const config = {
    startSerial, incrementMode, step, minDigits, pattern,
    caseTransform, spaceTransform, extraPrefix, extraSuffix
  };

  // Filtrado por extensión
  let activeFiles = [...AppState.files];
  if (filterExt !== 'ALL') {
    const allowed = filterExt.split(',').map(e => '.' + e.trim().toLowerCase());
    activeFiles = activeFiles.filter(f => allowed.includes(f.originalExt.toLowerCase()));
  }

  // Ordenamiento
  activeFiles.sort((a, b) => {
    if (sortOrder === 'name_asc') return a.originalName.localeCompare(b.originalName);
    if (sortOrder === 'name_desc') return b.originalName.localeCompare(a.originalName);
    if (sortOrder === 'date_asc') return a.lastModified - b.lastModified;
    if (sortOrder === 'date_desc') return b.lastModified - a.lastModified;
    if (sortOrder === 'size_asc') return a.size - b.size;
    return 0;
  });

  AppState.filteredFiles = activeFiles;

  // Asignación de seriales y nuevos nombres
  const generatedNamesMap = new Map();
  let serialCounter = 0;
  let lastAssignedSerial = startSerial;

  activeFiles.forEach(fileItem => {
    if (fileItem.isSelected) {
      const serial = calculateAlphanumericSerial(startSerial, serialCounter, incrementMode, step, minDigits);
      fileItem.serial = serial;
      fileItem.newName = applyPattern(fileItem, serial, serialCounter, config);
      lastAssignedSerial = serial;
      serialCounter++;
    } else {
      fileItem.newName = fileItem.originalName;
      fileItem.serial = '(Omitido)';
    }

    // Comprobar conflictos de duplicados
    const lowerNew = fileItem.newName.toLowerCase();
    generatedNamesMap.set(lowerNew, (generatedNamesMap.get(lowerNew) || 0) + 1);
  });

  // Validaciones
  let hasConflict = false;
  activeFiles.forEach(f => {
    if (f.isSelected && generatedNamesMap.get(f.newName.toLowerCase()) > 1) {
      f.isConflict = true;
      hasConflict = true;
    } else {
      f.isConflict = false;
    }
  });

  // Próximo serial en secuencia para la KPI
  const nextProjectedSerial = calculateAlphanumericSerial(startSerial, serialCounter, incrementMode, step, minDigits);

  // Actualizar métricas KPI en encabezado
  document.getElementById('kpi-total-files').textContent = activeFiles.length;
  document.getElementById('kpi-start-serial').textContent = startSerial;
  document.getElementById('kpi-next-serial').textContent = nextProjectedSerial;

  const kpiValidation = document.getElementById('kpi-validation-status');
  const footerValidationMsg = document.getElementById('validation-text');
  const btnExecute = document.getElementById('btn-execute-rename');

  const selectedCount = activeFiles.filter(f => f.isSelected).length;

  if (activeFiles.length === 0) {
    kpiValidation.textContent = 'Sin archivos';
    kpiValidation.className = 'kpi-value text-muted';
    footerValidationMsg.textContent = 'Abre una carpeta o arrastra archivos para comenzar.';
    btnExecute.disabled = true;
  } else if (hasConflict) {
    kpiValidation.textContent = 'Conflicto (Duplicados)';
    kpiValidation.className = 'kpi-value text-accent-rose';
    footerValidationMsg.textContent = 'Atención: Existen dos o más archivos con el mismo nuevo nombre generado.';
    btnExecute.disabled = true;
  } else if (selectedCount === 0) {
    kpiValidation.textContent = 'Ninguno seleccionado';
    kpiValidation.className = 'kpi-value text-muted';
    footerValidationMsg.textContent = 'Selecciona al menos un archivo en la tabla para renombrar.';
    btnExecute.disabled = true;
  } else {
    kpiValidation.textContent = 'Listo (' + selectedCount + ')';
    kpiValidation.className = 'kpi-value status-ok';
    footerValidationMsg.textContent = `Listo para renombrar ${selectedCount} archivos sin conflictos.`;
    btnExecute.disabled = false;
  }

  document.getElementById('btn-rename-label').textContent = `Renombrar ${selectedCount} Archivos`;
  document.getElementById('preview-items-count').textContent = `${activeFiles.length} archivos`;

  // Renderizar la tabla de diff
  renderTableRows(activeFiles, startSerial);
}

function renderTableRows(files, startSerial) {
  const tbody = document.getElementById('preview-tbody');
  if (!tbody) return;

  if (files.length === 0) {
    tbody.innerHTML = `
      <tr class="empty-state-row">
        <td colspan="8">
          <div class="empty-state-message">
            <div class="empty-icon">📂</div>
            <h3>No hay archivos cargados para renombrar</h3>
            <p>Haz clic en <strong>"Abrir Carpeta en Disco"</strong> o arrastra archivos para ver la vista previa en vivo y el consecutivo que les corresponde.</p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  let html = '';
  files.forEach((fileItem, idx) => {
    const isConflict = fileItem.isConflict;
    const isSelected = fileItem.isSelected;
    const isRenamed = fileItem.status === 'renamed';

    let statusBadge = '';
    if (isRenamed) {
      statusBadge = '<span class="badge-status renamed">✓ Renombrado</span>';
    } else if (isConflict) {
      statusBadge = '<span class="badge-status conflict">⚠ Nombre Duplicado</span>';
    } else if (!isSelected) {
      statusBadge = '<span class="badge-status text-muted">Excluido</span>';
    } else {
      statusBadge = '<span class="badge-status valid">Listo</span>';
    }

    // Resaltado del serial en el nuevo nombre
    let formattedNewName = escapeHtml(fileItem.newName);
    if (isSelected && fileItem.serial && fileItem.serial !== '(Omitido)') {
      formattedNewName = formattedNewName.replace(
        escapeHtml(fileItem.serial),
        `<span class="serial-highlight">${escapeHtml(fileItem.serial)}</span>`
      );
    }

    html += `
      <tr class="${isConflict ? 'row-conflict' : ''} ${!isSelected ? 'row-unselected' : ''}">
        <td class="col-check">
          <input type="checkbox" data-file-id="${fileItem.id}" ${isSelected ? 'checked' : ''} onchange="toggleFileSelection('${fileItem.id}')">
        </td>
        <td class="col-num">${idx + 1}</td>
        <td class="col-original font-mono" title="${escapeHtml(fileItem.originalName)}">${escapeHtml(fileItem.originalName)}</td>
        <td class="col-arrow">→</td>
        <td class="col-new font-mono">${formattedNewName}</td>
        <td class="col-serial">
          <span class="badge-serial">${escapeHtml(fileItem.serial)}</span>
        </td>
        <td class="col-size">${formatBytes(fileItem.size)}</td>
        <td class="col-status">${statusBadge}</td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}

window.toggleFileSelection = function(fileId) {
  const item = AppState.files.find(f => f.id === fileId);
  if (item) {
    item.isSelected = !item.isSelected;
    updateLivePreview();
  }
};

function filterTableRows(query) {
  const q = query.toLowerCase().trim();
  const rows = document.querySelectorAll('#preview-tbody tr:not(.empty-state-row)');
  rows.forEach(row => {
    const text = row.textContent.toLowerCase();
    row.style.display = text.includes(q) ? '' : 'none';
  });
}

function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ==========================================================================
// EJECUCIÓN DEL RENOMBRADO MASIVO
// ==========================================================================

function openConfirmModal() {
  const selectedFiles = AppState.filteredFiles.filter(f => f.isSelected);
  if (selectedFiles.length === 0) return;

  document.getElementById('modal-count').textContent = selectedFiles.length;
  document.getElementById('modal-first-name').textContent = selectedFiles[0].newName;
  document.getElementById('modal-last-name').textContent = selectedFiles[selectedFiles.length - 1].newName;

  document.getElementById('confirm-modal').style.display = 'flex';
}

function closeConfirmModal() {
  document.getElementById('confirm-modal').style.display = 'none';
}

async function executeBatchRename() {
  closeConfirmModal();

  const selectedFiles = AppState.filteredFiles.filter(f => f.isSelected);
  if (selectedFiles.length === 0) return;

  const progressWrapper = document.getElementById('progress-wrapper');
  const progressFill = document.getElementById('progress-fill');
  const progressPct = document.getElementById('progress-percentage');
  const progressStatus = document.getElementById('progress-status-text');

  progressWrapper.style.display = 'block';
  progressFill.style.width = '0%';
  progressPct.textContent = '0%';
  progressStatus.textContent = 'Iniciando renombramiento...';

  const batchHistoryItems = [];
  let successCount = 0;
  let failCount = 0;

  // MODO DIRECTO EN DISCO (Si se abrió con File System Access API)
  if (AppState.directoryHandle) {
    for (let i = 0; i < selectedFiles.length; i++) {
      const item = selectedFiles[i];
      const pct = Math.round(((i + 1) / selectedFiles.length) * 100);
      progressFill.style.width = pct + '%';
      progressPct.textContent = pct + '%';
      progressStatus.textContent = `Renombrando (${i + 1}/${selectedFiles.length}): ${item.originalName} → ${item.newName}`;

      try {
        if (item.originalName !== item.newName) {
          // Intentar el método nativo move()
          if (item.fileHandle && typeof item.fileHandle.move === 'function') {
            await item.fileHandle.move(item.newName);
          } else {
            // Método de copia y eliminación si move no está disponible
            const oldFile = await item.fileHandle.getFile();
            const newHandle = await AppState.directoryHandle.getFileHandle(item.newName, { create: true });
            const writable = await newHandle.createWritable();
            await writable.write(oldFile);
            await writable.close();
            await AppState.directoryHandle.removeEntry(item.originalName);
            item.fileHandle = newHandle;
          }
        }

        item.status = 'renamed';
        successCount++;
        batchHistoryItems.push({
          originalName: item.originalName,
          newName: item.newName,
          serial: item.serial
        });
      } catch (err) {
        console.error(`Error renombrando ${item.originalName}:`, err);
        item.status = 'error';
        failCount++;
      }
    }
  } else {
    // Si no hay acceso directo a disco, se genera un script ejecutable instantáneo
    exportRenameScript();
    showToast('Los archivos no tienen permisos directos de disco. Se ha descargado el script para renombrarlos con 1 clic en su carpeta.', 'info');
    progressWrapper.style.display = 'none';
    return;
  }

  // Guardar en el Historial y Memoria de Consecutivo
  if (successCount > 0) {
    const lastRenamedItem = selectedFiles[selectedFiles.length - 1];
    const nextSerialToSuggest = calculateAlphanumericSerial(
      lastRenamedItem.serial, 1,
      document.getElementById('select-increment-mode').value,
      parseInt(document.getElementById('input-serial-step').value, 10) || 1,
      document.getElementById('input-min-digits').value
    );

    // Guardar último consecutivo para no repetir
    const memoryEnabled = document.getElementById('memory-persistence-toggle').checked;
    if (memoryEnabled) {
      localStorage.setItem('last_saved_serial', nextSerialToSuggest);
      document.getElementById('input-start-serial').value = nextSerialToSuggest;
    }

    const batchRecord = {
      id: 'batch-' + Date.now(),
      timestamp: new Date().toLocaleString(),
      folderName: AppState.folderName || 'Carpeta Local',
      count: successCount,
      startSerial: selectedFiles[0].serial,
      endSerial: lastRenamedItem.serial,
      nextSerial: nextSerialToSuggest,
      items: batchHistoryItems,
      reverted: false
    };

    AppState.history.unshift(batchRecord);
    saveHistoryToStorage();

    // Actualizar nombres en memoria local
    selectedFiles.forEach(f => {
      if (f.status === 'renamed') {
        f.originalName = f.newName;
        f.baseName = getBaseName(f.newName);
      }
    });

    showToast(`¡Éxito! Se renombraron ${successCount} archivos. Próximo serial guardado: ${nextSerialToSuggest}`);
  }

  setTimeout(() => {
    progressWrapper.style.display = 'none';
    updateLivePreview();
  }, 1000);
}

// ==========================================================================
// EXPORTACIÓN DE SCRIPT DE RESPALDO (.BAT / .PS1)
// ==========================================================================

function exportRenameScript() {
  const selectedFiles = AppState.filteredFiles.filter(f => f.isSelected && f.originalName !== f.newName);
  if (selectedFiles.length === 0) {
    showToast('No hay archivos seleccionados para exportar en script.', 'warning');
    return;
  }

  let batContent = `@echo off\r\nchcp 65001 > nul\r\ntitle Renombrado Masivo Levapan S.A.\r\necho Renombrando ${selectedFiles.length} archivos...\r\n\r\n`;

  selectedFiles.forEach(f => {
    batContent += `ren "${f.originalName}" "${f.newName}"\r\n`;
  });

  batContent += `\r\necho.\r\necho [OK] Renombrado completado con exito.\r\npause\r\n`;

  const blob = new Blob([batContent], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `renombrar_archivos_${Date.now()}.bat`;
  a.click();
  URL.revokeObjectURL(url);

  showToast('Script .bat descargado. Colócalo en la carpeta de los archivos y ejecútalo.');
}

// ==========================================================================
// HISTORIAL, PERSISTENCIA Y REVERSIÓN (UNDO)
// ==========================================================================

function loadHistoryFromStorage() {
  try {
    const raw = localStorage.getItem('renamer_history_batches');
    if (raw) {
      AppState.history = JSON.parse(raw);
    }
  } catch (e) {
    AppState.history = [];
  }
  updateHistoryBadge();
}

function saveHistoryToStorage() {
  try {
    localStorage.setItem('renamer_history_batches', JSON.stringify(AppState.history));
    updateHistoryBadge();

    // Intentar sincronizar con el servidor local si está activo
    fetch('/api/guardar-historial', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ultimoSerialGlobal: document.getElementById('input-start-serial').value,
        lotes: AppState.history
      })
    }).catch(() => {});
  } catch (e) {
    console.error('Error guardando historial:', e);
  }
}

function updateHistoryBadge() {
  const badge = document.getElementById('history-badge-count');
  if (badge) {
    badge.textContent = AppState.history.length;
  }
}

function renderHistoryView() {
  const container = document.getElementById('history-batches-container');
  if (!container) return;

  if (AppState.history.length === 0) {
    container.innerHTML = `
      <div class="empty-state-message" style="padding: 3rem 1rem;">
        <div class="empty-icon">🕒</div>
        <h3>No hay historial de renombramiento registrado</h3>
        <p>Cuando ejecutes lotes de renombramiento, aquí podrás consultar la fecha, los seriales asignados y revertir los cambios si lo necesitas.</p>
      </div>
    `;
    return;
  }

  let html = '';
  AppState.history.forEach(batch => {
    const isReverted = batch.reverted;
    html += `
      <div class="history-batch-card ${isReverted ? 'batch-reverted' : ''}">
        <div class="history-batch-top">
          <div class="batch-title-info">
            <strong>${escapeHtml(batch.folderName)}</strong>
            <span class="batch-timestamp">${batch.timestamp}</span>
            ${isReverted ? '<span class="badge-status text-muted">↩ Revertido</span>' : '<span class="badge-status valid">✓ Aplicado</span>'}
          </div>
          <div class="batch-summary-chips">
            <span class="batch-chip">Archivos: ${batch.count}</span>
            <span class="batch-chip font-mono">Desde: ${escapeHtml(batch.startSerial)}</span>
            <span class="batch-chip font-mono">Hasta: ${escapeHtml(batch.endSerial)}</span>
            ${!isReverted ? `
              <button class="btn btn-sm btn-secondary" onclick="revertBatch('${batch.id}')" title="Revertir este lote a sus nombres originales">
                ↩ Deshacer Lote
              </button>
            ` : ''}
          </div>
        </div>

        <details>
          <summary style="font-size:0.8rem; color:var(--text-secondary); cursor:pointer; margin-top:0.3rem;">
            Ver detalle de archivos (${batch.items ? batch.items.length : 0})
          </summary>
          <table class="history-batch-table">
            <thead>
              <tr>
                <th>Nombre Original</th>
                <th></th>
                <th>Nombre Asignado</th>
                <th>Serial</th>
              </tr>
            </thead>
            <tbody>
              ${(batch.items || []).map(it => `
                <tr>
                  <td class="font-mono">${escapeHtml(it.originalName)}</td>
                  <td>→</td>
                  <td class="font-mono font-weight-bold">${escapeHtml(it.newName)}</td>
                  <td><span class="badge-serial">${escapeHtml(it.serial)}</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </details>
      </div>
    `;
  });

  container.innerHTML = html;
}

window.revertBatch = async function(batchId) {
  const batch = AppState.history.find(b => b.id === batchId);
  if (!batch || batch.reverted) return;

  if (!confirm(`¿Deseas revertir los nombres de los ${batch.count} archivos de este lote a sus nombres originales?`)) {
    return;
  }

  if (AppState.directoryHandle) {
    let revertedCount = 0;
    for (const item of batch.items) {
      try {
        const fileHandle = await AppState.directoryHandle.getFileHandle(item.newName);
        if (fileHandle && typeof fileHandle.move === 'function') {
          await fileHandle.move(item.originalName);
          revertedCount++;
        }
      } catch (err) {
        console.warn(`No se pudo revertir ${item.newName}:`, err);
      }
    }
    batch.reverted = true;
    saveHistoryToStorage();
    renderHistoryView();
    showToast(`Se revirtieron ${revertedCount} archivos a sus nombres originales.`);
  } else {
    // Si no está la carpeta abierta, generar script de reversión
    let batUndo = `@echo off\r\nchcp 65001 > nul\r\ntitle Revertir Lote Levapan\r\necho Revirtiendo nombres...\r\n\r\n`;
    batch.items.forEach(it => {
      batUndo += `ren "${it.newName}" "${it.originalName}"\r\n`;
    });
    batUndo += `\r\necho [OK] Lote revertido.\r\npause\r\n`;

    const blob = new Blob([batUndo], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `deshacer_lote_${batch.id}.bat`;
    a.click();
    URL.revokeObjectURL(url);

    batch.reverted = true;
    saveHistoryToStorage();
    renderHistoryView();
    showToast('Se descargó el script de reversión. Ejecútalo en la carpeta para restaurar los nombres originales.');
  }
};

function clearHistory() {
  if (confirm('¿Seguro que deseas vaciar el historial de auditoría?')) {
    AppState.history = [];
    saveHistoryToStorage();
    renderHistoryView();
    showToast('Historial vaciado.');
  }
}

function exportHistoryCSV() {
  if (AppState.history.length === 0) {
    showToast('No hay registros en el historial para exportar.', 'warning');
    return;
  }

  let csv = 'LoteID,Fecha,Carpeta,NombreOriginal,NuevoNombre,Serial,Estado\n';
  AppState.history.forEach(b => {
    (b.items || []).forEach(it => {
      csv += `"${b.id}","${b.timestamp}","${b.folderName}","${it.originalName}","${it.newName}","${it.serial}","${b.reverted ? 'Revertido' : 'Aplicado'}"\n`;
    });
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `historial_renombrado_levapan_${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ==========================================================================
// TOAST NOTIFICACIONES
// ==========================================================================

function showToast(message, type = 'success') {
  const toast = document.getElementById('toast-notification');
  const toastMsg = document.getElementById('toast-message');
  const toastIcon = document.getElementById('toast-icon');

  if (!toast || !toastMsg) return;

  toastMsg.textContent = message;
  if (type === 'error') {
    toastIcon.textContent = '✕';
    toastIcon.style.background = 'var(--accent-rose)';
    toast.style.borderColor = 'var(--accent-rose)';
  } else if (type === 'warning') {
    toastIcon.textContent = '⚠';
    toastIcon.style.background = 'var(--accent-amber)';
    toast.style.borderColor = 'var(--accent-amber)';
  } else if (type === 'info') {
    toastIcon.textContent = 'ℹ';
    toastIcon.style.background = 'var(--accent-cyan)';
    toast.style.borderColor = 'var(--accent-cyan)';
  } else {
    toastIcon.textContent = '✓';
    toastIcon.style.background = 'var(--accent-emerald)';
    toast.style.borderColor = 'var(--accent-emerald)';
  }

  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3500);
}
