const { contextBridge, ipcRenderer, webFrame } = require('electron');

// Disable pinch/Ctrl+scroll zoom
webFrame.setZoomFactor(1);
webFrame.setVisualZoomLevelLimits(1, 1);

contextBridge.exposeInMainWorld('electronAPI', {
  // App settings
  readSettings:  ()         => ipcRenderer.invoke('settings:read'),
  writeSettings: (settings) => ipcRenderer.invoke('settings:write', settings),

  // Window controls
  windowMinimize:    () => ipcRenderer.invoke('window:minimize'),
  windowMaximize:    () => ipcRenderer.invoke('window:maximize'),
  windowClose:       () => ipcRenderer.invoke('window:close'),
  windowIsMaximized: () => ipcRenderer.invoke('window:is-maximized'),

  // Navigation
  getLastPage: ()       => ipcRenderer.invoke('nav:get-last-page'),
  setLastPage: (pageId) => ipcRenderer.invoke('nav:set-last-page', pageId),

  // Literature / papers
  readPapers:  ()       => ipcRenderer.invoke('literature:read-papers'),
  writePapers: (papers) => ipcRenderer.invoke('literature:write-papers', papers),
  selectPdf:   ()       => ipcRenderer.invoke('literature:select-pdf'),
  readPdf:     (path)   => ipcRenderer.invoke('literature:read-pdf', path),

  // Shell
  openFile: (filePath) => ipcRenderer.invoke('shell:open-file', filePath),

  // PyMuPDF parser server
  pymupdfStart:  () => ipcRenderer.invoke('parsers:pymupdf-start'),
  pymupdfStop:   () => ipcRenderer.invoke('parsers:pymupdf-stop'),
  pymupdfStatus: () => ipcRenderer.invoke('parsers:pymupdf-status'),

  // Open URL in browser
  gpuOpenUrl: (url) => ipcRenderer.invoke('shell:open-url', url),
});
