const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

const ROOT_DIR = path.join(__dirname, '..');
const SCRIPTS_DIR = path.join(ROOT_DIR, 'scripts');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const USER_DATA_DIR = app.getPath('userData');
const SETTINGS_PATH = path.join(USER_DATA_DIR, 'settings.json');
const LAST_PAGE_PATH = path.join(USER_DATA_DIR, 'last-page.json');
const LITERATURE_PATH = path.join(DATA_DIR, 'literature-papers.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ── Read .env / .env.local into an object (for subprocess env injection) ─────
function loadDotEnvVars() {
  const vars = {};
  for (const name of ['.env', '.env.local']) {
    const p = path.join(ROOT_DIR, name);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq < 1) continue;
      vars[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
    }
  }
  return vars;
}

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    frame: false,
    backgroundColor: '#0A0F1A',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:3002');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../build/index.html'));
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// ── Window controls ──────────────────────────────────────────────────────────
ipcMain.handle('window:minimize',     () => mainWindow.minimize());
ipcMain.handle('window:maximize',     () => {
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.handle('window:close',        () => mainWindow.close());
ipcMain.handle('window:is-maximized', () => mainWindow.isMaximized());

// ── Settings persistence ─────────────────────────────────────────────────────
ipcMain.handle('settings:read', () => {
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
    }
  } catch {}
  return null;
});

ipcMain.handle('settings:write', (_, settings) => {
  try {
    fs.mkdirSync(USER_DATA_DIR, { recursive: true });
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf8');
  } catch {}
});

// ── Last page navigation ─────────────────────────────────────────────────────
ipcMain.handle('nav:get-last-page', () => {
  try {
    if (fs.existsSync(LAST_PAGE_PATH)) {
      return JSON.parse(fs.readFileSync(LAST_PAGE_PATH, 'utf8'))?.pageId || null;
    }
  } catch {}
  return null;
});

ipcMain.handle('nav:set-last-page', (_, pageId) => {
  try {
    fs.mkdirSync(USER_DATA_DIR, { recursive: true });
    fs.writeFileSync(LAST_PAGE_PATH, JSON.stringify({ pageId }), 'utf8');
  } catch {}
});

// ── Literature — paper persistence ───────────────────────────────────────────
ipcMain.handle('literature:read-papers', async () => {
  try {
    if (!fs.existsSync(LITERATURE_PATH)) return [];
    return JSON.parse(fs.readFileSync(LITERATURE_PATH, 'utf8'));
  } catch { return []; }
});

ipcMain.handle('literature:write-papers', async (_, papers) => {
  try {
    ensureDataDir();
    fs.writeFileSync(LITERATURE_PATH, JSON.stringify(papers, null, 2), 'utf8');
    return { ok: true };
  } catch (err) { return { ok: false, error: err.message }; }
});

