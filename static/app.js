'use strict';
// CiteLocal Library. Local-first CSL-JSON library saved to data/citelocal-library.json.

const $ = s => document.querySelector(s);
function el(t, p = {}) {
  const node = document.createElement(t);
  Object.entries(p).forEach(([k, v]) => {
    if (k === 'dataset') Object.entries(v).forEach(([dk, dv]) => { node.dataset[dk] = dv; });
    else node[k] = v;
  });
  return node;
}
function onKeyboardActivate(node, action) {
  node.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      action(e);
    }
  });
}
const KEY = 'citelocal';
const TOOL_STATE_KEY = 'citelocal-tool-state';
const api = (u, o) => fetch(u, o).then(r => r.ok ? r.json() : r.json().then(e => Promise.reject(e)));

function loadToolState() {
  try {
    return JSON.parse(localStorage.getItem(TOOL_STATE_KEY) || '{}') || {};
  } catch {
    return {};
  }
}
function saveToolState() {
  try {
    localStorage.setItem(TOOL_STATE_KEY, JSON.stringify(toolState));
  } catch {}
}

let db = defaultLibrary();
let formatData = { bibliography: [], citations: [] };
let captureCandidates = [];
let selectedCapture = -1;
let saveT;
let noteT;
let showNeedsReviewOnly = false;
let railCollapsed = false;
let notesDrawerOpen = false;
let activeRailSection = 'library';
let activeFolder = 'General';
let activeTool = '';
let pdfDrawerExpanded = false;
let selectedPdfFile = null;
let toolState = loadToolState();
let storageInfo = { dataDir: '', libraryFile: '' };
let appHealth = { ok: true };

function defaultLibrary() {
  return {
    folders: [{ id: 'folder-general', name: 'General' }],
    projects: [{ id: 'project-1', name: 'My bibliography', unit: '', folder: 'General', trashedAt: '', style: 'apa', notes: [], sources: [] }],
    active: 0,
    selected: null
  };
}
const proj = () => db.projects[db.active];
const selectedSource = () => proj().sources.find(s => s.id === db.selected) || null;

// ---- source types for manual entry (CSL types are the real taxonomy) ----
const TYPES = {
  webpage:            { label: 'Website / web page', fields: ['title', 'author', 'container-title', 'URL', 'issued', 'accessed'] },
  'article-journal':  { label: 'Journal article', fields: ['title', 'author', 'container-title', 'volume', 'issue', 'page', 'DOI', 'issued'] },
  'article-magazine': { label: 'Magazine article', fields: ['title', 'author', 'container-title', 'volume', 'page', 'URL', 'issued'] },
  'article-newspaper':{ label: 'Newspaper article', fields: ['title', 'author', 'container-title', 'page', 'URL', 'issued'] },
  book:               { label: 'Book', fields: ['title', 'author', 'publisher', 'publisher-place', 'edition', 'ISBN', 'issued'] },
  chapter:            { label: 'Book chapter', fields: ['title', 'author', 'container-title', 'editor', 'publisher', 'page', 'issued'] },
  'paper-conference': { label: 'Conference paper', fields: ['title', 'author', 'container-title', 'publisher', 'page', 'issued'] },
  thesis:             { label: 'Thesis / dissertation', fields: ['title', 'author', 'publisher', 'genre', 'issued'] },
  report:             { label: 'Report', fields: ['title', 'author', 'publisher', 'number', 'URL', 'issued'] },
  'motion_picture':   { label: 'Film / video', fields: ['title', 'author', 'publisher', 'URL', 'issued'] },
  broadcast:          { label: 'TV / radio broadcast', fields: ['title', 'author', 'container-title', 'publisher', 'issued'] },
  song:               { label: 'Music / audio', fields: ['title', 'author', 'container-title', 'publisher', 'issued'] },
  interview:          { label: 'Interview', fields: ['title', 'author', 'container-title', 'issued'] },
  software:           { label: 'Software', fields: ['title', 'author', 'publisher', 'version', 'URL', 'issued'] },
  document:           { label: 'Other / generic', fields: ['title', 'author', 'container-title', 'publisher', 'page', 'DOI', 'URL', 'issued', 'accessed'] },
};
const NAME_FIELDS = new Set(['author', 'editor']);
const DATE_FIELDS = new Set(['issued', 'accessed']);
const COMMON_STYLES = [
  { label: 'APA 7', id: 'apa' },
  { label: 'MLA 9', id: 'modern-language-association' },
  { label: 'Chicago AD', id: 'chicago-author-date' },
  { label: 'Chicago Notes', id: 'chicago-notes-bibliography' },
  { label: 'Harvard', id: 'harvard-cite-them-right' },
  { label: 'IEEE', id: 'ieee' },
  { label: 'Vancouver', id: 'nlm-citation-sequence' },
];

// ---- storage ----
async function loadLibrary() {
  try {
    db = normalizeLibrary(await api('/api/library'));
    const old = localFallback();
    if (isEmptyLibrary(db) && old && !isEmptyLibrary(old)) {
      db = normalizeLibrary(old);
      await saveLibrary(true);
    }
  } catch {
    db = normalizeLibrary(localFallback() || defaultLibrary());
  }
}
async function loadStorageInfo() {
  try {
    storageInfo = await api('/api/storage');
  } catch {
    storageInfo = { dataDir: 'Unavailable in this mode', libraryFile: '' };
  }
}
async function loadAppHealth() {
  try {
    appHealth = await api('/api/health');
  } catch {
    appHealth = { ok: false, setupHint: 'Could not read local app health.' };
  }
}
function localFallback() {
  try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; }
}
function slug(text) {
  return String(text || 'folder').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'folder';
}
function normalizeLibrary(data) {
  const base = defaultLibrary();
  if (!data || !Array.isArray(data.projects) || !data.projects.length) return base;
  const projects = data.projects.map((p, i) => ({
    id: String(p.id || `project-${i + 1}`),
    name: String(p.name || `Bibliography ${i + 1}`),
    unit: String(p.unit || ''),
    folder: String(p.folder || 'General'),
    trashedAt: String(p.trashedAt || ''),
    style: String(p.style || 'apa'),
    notes: normalizeNotes(p.notes),
    sources: Array.isArray(p.sources) ? p.sources : [],
  }));
  const folderNames = [
    ...(Array.isArray(data.folders) ? data.folders.map(f => typeof f === 'string' ? f : f?.name) : []),
    ...projects.map(p => p.folder || 'General'),
    'General',
  ].map(name => String(name || '').trim()).filter(Boolean);
  const folders = [...new Set(folderNames)].map((name, i) => ({
    id: String((Array.isArray(data.folders) && typeof data.folders[i] === 'object' && data.folders[i]?.id) || `folder-${slug(name)}-${i}`),
    name,
  }));
  return {
    folders,
    projects,
    active: Math.min(Math.max(Number(data.active) || 0, 0), projects.length - 1),
    selected: typeof data.selected === 'string' ? data.selected : null,
  };
}
function normalizeNotes(notes) {
  if (Array.isArray(notes)) {
    return notes.map((n, i) => ({
      id: String(n.id || `note-${Date.now()}-${i}`),
      text: String(n.text || ''),
      sourceId: String(n.sourceId || ''),
    })).filter(n => n.text || n.sourceId);
  }
  const text = String(notes || '').trim();
  return text ? [{ id: 'note-migrated', text, sourceId: '' }] : [];
}
function isEmptyLibrary(lib) {
  return lib.projects.length === 1 && !lib.projects[0].sources.length && !lib.projects[0].notes.length;
}
async function saveLibrary(now = false) {
  localStorage.setItem(KEY, JSON.stringify(db));
  clearTimeout(saveT);
  const run = async () => {
    try {
      await api('/api/library', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(db),
      });
    } catch {
      toast('Saved in browser; local file unavailable');
    }
  };
  if (now) await run();
  else saveT = setTimeout(run, 250);
}

