// =============================================================================
// Electron Main Process — NLE Video Editor
// =============================================================================
// This is the privileged Node.js process. It creates the BrowserWindow,
// registers IPC handlers, and manages FFmpeg/Gemini integrations.
// SECURITY: contextIsolation=true, nodeIntegration=false, sandbox=true.
// =============================================================================

const { app, BrowserWindow, Menu, dialog, ipcMain, shell, protocol, net } = require('electron');
const path = require('path');
const fs = require('fs');
const url = require('url');

// ---------------------------------------------------------------------------
// Custom Protocol — Secure Media File Streaming
// ---------------------------------------------------------------------------
// Register 'nle-media' as a privileged scheme BEFORE app.ready.
// This allows the sandboxed renderer to load local video/audio files
// without disabling webSecurity or using raw file:// URLs.
// ---------------------------------------------------------------------------
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'nle-media',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: true,
    },
  },
]);

// ---------------------------------------------------------------------------
// Environment & Configuration
// ---------------------------------------------------------------------------
const isDev = !app.isPackaged;

// Load .env file in dev mode for GEMINI_API_KEY
if (isDev) {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split('\n').forEach((line) => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        process.env[key.trim()] = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
      }
    });
  }
}

// ---------------------------------------------------------------------------
// Window Management
// ---------------------------------------------------------------------------
let mainWindow = null;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1200,
    minHeight: 700,
    title: 'MaestroCut',
    backgroundColor: '#0f0f13',
    show: false, // Show when ready to prevent visual flash
    webPreferences: {
      nodeIntegration: false,       // MANDATORY — No Node in renderer
      contextIsolation: true,       // MANDATORY — Isolate preload context
      sandbox: true,                // Extra hardening
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  // Graceful show after content loads
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (isDev) {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
  });

  // Load Angular app
  if (isDev) {
    mainWindow.loadURL('http://localhost:4200');
  } else {
    const indexPath = path.join(__dirname, '..', 'dist', 'renderer', 'browser', 'index.html');
    mainWindow.loadFile(indexPath);
  }

  // Handle external link clicks — open in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ---------------------------------------------------------------------------
