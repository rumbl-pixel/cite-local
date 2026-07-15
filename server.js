// Study Toolbelt server: static UI + API. No accounts, no limits, no keys.
import express from 'express';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, dirname, win32, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import * as cheerio from 'cheerio';
import { Cite, plugins } from '@citation-js/core';
import '@citation-js/plugin-csl';
import '@citation-js/plugin-doi';
import '@citation-js/plugin-bibtex';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 4747;

// One canonical library location per machine, regardless of how CiteLocal is
// launched (browser dev server, `electron .`, the portable exe, or an
// installed app). This mirrors Electron's own app.getPath('userData')
// convention exactly (same OS paths, same app-name folder: "cite-local", the
// package.json name) so the browser and every Electron entry point always
// converge on the identical file — no more silently forked, diverging
// libraries depending on which way the app happened to be opened.
// ponytail: hand-rolled instead of an env-paths dependency — only 3 branches, ever.
// Uses path.win32/path.posix explicitly (not the host-bound `join`) so this is a true
// pure function of its platform argument — testable for all three OSes from any host.
function computeDefaultDataDir(platform, env, home) {
  const appName = 'cite-local';
  const p = platform === 'win32' ? win32 : posix;
  if (platform === 'win32') return p.join(env.APPDATA || p.join(home, 'AppData', 'Roaming'), appName, 'data');
  if (platform === 'darwin') return p.join(home, 'Library', 'Application Support', appName, 'data');
  return p.join(env.XDG_CONFIG_HOME || p.join(home, '.config'), appName, 'data');
}
function defaultDataDir() {
  return computeDefaultDataDir(process.platform, process.env, homedir());
}

const DATA_DIR = process.env.CITELOCAL_DATA_DIR || defaultDataDir();
const LIBRARY_FILE = join(DATA_DIR, 'citelocal-library.json');

const index = JSON.parse(await readFile(join(__dirname, 'styles-index.json'), 'utf8'));
const byId = new Map(index.map(s => [s.id, s]));