// ---- toast ----
let toastT;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2200);
}
function renderAppHealth() {
  const box = $('#appHealth');
  if (appHealth.ok) {
    box.classList.add('hidden');
    box.textContent = '';
    return;
  }
  box.textContent = appHealth.setupHint || 'CiteLocal setup needs attention.';
  box.classList.remove('hidden');
}

// ---- app chrome ----
function libraryFolders() {
  const names = [
    ...(Array.isArray(db.folders) ? db.folders.map(f => typeof f === 'string' ? f : f?.name) : []),
    ...db.projects.filter(p => !p.trashedAt).map(p => p.folder || 'General'),
    'General',
  ].map(name => String(name || '').trim()).filter(Boolean);
  return [...new Set(names)];
}
function ensureFolder(name) {
  const clean = String(name || '').trim() || 'General';
  if (!Array.isArray(db.folders)) db.folders = [];
  if (!libraryFolders().includes(clean)) {
    db.folders.push({ id: `folder-${slug(clean)}-${Date.now()}`, name: clean });
  }
  activeFolder = clean;
  return clean;
}
function projectsInFolder(folder, includeTrashed = false) {
  return db.projects
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => (p.folder || 'General') === folder && (includeTrashed || !p.trashedAt));
}
function setRailCollapsed(next) {
  railCollapsed = next;
  $('#appShell').classList.toggle('rail-collapsed', railCollapsed);
  $('#toggleRail').textContent = railCollapsed ? '›' : '‹';
  $('#toggleRail').setAttribute('aria-expanded', String(!railCollapsed));
  $('#toggleRail').setAttribute('aria-label', railCollapsed ? 'Expand bibliography sidebar' : 'Collapse bibliography sidebar');
}
function setNotesDrawerOpen(next) {
  notesDrawerOpen = next;
  if (next) {
    pdfDrawerExpanded = false;
    activeTool = '';
  }
  document.body.classList.toggle('notes-open', notesDrawerOpen);
  $('#notesDrawer').setAttribute('aria-hidden', String(!notesDrawerOpen));
  $('#openNotesDrawer').setAttribute('aria-expanded', String(notesDrawerOpen));
  renderToolWorkspace();
}
function renderLibrarySections() {
  const sections = $('#railSections');
  const compactSections = $('#compactRailSections');
  const liveProjects = db.projects.filter(p => !p.trashedAt);
  const trashCount = db.projects.filter(p => p.trashedAt).length;
  const folderCount = libraryFolders().length;
  const { sourceCount, noteCount, reviewCount } = projectStats(proj());
  const labels = {
    library: `Library (${liveProjects.length})`,
    folders: `Folders (${folderCount})`,
    trash: `Trash (${trashCount})`,
  };
  Object.entries(labels).forEach(([section, label]) => {
    const fullButton = sections.querySelector(`[data-section="${section}"]`);
    const compactButton = compactSections.querySelector(`[data-section="${section}"]`);
    fullButton.textContent = label;
    compactButton.title = label;
    compactButton.setAttribute('aria-label', label);
  });
  sections.querySelectorAll('.rail-section').forEach(b => b.classList.toggle('active', b.dataset.section === activeRailSection));
  compactSections.querySelectorAll('.compact-rail-section').forEach(b => b.classList.toggle('active', b.dataset.section === activeRailSection));
  $('#projectMetaLine').textContent = `${projectSubline(proj())} saved locally`;
  sections.title = `${sourceCount} source(s), ${noteCount} note(s), ${reviewCount} needing review`;
  $('#openNotesDrawer').textContent = noteCount ? `Notes (${noteCount})` : 'Notes';
}
function visibleProjectIndexes() {
  return db.projects.map((p, i) => ({ p, i })).filter(({ p }) => {
    if (activeRailSection === 'trash') return !!p.trashedAt;
    return !p.trashedAt;
  });
}
function ensureActiveProjectVisible() {
  const visible = visibleProjectIndexes();
  if (!visible.length) return;
  if (!visible.some(({ i }) => i === db.active)) {
    db.active = visible[0].i;
    db.selected = proj().sources[0]?.id || null;
  }
}
function setRailSection(section) {
  activeTool = '';
  pdfDrawerExpanded = false;
  activeRailSection = section;
  ensureActiveProjectVisible();
  renderAll();
}
function setActiveTool(tool) {
  activeTool = tool;
  pdfDrawerExpanded = tool === 'pdf-tools';
  setNotesDrawerOpen(false);
  renderToolWorkspace();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function setPdfDrawerExpanded(next) {
  if (next && activeTool !== 'pdf-tools') return;
  pdfDrawerExpanded = Boolean(next);
  if (next) setNotesDrawerOpen(false);
  renderToolWorkspace();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function renderToolWorkspace() {
  const active = Boolean(activeTool);
  const pdfMode = activeTool === 'pdf-tools' && pdfDrawerExpanded;
  pdfDrawerExpanded = pdfMode;
  document.body.classList.toggle('tool-mode', active);
  document.body.classList.toggle('pdf-tool-mode', activeTool === 'pdf-tools');
  document.body.classList.toggle('pdf-drawer-expanded', pdfMode);
  $('#libraryHeader').classList.toggle('hidden', active);
  $('#libraryHeader').setAttribute('aria-hidden', String(active));
  $('#toolWorkspace').classList.toggle('hidden', !active);
  $('#toolWorkspace').setAttribute('aria-hidden', String(!active));
  $('#capturePanel').classList.toggle('hidden', active);
  $('#sourceSection').classList.toggle('hidden', active);
  $('#detailPanel').classList.toggle('hidden', active);
  $('#pdfToolDrawer').classList.toggle('expanded', pdfMode);
  $('#pdfToolDrawer').classList.toggle('collapsed', !pdfMode);
  $('#togglePdfToolDrawer').setAttribute('aria-expanded', String(pdfMode));
  $('#pdfToolDrawerContent').setAttribute('aria-hidden', String(!pdfMode));
  $('#wordCountTool').classList.toggle('hidden', activeTool !== 'word-count');
  $('#wordCountTool').setAttribute('aria-hidden', String(activeTool !== 'word-count'));
  $('#pdfToolsPanel').classList.toggle('hidden', activeTool !== 'pdf-tools');
  $('#pdfToolsPanel').setAttribute('aria-hidden', String(activeTool !== 'pdf-tools'));
  document.querySelectorAll('.tool-tab').forEach(button => {
    const on = button.dataset.tool === activeTool;
    button.classList.toggle('active', on);
    button.setAttribute('aria-pressed', String(on));
  });
}
$('#toggleRail').onclick = () => setRailCollapsed(!railCollapsed);
$('#openNotesDrawer').onclick = () => setNotesDrawerOpen(true);
onKeyboardActivate($('#openNotesDrawer'), () => setNotesDrawerOpen(true));
$('#closeNotesDrawer').onclick = () => setNotesDrawerOpen(false);
onKeyboardActivate($('#closeNotesDrawer'), () => setNotesDrawerOpen(false));
$('#notesBackdrop').onclick = () => setNotesDrawerOpen(false);
$('#railSections').onclick = e => {
  const button = e.target.closest('.rail-section');
  if (!button) return;
  setRailSection(button.dataset.section || 'library');
};
$('#compactRailSections').onclick = e => {
  const button = e.target.closest('.compact-rail-section');
  if (!button) return;
  setRailSection(button.dataset.section || 'library');
  setRailCollapsed(false);
};
$('#toolTabs').onclick = e => {
  const button = e.target.closest('.tool-tab');
  if (!button) return;
  setActiveTool(button.dataset.tool || '');
};
$('#closeToolWorkspace').onclick = () => setActiveTool('');
$('#closePdfTools').onclick = () => setActiveTool('');
$('#closePdfToolDrawer').onclick = () => setPdfDrawerExpanded(false);
$('#togglePdfToolDrawer').onclick = () => setPdfDrawerExpanded(!pdfDrawerExpanded);
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (notesDrawerOpen) return setNotesDrawerOpen(false);
  if (pdfDrawerExpanded) return setPdfDrawerExpanded(false);
  if (activeTool) setActiveTool('');
});