// Application Menu
// ---------------------------------------------------------------------------
function buildMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Video...',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            if (!mainWindow) return;
            const result = await dialog.showOpenDialog(mainWindow, {
              properties: ['openFile', 'multiSelections'],
              filters: [
                { name: 'Video Files', extensions: ['mp4', 'mov', 'avi', 'mkv', 'webm', 'wmv', 'flv', 'm4v'] },
                { name: 'Audio Files', extensions: ['mp3', 'wav', 'aac', 'ogg', 'flac', 'm4a'] },
                { name: 'All Files', extensions: ['*'] },
              ],
            });
            if (!result.canceled && result.filePaths.length > 0) {
              mainWindow.webContents.send('file:opened', result.filePaths);
            }
          },
        },
        {
          label: 'Open Project...',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: async () => {
            if (!mainWindow) return;
            const result = await dialog.showOpenDialog(mainWindow, {
              properties: ['openFile'],
              filters: [
                { name: 'MaestroCut Project', extensions: ['maestro'] },
                { name: 'JSON Files', extensions: ['json'] },
              ],
            });
            if (!result.canceled && result.filePaths.length > 0) {
              try {
                const content = await fs.promises.readFile(result.filePaths[0], 'utf-8');
                const data = JSON.parse(content);
                mainWindow.webContents.send('project:loaded', {
                  filePath: result.filePaths[0],
                  data,
                });
              } catch (err) {
                dialog.showErrorBox('Open Project Error', `Failed to load project: ${err.message}`);
              }
            }
          },
        },
        {
          label: 'Save Project',
          accelerator: 'CmdOrCtrl+S',
          click: () => {
            if (mainWindow) mainWindow.webContents.send('menu:save');
          },
        },
        {
          label: 'Save Project As...',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => {
            if (mainWindow) mainWindow.webContents.send('menu:saveAs');
          },
        },
        { type: 'separator' },
        {
          label: 'Export Video...',
          accelerator: 'CmdOrCtrl+E',
          click: () => {
            if (mainWindow) mainWindow.webContents.send('menu:export');
          },
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        {
          label: 'Undo',
          accelerator: 'CmdOrCtrl+Z',
          click: () => {
            if (mainWindow) mainWindow.webContents.send('menu:undo');
          },
        },
        {
          label: 'Redo',
          accelerator: 'CmdOrCtrl+Shift+Z',
          click: () => {
            if (mainWindow) mainWindow.webContents.send('menu:redo');
          },
        },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About NLE Video Editor',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'MaestroCut',
              message: 'MaestroCut v1.0.0',
              detail: 'A Desktop Non-Linear Video Editor with AI Copilot.\nBuilt with Angular, Electron, and FFmpeg.',
            });
          },
        },
      ],
    },
  ];

  // macOS-specific application menu
  if (process.platform === 'darwin') {
    template.unshift({
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    });
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// ---------------------------------------------------------------------------
// IPC Handlers Registration
// ---------------------------------------------------------------------------
function registerIpcHandlers() {
  // --- File Dialog ---
  ipcMain.handle('dialog:openFile', async () => {
    if (!mainWindow) return { canceled: true, filePaths: [] };
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Video Files', extensions: ['mp4', 'mov', 'avi', 'mkv', 'webm', 'wmv', 'flv', 'm4v'] },
        { name: 'Audio Files', extensions: ['mp3', 'wav', 'aac', 'ogg', 'flac', 'm4a'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    return { canceled: result.canceled, filePaths: result.filePaths };
  });

  // --- Save Dialog ---
  ipcMain.handle('dialog:saveFile', async (_event, defaultName) => {
    if (!mainWindow) return { canceled: true, filePath: '' };
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: defaultName || 'untitled.maestro',
      filters: [
        { name: 'MaestroCut Project', extensions: ['maestro'] },
      ],
    });
    return { canceled: result.canceled, filePath: result.filePath || '' };
  });

  // --- Export Save Dialog ---
  ipcMain.handle('dialog:exportFile', async () => {
    if (!mainWindow) return { canceled: true, filePath: '' };
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: 'export.mp4',
      filters: [
        { name: 'MP4 Video', extensions: ['mp4'] },
        { name: 'WebM Video', extensions: ['webm'] },
        { name: 'MOV Video', extensions: ['mov'] },
        { name: 'AVI Video', extensions: ['avi'] },
      ],
    });
    return { canceled: result.canceled, filePath: result.filePath || '' };
  });

  // --- Project Save / Load ---
  ipcMain.handle('project:save', async (_event, filePath, stateJson) => {
    try {
      await fs.promises.writeFile(filePath, JSON.stringify(stateJson, null, 2), 'utf-8');
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('project:load', async (_event, filePath) => {
    try {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      return { success: true, data: JSON.parse(content) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // --- Video Metadata (using ffprobe) ---
  ipcMain.handle('file:metadata', async (_event, filePath) => {
    const ffmpeg = require('fluent-ffmpeg');
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) return reject(err);

        const videoStream = metadata.streams.find((s) => s.codec_type === 'video');
        const audioStream = metadata.streams.find((s) => s.codec_type === 'audio');

        resolve({
          duration: metadata.format.duration || 0,
          width: videoStream ? videoStream.width : 0,
          height: videoStream ? videoStream.height : 0,
          fps: videoStream ? eval(videoStream.r_frame_rate) : 0,
          codec: videoStream ? videoStream.codec_name : '',
          audioCodec: audioStream ? audioStream.codec_name : '',
          fileSize: metadata.format.size || 0,
          bitrate: metadata.format.bit_rate || 0,
        });
      });
    });
  });

  // --- Get Video Thumbnail ---
  ipcMain.handle('file:thumbnail', async (_event, filePath, timeInSeconds) => {
    const ffmpeg = require('fluent-ffmpeg');
    const os = require('os');
    const tmpDir = path.join(os.tmpdir(), 'nle-thumbnails');

    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }

    const thumbnailName = `thumb_${Date.now()}.png`;

    return new Promise((resolve, reject) => {
      ffmpeg(filePath)
        .screenshots({
          timestamps: [timeInSeconds],
          filename: thumbnailName,
          folder: tmpDir,
          size: '320x180',
        })
        .on('end', () => {
          const thumbPath = path.join(tmpDir, thumbnailName);
          const base64 = fs.readFileSync(thumbPath, 'base64');
          // Clean up temp file
          fs.unlinkSync(thumbPath);
          resolve(`data:image/png;base64,${base64}`);
        })
        .on('error', (err) => reject(err));
    });
  });

  // --- Get File URL for renderer (convert local path to nle-media:// URL) ---
  ipcMain.handle('file:getUrl', async (_event, filePath) => {
    // Validate the file exists
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }
    // Encode the path and return a custom protocol URL that bypasses
    // the sandbox file:// restriction
    const encoded = encodeURIComponent(path.resolve(filePath));
    return `nle-media://media/${encoded}`;
  });

  // --- AI Prompt (Gemini API Proxy) ---
  const { GeminiProxy } = require('./gemini-proxy');
  let geminiProxy = null;

  ipcMain.handle('ai:prompt', async (_event, prompt, context) => {
    try {
      if (!geminiProxy) {
        geminiProxy = new GeminiProxy();
      }
      return await geminiProxy.prompt(prompt, context);
    } catch (err) {
      console.error('[AI Proxy] Error:', err);
      return {
        commands: [],
        explanation: `AI error: ${err.message}`,
      };
    }
  });

  // --- Export Video ---
  const { FFmpegEngine } = require('./ffmpeg-engine');
  const { sanitizeExportConfig } = require('./input-sanitizer');
  let exportEngine = null;

  ipcMain.handle('export:start', async (_event, config) => {
    try {
      const sanitizedConfig = sanitizeExportConfig(config);
      exportEngine = new FFmpegEngine();

      await exportEngine.export(sanitizedConfig, (progress) => {
        // Stream progress to the renderer
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('export:progress', progress);
        }
      });

      exportEngine = null;
    } catch (err) {
      exportEngine = null;
      // Send error progress
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('export:progress', {
          percent: 0,
          currentTime: 0,
          totalDuration: 0,
          fps: 0,
          speed: '0x',
          estimatedTimeRemaining: 0,
          stage: 'error',
        });
      }
      throw err;
    }
  });

  ipcMain.handle('export:cancel', async () => {
    if (exportEngine) {
      exportEngine.cancel();
      exportEngine = null;
    }
  });
}