function defaultLibrary() {
  return {
    folders: [{ id: 'folder-general', name: 'General' }],
    projects: [{ id: 'project-1', name: 'My bibliography', unit: '', folder: 'General', trashedAt: '', style: 'apa', notes: [], sources: [] }],
    active: 0,
    selected: null,
  };
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
    ...projects.filter(p => !p.trashedAt).map(p => p.folder || 'General'),
    'General',
  ].map(name => String(name || '').trim()).filter(Boolean);
  const seenFolders = new Set();
  const uniqueFolderNames = folderNames.filter(name => {
    const key = name.toLowerCase();
    if (seenFolders.has(key)) return false;
    seenFolders.add(key);
    return true;
  });
  const folders = uniqueFolderNames.map((name, i) => ({
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

async function readLibrary() {
  try {
    return normalizeLibrary(JSON.parse(await readFile(LIBRARY_FILE, 'utf8')));
  } catch {
    return defaultLibrary();
  }
}

async function writeLibrary(data) {
  const normalized = normalizeLibrary(data);
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(LIBRARY_FILE, JSON.stringify(normalized, null, 2));
  return normalized;
}

// Register a CSL style with citeproc on demand; cache which ids are loaded.
const cslConfig = plugins.config.get('@csl');
async function ensureStyle(id) {
  if (cslConfig.styles.has(id)) return true; // built-ins (apa, vancouver…) + already-loaded
  const s = byId.get(id);
  if (!s) return false;
  const xml = await readFile(join(__dirname, 'styles', s.path), 'utf8');
  cslConfig.styles.add(id, xml);
  return true;
}

const app = express();
app.use(express.json({ limit: '4mb' }));
app.use(express.static(join(__dirname, 'static')));

app.get('/api/library', async (_req, res) => {
  res.json(await readLibrary());
});

app.put('/api/library', async (req, res) => {
  try {
    res.json(await writeLibrary(req.body));
  } catch (e) {
    res.status(400).json({ error: 'library save failed: ' + e.message });
  }
});

app.get('/api/storage', (_req, res) => {
  res.json({ dataDir: DATA_DIR, libraryFile: LIBRARY_FILE });
});

app.get('/api/health', async (_req, res) => {
  const apaStylePath = join(__dirname, 'styles', 'apa.csl');
  const apaStyleReady = await pathExists(apaStylePath);
  res.json({
    ok: Boolean(index.length && apaStyleReady),
    styleCount: index.length,
    apaStyleReady,
    dataDir: DATA_DIR,
    libraryFile: LIBRARY_FILE,
    setupHint: apaStyleReady ? '' : 'Run npm run setup after cloning the CSL styles repository.',
  });
});

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

app.post('/api/open-data-dir', async (_req, res) => {
  try {
    await mkdir(DATA_DIR, { recursive: true });
    openFolder(DATA_DIR);
    res.json({ ok: true, dataDir: DATA_DIR });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/clipboard', async (req, res) => {
  const text = String(req.body?.text || '');
  if (!text) return res.status(400).json({ error: 'text required' });
  try {
    await writeClipboard(text);
    res.json({ ok: true });
  } catch (e) {
    res.status(501).json({ error: 'local clipboard unavailable: ' + e.message });
  }
});

function openFolder(path) {
  const platform = process.platform;
  if (platform === 'win32') spawn('explorer.exe', [path], { detached: true, stdio: 'ignore' }).unref();
  else if (platform === 'darwin') spawn('open', [path], { detached: true, stdio: 'ignore' }).unref();
  else spawn('xdg-open', [path], { detached: true, stdio: 'ignore' }).unref();
}

async function writeClipboard(text) {
  const commands = process.platform === 'win32'
    ? [['powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Set-Clipboard -Value ([Console]::In.ReadToEnd())']]]
    : process.platform === 'darwin'
      ? [['pbcopy', []]]
      : [['wl-copy', []], ['xclip', ['-selection', 'clipboard']], ['xsel', ['--clipboard', '--input']]];
  let lastError;
  for (const [command, args] of commands) {
    try {
      await runClipboardCommand(command, args, text);
      return;
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError || new Error('no clipboard command available');
}

function runClipboardCommand(command, args, text) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['pipe', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', code => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `${command} exited with ${code}`));
    });
    child.stdin.end(text);
  });
}

// Style search
app.get('/api/styles', (req, res) => {
  const q = (req.query.q || '').toLowerCase().trim();
  if (!q) return res.json(index.slice(0, 50));
  const hits = [];
  for (const s of index) {
    if (s.title.toLowerCase().includes(q) || s.id.includes(q)) hits.push(s);
    if (hits.length >= 50) break;
  }
  res.json(hits);
});

function normalizeDoi(value) {
  return String(value || '')
    .trim()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    .replace(/^[\s(<[]+|[\s)>.,;:!?/]+$/g, '');
}

async function enrichMissingDoiAuthors(items, doi) {
  const list = Array.isArray(items) ? items : [items];
  if (!list.some(item => !Array.isArray(item.author) || !item.author.length)) return list;
  try {
    const r = await fetch(`https://doi.org/${encodeURI(doi)}`, {
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (Study Toolbelt metadata fetch)' },
    });
    const contentType = r.headers.get('content-type') || '';
    if (!r.ok || !contentType.includes('html')) return list;
    const $ = cheerio.load(await r.text());
    const authors = $('meta[name="citation_author"]').map((_, node) => $(node).attr('content')).get().filter(Boolean);
    if (!authors.length) return list;
    list.forEach(item => {
      if (!Array.isArray(item.author) || !item.author.length) item.author = authors.map(nameToCSL);
      if (!item.URL) item.URL = r.url;
    });
  } catch { /* DOI metadata is still usable without this enrichment. */ }
  return list;
}

// Format: per-entry reference list + per-item in-text, both aligned to items order.
// Uses citeproc's engine so numbering (IEEE/Vancouver) and disambiguation (2013a/2013b)
// are computed with the whole set in context — a lone-item render can't do either.
app.post('/api/format', async (req, res) => {
  const { items, style = 'apa', lang = 'en-US' } = req.body || {};
  if (!Array.isArray(items)) return res.status(400).json({ error: 'items[] required' });
  if (!items.length) return res.json({ bibliography: [], citations: [] });
  if (!(await ensureStyle(style))) return res.status(404).json({ error: 'unknown style' });
  try {
    const ids = items.map(it => it.id);
    const engine = cslConfig.engine(items, style, lang, 'html');
    engine.updateItems(ids);
    // bibliography entries come back in the style's sort order → remap to items order
    const byId = {};
    const [meta, entries] = engine.makeBibliography();
    (meta.entry_ids || []).forEach((eid, k) => { byId[Array.isArray(eid) ? eid[0] : eid] = entries[k]; });
    const bibliography = ids.map(id => (byId[id] || '').trim());
    const citations = ids.map(id => engine.makeCitationCluster([{ id }]));
    res.json({ bibliography, citations });
  } catch (e) {
    res.status(500).json({ error: 'format failed: ' + e.message });
  }
});

// DOI or ISBN lookup -> CSL-JSON
app.get('/api/lookup', async (req, res) => {
  const { doi, isbn } = req.query;
  try {
    if (doi) {
      const cleanDoi = normalizeDoi(doi);
      const cite = await Cite.async(cleanDoi);
      return res.json(await enrichMissingDoiAuthors(cite.data, cleanDoi));
    }
    if (isbn) {
      const clean = String(isbn).replace(/[^0-9Xx]/g, '');
      // ponytail: OpenLibrary direct — dropped @citation-js/plugin-isbn (pinned to old core)
      const r = await fetch(`https://openlibrary.org/isbn/${clean}.json`);
      if (!r.ok) return res.status(404).json({ error: 'isbn not found' });
      const b = await r.json();
      const authors = [];
      for (const a of b.authors || []) {
        try {
          const ar = await fetch(`https://openlibrary.org${a.key}.json`);
          if (ar.ok) authors.push(nameToCSL((await ar.json()).name));
        } catch { /* skip */ }
      }
      return res.json([clean_({
        id: 'isbn-' + clean,
        type: 'book',
        title: b.title,
        author: authors.length ? authors : undefined,
        publisher: (b.publishers || [])[0],
        'publisher-place': (b.publish_places || [])[0],
        ISBN: clean,
        issued: parseDate(b.publish_date),
      })]);
    }
    res.status(400).json({ error: 'doi or isbn required' });
  } catch (e) {
    res.status(502).json({ error: 'lookup failed: ' + e.message });
  }
});

// Title/author search via CrossRef (free, no key)
app.get('/api/search', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json([]);
  try {
    const url = `https://api.crossref.org/works?rows=10&mailto=citelocal@localhost&query.bibliographic=${encodeURIComponent(q)}`;
    const r = await fetch(url, { headers: { 'User-Agent': 'StudyToolbelt/1.0 (mailto:citelocal@localhost)' } });
    const j = await r.json();
    const items = (j.message?.items || []).map(crossrefToCSL);
    res.json(items);
  } catch (e) {
    res.status(502).json({ error: 'search failed: ' + e.message });
  }
});

// BibTeX import (text -> CSL-JSON) and export (CSL-JSON -> bibtex string)
app.post('/api/bibtex', async (req, res) => {
  const { text, items } = req.body || {};
  try {
    if (text) return res.json(new Cite(text).data);
    if (items) return res.type('text/plain').send(new Cite(items).format('bibtex'));
    res.status(400).json({ error: 'text or items required' });
  } catch (e) {
    res.status(400).json({ error: 'bibtex failed: ' + e.message });
  }
});

// URL auto-cite: fetch page, extract metadata, return CSL-JSON
app.get('/api/scrape', async (req, res) => {
  const url = req.query.url;
  if (!url || !/^https?:\/\//i.test(url)) return res.status(400).json({ error: 'bad url' });
  try {
    const r = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (Study Toolbelt metadata fetch)' },
    });
    // A direct PDF/binary link decoded as text and parsed as HTML finds no
    // real metadata anywhere, so extractCSL falls all the way through to
    // "title: the raw URL" — a low-quality result that looks like it worked.
    // Fail clearly instead so the user tries the DOI or manual entry.
    const contentType = r.headers.get('content-type') || '';
    if (!contentType.includes('html')) {
      return res.status(415).json({ error: `that link isn't a web page (content-type: ${contentType.split(';')[0] || 'unknown'}) — try the DOI, or add it manually` });
    }
    const html = await r.text();
    res.json(extractCSL(cheerio.load(html), url));
  } catch (e) {
    res.status(502).json({ error: 'fetch failed: ' + e.message });
  }
});