// ---- projects ----
function renderProjects() {
  ensureActiveProjectVisible();
  renderProjectEditor();
  renderProjectList();
  renderLibrarySections();
  buildStylePreset();
}
function renderProjectList() {
  const list = $('#projectList'); list.innerHTML = '';
  const visible = visibleProjectIndexes();
  $('#restoreProj').classList.toggle('hidden', activeRailSection !== 'trash' || !visible.length);
  $('#delProj').textContent = activeRailSection === 'trash' ? 'Delete forever' : 'Delete';
  $('.project-rail-label').textContent = activeRailSection === 'trash' ? 'Trash' : activeRailSection === 'folders' ? 'Folders' : 'Bibliographies';
  $('#newFolder').classList.toggle('hidden', activeRailSection === 'trash');
  if (!visible.length) {
    if (activeRailSection === 'folders') renderStorageFolderCard(list);
    list.appendChild(el('div', { className: 'empty tight', textContent: activeRailSection === 'trash' ? 'Trash is empty.' : 'No bibliographies here yet.' }));
    return;
  }
  if (activeRailSection === 'folders') renderStorageFolderCard(list);
  if (activeRailSection === 'trash') {
    visible.forEach(({ p, i }) => renderProjectButton(list, p, i));
    return;
  }
  libraryFolders().forEach(folder => renderFolderBlock(list, folder));
}
function renderFolderBlock(list, folder) {
  const items = projectsInFolder(folder);
  const box = el('section', { className: folder === activeFolder ? 'folder-block active' : 'folder-block' });
  const head = el('div', { className: 'folder-heading-row' });
  const name = el('button', { className: 'folder-heading', type: 'button' });
  name.innerHTML = `<span>${esc(folder)}</span><small>${items.length} assignment${items.length === 1 ? '' : 's'}</small>`;
  name.onclick = () => {
    activeFolder = folder;
    if (items.length) {
      db.active = items[0].i;
      db.selected = proj().sources[0]?.id || null;
    }
    saveLibrary();
    renderAll();
  };
  const add = el('button', { className: 'folder-add', type: 'button', textContent: '+' });
  add.title = `New bibliography in ${folder}`;
  add.onclick = () => createProject(folder);
  head.append(name, add);
  box.appendChild(head);
  if (!items.length) {
    box.appendChild(el('p', { className: 'empty tight', textContent: 'Empty unit folder' }));
  } else {
    items.forEach(({ p, i }) => renderProjectButton(box, p, i));
  }
  list.appendChild(box);
}
function renderProjectButton(list, p, i) {
  const b = el('button', { className: i === db.active ? 'project-item active' : 'project-item', type: 'button' });
  b.innerHTML = `<span>${esc(projectDisplayName(p))}</span><small>${esc(projectSubline(p))}</small>`;
  b.onclick = () => {
    db.active = i;
    activeFolder = p.folder || 'General';
    db.selected = proj().sources[0]?.id || null;
    saveLibrary();
    renderAll();
  };
  list.appendChild(b);
}
function renderStorageFolderCard(list) {
  const card = el('div', { className: 'storage-card' });
  card.innerHTML = `<b>Local storage folder</b><span>${esc(storageInfo.dataDir || 'Loading...')}</span>`;
  const open = el('button', { className: 'storage-open', type: 'button', textContent: 'Open local folder' });
  open.onclick = openDataFolder;
  card.appendChild(open);
  list.appendChild(card);
}
async function openDataFolder() {
  try {
    const out = await api('/api/open-data-dir', { method: 'POST' });
    toast(`Opened ${out.dataDir}`);
  } catch (e) {
    toast('Could not open folder: ' + (e.error || e.message || 'error'));
  }
}
function createProject(folderName = activeFolder || proj().folder || 'General') {
  const name = prompt('Assignment or bibliography name:', 'Untitled assignment'); if (!name) return;
  const folder = ensureFolder(folderName);
  db.projects.push({ id: 'project-' + Math.random().toString(36).slice(2, 9), name, unit: '', folder, trashedAt: '', style: proj().style, notes: [], sources: [] });
  db.active = db.projects.length - 1;
  db.selected = null;
  activeRailSection = 'folders';
  saveLibrary(); renderAll();
}
function createFolder() {
  const name = $('#folderNameInput').value;
  if (!name) return;
  const folder = ensureFolder(name);
  activeRailSection = 'folders';
  $('#folderCreator').classList.add('hidden');
  $('#folderNameInput').value = '';
  saveLibrary();
  renderAll();
  toast(`Folder ready: ${folder}`);
}
$('#newProj').onclick = () => {
  createProject(activeRailSection === 'folders' ? activeFolder : (proj().folder || activeFolder || 'General'));
};
$('#newFolder').onclick = () => {
  $('#folderCreator').classList.remove('hidden');
  $('#folderNameInput').value = proj().unit || activeFolder || '';
  $('#folderNameInput').select();
};
$('#folderCreator').onsubmit = e => {
  e.preventDefault();
  createFolder();
};
$('#saveFolder').onclick = e => {
  e.preventDefault();
  createFolder();
};
$('#cancelFolder').onclick = () => $('#folderCreator').classList.add('hidden');
$('#delProj').onclick = () => {
  if (activeRailSection === 'trash') return deleteProjectPermanently();
  moveProjectToTrash();
};
$('#restoreProj').onclick = restoreProjectFromTrash;
function moveProjectToTrash() {
  const liveCount = db.projects.filter(p => !p.trashedAt).length;
  if (liveCount === 1) return toast('Keep at least one active bibliography');
  if (!confirm(`Move "${proj().name}" to Trash?`)) return;
  proj().trashedAt = new Date().toISOString();
  ensureActiveProjectVisible();
  saveLibrary();
  renderAll();
  toast('Moved to Trash');
}
function restoreProjectFromTrash() {
  if (!proj().trashedAt) return toast('Select a trashed bibliography');
  proj().trashedAt = '';
  activeRailSection = 'library';
  saveLibrary();
  renderAll();
  toast('Restored bibliography');
}
function deleteProjectPermanently() {
  if (!proj().trashedAt) return toast('Select a trashed bibliography');
  if (!confirm(`Permanently delete "${proj().name}"? This cannot be undone.`)) return;
  db.projects.splice(db.active, 1);
  db.active = Math.min(db.active, db.projects.length - 1);
  if (!db.projects.length) db.projects.push(defaultLibrary().projects[0]);
  ensureActiveProjectVisible();
  db.selected = proj().sources[0]?.id || null;
  saveLibrary();
  renderAll();
  toast('Deleted permanently');
}
function projectDisplayName(p) {
  return [p.unit, p.name].filter(Boolean).join(' - ') || 'Untitled assignment';
}
function projectStats(p) {
  const sourceCount = p.sources.length;
  const noteCount = p.notes.filter(note => note.text.trim()).length;
  const reviewCount = p.sources.filter(src => sourceQuality(src).missing.length).length;
  return { sourceCount, noteCount, reviewCount };
}
function projectSubline(p) {
  const { sourceCount, noteCount, reviewCount } = projectStats(p);
  const parts = [
    `${sourceCount} source${sourceCount === 1 ? '' : 's'}`,
    `${noteCount} note${noteCount === 1 ? '' : 's'}`,
  ];
  if (reviewCount) parts.push(`${reviewCount} needs review`);
  return parts.join(' · ');
}
function renderProjectEditor() {
  $('#projectNameInput').value = proj().name;
  $('#unitCodeInput').value = proj().unit || '';
  $('#projectFolderInput').value = proj().folder || 'General';
  $('#projectMetaLine').textContent = `${projectSubline(proj())} saved locally`;
}
function bindProjectMeta() {
  // Name/unit are free text with no side effects — safe to save on every
  // keystroke. Folder assignment is NOT: ensureFolder() creates a new folder
  // for any name it hasn't seen before, so wiring it to 'input' created one
  // junk folder per keystroke while typing (e.g. "F", "Fa", "Fam", ... for a
  // real July 2026 incident). Folder only commits on blur/Enter ('change').
  const updateText = () => {
    proj().name = $('#projectNameInput').value.trim() || 'Untitled assignment';
    proj().unit = $('#unitCodeInput').value.trim();
    saveLibrary();
    renderProjectList();
    renderLibrarySections();
    $('#projectMetaLine').textContent = `${projectSubline(proj())} saved locally`;
  };
  const commitFolder = () => {
    proj().folder = ensureFolder($('#projectFolderInput').value.trim() || 'General');
    saveLibrary();
    renderProjectList();
    renderLibrarySections();
    $('#projectMetaLine').textContent = `${projectSubline(proj())} saved locally`;
  };
  $('#projectNameInput').addEventListener('input', updateText);
  $('#unitCodeInput').addEventListener('input', updateText);
  $('#projectFolderInput').addEventListener('change', commitFolder);
}

