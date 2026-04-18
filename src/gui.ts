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
      --bg: #0a0f1f;
      --bg2: #10182c;
      --surface: rgba(15, 22, 39, 0.92);
      --surface2: rgba(27, 38, 65, 0.95);
      --surface3: rgba(37, 50, 82, 0.95);
      --border: rgba(110, 134, 191, 0.24);
      --accent: #f7b24d;
      --accent2: #ff8f5b;
      --green: #4dd39d;
      --red: #ff6f7d;
      --yellow: #ffd166;
      --blue: #7ab8ff;
      --text: #eef3ff;
      --muted: #98a7c9;
      --radius: 18px;
      --shadow: 0 18px 60px rgba(0,0,0,0.32);
    }
    :root.light {
      --bg: #f3f6fb;
      --bg2: #eaf0f9;
      --surface: rgba(255, 255, 255, 0.95);
      --surface2: rgba(242, 246, 255, 0.98);
      --surface3: rgba(232, 239, 251, 0.98);
      --border: rgba(74, 92, 145, 0.18);
      --text: #172033;
      --muted: #5f6f93;
      --shadow: 0 18px 50px rgba(61, 81, 140, 0.12);
    }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background:
        radial-gradient(circle at top left, rgba(247,178,77,0.10), transparent 0 28%),
        radial-gradient(circle at top right, rgba(122,184,255,0.10), transparent 0 30%),
        linear-gradient(180deg, var(--bg), var(--bg2));
      color: var(--text);
      min-height: 100vh;
      line-height: 1.45;
    }
    header {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 22px 28px;
      border-bottom: 1px solid var(--border);
      backdrop-filter: blur(10px);
      position: sticky;
      top: 0;
      z-index: 20;
      background: rgba(10, 15, 31, 0.72);
    }
    :root.light header { background: rgba(243, 246, 251, 0.82); }
    .brand-stack { display: flex; flex-direction: column; gap: 2px; }
    .logo { font-size: 1.55rem; font-weight: 900; color: var(--accent); letter-spacing: -0.04em; }
    .tagline { font-size: 0.9rem; color: var(--muted); }
    .header-right {
      margin-left: auto;
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 0.78rem;
      color: var(--muted);
    }
    .privacy-pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      border: 1px solid var(--border);
      border-radius: 999px;
      background: rgba(77, 211, 157, 0.08);
      color: var(--text);
    }
    .main {
      display: grid;
      grid-template-columns: 320px minmax(0, 1fr);
      gap: 22px;
      max-width: 1480px;
      margin: 0 auto;
      padding: 22px;
    }
    .sidebar, .workspace { display: flex; flex-direction: column; gap: 16px; }
    .panel {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 18px;
      box-shadow: var(--shadow);
      backdrop-filter: blur(8px);
    }
    .panel-title {
      font-size: 0.72rem;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.14em;
      color: var(--muted);
      margin-bottom: 14px;
    }
    .subtle-copy { font-size: 0.82rem; color: var(--muted); }
    .hero {
      display: grid;
      grid-template-columns: 1.4fr 0.9fr;
      gap: 18px;
      align-items: stretch;
    }
    .hero-copy h1 {
      font-size: clamp(1.5rem, 2vw, 2.2rem);
      line-height: 1.1;
      letter-spacing: -0.04em;
      margin-bottom: 10px;
    }
    .hero-copy p { color: var(--muted); max-width: 62ch; }
    .eyebrow {
      color: var(--accent);
      font-size: 0.75rem;
      font-weight: 800;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      margin-bottom: 8px;
    }
    .hero-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
      align-self: stretch;
    }
    .hero-chip {
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 12px;
      background: var(--surface2);
      font-size: 0.8rem;
      color: var(--text);
    }
    .hero-chip strong { display: block; margin-bottom: 4px; font-size: 0.95rem; }
    .option-group { margin-bottom: 14px; }
    .option-group label { display: flex; align-items: center; gap: 10px; font-size: 0.9rem; cursor: pointer; color: var(--text); }
    .option-group input[type=checkbox] { width: 16px; height: 16px; accent-color: var(--accent); cursor: pointer; }
    .option-group .desc { font-size: 0.75rem; color: var(--muted); margin-left: 26px; margin-top: 4px; }
    .input, select {
      width: 100%;
      background: var(--surface2);
      border: 1px solid var(--border);
      color: var(--text);
      padding: 9px 10px;
      border-radius: 10px;
      font-size: 0.84rem;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
    }
    .stat-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 14px 16px;
      box-shadow: var(--shadow);
    }
    .stat-label {
      font-size: 0.72rem;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: var(--muted);
      margin-bottom: 6px;
    }
    .stat-value {
      font-size: 1.45rem;
      font-weight: 800;
      letter-spacing: -0.04em;
    }
    #drop-zone {
      border: 1.5px dashed var(--border);
      border-radius: var(--radius);
      padding: 34px 22px;
      text-align: center;
      cursor: pointer;
      transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease;
      background: linear-gradient(180deg, rgba(247,178,77,0.06), transparent), var(--surface);
      box-shadow: var(--shadow);
    }
    #drop-zone.hover, #drop-zone:hover {
      border-color: rgba(247,178,77,0.8);
      background: linear-gradient(180deg, rgba(247,178,77,0.11), transparent), var(--surface);
      transform: translateY(-1px);
    }
    .drop-icon { font-size: 2.8rem; margin-bottom: 10px; }
    .drop-title { font-size: 1.15rem; font-weight: 700; color: var(--text); margin-bottom: 6px; }
    .drop-sub { font-size: 0.84rem; color: var(--muted); }
    .drop-formats { font-size: 0.72rem; color: var(--muted); margin-top: 10px; }
    .trust-row {
      display: flex;
      justify-content: center;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 14px;
    }
    .trust-tag, .queue-note {
      padding: 4px 8px;
      border-radius: 999px;
      border: 1px solid var(--border);
      background: var(--surface2);
      color: var(--muted);
      font-size: 0.74rem;
    }
    .action-bar {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      margin-top: 2px;
      margin-bottom: 10px;
    }
    .action-left, .action-right { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
    .summary-text { font-size: 0.82rem; color: var(--muted); }
    .toolbar-select { min-width: 150px; }
    .btn {
      padding: 9px 16px;
      border-radius: 10px;
      border: 1px solid transparent;
      cursor: pointer;
      font-size: 0.86rem;
      font-weight: 700;
      transition: all 0.15s ease;
    }
    .btn-primary { background: linear-gradient(135deg, var(--accent), var(--accent2)); color: #151515; }
    .btn-primary:hover:not(:disabled) { filter: brightness(1.03); transform: translateY(-1px); }
    .btn-primary:disabled { opacity: 0.45; cursor: not-allowed; transform: none; }
    .btn-ghost, .btn-secondary, .btn-dl {
      background: var(--surface2);
      border: 1px solid var(--border);
      color: var(--text);
    }
    .btn-ghost:hover, .btn-secondary:hover, .btn-dl:hover { border-color: rgba(247,178,77,0.7); color: var(--accent); }
    .btn-dl { padding: 6px 11px; font-size: 0.76rem; }
    .prog-wrap { height: 6px; background: var(--surface3); border-radius: 999px; overflow: hidden; margin: 6px 0 0; }
    .prog-bar { height: 100%; background: linear-gradient(90deg, var(--accent), var(--accent2)); border-radius: 999px; transition: width 0.3s; }
    #file-list { margin-top: 14px; }
    table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      font-size: 0.85rem;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 16px;
      overflow: hidden;
      box-shadow: var(--shadow);
    }
    thead tr { background: rgba(122,184,255,0.06); }
    th {
      text-align: left;
      padding: 10px 12px;
      font-size: 0.7rem;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--muted);
    }
    td { padding: 12px; border-bottom: 1px solid rgba(110, 134, 191, 0.12); vertical-align: middle; }
    tr:last-child td { border-bottom: none; }
    .file-name { font-weight: 650; max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .file-size { color: var(--muted); font-size: 0.8rem; }
    .badge {
      display: inline-block; padding: 3px 8px; border-radius: 999px;
      font-size: 0.68rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em;
    }
    .badge-format { background: rgba(247,178,77,0.12); color: var(--accent); }
    .badge-pending  { background: rgba(255,209,102,0.15); color: var(--yellow); }
    .badge-done     { background: rgba(77,211,157,0.15); color: var(--green); }
    .badge-error    { background: rgba(255,111,125,0.15); color: var(--red); }
    .badge-reading  { background: rgba(122,184,255,0.15); color: var(--blue); }
    .metadata-tags { display: flex; flex-wrap: wrap; gap: 4px; }
    .meta-tag { padding: 2px 7px; border-radius: 6px; font-size: 0.68rem; background: var(--surface2); color: var(--muted); }
    #toast {
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 12px 16px;
      font-size: 0.86rem;
      box-shadow: var(--shadow);
      transform: translateY(80px);
      opacity: 0;
      transition: all 0.3s;
      z-index: 999;
    }
    #toast.show { transform: translateY(0); opacity: 1; }
    #toast.success { border-left: 3px solid var(--green); }
    #toast.error   { border-left: 3px solid var(--red); }
    .empty { text-align: center; padding: 36px 24px; color: var(--muted); font-size: 0.92rem; }
    .btn-remove { background: none; border: none; cursor: pointer; color: var(--muted); font-size: 1rem; padding: 2px 6px; border-radius: 6px; }
    .btn-remove:hover { color: var(--red); background: rgba(255,111,125,0.10); }
    details summary { cursor: pointer; color: var(--muted); font-size: 0.78rem; list-style: none; }
    details summary::after { content: ' ▸'; }
    details[open] summary::after { content: ' ▾'; }
    .history-list {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .history-item {
      border: 1px solid var(--border);
      border-radius: 12px;
      background: var(--surface2);
      padding: 10px 12px;
      display: flex;
      flex-direction: column;
      gap: 3px;
      font-size: 0.78rem;
    }
    .history-item span, .history-item small, .history-empty { color: var(--muted); }
    ::-webkit-scrollbar { width: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
    @media (max-width: 1100px) {
      .main, .hero { grid-template-columns: 1fr; }
      .stats-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
    @media (max-width: 760px) {
      header { padding: 16px; align-items: flex-start; flex-direction: column; }
      .main { padding: 14px; }
      .stats-grid { grid-template-columns: 1fr; }
      .action-bar { flex-direction: column; align-items: stretch; }
      .action-left, .action-right { width: 100%; }
      .action-right > * { flex: 1; }
    }
  </style>
</head>
<body>
  <header>
    <div class="brand-stack">
      <div class="logo">🛡 HB Scrub</div>
      <div class="tagline">A polished, local-first workspace for private metadata cleanup</div>
    </div>
    <div class="header-right">
      <span class="privacy-pill">Local processing only • nothing leaves this machine</span>
      <button id="theme-toggle" title="Toggle light or dark mode"
        style="background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:7px 11px;border-radius:10px;cursor:pointer;font-size:0.9rem;">🌙</button>
    </div>
  </header>

  <div class="main">
    <aside class="sidebar">
      <div class="panel">
        <div class="panel-title">Profiles &amp; privacy controls</div>
        <select id="opt-profile" class="input" style="margin-bottom:12px;">
          <option value="custom" selected>Custom</option>
          <option value="privacy">Privacy (strip everything)</option>
          <option value="sharing">Sharing (keep color &amp; orientation)</option>
          <option value="archive">Archive (keep all except GPS)</option>
        </select>

        <div class="panel-title">Saved presets</div>
        <div style="display:flex;gap:8px;margin-bottom:14px;">
          <select id="saved-presets" class="input" style="margin:0;flex:1;">
            <option value="">Saved presets</option>
          </select>
          <button class="btn btn-ghost" id="btn-save-preset" style="white-space:nowrap;">Save</button>
        </div>

        <div class="option-group">
          <label><input type="checkbox" id="opt-color" /> Preserve color profile</label>
          <div class="desc">Useful for print and color-sensitive output.</div>
        </div>
        <div class="option-group">
          <label><input type="checkbox" id="opt-copyright" /> Preserve copyright</label>
          <div class="desc">Retain copyright and artist attribution metadata.</div>
        </div>
        <div class="option-group">
          <label><input type="checkbox" id="opt-orientation" /> Preserve orientation</label>
          <div class="desc">Keep camera rotation tags when required.</div>
        </div>
        <div class="option-group">
          <label><input type="checkbox" id="opt-title" /> Preserve title</label>
          <div class="desc">Retain title metadata on compatible files.</div>
        </div>
        <div class="option-group">
          <label><input type="checkbox" id="opt-description" /> Preserve description</label>
          <div class="desc">Keep descriptive text where needed.</div>
        </div>

        <hr style="border-color: var(--border); margin: 16px 0;" />
        <div class="panel-title">GPS precision</div>
        <select id="opt-gps" class="input">
          <option value="remove" selected>Remove GPS entirely</option>
          <option value="country">Country level (~111 km)</option>
          <option value="region">Region level (~11 km)</option>
          <option value="city">City level (~1 km)</option>
          <option value="exact">Keep exact GPS</option>
        </select>

        <hr style="border-color: var(--border); margin: 16px 0;" />
        <details id="inject-panel">
          <summary class="panel-title" style="cursor:pointer;">Inject clean metadata</summary>
          <div style="margin-top:10px;display:flex;flex-direction:column;gap:8px;">
            <input type="text" class="input" id="inj-copyright" placeholder="Copyright" />
            <input type="text" class="input" id="inj-artist" placeholder="Artist" />
            <input type="text" class="input" id="inj-software" placeholder="Software" />
            <input type="text" class="input" id="inj-description" placeholder="Image description" />
            <input type="text" class="input" id="inj-datetime" placeholder="Date/time" />
            <div class="desc">Available for scrubbed JPEG, PNG, and WebP files.</div>
          </div>
        </details>

        <hr style="border-color: var(--border); margin: 16px 0;" />
        <details id="pdf-panel">
          <summary class="panel-title" style="cursor:pointer;">PDF options</summary>
          <div style="margin-top:10px;display:flex;flex-direction:column;gap:8px;">
            <input type="password" class="input" id="pdf-password" placeholder="Password for encrypted PDFs" />
            <div class="desc">Provide a password only when a PDF requires it.</div>
          </div>
        </details>
      </div>

      <div class="panel">
        <div class="panel-title">Supported formats</div>
        <div id="formats-list" style="display:flex;flex-wrap:wrap;gap:5px;"></div>
      </div>

      <div class="panel" id="session-history">
        <div class="panel-title">Recent sessions</div>
        <ul class="history-list" id="history-list">
          <li class="history-empty">No recent cleanup sessions yet.</li>
        </ul>
      </div>
    </aside>

    <main class="workspace">
      <section class="panel hero">
        <div class="hero-copy">
          <div class="eyebrow">Private metadata cleanup</div>
          <h1>Inspect, clean, and export with a faster desktop workflow.</h1>
          <p>Batch process photos, documents, and media locally with clearer status, smarter controls, and better visibility into what changed.</p>
        </div>
        <div class="hero-grid">
          <div class="hero-chip"><strong>Zero upload</strong> Everything runs on-device.</div>
          <div class="hero-chip"><strong>Batch ready</strong> Process entire sets in one pass.</div>
          <div class="hero-chip"><strong>Readable results</strong> See what was removed and saved.</div>
          <div class="hero-chip"><strong>Safer defaults</strong> Privacy-first presets are built in.</div>
        </div>
      </section>

      <section class="stats-grid" id="stats-grid">
        <div class="stat-card"><div class="stat-label">Files in session</div><div class="stat-value" id="stat-total">0</div></div>
        <div class="stat-card"><div class="stat-label">Cleaned</div><div class="stat-value" id="stat-cleaned">0</div></div>
        <div class="stat-card"><div class="stat-label">Still queued</div><div class="stat-value" id="stat-pending">0</div></div>
        <div class="stat-card"><div class="stat-label">Space saved</div><div class="stat-value" id="stat-saved">0 B</div></div>
      </section>

      <div id="drop-zone">
        <div class="drop-icon">📂</div>
        <div class="drop-title">Drop files here or click to browse</div>
        <div class="drop-sub">Drag from your file manager, paste from clipboard, or use the native picker</div>
        <div class="drop-formats">JPEG · PNG · WebP · GIF · SVG · TIFF · HEIC · AVIF · PDF · MP4 · MOV · RAW</div>
        <div class="trust-row">
          <span class="trust-tag">No re-uploading</span>
          <span class="trust-tag">Local-only processing</span>
          <span class="trust-tag">Built for batch cleanup</span>
        </div>
      </div>
      <input type="file" id="file-input" multiple style="display:none"
        accept=".jpg,.jpeg,.png,.webp,.gif,.svg,.tiff,.tif,.heic,.heif,.avif,.pdf,.mp4,.mov,.dng,.raw,.nef,.cr2,.cr3,.arw,.orf,.rw2" />

      <div class="action-bar">
        <div class="action-left">
          <button class="btn btn-primary" id="btn-scrub" disabled>🧹 Scrub All</button>
          <button class="btn btn-ghost" id="btn-clear">Reset session</button>
          <button class="btn btn-ghost" id="btn-clear-completed">Clear completed</button>
        </div>
        <div class="action-right">
          <select id="filter-status" class="toolbar-select">
            <option value="all">All files</option>
            <option value="queued">Queued</option>
            <option value="done">Cleaned</option>
            <option value="error">Needs attention</option>
          </select>
          <select id="sort-files" class="toolbar-select">
            <option value="newest">Sort: newest first</option>
            <option value="name">Sort: name</option>
            <option value="size">Sort: largest first</option>
            <option value="saved">Sort: biggest savings</option>
            <option value="status">Sort: status</option>
          </select>
          <button class="btn btn-ghost" id="btn-export-report">Export report</button>
          <button class="btn btn-ghost" id="btn-dl-all" disabled>⬇ Download All</button>
        </div>
      </div>
      <div class="summary-text" id="run-summary">No files queued yet.</div>
      <div class="summary-text" id="file-count" style="margin-top:4px;"></div>
      <div class="prog-wrap"><div class="prog-bar" id="prog-bar" style="width:0%"></div></div>

      <div id="file-list">
        <div class="empty" id="empty-state">Drop files above to begin a private cleanup session.</div>
        <table id="file-table" style="display:none">
          <thead>
            <tr>
              <th>File</th>
              <th>Size</th>
              <th>Format</th>
              <th>Metadata found</th>
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

  <div id="toast"></div>

  <script>
  (function() {
    const $ = id => document.getElementById(id);

    // ── Theme toggle ──
    const themeBtn = $('theme-toggle');
    const savedTheme = localStorage.getItem('hb-scrub-theme');
    if (savedTheme === 'light' || (!savedTheme && window.matchMedia('(prefers-color-scheme: light)').matches)) {
      document.documentElement.classList.add('light');
      themeBtn.textContent = '☀️';
    }
    themeBtn.addEventListener('click', () => {
      const isLight = document.documentElement.classList.toggle('light');
      themeBtn.textContent = isLight ? '☀️' : '🌙';
      localStorage.setItem('hb-scrub-theme', isLight ? 'light' : 'dark');
    });

    const dropZone          = $('drop-zone');
    const fileInput         = $('file-input');
    const tbody             = $('file-tbody');
    const table             = $('file-table');
    const emptyState        = $('empty-state');
    const btnScrub          = $('btn-scrub');
    const btnClear          = $('btn-clear');
    const btnClearCompleted = $('btn-clear-completed');
    const btnExportReport   = $('btn-export-report');
    const btnDlAll          = $('btn-dl-all');
    const btnSavePreset     = $('btn-save-preset');
    const savedPresets      = $('saved-presets');
    const fileCount         = $('file-count');
    const runSummary        = $('run-summary');
    const progBar           = $('prog-bar');
    const toast             = $('toast');
    const filterStatus      = $('filter-status');
    const sortFiles         = $('sort-files');
    const historyList       = $('history-list');
    const statTotal         = $('stat-total');
    const statCleaned       = $('stat-cleaned');
    const statPending       = $('stat-pending');
    const statSaved         = $('stat-saved');

    // File registry: id -> { file, status, result, resultName, format, metadataTypes, removedTypes, warnings, savedBytes }
    const files = new Map();
    let nextId = 0;

    // ── localStorage option persistence (#10) ────────────────────────────
    const OPT_IDS = ['opt-color', 'opt-copyright', 'opt-orientation', 'opt-title', 'opt-description'];
    const INJ_IDS = ['inj-copyright', 'inj-artist', 'inj-software', 'inj-description', 'inj-datetime'];
    const RC_KEY = 'hbscrub-options';
    const HISTORY_KEY = 'hbscrub-history';
    const PRESET_KEY = 'hbscrub-custom-presets';

    // ── Profile definitions ───────────────────────────────────────────────
    const PROFILES = {
      privacy:  { 'opt-color': false, 'opt-copyright': false, 'opt-orientation': false, 'opt-title': false, 'opt-description': false, 'opt-gps': 'remove' },
      sharing:  { 'opt-color': true,  'opt-copyright': false, 'opt-orientation': true,  'opt-title': false, 'opt-description': false, 'opt-gps': 'remove' },
      archive:  { 'opt-color': true,  'opt-copyright': true,  'opt-orientation': true,  'opt-title': true,  'opt-description': true,  'opt-gps': 'remove' },
    };

    let profileChanging = false; // guard to avoid re-entrance

    function applyProfile(name) {
      const p = PROFILES[name];
      if (!p) return;
      profileChanging = true;
      OPT_IDS.forEach(id => { $(id).checked = p[id]; });
      $('opt-gps').value = p['opt-gps'];
      profileChanging = false;
      saveOptions();
    }

    function detectProfile() {
      for (const [name, p] of Object.entries(PROFILES)) {
        const match = OPT_IDS.every(id => $(id).checked === p[id]) && $('opt-gps').value === p['opt-gps'];
        if (match) return name;
      }
      return 'custom';
    }

    $('opt-profile').addEventListener('change', function() {
      if (this.value !== 'custom') applyProfile(this.value);
    });

    function getCurrentPresetState() {
      const state = {};
      OPT_IDS.forEach(id => { state[id] = $(id).checked; });
      state['opt-gps'] = $('opt-gps').value;
      INJ_IDS.forEach(id => { state[id] = $(id).value; });
      return state;
    }

    function applyPresetState(state) {
      if (!state) return;
      profileChanging = true;
      OPT_IDS.forEach(id => { if (id in state) $(id).checked = !!state[id]; });
      if ('opt-gps' in state) $('opt-gps').value = state['opt-gps'];
      INJ_IDS.forEach(id => { if (id in state) $(id).value = state[id] || ''; });
      $('opt-profile').value = 'custom';
      profileChanging = false;
      saveOptions();
    }

    function getSavedPresetItems() {
      try {
        return JSON.parse(localStorage.getItem(PRESET_KEY) || '{}');
      } catch {
        return {};
      }
    }

    function renderSavedPresets() {
      const items = getSavedPresetItems();
      const names = Object.keys(items).sort((a, b) => a.localeCompare(b));
      savedPresets.innerHTML = '';
      const empty = document.createElement('option');
      empty.value = '';
      empty.textContent = 'Saved presets';
      savedPresets.appendChild(empty);
      names.forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        savedPresets.appendChild(opt);
      });
    }

    function saveOptions() {
      try {
        const state = getCurrentPresetState();
        state['opt-profile'] = $('opt-profile').value;
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
        if ('opt-profile' in state) $('opt-profile').value = state['opt-profile'];
        INJ_IDS.forEach(id => { if (id in state) $(id).value = state[id]; });
      } catch(e) { /* ignore */ }
    }

    // When any option changes manually, switch profile to "Custom"
    function onManualOptionChange() {
      if (profileChanging) return;
      $('opt-profile').value = detectProfile();
      savedPresets.value = '';
      saveOptions();
    }

    savedPresets.addEventListener('change', () => {
      if (!savedPresets.value) return;
      const items = getSavedPresetItems();
      applyPresetState(items[savedPresets.value]);
      showToast('Preset loaded: ' + savedPresets.value, 'success');
    });

    btnSavePreset.addEventListener('click', () => {
      const name = (window.prompt('Save current settings as preset:', savedPresets.value || '') || '').trim();
      if (!name) return;
      const items = getSavedPresetItems();
      items[name] = getCurrentPresetState();
      try {
        localStorage.setItem(PRESET_KEY, JSON.stringify(items));
      } catch {
        showToast('Unable to save preset in this environment', 'error');
        return;
      }
      renderSavedPresets();
      savedPresets.value = name;
      showToast('Preset saved: ' + name, 'success');
    });

    // Attach change listeners to persist on every change
    OPT_IDS.forEach(id => $(id).addEventListener('change', onManualOptionChange));
    $('opt-gps').addEventListener('change', onManualOptionChange);
    INJ_IDS.forEach(id => $(id).addEventListener('input', onManualOptionChange));
    filterStatus.addEventListener('change', refreshUI);
    sortFiles.addEventListener('change', refreshUI);
    loadOptions();
    renderHistory();
    renderSavedPresets();

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
    // ── Folder drag-drop support ────────────────────────────────────────
    function readEntries(reader) {
      return new Promise((resolve, reject) => {
        reader.readEntries(resolve, reject);
      });
    }
    function fileFromEntry(entry) {
      return new Promise((resolve, reject) => {
        entry.file(resolve, reject);
      });
    }
    async function collectFilesFromEntries(entries, out) {
      for (const entry of entries) {
        if (entry.isFile) {
          try { out.push(await fileFromEntry(entry)); } catch {}
        } else if (entry.isDirectory) {
          const reader = entry.createReader();
          let batch;
          do {
            batch = await readEntries(reader);
            await collectFilesFromEntries(batch, out);
          } while (batch.length > 0);
        }
      }
    }

    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('hover'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('hover'));
    dropZone.addEventListener('drop', async e => {
      e.preventDefault();
      dropZone.classList.remove('hover');
      // Support folder drops via webkitGetAsEntry
      if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
        const allFiles = [];
        const entries = [];
        for (const item of e.dataTransfer.items) {
          const entry = item.webkitGetAsEntry && item.webkitGetAsEntry();
          if (entry) entries.push(entry);
        }
        if (entries.some(e => e.isDirectory)) {
          await collectFilesFromEntries(entries, allFiles);
          addFiles(allFiles);
          return;
        }
      }
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
        files.set(id, {
          file: f,
          status: 'pending',
          result: null,
          format: '…',
          metadataTypes: [],
          removedTypes: [],
          warnings: [],
          resultName: '',
          savedBytes: 0,
          createdAt: Date.now() + id,
        });
        appendRow(id);
        readMeta(id);
      });
      refreshUI();
    }

    function appendRow(id) {
      const entry = files.get(id);
      const tr = document.createElement('tr');
      tr.id = 'row-' + id;
      tr.dataset.status = entry.status;
      tr.innerHTML = \`
        <td><div class="file-name" title="\${entry.file.name}">\${entry.file.name}</div></td>
        <td><span class="file-size" id="size-\${id}">\${fmtSize(entry.file.size)}</span></td>
        <td><span class="badge badge-format" id="fmt-\${id}">…</span></td>
        <td><div class="metadata-tags" id="meta-\${id}"><span class="badge badge-reading">reading…</span></div></td>
        <td><span class="badge badge-pending" id="status-\${id}">Pending</span></td>
        <td id="action-\${id}"><span class="queue-note">Ready</span></td>
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

    window.retryFile = function(id) {
      const entry = files.get(id);
      if (!entry) return;
      entry.status = 'pending';
      entry.result = null;
      entry.resultName = '';
      entry.savedBytes = 0;
      entry.removedTypes = [];
      entry.warnings = [];
      setStatus(id, 'pending', 'Pending');
      const actionEl = $('action-' + id);
      if (actionEl) actionEl.innerHTML = '<span class="queue-note">Ready</span>';
      renderMetaTags(id);
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
      const pending = [...files.entries()].filter(([, e]) => e.status !== 'done');
      if (!pending.length) return;

      btnScrub.disabled = true;
      let processed = 0;
      let successCount = 0;
      let errorCount = 0;
      let savedThisRun = 0;

      for (const [id, entry] of pending) {
        entry.status = 'reading';
        setStatus(id, 'reading', 'Processing…');
        refreshUI();
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
          entry.metadataTypes = [];
          entry.warnings = json.warnings || [];

          const cleanedBytes = Math.ceil(json.data.length * 3 / 4);
          const diff = Math.max(entry.file.size - cleanedBytes, 0);
          const pct = entry.file.size > 0 ? ((diff / entry.file.size) * 100).toFixed(1) : '0';
          entry.savedBytes = diff;
          savedThisRun += diff;
          successCount++;

          const sizeEl = $('size-' + id);
          if (sizeEl) {
            const diffStr = diff > 0
              ? \` <span style="color:var(--green)">• saved \${fmtSize(diff)} (\${pct}%)</span>\`
              : '';
            sizeEl.innerHTML = \`\${fmtSize(entry.file.size)} → \${fmtSize(cleanedBytes)}\${diffStr}\`;
          }

          setStatus(id, 'done', entry.warnings.length ? 'Clean + warning' : 'Clean');
          renderMetaTags(id);
          const actionEl = $('action-' + id);
          if (actionEl) {
            actionEl.innerHTML = \`<button class="btn-dl" onclick="downloadFile(\${id})">⬇ Download</button>\`;
          }
        } catch (e) {
          entry.status = 'error';
          entry.savedBytes = 0;
          errorCount++;
          setStatus(id, 'error', 'Needs review');
          const actionEl = $('action-' + id);
          if (actionEl) {
            actionEl.innerHTML = \`<button class="btn-dl" onclick="retryFile(\${id})">↻ Retry</button>\`;
          }
          console.error(e);
        }
        processed++;
        progBar.style.width = Math.round((processed / pending.length) * 100) + '%';
        refreshUI();
      }

      btnDlAll.disabled = ![...files.values()].some(e => e.status === 'done');
      btnScrub.disabled = false;
      if (successCount > 0) {
        recordSessionHistory({ files: pending.length, cleaned: successCount, errors: errorCount, savedBytes: savedThisRun });
      }
      showToast(
        successCount + ' file(s) cleaned' + (errorCount ? ' • ' + errorCount + ' need attention' : ''),
        errorCount ? 'error' : 'success'
      );
      setTimeout(() => { progBar.style.width = '0%'; }, 1800);
      refreshUI();
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
      showToast('Session reset', '');
    });

    btnClearCompleted.addEventListener('click', () => {
      for (const [id, entry] of [...files.entries()]) {
        if (entry.status === 'done') {
          files.delete(id);
          const row = $('row-' + id);
          if (row) row.remove();
        }
      }
      refreshUI();
    });

    btnExportReport.addEventListener('click', () => {
      if (files.size === 0) {
        showToast('No session data to export yet', 'error');
        return;
      }
      const values = [...files.values()];
      const report = {
        generatedAt: new Date().toISOString(),
        summary: {
          total: values.length,
          cleaned: values.filter(e => e.status === 'done').length,
          queued: values.filter(e => e.status === 'pending' || e.status === 'reading').length,
          errors: values.filter(e => e.status === 'error').length,
          savedBytes: values.reduce((sum, e) => sum + (e.savedBytes || 0), 0),
        },
        files: values.map(e => ({
          name: e.file.name,
          size: e.file.size,
          format: e.format,
          status: e.status,
          metadataFound: e.metadataTypes,
          removedMetadata: e.removedTypes,
          warnings: e.warnings || [],
          savedBytes: e.savedBytes || 0,
          resultName: e.resultName || null,
        })),
      };
      const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'hb-scrub-session-report.json';
      a.click();
      URL.revokeObjectURL(a.href);
      showToast('Session report exported', 'success');
    });

    // ── Options ───────────────────────────────────────────────────────────
    function getOptions() {
      const opts = {
        preserveColorProfile:  $('opt-color').checked,
        preserveCopyright:     $('opt-copyright').checked,
        preserveOrientation:   $('opt-orientation').checked,
        preserveTitle:         $('opt-title').checked,
        preserveDescription:   $('opt-description').checked,
        gpsRedact:             $('opt-gps').value,
      };

      // Collect inject fields (only include non-empty values)
      const inject = {};
      const injMap = {
        'inj-copyright': 'copyright',
        'inj-artist': 'artist',
        'inj-software': 'software',
        'inj-description': 'imageDescription',
        'inj-datetime': 'dateTime',
      };
      for (const [id, key] of Object.entries(injMap)) {
        const val = $(id).value.trim();
        if (val) inject[key] = val;
      }
      if (Object.keys(inject).length > 0) opts.inject = inject;

      const pdfPw = $('pdf-password').value.trim();
      if (pdfPw) opts.pdfPassword = pdfPw;

      return opts;
    }

    // ── Helpers ───────────────────────────────────────────────────────────
    function setStatus(id, type, text) {
      const el = $('status-' + id);
      const row = $('row-' + id);
      if (!el) return;
      const normalized = type === 'reading' ? 'reading' : type === 'done' ? 'done' : type === 'error' ? 'error' : 'pending';
      el.className = 'badge badge-' + normalized;
      el.textContent = text;
      if (row) row.dataset.status = normalized;
    }

    function statusRank(status) {
      return { reading: 0, pending: 1, error: 2, done: 3 }[status] ?? 9;
    }

    function getVisibleEntries() {
      let entries = [...files.entries()];
      if (filterStatus.value !== 'all') {
        entries = entries.filter(([, entry]) => {
          if (filterStatus.value === 'queued') return entry.status === 'pending' || entry.status === 'reading';
          return entry.status === filterStatus.value;
        });
      }

      entries.sort((a, b) => {
        const ea = a[1];
        const eb = b[1];
        switch (sortFiles.value) {
          case 'name':
            return ea.file.name.localeCompare(eb.file.name);
          case 'size':
            return eb.file.size - ea.file.size;
          case 'saved':
            return (eb.savedBytes || 0) - (ea.savedBytes || 0);
          case 'status':
            return statusRank(ea.status) - statusRank(eb.status) || ea.file.name.localeCompare(eb.file.name);
          case 'newest':
          default:
            return (eb.createdAt || 0) - (ea.createdAt || 0);
        }
      });
      return entries;
    }

    function syncRows() {
      const visibleEntries = getVisibleEntries();
      const visibleIds = new Set(visibleEntries.map(([id]) => id));
      for (const [id] of files.entries()) {
        const row = $('row-' + id);
        if (!row) continue;
        row.style.display = visibleIds.has(id) ? '' : 'none';
      }
      visibleEntries.forEach(([id]) => {
        const row = $('row-' + id);
        if (row) tbody.appendChild(row);
      });
      return visibleEntries.length;
    }

    function updateDashboard() {
      const values = [...files.values()];
      const total = values.length;
      const cleaned = values.filter(e => e.status === 'done').length;
      const queued = values.filter(e => e.status === 'pending' || e.status === 'reading').length;
      const errors = values.filter(e => e.status === 'error').length;
      const saved = values.reduce((sum, e) => sum + (e.savedBytes || 0), 0);

      statTotal.textContent = String(total);
      statCleaned.textContent = String(cleaned);
      statPending.textContent = String(queued);
      statSaved.textContent = fmtSize(saved);
      runSummary.textContent = total
        ? cleaned + ' cleaned • ' + queued + ' queued' + (errors ? ' • ' + errors + ' need attention' : '')
        : 'No files queued yet.';
    }

    function getHistoryItems() {
      try {
        return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
      } catch {
        return [];
      }
    }

    function renderHistory() {
      const items = getHistoryItems();
      if (!items.length) {
        historyList.innerHTML = '<li class="history-empty">No recent cleanup sessions yet.</li>';
        return;
      }
      historyList.innerHTML = items.map(item => {
        const when = new Date(item.at).toLocaleString();
        const filesLabel = item.files + ' file' + (item.files !== 1 ? 's' : '');
        return '<li class="history-item">'
          + '<strong>' + filesLabel + '</strong>'
          + '<span>' + item.cleaned + ' cleaned • ' + item.savedText + ' saved</span>'
          + '<small>' + when + (item.errors ? ' • ' + item.errors + ' issues' : '') + '</small>'
          + '</li>';
      }).join('');
    }

    function recordSessionHistory(summary) {
      try {
        const items = getHistoryItems();
        items.unshift({
          at: new Date().toISOString(),
          files: summary.files,
          cleaned: summary.cleaned,
          errors: summary.errors,
          savedBytes: summary.savedBytes,
          savedText: fmtSize(summary.savedBytes),
        });
        localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, 6)));
      } catch {
        /* ignore storage errors */
      }
      renderHistory();
    }

    function refreshUI() {
      const count = files.size;
      const visible = syncRows();
      table.style.display = count && visible ? '' : 'none';
      emptyState.style.display = visible ? 'none' : '';
      emptyState.textContent = count ? 'No files match the current view.' : 'Drop files above to begin a private cleanup session.';
      btnScrub.disabled = count === 0;
      btnDlAll.disabled = ![...files.values()].some(e => e.status === 'done');
      fileCount.textContent = count ? count + ' file' + (count !== 1 ? 's' : '') + ' in this session' : '';
      fileInput.value = '';
      updateDashboard();
    }

    function fmtSize(bytes) {
      if (!bytes) return '0 B';
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
      return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
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
      toast.className = 'show ' + type;
      setTimeout(() => { toast.className = ''; }, 3500);
    }
  })();
  </script>
</body>
</html>`;

// ─── HTTP Server ─────────────────────────────────────────────────────────────

/** Maximum request body size in bytes (default 50 MB, configurable via env). */
const MAX_BODY_SIZE = parseInt(process.env['HB_SCRUB_MAX_BODY'] ?? '', 10) || 50 * 1024 * 1024;

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
    let bodySize = 0;
    let aborted = false;

    req.on('data', (chunk: Buffer) => {
      bodySize += chunk.length;
      if (bodySize > MAX_BODY_SIZE) {
        if (!aborted) {
          aborted = true;
          res.writeHead(413, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `Request body exceeds ${MAX_BODY_SIZE} byte limit` }));
          req.destroy();
        }
        return;
      }
      body += chunk.toString();
    });
    req.on('end', () => {
      if (aborted) return;
      let parsed: { name?: unknown; data?: unknown; options?: Record<string, unknown> };
      try {
        parsed = JSON.parse(body) as typeof parsed;
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON in request body' }));
        return;
      }

      const { name, data, options } = parsed;
      if (typeof name !== 'string' || typeof data !== 'string') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing required fields: name (string) and data (base64 string)' }));
        return;
      }

      try {
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
            warnings: result.warnings,
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
