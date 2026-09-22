// preload.js — pont sécurisé entre le renderer et le process principal.
//
// Issue #4 : migration vers contextIsolation: true + nodeIntegration: false.
// Ce script s'exécute dans le contexte ISOLÉ de la page (avant index.html),
// avec accès aux modules Node (electron, path, url) — contrairement au
// renderer qui n'y a plus accès.
//
// Il expose une API MINIMALE via contextBridge.exposeInMainWorld :
//   window.iaoAPI.ipcInvoke(channel, ...args)  → ipcRenderer.invoke
//   window.iaoAPI.resolveMonacoBase()          → chemin absolu de Monaco
//
// Aucun autre accès Node n'est exposé : le renderer ne peut appeler QUE
// les canaux IPC whitelistés par le process principal (main.js).
// L'ancien pattern (nodeRequire('electron') + ipcRenderer direct) est
// supprimé : le renderer n'a plus accès à ipcRenderer ni à require.

const { contextBridge, ipcRenderer } = require('electron');
const path = require('path');
const url = require('url');

contextBridge.exposeInMainWorld('iaoAPI', {
  // Wrapper unique pour ipcRenderer.invoke : le renderer ne peut appeler
  // que des canaux IPC déjà enregistrés côté main.js (ipcMain.handle).
  // Aucune exposition de ipcRenderer.on/send/removeListener — l'app
  // n'utilise que invoke (requête/réponse, jamais push du main vers renderer).
  ipcInvoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),

  // Résout le chemin absolu du dossier Monaco (node_modules/monaco-editor/min/vs)
  // à partir de l'URL de la page courante. Remplace nodeRequire('url')/('path')
  // qui n'étaient accessibles qu'avec nodeIntegration:true.
  resolveMonacoBase: () => {
    try {
      const appDir = path.dirname(url.fileURLToPath(window.location.href));
      return path.join(appDir, 'node_modules', 'monaco-editor', 'min', 'vs').replace(/\\/g, '/');
    } catch (e) {
      return null;
    }
  }
});