// ---- style picker ----
$('#stylePreset').addEventListener('change', e => {
  proj().style = e.target.value || 'apa';
  saveLibrary();
  renderBiblio();
});
function buildStylePreset() {
  const sel = $('#stylePreset'); sel.innerHTML = '';
  COMMON_STYLES.forEach(s => sel.appendChild(el('option', { value: s.id, textContent: s.label })));
  if (!COMMON_STYLES.some(s => s.id === proj().style)) proj().style = 'apa';
  sel.value = proj().style;
}
function buildDetailTypeSelect() {
  const sel = $('#detailType'); sel.innerHTML = '';
  Object.entries(TYPES).forEach(([k, v]) => sel.appendChild(el('option', { value: k, textContent: v.label })));
}

// ---- capture ----
$('#omniGo').onclick = runOmni;
$('#omni').addEventListener('keydown', e => { if (e.key === 'Enter') runOmni(); });
$('#sourceSearch').addEventListener('input', renderSourceList);
$('#reviewFilter').onclick = () => {
  showNeedsReviewOnly = !showNeedsReviewOnly;
  renderSourceList();
};

async function runOmni() {
  const q = $('#omni').value.trim(); if (!q) return;
  const box = $('#omniResults'); box.innerHTML = '<div class="spin">Looking up source data...</div>';
  try {
    let items;
    if (/^https?:\/\//i.test(q)) items = [await api('/api/scrape?url=' + encodeURIComponent(q))];
    else if (/^10\.\d{4,}\//.test(q)) items = await api('/api/lookup?doi=' + encodeURIComponent(q));
    else if (isISBN(q)) items = await api('/api/lookup?isbn=' + encodeURIComponent(q));
    else items = await api('/api/search?q=' + encodeURIComponent(q));
    showResults(Array.isArray(items) ? items : [items]);
  } catch (err) {
    box.innerHTML = `<div class="spin">Could not fetch that (${esc(err.error || err.message || 'error')}). Try manual entry.</div>`;
  }
}
function isISBN(s) { const d = s.replace(/[- ]/g, ''); return /^(97[89])?\d{9}[\dXx]$/.test(d); }
function showResults(items) {
  captureCandidates = items;
  selectedCapture = items.length ? 0 : -1;
  renderCaptureCandidates();
  renderCaptureReview();
}
function renderCaptureCandidates() {
  const box = $('#omniResults'); box.innerHTML = '';
  if (!captureCandidates.length) {
    box.innerHTML = '<div class="spin">No matches. Try manual entry.</div>';
    return;
  }
  captureCandidates.forEach((it, i) => {
    const card = el('button', { className: i === selectedCapture ? 'result-card active' : 'result-card' });
    card.innerHTML = `<div><b>${esc(it.title || '(untitled)')}</b><span>${esc(sourceLine(it) || labelForType(it.type))}</span></div>`;
    card.onclick = () => selectCaptureCandidate(i);
    box.appendChild(card);
  });
}
function selectCaptureCandidate(i) {
  selectedCapture = i;
  renderCaptureCandidates();
  renderCaptureReview();
}
function renderCaptureReview() {
  const it = captureCandidates[selectedCapture];
  $('#captureReview').classList.toggle('hidden', !it);
  if (!it) return;
  const existing = captureDuplicate();
  $('#capturePreviewTitle').textContent = it.title || '(untitled)';
  $('#capturePreviewMeta').textContent = sourceLine(it) || 'Metadata captured from lookup';
  $('#capturePreviewType').textContent = labelForType(it.type);
  $('#capturePreviewYear').textContent = it.issued?.['date-parts']?.[0]?.[0] || 'Unknown';
  $('#capturePreviewId').textContent = it.DOI || it.ISBN || it.URL || it.id || 'None';
  $('#captureDuplicateNotice').classList.toggle('hidden', !existing);
  $('#openExistingCapture').classList.toggle('hidden', !existing);
  $('#mergeCaptureCandidate').classList.toggle('hidden', !existing);
  $('#addCaptureCandidate').classList.toggle('hidden', !!existing);
  if (existing) {
    $('#captureDuplicateNotice').textContent = `Already saved as "${existing.title || '(untitled)'}".`;
  }
}
function captureDuplicate() {
  const it = captureCandidates[selectedCapture];
  return it ? findExistingSource(it) : null;
}
function sourceLine(it) {
  const who = (it.author || []).map(a => a.family || a.literal).filter(Boolean).slice(0, 3).join(', ');
  const yr = it.issued?.['date-parts']?.[0]?.[0];
  return [who, it['container-title'] || it.publisher, yr].filter(Boolean).join(' · ');
}
function addSource(it, skipRender) {
  const existing = findExistingSource(it);
  if (existing) {
    db.selected = existing.id;
    saveLibrary();
    toast('Already in this bibliography');
    renderAll();
    return;
  }
  if (!it.id) it.id = 'src-' + Math.random().toString(36).slice(2, 9);
  proj().sources.push(it);
  db.selected = it.id;
  saveLibrary();
  toast('Source added');
  if (!skipRender) renderAll();
}
function findExistingSource(it) {
  const norm = v => String(v || '').trim().toLowerCase();
  const keys = ['DOI', 'ISBN', 'URL', 'id'];
  return proj().sources.find(src => keys.some(k => norm(it[k]) && norm(it[k]) === norm(src[k])));
}
function mergeMissingSourceFields(existing, incoming) {
  const merged = { ...existing };
  const keys = ['title', 'author', 'issued', 'type', 'container-title', 'publisher', 'DOI', 'ISBN', 'URL', 'volume', 'issue', 'page'];
  keys.forEach(k => {
    if (hasCitationValue(merged[k]) || !hasCitationValue(incoming[k])) return;
    merged[k] = incoming[k];
  });
  return merged;
}
function hasCitationValue(value) {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === 'object') return Object.keys(value).length > 0;
  return String(value || '').trim().length > 0;
}
function openExistingCaptureSource() {
  const existing = captureDuplicate();
  if (!existing) return toast('No saved duplicate selected');
  db.selected = existing.id;
  saveLibrary();
  renderAll();
  toast('Opened existing source');
}
function mergeCaptureCandidate() {
  const incoming = captureCandidates[selectedCapture];
  const existing = captureDuplicate();
  if (!incoming || !existing) return toast('No saved duplicate selected');
  const i = proj().sources.findIndex(src => src.id === existing.id);
  if (i < 0) return toast('Existing source not found');
  proj().sources[i] = mergeMissingSourceFields(existing, incoming);
  db.selected = existing.id;
  saveLibrary();
  renderAll();
  renderCaptureReview();
  toast('Filled missing metadata');
}
$('#addCaptureCandidate').onclick = () => {
  const it = captureCandidates[selectedCapture];
  if (!it) return toast('Select a capture result first');
  addSource({ ...it });
  captureCandidates = [];
  selectedCapture = -1;
  $('#omniResults').innerHTML = '';
  $('#captureReview').classList.add('hidden');
  $('#omni').value = '';
};
$('#openExistingCapture').onclick = openExistingCaptureSource;
$('#mergeCaptureCandidate').onclick = mergeCaptureCandidate;
$('#emptyPasteAction').onclick = () => $('#omni').focus();
$('#emptyManualAction').onclick = () => {
  $('#manual').open = true;
  $('#typeSel').focus();
};
$('#emptyImportAction').onclick = () => $('#importFile').click();

// ---- source list and citation workspace ----
function renderSourceList() {
  const query = $('#sourceSearch').value.trim().toLowerCase();
  const srcs = proj().sources.filter(s => {
    if (showNeedsReviewOnly && !sourceQuality(s).missing.length) return false;
    return !query || searchableSource(s).includes(query);
  });
  $('#reviewFilter').classList.toggle('active', showNeedsReviewOnly);
  $('#reviewFilter').setAttribute('aria-pressed', String(showNeedsReviewOnly));
  $('#count').textContent = proj().sources.length ? `(${proj().sources.length})` : '';
  $('#empty').classList.toggle('hidden', proj().sources.length > 0);
  const list = $('#sourceList'); list.innerHTML = '';
  if (!proj().sources.length) return;
  if (!srcs.length) {
    list.innerHTML = `<div class="empty tight">${showNeedsReviewOnly ? 'No sources need review.' : 'No sources match that search.'}</div>`;
    return;
  }
  srcs.forEach(src => {
    const row = el('button', { className: src.id === db.selected ? 'source-row active' : 'source-row' });
    row.innerHTML = `<b>${esc(src.title || '(untitled)')}</b><span>${esc(sourceLine(src) || labelForType(src.type))}</span>${qualityBadge(src)}`;
    row.onclick = e => {
      const shouldReview = !!e.target.closest('.quality-badge.warn');
      db.selected = src.id;
      saveLibrary();
      renderSourceList();
      renderSelected();
      if (shouldReview) focusSourceReview(src);
    };
    list.appendChild(row);
  });
}
function searchableSource(src) {
  return [src.title, sourceLine(src), src.DOI, src.ISBN, src.URL, labelForType(src.type)].filter(Boolean).join(' ').toLowerCase();
}
function labelForType(type) {
  return TYPES[type]?.label || type || 'Source';
}
function sourceQuality(src) {
  const missing = [];
  if (!String(src.title || '').trim()) missing.push('title');
  if (!Array.isArray(src.author) || !src.author.length) missing.push('author');
  if (!src.issued?.['date-parts']?.[0]?.[0]) missing.push('year');
  if (!String(src.DOI || src.URL || src.ISBN || '').trim()) missing.push('identifier');
  return {
    missing,
    label: missing.length ? 'Needs review' : 'Ready',
  };
}
function qualityBadge(src) {
  const q = sourceQuality(src);
  const title = q.missing.length ? `Missing ${q.missing.join(', ')}` : 'Core citation fields present';
  const interactive = q.missing.length ? ' role="button" tabindex="0" aria-label="Review missing source details"' : '';
  return `<span class="quality-badge ${q.missing.length ? 'warn' : 'ok'}" title="${esc(title)}"${interactive}>${q.label}</span>`;
}
function reviewTargetForMissing(src) {
  const [missing] = sourceQuality(src).missing;
  if (missing === 'title') return '#detailTitle';
  if (missing === 'author') return '#detailAuthorFamily';
  if (missing === 'year') return '#detailIssued';
  if (missing === 'identifier') return src.DOI ? '#detailUrl' : '#detailDoi';
  return '#detailTitle';
}
function focusSourceReview(src = selectedSource()) {
  if (!src) return;
  const target = $(reviewTargetForMissing(src));
  if (!target) return;
  target.focus();
  if (typeof target.select === 'function') target.select();
  target.classList.add('review-focus');
  setTimeout(() => target.classList.remove('review-focus'), 1100);
}
async function renderBiblio() {
  const srcs = proj().sources;
  formatData = { bibliography: [], citations: [] };
  if (!srcs.length) {
    renderSourceList();
    renderSelected();
    return;
  }
  try {
    formatData = await api('/api/format', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: srcs, style: proj().style || 'apa' }),
    });
  } catch (e) {
    toast('Formatting failed: ' + (e.error || 'error'));
  }
  renderSourceList();
  renderSelected();
}
function selectedIndex() {
  return proj().sources.findIndex(s => s.id === db.selected);
}
function renderSelected() {
  const i = selectedIndex();
  const src = i >= 0 ? proj().sources[i] : null;
  $('#selectedEmpty').classList.toggle('hidden', !!src);
  $('#selectedCitation').classList.toggle('hidden', !src);
  if (!src) return;
  renderSourceDetail(src);
  $('#selectedEntry').innerHTML = formatData.bibliography[i] || '(no formatted reference yet)';
  $('#selectedInText').textContent = (formatData.citations[i] || '').replace(/<[^>]+>/g, '') || '(no in-text citation)';
  renderSelectedSourceNotes(src);
}
function renderSourceDetail(src) {
  const firstAuthor = src.author?.[0] || {};
  const q = sourceQuality(src);
  const badge = $('#sourceQualityBadge');
  badge.textContent = q.label;
  badge.title = q.missing.length ? `Missing ${q.missing.join(', ')}` : 'Core citation fields present';
  badge.className = `quality-badge ${q.missing.length ? 'warn' : 'ok'}`;
  badge.setAttribute('role', q.missing.length ? 'button' : 'status');
  badge.tabIndex = q.missing.length ? 0 : -1;
  badge.setAttribute('aria-label', q.missing.length ? 'Review missing source details' : 'Source details ready');
  $('#detailTitle').value = src.title || '';
  $('#detailAuthorGiven').value = firstAuthor.given || '';
  $('#detailAuthorFamily').value = firstAuthor.family || firstAuthor.literal || '';
  $('#detailIssued').value = src.issued?.['date-parts']?.[0]?.[0] || '';
  $('#detailType').value = TYPES[src.type] ? src.type : 'document';
  $('#detailContainer').value = src['container-title'] || src.publisher || '';
  $('#detailDoi').value = src.DOI || '';
  $('#detailUrl').value = src.URL || '';
}
function collectSourceDetail(src) {
  const out = { ...src };
  out.title = $('#detailTitle').value.trim();
  out.type = $('#detailType').value || 'document';
  const given = $('#detailAuthorGiven').value.trim();
  const family = $('#detailAuthorFamily').value.trim();
  if (given || family) out.author = [given ? { given, family } : { literal: family }];
  else delete out.author;
  const year = Number($('#detailIssued').value.trim());
  if (year) out.issued = { 'date-parts': [[year]] };
  else delete out.issued;
  const container = $('#detailContainer').value.trim();
  if (container) out['container-title'] = container;
  else delete out['container-title'];
  const doi = $('#detailDoi').value.trim();
  if (doi) out.DOI = doi;
  else delete out.DOI;
  const url = $('#detailUrl').value.trim();
  if (url) out.URL = url;
  else delete out.URL;
  return out;
}
function saveSourceDetail() {
  const i = selectedIndex();
  if (i < 0) return toast('Select a source first');
  const src = collectSourceDetail(proj().sources[i]);
  if (!src.title) return toast('Title is required');
  proj().sources[i] = src;
  db.selected = src.id;
  saveLibrary();
  toast('Source details saved');
  renderAll();
}
$('#sourceDetailForm').onsubmit = e => {
  e.preventDefault();
  saveSourceDetail();
};
$('#sourceQualityBadge').onclick = () => focusSourceReview();
$('#sourceQualityBadge').onkeydown = e => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    focusSourceReview();
  }
};
async function copyText(text, successMessage) {
  const value = String(text || '').trim();
  if (!value) {
    toast('Nothing to copy');
    return false;
  }
  const legacyCopy = () => {
    const area = el('textarea', { value });
    area.setAttribute('readonly', '');
    Object.assign(area.style, { position: 'fixed', left: '-9999px', top: '0' });
    document.body.appendChild(area);
    area.focus();
    area.select();
    const copied = document.execCommand('copy');
    area.remove();
    return copied;
  };
  if (legacyCopy()) {
    toast(successMessage);
    return true;
  }
  try {
    await navigator.clipboard.writeText(value);
    toast(successMessage);
    return true;
  } catch {
    try {
      await api('/api/clipboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: value }),
      });
      toast(successMessage);
      return true;
    } catch {
      toast('Copy failed. Select the text and copy manually.');
      return false;
    }
  }
}
$('#copySelectedEntry').onclick = async () => {
  const txt = $('#selectedEntry').textContent.trim();
  if (!txt) return toast('Select a source first');
  await copyText(txt, 'Reference copied');
};
$('#copySelectedInText').onclick = async () => {
  const txt = $('#selectedInText').textContent.trim();
  if (!txt) return toast('Select a source first');
  await copyText(txt, 'In-text citation copied');
};
$('#editSelected').onclick = () => {
  const src = selectedSource();
  if (!src) return toast('Select a source first');
  openEdit(src);
};
$('#deleteSelected').onclick = () => {
  const i = selectedIndex();
  if (i < 0) return;
  if (!confirm('Delete this source?')) return;
  proj().sources.splice(i, 1);
  db.selected = proj().sources[Math.min(i, proj().sources.length - 1)]?.id || null;
  saveLibrary(); renderAll();
};