// ---------------------------------------------------------------------------
// App Lifecycle
// ---------------------------------------------------------------------------
app.whenReady().then(() => {
  // Register the custom protocol handler to stream local media files
  protocol.handle('nle-media', (request) => {
    // Parse the encoded file path from the URL
    const requestUrl = new URL(request.url);
    // The path is: /encodedFilePath
    const encodedPath = requestUrl.pathname.slice(1); // remove leading /
    const filePath = decodeURIComponent(encodedPath);

    // Security: validate extension against allowlist
    const ext = path.extname(filePath).toLowerCase();
    const ALLOWED = new Set([
      '.mp4', '.mov', '.avi', '.mkv', '.webm', '.wmv', '.flv', '.m4v',
      '.mp3', '.wav', '.aac', '.ogg', '.flac', '.m4a',
      '.png', '.jpg', '.jpeg', '.bmp', '.gif',
    ]);
    if (!ALLOWED.has(ext)) {
      return new Response('Forbidden file type', { status: 403 });
    }

    // Security: verify file exists
    if (!fs.existsSync(filePath)) {
      return new Response('File not found', { status: 404 });
    }

    // -----------------------------------------------------------------
    // Range Request Handling for Video Seeking
    // -----------------------------------------------------------------
    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const rangeHeader = request.headers.get('Range') || request.headers.get('range');

    if (rangeHeader) {
      const parts = rangeHeader.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;

      const fileStream = fs.createReadStream(filePath, { start, end });
      return new Response(fileStream, {
        status: 206,
        statusText: 'Partial Content',
        headers: {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize.toString(),
          'Content-Type': getMimeType(ext),
        },
      });
    }

    // No range requested (e.g. initial load or image)
    const fileStream = fs.createReadStream(filePath);
    return new Response(fileStream, {
      status: 200,
      headers: {
        'Content-Length': fileSize.toString(),
        'Accept-Ranges': 'bytes',
        'Content-Type': getMimeType(ext),
      },
    });
  });

  // Helper inside app.whenReady
  function getMimeType(ext) {
    const map = {
      '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm',
      '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.png': 'image/png', '.jpg': 'image/jpeg'
    };
    return map[ext] || 'application/octet-stream';
  }

  registerIpcHandlers();
  buildMenu();
  createMainWindow();

  app.on('activate', () => {
    // macOS: re-create window when dock icon is clicked
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Security: Prevent new window creation from renderer
app.on('web-contents-created', (_event, contents) => {
  contents.on('will-navigate', (event, _url) => {
    // In production, prevent all navigation away from the app
    if (!isDev) {
      event.preventDefault();
    }
  });
});