function crossrefToCSL(it) {
  return clean_({
    id: it.DOI || 'cr-' + Math.random().toString(36).slice(2, 9),
    type: it.type === 'journal-article' ? 'article-journal' : (it.type || 'article-journal'),
    title: Array.isArray(it.title) ? it.title[0] : it.title,
    author: it.author?.map(a => clean_({ family: a.family, given: a.given, literal: a.name })),
    'container-title': (it['container-title'] || [])[0],
    volume: it.volume,
    issue: it.issue,
    page: it.page,
    publisher: it.publisher,
    DOI: it.DOI,
    issued: it.issued?.['date-parts'] ? { 'date-parts': it.issued['date-parts'] } : undefined,
  });
}

// --- metadata extraction, priority: citation_* > JSON-LD > OpenGraph > <title> ---
function extractCSL($, url) {
  const meta = n => $(`meta[name="${n}"]`).attr('content') || $(`meta[property="${n}"]`).attr('content');
  const host = new URL(url).hostname.replace(/^www\./, '');
  const now = new Date();
  const accessed = { 'date-parts': [[now.getFullYear(), now.getMonth() + 1, now.getDate()]] };

  const cTitle = meta('citation_title');
  if (cTitle) {
    const authors = $('meta[name="citation_author"]').map((_, el) => nameToCSL($(el).attr('content'))).get();
    return clean_({
      type: meta('citation_journal_title') ? 'article-journal' : 'webpage',
      title: cTitle,
      author: authors.length ? authors : undefined,
      'container-title': meta('citation_journal_title'),
      volume: meta('citation_volume'),
      issue: meta('citation_issue'),
      page: meta('citation_firstpage'),
      DOI: meta('citation_doi'),
      issued: parseDate(meta('citation_publication_date') || meta('citation_date')),
      URL: url,
      accessed,
    });
  }

  let ld;
  $('script[type="application/ld+json"]').each((_, el) => {
    if (ld) return;
    try {
      let j = JSON.parse($(el).contents().text());
      if (Array.isArray(j)) j = j.find(x => x['@type']) || j[0];
      if (j && j['@graph']) j = j['@graph'].find(x => x.headline || x.name) || j;
      if (j && (j.headline || j.name)) ld = j;
    } catch { /* skip */ }
  });
  if (ld) {
    const a = ld.author;
    const authors = (Array.isArray(a) ? a : a ? [a] : [])
      .map(x => (typeof x === 'string' ? nameToCSL(x) : x?.name ? nameToCSL(x.name) : null))
      .filter(Boolean);
    return clean_({
      type: 'webpage',
      title: ld.headline || ld.name,
      author: authors.length ? authors : undefined,
      'container-title': ld.publisher?.name || host,
      issued: parseDate(ld.datePublished),
      URL: url,
      accessed,
    });
  }

  const ogAuthor = meta('article:author') || meta('author');
  return clean_({
    type: 'webpage',
    title: meta('og:title') || $('title').text().trim() || url,
    author: ogAuthor && !/^https?:/.test(ogAuthor) ? [nameToCSL(ogAuthor)] : undefined,
    'container-title': meta('og:site_name') || host,
    issued: parseDate(meta('article:published_time')),
    URL: url,
    accessed,
  });
}