// ---- notes ----
function renderNotes() {
  const list = $('#noteList'); list.innerHTML = '';
  if (!proj().notes.length) {
    list.appendChild(el('div', { className: 'empty tight', textContent: 'No notes yet. Add one and optionally link it to a saved source.' }));
  }
  proj().notes.forEach((note, i) => list.appendChild(noteRow(note, i)));
  $('#noteStatus').textContent = 'Saved locally';
  renderSelectedSourceNotes();
  renderProjectList();
  renderLibrarySections();
}
function noteRow(note, i) {
  const row = el('div', { className: 'note-row' });
  const noteText = el('input', { className: 'note-text', placeholder: 'Write a note...', value: note.text });
  noteText.dataset.noteText = note.id;
  const noteSource = el('select', { className: 'note-source' });
  noteSource.dataset.noteSource = note.id;
  noteSource.appendChild(el('option', { value: '', textContent: 'No linked source' }));
  proj().sources.forEach(src => noteSource.appendChild(el('option', { value: src.id, textContent: src.title || '(untitled)' })));
  noteSource.value = note.sourceId || '';
  const openSource = el('button', { className: 'note-open', textContent: 'Open source', type: 'button' });
  openSource.disabled = !note.sourceId;
  const remove = el('button', { className: 'note-remove', textContent: 'Delete', type: 'button' });
  noteText.oninput = e => updateNote(i, { text: e.target.value });
  noteSource.onchange = e => updateNote(i, { sourceId: e.target.value });
  openSource.onclick = () => openNoteSource(note.sourceId);
  remove.onclick = () => { proj().notes.splice(i, 1); saveNotesNow(); renderNotes(); };
  row.append(noteText, noteSource, openSource, remove);
  return row;
}
function updateNote(i, patch) {
  Object.assign(proj().notes[i], patch);
  renderSelectedSourceNotes();
  renderProjectList();
  renderLibrarySections();
  $('#noteStatus').textContent = 'Saving...';
  clearTimeout(noteT);
  noteT = setTimeout(async () => {
    await saveLibrary(true);
    $('#noteStatus').textContent = 'Saved locally';
  }, 350);
}
function saveNotesNow() {
  $('#noteStatus').textContent = 'Saving...';
  saveLibrary(true).then(() => { $('#noteStatus').textContent = 'Saved locally'; });
}
function textWithoutParentheses(text) {
  let out = '';
  let depth = 0;
  for (const ch of String(text || '')) {
    if (ch === '(') {
      depth += 1;
      out += ' ';
    } else if (ch === ')') {
      depth = Math.max(0, depth - 1);
      out += ' ';
    } else if (depth === 0) {
      out += ch;
    }
  }
  return out;
}
function countWords(text) {
  return (String(text || '').match(/[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)*/g) || []).length;
}
function renderWordCount() {
  const text = $('#wordCountInput').value;
  toolState.wordCountText = text;
  saveToolState();
  $('#wordCountTotal').textContent = String(countWords(text));
  $('#wordCountClean').textContent = String(countWords(textWithoutParentheses(text)));
}
$('#wordCountInput').addEventListener('input', renderWordCount);
$('#clearWordCount').onclick = () => {
  $('#wordCountInput').value = '';
  renderWordCount();
  $('#wordCountInput').focus();
};
function setPdfFile(file) {
  selectedPdfFile = file || null;
  if (selectedPdfFile) {
    toolState.pdfFileName = selectedPdfFile.name;
    toolState.pdfFileSize = selectedPdfFile.size;
  } else {
    delete toolState.pdfFileName;
    delete toolState.pdfFileSize;
  }
  saveToolState();
  $('#pdfToolFileStatus').textContent = selectedPdfFile
    ? `${selectedPdfFile.name} · ${Math.max(1, Math.round(selectedPdfFile.size / 1024))} KB`
    : 'or click to choose one from your computer';
  $('#pdfDropZone').classList.toggle('has-file', Boolean(selectedPdfFile));
}
function selectPdfTool(toolName) {
  const label = toolName.replace(/-/g, ' ');
  const message = selectedPdfFile
    ? `${selectedPdfFile.name} is ready for ${label}. Local processing will run through the PDF tools backend.`
    : `Choose a PDF before using ${label}.`;
  toolState.pdfToolStatus = message;
  toolState.pdfTool = toolName;
  saveToolState();
  $('#pdfToolStatus').textContent = message;
}
$('#pdfDropZone').onclick = () => $('#pdfToolFile').click();
$('#pdfDropZone').onkeydown = e => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    $('#pdfToolFile').click();
  }
};
$('#pdfToolFile').onchange = e => setPdfFile(e.target.files?.[0]);
$('#pdfDropZone').ondragover = e => {
  e.preventDefault();
  $('#pdfDropZone').classList.add('dragging');
};
$('#pdfDropZone').ondragleave = () => $('#pdfDropZone').classList.remove('dragging');
$('#pdfDropZone').ondrop = e => {
  e.preventDefault();
  $('#pdfDropZone').classList.remove('dragging');
  const pdf = [...e.dataTransfer.files].find(file => /\.pdf$/i.test(file.name));
  if (!pdf) return toast('Only PDF files can be dropped here');
  setPdfFile(pdf);
};
$('#pdfToolDrawer').onclick = e => {
  const button = e.target.closest('.pdf-tool');
  if (!button) return;
  if (button.disabled || button.getAttribute('aria-disabled') === 'true') return;
  document.querySelectorAll('.pdf-tool').forEach(b => b.classList.toggle('active', b === button));
  selectPdfTool(button.dataset.pdfTool || button.textContent.trim());
};
function addLinkedNote() {
  const selected = selectedSource();
  setNotesDrawerOpen(true);
  proj().notes.push({ id: 'note-' + Math.random().toString(36).slice(2, 9), text: '', sourceId: selected?.id || '' });
  renderNotes();
  saveNotesNow();
  const fields = document.querySelectorAll('.note-text');
  fields[fields.length - 1]?.focus();
}
$('#addNote').onclick = addLinkedNote;
onKeyboardActivate($('#addNote'), addLinkedNote);
function sourceNotesFor(sourceId) {
  return proj().notes.filter(note => note.sourceId === sourceId && note.text.trim());
}
function renderSelectedSourceNotes(src = selectedSource()) {
  const box = $('#selectedSourceNotes');
  if (!box) return;
  box.innerHTML = '';
  if (!src) return;
  const notes = sourceNotesFor(src.id);
  if (!notes.length) return;
  box.appendChild(el('p', { className: 'field-label', textContent: 'Linked notes' }));
  notes.forEach(note => box.appendChild(el('p', { className: 'linked-note', textContent: note.text })));
}
function openNoteSource(sourceId) {
  const exists = proj().sources.some(src => src.id === sourceId);
  if (!exists) return toast('Linked source not found');
  db.selected = sourceId;
  saveLibrary();
  renderSourceList();
  renderSelected();
  toast('Opened linked source');
}