// ── Literature — PDF file picker & reader ────────────────────────────────────
ipcMain.handle('literature:select-pdf', async () => {
  const win = BrowserWindow.getFocusedWindow();
  const result = await dialog.showOpenDialog(win, {
    title: 'Select PDF file',
    properties: ['openFile'],
    filters: [{ name: 'PDF Documents', extensions: ['pdf'] }],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle('literature:read-pdf', async (_, filePath) => {
  try {
    if (!filePath || !fs.existsSync(filePath)) return { ok: false, error: 'File not found.' };
    const data = fs.readFileSync(filePath);
    return { ok: true, base64: data.toString('base64') };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ── Shell helpers ────────────────────────────────────────────────────────────
ipcMain.handle('shell:open-file', async (_, targetPath) => {
  try {
    const candidate = String(targetPath || '').trim();
    if (!candidate) return { ok: false, error: 'No path provided.' };
    if (!fs.existsSync(candidate)) return { ok: false, error: 'File not found.' };
    const result = await shell.openPath(candidate);
    return result ? { ok: false, error: result } : { ok: true };
  } catch (error) {
    return { ok: false, error: error.message || 'Unable to open file.' };
  }
});

ipcMain.handle('shell:open-url', async (_, url) => {
  try {
    await shell.openExternal(url);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});

// ── PyMuPDF parser server ────────────────────────────────────────────────────
let pymupdfServerProcess = null;
let pymupdfServerLog = '';
let pymupdfServerReady = false;   // true only after /ping responds 200
const PYMUPDF_SERVER_PORT = 7432;
const PYMUPDF_SERVER_SCRIPT = path.join(SCRIPTS_DIR, 'pymupdf_server.py');

function appendServerLog(text) {
  pymupdfServerLog += text;
  if (pymupdfServerLog.length > 8192) pymupdfServerLog = pymupdfServerLog.slice(-8192);
}

// Poll /ping until the server responds or the process dies.
// Retries every 2 s for up to maxWaitMs (default 90 s — heavy imports take time).
function waitForPymupdfReady(maxWaitMs = 90000) {
  const http = require('http');
  const interval = 2000;
  const deadline = Date.now() + maxWaitMs;

  return new Promise((resolve) => {
    function attempt() {
      if (!pymupdfServerProcess) { resolve(false); return; }
      if (Date.now() > deadline)  { resolve(false); return; }

      const req = http.get(`http://127.0.0.1:${PYMUPDF_SERVER_PORT}/ping`, (res) => {
        if (res.statusCode === 200) {
          pymupdfServerReady = true;
          resolve(true);
        } else {
          setTimeout(attempt, interval);
        }
        res.resume(); // drain
      });
      req.on('error', () => setTimeout(attempt, interval));
      req.setTimeout(1500, () => { req.destroy(); setTimeout(attempt, interval); });
    }
    attempt();
  });
}

ipcMain.handle('parsers:pymupdf-start', async () => {
  if (pymupdfServerProcess) return { ok: true, already: true };

  // Look for a Python interpreter — prefer local .venv, fall back to system python
  const venvDir = path.join(ROOT_DIR, '.venv');
  const isWin = process.platform === 'win32';
  const venvPy = isWin
    ? path.join(venvDir, 'Scripts', 'python.exe')
    : path.join(venvDir, 'bin', 'python');

  const py = fs.existsSync(venvPy) ? venvPy : 'python';

  if (!fs.existsSync(PYMUPDF_SERVER_SCRIPT)) {
    return { ok: false, error: `Server script not found at ${PYMUPDF_SERVER_SCRIPT}` };
  }

  pymupdfServerLog = '';
  pymupdfServerReady = false;
  pymupdfServerProcess = spawn(py, [PYMUPDF_SERVER_SCRIPT], {
    cwd: ROOT_DIR,
    env: {
      ...process.env,
      ...loadDotEnvVars(),
      HF_HUB_DISABLE_SYMLINKS_WARNING: '1',
      HUGGINGFACE_HUB_DISABLE_IMPLICIT_TOKEN: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  pymupdfServerProcess.stdout.on('data', d => appendServerLog(d.toString()));
  pymupdfServerProcess.stderr.on('data', d => appendServerLog(d.toString()));
  pymupdfServerProcess.on('close', (code) => {
    appendServerLog(`\n[process exited with code ${code}]\n`);
    pymupdfServerProcess = null;
    pymupdfServerReady = false;
  });
  pymupdfServerProcess.on('error', (err) => {
    appendServerLog(err.message);
    pymupdfServerProcess = null;
    pymupdfServerReady = false;
  });

  // Wait for the server to actually accept connections (up to 90 s for heavy imports)
  const ready = await waitForPymupdfReady(90000);
  if (!ready) {
    return {
      ok: false,
      error: pymupdfServerLog.trim() ||
        'Parser server did not respond within 90 s. Check that Python packages are installed.',
    };
  }
  return { ok: true };
});

ipcMain.handle('parsers:pymupdf-stop', async () => {
  if (pymupdfServerProcess) {
    pymupdfServerProcess.kill();
    pymupdfServerProcess = null;
  }
  return { ok: true };
});

ipcMain.handle('parsers:pymupdf-status', async () => {
  return { running: pymupdfServerReady && !!pymupdfServerProcess, log: pymupdfServerLog };
});

app.on('before-quit', () => {
  if (pymupdfServerProcess) { pymupdfServerProcess.kill(); pymupdfServerProcess = null; }
});