function nameToCSL(name) {
  if (!name) return null;
  name = String(name).trim();
  const parts = name.split(/\s+/);
  if (parts.length === 1) return { literal: name };
  return { family: parts.pop(), given: parts.join(' ') };
}

function parseDate(s) {
  if (!s) return undefined;
  const m = String(s).match(/(\d{4})(?:[-/](\d{1,2}))?(?:[-/](\d{1,2}))?/);
  if (!m) return undefined;
  const parts = [Number(m[1])];
  if (m[2]) parts.push(Number(m[2]));
  if (m[3]) parts.push(Number(m[3]));
  return { 'date-parts': [parts] };
}

// drop undefined/empty keys, ensure an id
function clean_(o) {
  for (const k of Object.keys(o)) {
    const v = o[k];
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) delete o[k];
  }
  if (!o.id) o.id = 'src-' + Math.random().toString(36).slice(2, 9);
  return o;
}

function startServer(port = PORT) {
  return new Promise(resolve => {
    const server = app.listen(port, () => resolve(server));
  });
}

if (process.env.NODE_ENV !== 'test' && process.env.CITELOCAL_NO_AUTO_START !== '1') {
  const server = await startServer(PORT);
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : PORT;
  console.log(`Study Toolbelt running: http://localhost:${port}`);
}

export { app, defaultLibrary, extractCSL, nameToCSL, normalizeDoi, normalizeLibrary, parseDate, readLibrary, writeLibrary, crossrefToCSL, clean_, startServer, DATA_DIR, LIBRARY_FILE, computeDefaultDataDir };