// ---- manual entry ----
function buildTypeSelect() {
  const sel = $('#typeSel'); sel.innerHTML = '';
  Object.entries(TYPES).forEach(([k, v]) => sel.appendChild(el('option', { value: k, textContent: v.label })));
  sel.onchange = () => buildForm(sel.value);
  buildForm(sel.value);
}
function buildForm(type, data = {}) {
  const wrap = $('#formFields'); wrap.innerHTML = '';
  wrap.dataset.type = type;
  for (const f of TYPES[type].fields) {
    const field = el('div', { className: 'field' });
    field.appendChild(el('label', { textContent: labelFor(f) }));
    if (NAME_FIELDS.has(f)) field.appendChild(authorEditor(f, data[f]));
    else if (DATE_FIELDS.has(f)) field.append(dateInput(f, data[f]));
    else field.appendChild(el('input', { dataset: { field: f }, value: scalar(data[f]) }));
    wrap.appendChild(field);
  }
}
function labelFor(f) {
  return ({ 'container-title': 'Publication / site', 'publisher-place': 'Place', DOI: 'DOI', URL: 'URL', ISBN: 'ISBN', issued: 'Date published', accessed: 'Date accessed', page: 'Pages' })[f] || f;
}
function scalar(v) { return v == null ? '' : String(v); }
function dateInput(f, v) {
  const parts = v?.['date-parts']?.[0] || [];
  const iso = parts.length ? `${parts[0]}-${String(parts[1] || 1).padStart(2, '0')}-${String(parts[2] || 1).padStart(2, '0')}` : '';
  return el('input', { type: 'date', dataset: { field: f, kind: 'date' }, value: iso });
}
function authorEditor(f, arr) {
  const box = el('div', { className: 'authors', dataset: { field: f, kind: 'names' } });
  const add = (a = {}) => {
    const row = el('div', { className: 'arow' });
    row.appendChild(el('input', { placeholder: 'Given / first', className: 'given', value: a.given || '' }));
    row.appendChild(el('input', { placeholder: 'Family / last', className: 'family', value: a.family || a.literal || '' }));
    const rm = el('button', { className: 'small', textContent: '-', type: 'button' });
    rm.onclick = () => { row.remove(); if (!box.querySelector('.arow')) add(); };
    row.appendChild(rm); box.appendChild(row);
  };
  (arr?.length ? arr : [{}]).forEach(add);
  const more = el('button', { className: 'small', textContent: '+ author', type: 'button' });
  more.onclick = () => add();
  box.appendChild(more);
  return box;
}
function collectForm() {
  const type = $('#formFields').dataset.type;
  const out = { type };
  $('#formFields').querySelectorAll('[data-field]').forEach(node => {
    const f = node.dataset.field;
    if (node.dataset.kind === 'names') {
      const names = [...node.querySelectorAll('.arow')].map(r => {
        const given = r.querySelector('.given').value.trim();
        const family = r.querySelector('.family').value.trim();
        if (!given && !family) return null;
        return given ? { given, family } : { literal: family };
      }).filter(Boolean);
      if (names.length) out[f] = names;
    } else if (node.dataset.kind === 'date') {
      if (node.value) { const [y, m, d] = node.value.split('-').map(Number); out[f] = { 'date-parts': [[y, m, d]] }; }
    } else if (node.value.trim()) out[f] = node.value.trim();
  });
  return out;
}
$('#addManual').onclick = () => {
  const data = collectForm();
  if (!data.title) return toast('A title is required');
  const editId = $('#addManual').dataset.edit;
  if (editId) {
    const i = proj().sources.findIndex(s => s.id === editId);
    data.id = editId; proj().sources[i] = data; db.selected = editId;
    $('#addManual').dataset.edit = ''; $('#addManual').textContent = 'Add to library';
  } else addSource(data, true);
  saveLibrary(); $('#manual').open = false; renderAll();
};
function openEdit(src) {
  const type = TYPES[src.type] ? src.type : 'document';
  $('#manual').open = true;
  $('#typeSel').value = type;
  buildForm(type, src);
  $('#addManual').dataset.edit = src.id;
  $('#addManual').textContent = 'Save changes';
  $('#manual').scrollIntoView({ behavior: 'smooth' });
}

