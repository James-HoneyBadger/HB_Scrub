/**
 * HB_Scrub GUI — standalone local web application
 * Run with: node dist/hb-scrub.gui.js
 * Then open http://localhost:3777 in your browser.
 */

import * as http from 'node:http';
import { fileURLToPath } from 'node:url';
import {
  removeMetadataSync,
  readMetadataSync,
  getMetadataTypes,
  getSupportedFormats,
} from './index.js';

const PORT = 3777;

// ─── HTML UI ─────────────────────────────────────────────────────────────────

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>HB Scrub — Metadata Remover</title>
  <style>
    :root {
      --bg: #0f1117;
      --surface: #1a1d27;
      --surface2: #22263a;
      --border: #2e3350;
      --accent: #f5a623;
      --accent2: #e8913a;
      --green: #4caf50;
      --red: #e53935;
      --yellow: #ffc107;
      --text: #e8eaf6;
      --muted: #8891b4;
      --radius: 10px;
    }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
    }
    /* ── Header ── */
    header {
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      padding: 18px 32px;
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .logo { font-size: 1.5rem; font-weight: 800; color: var(--accent); letter-spacing: -1px; }
    .tagline { font-size: 0.85rem; color: var(--muted); }
    .header-right { margin-left: auto; font-size: 0.8rem; color: var(--muted); }
    /* ── Layout ── */
    .main { display: grid; grid-template-columns: 280px 1fr; gap: 24px; padding: 28px 32px; max-width: 1400px; }
    /* ── Panel ── */
    .panel { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px; }
    .panel-title { font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: var(--muted); margin-bottom: 16px; }
    /* ── Options ── */
    .option-group { margin-bottom: 14px; }
    .option-group label { display: flex; align-items: center; gap: 10px; font-size: 0.875rem; cursor: pointer; color: var(--text); }
    .option-group input[type=checkbox] { width: 16px; height: 16px; accent-color: var(--accent); cursor: pointer; }
    .option-group .desc { font-size: 0.75rem; color: var(--muted); margin-left: 26px; margin-top: 3px; }
    /* ── Drop zone ── */
    #drop-zone {
      border: 2px dashed var(--border);
      border-radius: var(--radius);
      padding: 48px 24px;
      text-align: center;
      cursor: pointer;
      transition: border-color 0.2s, background 0.2s;
      background: var(--surface);
    }
    #drop-zone.hover, #drop-zone:hover { border-color: var(--accent); background: rgba(245,166,35,0.05); }
    .drop-icon { font-size: 3rem; margin-bottom: 12px; }
    .drop-title { font-size: 1rem; font-weight: 600; color: var(--text); margin-bottom: 6px; }
    .drop-sub { font-size: 0.8rem; color: var(--muted); }
    .drop-formats { font-size: 0.7rem; color: var(--muted); margin-top: 10px; }
    /* ── File table ── */
    #file-list { margin-top: 20px; }
    table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
    thead tr { border-bottom: 1px solid var(--border); }
    th { text-align: left; padding: 8px 10px; font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: var(--muted); }
    td { padding: 10px 10px; border-bottom: 1px solid rgba(46,51,80,0.5); vertical-align: middle; }
    tr:last-child td { border-bottom: none; }
    .file-name { font-weight: 500; max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .file-size { color: var(--muted); font-size: 0.8rem; }
    .badge {
      display: inline-block; padding: 2px 8px; border-radius: 20px;
      font-size: 0.7rem; font-weight: 700; text-transform: uppercase;
    }
    .badge-format { background: var(--surface2); color: var(--accent); }
    .badge-pending  { background: rgba(255,193,7,0.15); color: var(--yellow); }
    .badge-done     { background: rgba(76,175,80,0.15); color: var(--green); }
    .badge-error    { background: rgba(229,57,53,0.15); color: var(--red); }
    .badge-reading  { background: rgba(100,120,255,0.15); color: #99a8ff; }
    .metadata-tags { display: flex; flex-wrap: wrap; gap: 4px; }
    .meta-tag { padding: 1px 6px; border-radius: 4px; font-size: 0.65rem; background: var(--surface2); color: var(--muted); }
    /* ── Buttons ── */
    .btn {
      padding: 9px 20px; border-radius: 8px; border: none; cursor: pointer;
      font-size: 0.875rem; font-weight: 600; transition: all 0.15s;
    }
    .btn-primary { background: var(--accent); color: #111; }
    .btn-primary:hover:not(:disabled) { background: var(--accent2); }
    .btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }
    .btn-ghost {
      background: transparent; border: 1px solid var(--border);
      color: var(--muted); font-size: 0.8rem; padding: 6px 14px;
    }
    .btn-ghost:hover { border-color: var(--accent); color: var(--accent); }
    .btn-dl { padding: 5px 12px; font-size: 0.75rem; border-radius: 6px; background: var(--surface2); color: var(--accent); border: 1px solid var(--border); cursor: pointer; font-weight: 600; }
    .btn-dl:hover { background: var(--accent); color: #111; }
    /* ── Top bar ── */
    .action-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
    .action-left { display: flex; gap: 10px; align-items: center; }
    /* ── Progress bar ── */
    .prog-wrap { height: 4px; background: var(--border); border-radius: 2px; overflow: hidden; margin-top: 8px; }
    .prog-bar { height: 100%; background: var(--accent); border-radius: 2px; transition: width 0.3s; }
    /* ── Toast ── */
    #toast { position: fixed; bottom: 28px; right: 28px; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 14px 20px; font-size: 0.875rem; box-shadow: 0 8px 32px rgba(0,0,0,0.5); transform: translateY(80px); opacity: 0; transition: all 0.3s; z-index: 999; }
    #toast.show { transform: translateY(0); opacity: 1; }
    #toast.success { border-left: 3px solid var(--green); }
    #toast.error   { border-left: 3px solid var(--red); }
    /* ── Empty state ── */
    .empty { text-align: center; padding: 48px; color: var(--muted); font-size: 0.9rem; }
    /* ── Reduce button ── */
    .btn-remove { background: none; border: none; cursor: pointer; color: var(--muted); font-size: 1rem; padding: 2px 6px; border-radius: 4px; }
    .btn-remove:hover { color: var(--red); background: rgba(229,57,53,0.1); }
    /* ── Collapsible metadata ── */
    details summary { cursor: pointer; color: var(--muted); font-size: 0.78rem; list-style: none; }
    details summary::after { content: ' ▸'; }
    details[open] summary::after { content: ' ▾'; }
    /* scrollbar */
    ::-webkit-scrollbar { width: 6px; } 
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
  </style>
</head>
<body>
  <header>
    <div>
      <div class="logo">🛡 HB Scrub</div>
      <div class="tagline">Strip EXIF, GPS &amp; metadata from your files — privately, locally</div>
    </div>
    <div class="header-right">All processing happens on this machine. No data leaves your computer.</div>
  </header>

  <div class="main">
    <!-- Sidebar options -->
    <aside>
      <div class="panel">
        <div class="panel-title">Options</div>

        <div class="option-group">
          <label><input type="checkbox" id="opt-color" /> Preserve color profile</label>
          <div class="desc">Keep ICC color data (recommended for print)</div>
        </div>
        <div class="option-group">
          <label><input type="checkbox" id="opt-copyright" /> Preserve copyright</label>
          <div class="desc">Retain copyright &amp; artist tags</div>
        </div>
        <div class="option-group">
          <label><input type="checkbox" id="opt-orientation" /> Preserve orientation</label>
          <div class="desc">Keep EXIF rotation flag</div>
        </div>
        <div class="option-group">
          <label><input type="checkbox" id="opt-title" /> Preserve title</label>
          <div class="desc">Keep image title tag</div>
        </div>
        <div class="option-group">
          <label><input type="checkbox" id="opt-description" /> Preserve description</label>
          <div class="desc">Keep image description tag</div>
        </div>

        <hr style="border-color: var(--border); margin: 16px 0;" />
        <div class="panel-title">GPS Precision</div>
        <select id="opt-gps" style="width:100%;background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:8px;border-radius:6px;font-size:0.85rem;">
          <option value="remove" selected>Remove GPS entirely</option>
          <option value="country">Country level (~111 km)</option>
          <option value="region">Region level (~11 km)</option>
          <option value="city">City level (~1 km)</option>
          <option value="exact">Keep exact GPS</option>
        </select>
      </div>

      <div class="panel" style="margin-top:16px;">
        <div class="panel-title">Supported Formats</div>
        <div id="formats-list" style="display:flex;flex-wrap:wrap;gap:5px;"></div>
      </div>
    </aside>

    <!-- Main content -->
    <main>
      <!-- Drop zone -->
      <div id="drop-zone">
        <div class="drop-icon">📂</div>
        <div class="drop-title">Drop files here or click to browse</div>
        <div class="drop-sub">Drag files from your file manager</div>
        <div class="drop-formats">JPEG · PNG · WebP · GIF · SVG · TIFF · HEIC · AVIF · PDF · MP4 · MOV · RAW</div>
      </div>
      <input type="file" id="file-input" multiple style="display:none"
        accept=".jpg,.jpeg,.png,.webp,.gif,.svg,.tiff,.tif,.heic,.heif,.avif,.pdf,.mp4,.mov,.dng,.raw,.nef,.cr2,.cr3,.arw,.orf,.rw2" />

      <!-- Action bar -->
      <div class="action-bar" style="margin-top:20px;">
        <div class="action-left">
          <button class="btn btn-primary" id="btn-scrub" disabled>🧹 Scrub All</button>
          <button class="btn btn-ghost" id="btn-clear">Clear list</button>
          <span id="file-count" style="font-size:0.8rem;color:var(--muted);"></span>
        </div>
        <button class="btn btn-ghost" id="btn-dl-all" disabled>⬇ Download All</button>
      </div>
      <div class="prog-wrap"><div class="prog-bar" id="prog-bar" style="width:0%"></div></div>

      <!-- File list -->
      <div id="file-list">
        <div class="empty" id="empty-state">Add files above to get started</div>
        <table id="file-table" style="display:none">
          <thead>
            <tr>
              <th>File</th>
              <th>Size</th>
              <th>Format</th>
              <th>Metadata Found</th>
              <th>Status</th>
              <th>Action</th>
              <th></th>
            </tr>
          </thead>
          <tbody id="file-tbody"></tbody>
        </table>
      </div>
    </main>
  </div>

  <!-- Toast -->
  <div id="toast"></div>

  <script>
  (function() {
    const $ = id => document.getElementById(id);
    const dropZone   = $('drop-zone');
    const fileInput  = $('file-input');
    const tbody      = $('file-tbody');
    const table      = $('file-table');
    const emptyState = $('empty-state');
    const btnScrub   = $('btn-scrub');
    const btnClear   = $('btn-clear');
    const btnDlAll   = $('btn-dl-all');
    const fileCount  = $('file-count');
    const progBar    = $('prog-bar');
    const toast      = $('toast');

    // File registry: id -> { file, status, result, resultName, format, metadataTypes, removedTypes }
    const files = new Map();
    let nextId = 0;

    // ── localStorage option persistence (#10) ────────────────────────────
    const OPT_IDS = ['opt-color', 'opt-copyright', 'opt-orientation', 'opt-title', 'opt-description'];
    const RC_KEY = 'hbscrub-options';

    function saveOptions() {
      try {
        const state = {};
        OPT_IDS.forEach(id => { state[id] = $(id).checked; });
        state['opt-gps'] = $('opt-gps').value;
        localStorage.setItem(RC_KEY, JSON.stringify(state));
      } catch(e) { /* storage unavailable */ }
    }

    function loadOptions() {
      try {
        const raw = localStorage.getItem(RC_KEY);
        if (!raw) return;
        const state = JSON.parse(raw);
        OPT_IDS.forEach(id => { if (id in state) $(id).checked = state[id]; });
        if ('opt-gps' in state) $('opt-gps').value = state['opt-gps'];
      } catch(e) { /* ignore */ }
    }

    // Attach change listeners to persist on every change
    OPT_IDS.forEach(id => $(id).addEventListener('change', saveOptions));
    $('opt-gps').addEventListener('change', saveOptions);
    loadOptions();

    // ── Electron integration (#14 + #15) ─────────────────────────────────
    if (window.electronAPI) {
      // Expose triggers so main process File menu & tray can call us
      window._electronOpenFiles = async function() {
        const nativeFiles = await window.electronAPI.openFiles();
        if (!nativeFiles || !nativeFiles.length) return;
        addFiles(nativeFiles.map(f => {
          const bytes = Uint8Array.from(atob(f.data), c => c.charCodeAt(0));
          return new File([bytes], f.name);
        }));
      };
      window._showToast = (msg, type) => showToast(msg, type);

      // Listen for files pushed by the watch-folder feature
      window.electronAPI.onWatchFile(f => {
        const bytes = Uint8Array.from(atob(f.data), c => c.charCodeAt(0));
        addFiles([new File([bytes], f.name)]);
        showToast('Watch: ' + f.name + ' added', '');
      });

      // Inject a "Browse Files" button next to the drop-zone
      const browseBtn = document.createElement('button');
      browseBtn.className = 'btn-secondary';
      browseBtn.style.cssText = 'margin-top:0.75rem;';
      browseBtn.textContent = '📂 Browse Files';
      browseBtn.addEventListener('click', window._electronOpenFiles);
      dropZone.appendChild(browseBtn);
    }

    // ── Supported formats ─────────────────────────────────────────────────
    fetch('/api/formats').then(r => r.json()).then(fmts => {
      const el = $('formats-list');
      fmts.forEach(f => {
        const b = document.createElement('span');
        b.className = 'badge badge-format';
        b.textContent = f.toUpperCase();
        el.appendChild(b);
      });
    });

    // ── Drop zone ─────────────────────────────────────────────────────────
    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('hover'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('hover'));
    dropZone.addEventListener('drop', e => {
      e.preventDefault();
      dropZone.classList.remove('hover');
      addFiles(Array.from(e.dataTransfer.files));
    });
    fileInput.addEventListener('change', () => addFiles(Array.from(fileInput.files)));

    // ── Paste from clipboard (#11) ────────────────────────────────────────
    document.addEventListener('paste', e => {
      const items = e.clipboardData && e.clipboardData.files;
      if (items && items.length > 0) {
        e.preventDefault();
        addFiles(Array.from(items));
        showToast(items.length + ' file(s) pasted from clipboard', '');
      }
    });

    // ── Add files ─────────────────────────────────────────────────────────
    function addFiles(fileList) {
      fileList.forEach(f => {
        const id = nextId++;
        files.set(id, { file: f, status: 'pending', result: null, format: '…', metadataTypes: [], removedTypes: [] });
        appendRow(id);
        readMeta(id);
      });
      refreshUI();
    }

    function appendRow(id) {
      const entry = files.get(id);
      const tr = document.createElement('tr');
      tr.id = 'row-' + id;
      tr.innerHTML = \`
        <td><div class="file-name" title="\${entry.file.name}">\${entry.file.name}</div></td>
        <td><span class="file-size">\${fmtSize(entry.file.size)}</span></td>
        <td><span class="badge badge-format" id="fmt-\${id}">…</span></td>
        <td><div class="metadata-tags" id="meta-\${id}"><span class="badge badge-reading">reading…</span></div></td>
        <td><span class="badge badge-pending" id="status-\${id}">Pending</span></td>
        <td id="action-\${id}">—</td>
        <td><button class="btn-remove" title="Remove" onclick="removeFile(\${id})">✕</button></td>
      \`;
      tbody.appendChild(tr);
    }

    window.removeFile = function(id) {
      files.delete(id);
      const row = $('row-' + id);
      if (row) row.remove();
      refreshUI();
    };

    // ── Read metadata ────────────────────────────────────────────────────
    async function readMeta(id) {
      const entry = files.get(id);
      if (!entry) return;
      try {
        const b64 = await toBase64(entry.file);
        const res = await fetch('/api/read', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: entry.file.name, data: b64 })
        });
        const json = await res.json();
        entry.format = json.format || '?';
        entry.metadataTypes = json.metadataTypes || [];

        const fmtEl = $('fmt-' + id);
        if (fmtEl) fmtEl.textContent = entry.format.toUpperCase();

        renderMetaTags(id);
      } catch(e) {
        const metaEl = $('meta-' + id);
        if (metaEl) metaEl.innerHTML = '<span class="badge badge-error">Error</span>';
      }
    }

    // ── Before/after diff rendering (#12) ────────────────────────────────
    function renderMetaTags(id) {
      const entry = files.get(id);
      if (!entry) return;
      const metaEl = $('meta-' + id);
      if (!metaEl) return;

      if (entry.metadataTypes.length === 0 && entry.removedTypes.length === 0) {
        metaEl.innerHTML = '<span style="color:var(--green);font-size:0.75rem">✓ Clean</span>';
        return;
      }

      // Build diff: types in removedTypes are shown as strikethrough (removed)
      // types still in metadataTypes (not removed) shown normally
      const removedSet = new Set(entry.removedTypes);
      let html = '';
      const allTypes = [...new Set([...entry.metadataTypes, ...entry.removedTypes])];
      if (allTypes.length === 0) {
        metaEl.innerHTML = '<span style="color:var(--green);font-size:0.75rem">✓ Clean</span>';
        return;
      }
      for (const t of allTypes) {
        if (removedSet.has(t)) {
          html += \`<span class="meta-tag" style="text-decoration:line-through;opacity:0.45" title="removed">\${t}</span>\`;
        } else {
          html += \`<span class="meta-tag">\${t}</span>\`;
        }
      }
      metaEl.innerHTML = html;
    }

    // ── Scrub all ─────────────────────────────────────────────────────────
    btnScrub.addEventListener('click', async () => {
      const opts = getOptions();
      const pending = [...files.entries()].filter(([,e]) => e.status !== 'done');
      if (!pending.length) return;

      btnScrub.disabled = true;
      let done = 0;

      for (const [id, entry] of pending) {
        setStatus(id, 'reading', 'Processing…');
        try {
          const b64 = await toBase64(entry.file);
          const res = await fetch('/api/process', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: entry.file.name, data: b64, options: opts })
          });
          const json = await res.json();
          if (json.error) throw new Error(json.error);

          entry.status = 'done';
          entry.result = json.data;
          entry.resultName = json.name;
          entry.removedTypes = json.removed || [];
          // After scrub, remaining metadata is empty (clean)
          entry.metadataTypes = [];

          setStatus(id, 'done', 'Clean');
          renderMetaTags(id);
          const actionEl = $('action-' + id);
          if (actionEl) {
            actionEl.innerHTML = \`<button class="btn-dl" onclick="downloadFile(\${id})">⬇ Download</button>\`;
          }
        } catch(e) {
          entry.status = 'error';
          setStatus(id, 'error', 'Error');
          console.error(e);
        }
        done++;
        progBar.style.width = Math.round((done / pending.length) * 100) + '%';
      }

      btnDlAll.disabled = ![...files.values()].some(e => e.status === 'done');
      btnScrub.disabled = false;
      showToast(done + ' file(s) processed successfully', 'success');
      setTimeout(() => { progBar.style.width = '0%'; }, 2000);
    });

    // ── Download ─────────────────────────────────────────────────────────
    window.downloadFile = function(id) {
      const entry = files.get(id);
      if (!entry || !entry.result) return;
      const bytes = Uint8Array.from(atob(entry.result), c => c.charCodeAt(0));
      const blob = new Blob([bytes]);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = entry.resultName || entry.file.name;
      a.click();
      URL.revokeObjectURL(a.href);
    };

    // ── ZIP download all (#13) ────────────────────────────────────────────
    function buildZip(fileEntries) {
      // Simple ZIP with STORE (no compression) — no external dependencies
      const enc = s => new TextEncoder().encode(s);
      const u32le = n => new Uint8Array([n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff]);
      const u16le = n => new Uint8Array([n & 0xff, (n >> 8) & 0xff]);

      const localHeaders = [];
      const centralDirs  = [];
      let offset = 0;

      for (const { name, data } of fileEntries) {
        const nameBytes  = enc(name);
        const crc        = crc32(data);
        const size       = data.length;

        const local = [
          new Uint8Array([0x50, 0x4b, 0x03, 0x04]), // local file header sig
          u16le(20),          // version needed
          u16le(0),           // general purpose bit flag
          u16le(0),           // compression method: STORE
          u16le(0),           // last mod time
          u16le(0),           // last mod date
          u32le(crc),         // crc-32
          u32le(size),        // compressed size
          u32le(size),        // uncompressed size
          u16le(nameBytes.length),
          u16le(0),           // extra field length
          nameBytes,
          data,
        ];

        const central = [
          new Uint8Array([0x50, 0x4b, 0x01, 0x02]), // central dir sig
          u16le(20),          // version made by
          u16le(20),          // version needed
          u16le(0),           // general purpose bit flag
          u16le(0),           // compression method: STORE
          u16le(0),           // last mod time
          u16le(0),           // last mod date
          u32le(crc),
          u32le(size),
          u32le(size),
          u16le(nameBytes.length),
          u16le(0),           // extra field length
          u16le(0),           // file comment length
          u16le(0),           // disk number start
          u16le(0),           // internal file attributes
          u32le(0),           // external file attributes
          u32le(offset),      // relative offset of local header
          nameBytes,
        ];

        const localBytes = concat(...local);
        localHeaders.push(localBytes);
        centralDirs.push(concat(...central));
        offset += localBytes.length;
      }

      const centralStart = offset;
      const centralData  = concat(...centralDirs);
      const eocd = [
        new Uint8Array([0x50, 0x4b, 0x05, 0x06]), // end of central dir sig
        u16le(0), u16le(0),                        // disk numbers
        u16le(fileEntries.length),                 // entries on disk
        u16le(fileEntries.length),                 // total entries
        u32le(centralData.length),                 // size of central dir
        u32le(centralStart),                       // offset of central dir
        u16le(0),                                  // comment length
      ];

      return concat(...localHeaders, centralData, ...eocd);
    }

    function crc32(buf) {
      // CRC32 table (IEEE polynomial)
      if (!crc32._t) {
        crc32._t = new Uint32Array(256);
        for (let i = 0; i < 256; i++) {
          let c = i;
          for (let j = 0; j < 8; j++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
          crc32._t[i] = c;
        }
      }
      let c = 0xffffffff;
      for (let i = 0; i < buf.length; i++) c = crc32._t[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
      return (c ^ 0xffffffff) >>> 0;
    }

    function concat(...arrays) {
      const total = arrays.reduce((s, a) => s + a.length, 0);
      const out = new Uint8Array(total);
      let off = 0;
      for (const a of arrays) { out.set(a, off); off += a.length; }
      return out;
    }

    btnDlAll.addEventListener('click', () => {
      const done = [...files.entries()].filter(([,e]) => e.status === 'done');
      if (done.length === 0) return;

      if (done.length === 1) {
        // Single file — no need for a ZIP
        downloadFile(done[0][0]);
        return;
      }

      const entries = done.map(([,e]) => ({
        name: e.resultName || e.file.name,
        data: Uint8Array.from(atob(e.result), c => c.charCodeAt(0)),
      }));

      const zip = buildZip(entries);
      const blob = new Blob([zip], { type: 'application/zip' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'hb-scrub-clean.zip';
      a.click();
      URL.revokeObjectURL(a.href);
      showToast(done.length + ' files bundled into ZIP', 'success');
    });

    // ── Clear ─────────────────────────────────────────────────────────────
    btnClear.addEventListener('click', () => {
      files.clear();
      tbody.innerHTML = '';
      refreshUI();
    });

    // ── Options ───────────────────────────────────────────────────────────
    function getOptions() {
      return {
        preserveColorProfile:  $('opt-color').checked,
        preserveCopyright:     $('opt-copyright').checked,
        preserveOrientation:   $('opt-orientation').checked,
        preserveTitle:         $('opt-title').checked,
        preserveDescription:   $('opt-description').checked,
        gpsRedact:             $('opt-gps').value,
      };
    }

    // ── Helpers ───────────────────────────────────────────────────────────
    function setStatus(id, type, text) {
      const el = $('status-' + id);
      if (!el) return;
      el.className = 'badge badge-' + (type === 'reading' ? 'reading' : type === 'done' ? 'done' : type === 'error' ? 'error' : 'pending');
      el.textContent = text;
    }

    function refreshUI() {
      const count = files.size;
      table.style.display      = count ? '' : 'none';
      emptyState.style.display = count ? 'none' : '';
      btnScrub.disabled        = count === 0;
      fileCount.textContent    = count ? count + ' file' + (count !== 1 ? 's' : '') : '';
      fileInput.value = '';
    }

    function fmtSize(bytes) {
      if (bytes < 1024)       return bytes + ' B';
      if (bytes < 1024*1024)  return (bytes/1024).toFixed(1) + ' KB';
      return (bytes/(1024*1024)).toFixed(1) + ' MB';
    }

    function toBase64(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    }

    function showToast(msg, type = '') {
      toast.textContent = msg;
      toast.className   = 'show ' + type;
      setTimeout(() => { toast.className = ''; }, 3500);
    }
  })();
  </script>
</body>
</html>`;

// ─── HTTP Server ─────────────────────────────────────────────────────────────

export function handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
  const parsedUrl = new URL(req.url ?? '/', 'http://localhost');
  const pathname = parsedUrl.pathname;

  // ── GET / → serve UI ────────────────────────────────────────────────────
  if (req.method === 'GET' && pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(HTML);
    return;
  }

  // ── GET /api/formats ─────────────────────────────────────────────────────
  if (req.method === 'GET' && pathname === '/api/formats') {
    const fmts = getSupportedFormats().filter(f => f !== 'unknown');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(fmts));
    return;
  }

  // ── POST helpers ─────────────────────────────────────────────────────────
  if (req.method === 'POST' && (pathname === '/api/process' || pathname === '/api/read')) {
    let body = '';
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        const { name, data, options } = JSON.parse(body) as {
          name: string;
          data: string;
          options?: Record<string, unknown>;
        };

        const bytes = Uint8Array.from(Buffer.from(data, 'base64'));

        if (pathname === '/api/read') {
          // Read metadata without modifying
          const result = readMetadataSync(bytes);
          const metadataTypes = getMetadataTypes(bytes);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              format: result.format,
              metadataTypes,
            })
          );
          return;
        }

        // /api/process — strip metadata
        const result = removeMetadataSync(bytes, options ?? {});
        const outName = buildOutputName(name);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            name: outName,
            format: result.format,
            removed: result.removedMetadata,
            data: Buffer.from(result.data).toString('base64'),
          })
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: msg }));
      }
    });
    return;
  }

  // ── 404 ──────────────────────────────────────────────────────────────────
  res.writeHead(404);
  res.end('Not found');
}

export function buildOutputName(original: string): string {
  const dot = original.lastIndexOf('.');
  if (dot === -1) {
    return original + '_clean';
  }
  return original.slice(0, dot) + '_clean' + original.slice(dot);
}

// ─── Start ───────────────────────────────────────────────────────────────────

// Only auto-start the server when executed directly (not imported by tests)
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = http.createServer(handleRequest);
  server.listen(PORT, '127.0.0.1', () => {
    const addr = `http://localhost:${PORT}`;
    console.log(`\n  🛡  HB Scrub GUI is running at ${addr}\n`);
    console.log(`  Open ${addr} in your browser.\n`);
    console.log('  Press Ctrl+C to stop.\n');
  });
}