// ---- exports ----
function entryNodes() {
  const wrap = document.createElement('div');
  wrap.innerHTML = formatData.bibliography.join('');
  return [...wrap.querySelectorAll('.csl-entry')];
}
function hasEntries() {
  if (proj().sources.length) return true;
  toast('Add at least one source first');
  return false;
}
function entryHtml() {
  return formatData.bibliography.join('');
}
function entryPlainText() {
  return entryNodes().map(e => e.textContent.trim()).join('\n\n');
}
function safeFileName(name) {
  return (name || 'bibliography').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'bibliography';
}
function buildPrintDocument() {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(proj().name)}</title>
    <style>
      body { font-family: Georgia, 'Times New Roman', serif; color: #111; margin: 32px; line-height: 1.5; }
      h1 { font: 600 18px system-ui, sans-serif; margin: 0 0 24px; }
      .csl-entry { margin: 0 0 14px; padding-left: 36px; text-indent: -36px; }
      @media print { body { margin: 24mm; } }
    </style></head><body><h1>${esc(proj().name)}</h1>${entryHtml()}</body></html>`;
}
function rtfEscape(s) {
  return String(s).replace(/[\\{}]/g, '\\$&').replace(/\n/g, '\\par ');
}
function buildRtfDocument() {
  const body = entryPlainText().split(/\n{2,}/).map(p => `\\pard\\li720\\fi-720 ${rtfEscape(p)}\\par`).join('\n');
  return `{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Times New Roman;}}\\fs24\\b ${rtfEscape(proj().name)}\\b0\\par\\par\n${body}}`;
}
$('#copyAll').onclick = async () => {
  if (!hasEntries()) return;
  const html = entryHtml();
  const text = entryPlainText();
  try {
    await navigator.clipboard.write([new ClipboardItem({
      'text/html': new Blob([html], { type: 'text/html' }),
      'text/plain': new Blob([text], { type: 'text/plain' }),
    })]);
    toast('Bibliography copied');
  } catch { await copyText(text, 'Copied as plain text'); }
};
$('#printPdf').onclick = () => {
  if (!hasEntries()) return;
  const frame = el('iframe', { className: 'print-frame' });
  document.body.appendChild(frame);
  frame.onload = () => {
    frame.contentWindow.focus();
    frame.contentWindow.print();
    setTimeout(() => frame.remove(), 1000);
  };
  frame.srcdoc = buildPrintDocument();
};
$('#dlHtml').onclick = () => { if (hasEntries()) download(`${safeFileName(proj().name)}.html`, buildPrintDocument(), 'text/html'); };
$('#dlTxt').onclick = () => { if (hasEntries()) download(`${safeFileName(proj().name)}.txt`, `${proj().name}\n\n${entryPlainText()}`, 'text/plain'); };
$('#dlRtf').onclick = () => { if (hasEntries()) download(`${safeFileName(proj().name)}.rtf`, buildRtfDocument(), 'application/rtf'); };
$('#dlJson').onclick = () => download(`${safeFileName(proj().name)}.json`, JSON.stringify(proj().sources, null, 2), 'application/json');
$('#dlLibrary').onclick = exportLibraryBackup;
$('#dlBibtex').onclick = async () => {
  const txt = await fetch('/api/bibtex', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: proj().sources }) }).then(r => r.text());
  download(`${safeFileName(proj().name)}.bib`, txt, 'application/x-bibtex');
};
function exportLibraryBackup() {
  const stamp = new Date().toISOString().slice(0, 10);
  download(`citelocal-library-${stamp}.json`, JSON.stringify(normalizeLibrary(db), null, 2), 'application/json');
}
async function importLibraryBackup(file) {
  const text = await file.text();
  const next = normalizeLibrary(JSON.parse(text));
  if (!next.projects.length) throw new Error('No bibliography projects found');
  if (!confirm('Replace the current local CiteLocal library with this backup?')) return;
  db = next;
  if (!selectedSource()) db.selected = proj().sources[0]?.id || null;
  await saveLibrary(true);
  renderAll();
  toast(`Restored ${db.projects.length} bibliograph${db.projects.length === 1 ? 'y' : 'ies'}`);
}
$('#importBtn').onclick = () => $('#importFile').click();
$('#importFile').onchange = async e => {
  const file = e.target.files[0]; if (!file) return;
  const text = await file.text();
  try {
    let items;
    if (file.name.endsWith('.json')) items = JSON.parse(text);
    else items = await api('/api/bibtex', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
    items.forEach(it => addSource(it, true));
    saveLibrary(); renderAll(); toast(`Imported ${items.length} source(s)`);
  } catch (err) { toast('Import failed: ' + (err.error || err.message)); }
  e.target.value = '';
};
$('#importLibraryBtn').onclick = () => $('#importLibraryFile').click();
$('#importLibraryFile').onchange = async e => {
  const file = e.target.files[0]; if (!file) return;
  try {
    await importLibraryBackup(file);
  } catch (err) {
    toast('Restore failed: ' + (err.error || err.message));
  }
  e.target.value = '';
};
function download(name, content, type) {
  const a = el('a', { href: URL.createObjectURL(new Blob([content], { type })), download: name });
  a.click(); URL.revokeObjectURL(a.href);
}

// ---- render ----
function renderAll() {
  renderAppHealth();
  renderProjects();
  renderNotes();
  renderBiblio();
  renderToolWorkspace();
}
function restoreToolDrafts() {
  $('#wordCountInput').value = toolState.wordCountText || '';
  renderWordCount();
  if (toolState.pdfFileName && !selectedPdfFile) {
    const size = toolState.pdfFileSize ? ` - ${Math.max(1, Math.round(toolState.pdfFileSize / 1024))} KB` : '';
    $('#pdfToolFileStatus').textContent = `Last selected: ${toolState.pdfFileName}${size}. Choose it again after reload.`;
  }
  if (toolState.pdfToolStatus) $('#pdfToolStatus').textContent = toolState.pdfToolStatus;
}
function esc(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

await loadLibrary();
await loadStorageInfo();
await loadAppHealth();
if (!db.selected) db.selected = proj().sources[0]?.id || null;
activeFolder = proj().folder || 'General';
bindProjectMeta();
renderProjects();
buildTypeSelect();
buildDetailTypeSelect();
restoreToolDrafts();
renderNotes();
renderBiblio();
renderToolWorkspace();
