// One runnable self-check. `node test.js` — exits nonzero if the core logic breaks.
import assert from 'node:assert';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import * as cheerio from 'cheerio';
import { Cite, plugins } from '@citation-js/core';
import '@citation-js/plugin-csl';

process.env.NODE_ENV = 'test';

const { defaultLibrary, extractCSL, nameToCSL, normalizeLibrary, parseDate } = await import('./server.js');

let failed = 0;
const check = (name, fn) => { try { fn(); console.log('  ok  ' + name); } catch (e) { failed++; console.log('FAIL  ' + name + ' — ' + e.message); } };

// --- pure helpers ---
check('nameToCSL splits a full name', () => {
  assert.deepStrictEqual(nameToCSL('Jane Q Doe'), { family: 'Doe', given: 'Jane Q' });
});
check('nameToCSL keeps a single token literal', () => {
  assert.deepStrictEqual(nameToCSL('NASA'), { literal: 'NASA' });
});
check('parseDate reads a year', () => {
  assert.deepStrictEqual(parseDate('2019-04-01'), { 'date-parts': [[2019, 4, 1]] });
});

// --- URL scrape extraction (offline, from fixture HTML) ---
check('extractCSL pulls citation_* meta', () => {
  const html = `<html><head>
    <meta name="citation_title" content="On the Origin of Tests">
    <meta name="citation_author" content="Ada Lovelace">
    <meta name="citation_journal_title" content="Journal of Things">
    <meta name="citation_publication_date" content="2020/06/15">
    </head><body></body></html>`;
  const csl = extractCSL(cheerio.load(html), 'https://example.org/a');
  assert.strictEqual(csl.title, 'On the Origin of Tests');
  assert.strictEqual(csl.type, 'article-journal');
  assert.strictEqual(csl.author[0].family, 'Lovelace');
  assert.strictEqual(csl['container-title'], 'Journal of Things');
});
check('extractCSL falls back to <title> + og:site_name', () => {
  const html = `<html><head><title>Some Blog Post</title>
    <meta property="og:site_name" content="Cool Blog"></head><body></body></html>`;
  const csl = extractCSL(cheerio.load(html), 'https://blog.example.com/x');
  assert.strictEqual(csl.title, 'Some Blog Post');
  assert.strictEqual(csl['container-title'], 'Cool Blog');
  assert.ok(csl.accessed, 'should stamp an accessed date');
});

// --- formatting: a manual book renders non-empty in APA and MLA ---
async function formatWith(styleId, item) {
  const cfg = plugins.config.get('@csl');
  if (!cfg.styles.has(styleId)) {
    const s = JSON.parse(await readFile('styles-index.json', 'utf8')).find(x => x.id === styleId);
    cfg.styles.add(styleId, await readFile('styles/' + s.path, 'utf8'));
  }
  return new Cite([item]).format('bibliography', { format: 'text', template: styleId, lang: 'en-US' }).trim();
}
const book = { id: 'b1', type: 'book', title: 'Clean Enough Code',
  author: [{ family: 'Doe', given: 'Jane' }], publisher: 'No Press',
  issued: { 'date-parts': [[2021]] } };

const apa = await formatWith('apa', book);
const mla = await formatWith('modern-language-association', book);
const styleIds = new Set(JSON.parse(await readFile('styles-index.json', 'utf8')).map(s => s.id));
const htmlSource = await readFile('static/index.html', 'utf8');
const appSource = await readFile('static/app.js', 'utf8');
const cssSource = await readFile('static/theme.css', 'utf8');
const reshapedSlateThemeSource = await readFile('static/vendor/reshaped-slate.theme.css', 'utf8');
const serverSource = await readFile('server.js', 'utf8');
const electronMainSource = await readFile('electron/main.js', 'utf8');
const desktopSmokeSource = await readFile('scripts/desktop-smoke.js', 'utf8');
const releaseDoctorSource = await readFile('scripts/release-doctor.js', 'utf8');
const bootstrapSource = await readFile('scripts/bootstrap.js', 'utf8');
const windowsDesktopLauncher = await readFile('launch-citelocal-desktop.ps1', 'utf8');
const macDesktopLauncher = await readFile('launch-citelocal-desktop.command', 'utf8');
const gitignoreSource = await readFile('.gitignore', 'utf8');
const macIconSource = await readFile('build/icon.svg', 'utf8');
const licenseSource = await readFile('LICENSE', 'utf8');
const packageJson = JSON.parse(await readFile('package.json', 'utf8'));

function appFunction(name) {
  const start = appSource.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `${name} not found`);
  const bodyStart = appSource.indexOf('{', start);
  let depth = 0;
  for (let i = bodyStart; i < appSource.length; i++) {
    if (appSource[i] === '{') depth++;
    if (appSource[i] === '}') depth--;
    if (depth === 0) return vm.runInNewContext(`(${appSource.slice(start, i + 1)})`);
  }
  throw new Error(`${name} body not closed`);
}

check('APA output is non-empty and names the author', () => {
  assert.ok(apa.length > 10, 'APA empty'); assert.ok(/Doe/.test(apa), 'no author in APA');
});
check('MLA output differs from APA (real style switch)', () => {
  assert.ok(mla.length > 10, 'MLA empty'); assert.notStrictEqual(apa, mla);
});
check('quick-pick style ids exist in the bundled CSL index', () => {
  [
    'apa',
    'modern-language-association',
    'chicago-author-date',
    'chicago-notes-bibliography',
    'harvard-cite-them-right',
    'ieee',
    'nlm-citation-sequence',
  ].forEach(id => assert.ok(styleIds.has(id), `${id} missing from styles-index.json`));
});
check('style picker exposes one common-style dropdown in the browser UI', () => {
  assert.match(htmlSource, /id="stylePreset"/);
  assert.match(appSource, /COMMON_STYLES/);
  assert.doesNotMatch(htmlSource, /id="styleInput"/);
  assert.doesNotMatch(htmlSource, /id="styleQuickPicks"/);
});
check('bibliography exposes local document export controls', () => {
  ['printPdf', 'dlTxt', 'dlRtf'].forEach(id => assert.match(htmlSource, new RegExp(`id="${id}"`)));
  ['buildPrintDocument', 'buildRtfDocument', 'entryPlainText'].forEach(name => assert.match(appSource, new RegExp(name)));
});
check('app exposes whole-library backup and restore controls', () => {
  ['dlLibrary', 'importLibraryBtn', 'importLibraryFile'].forEach(id => assert.match(htmlSource, new RegExp(`id="${id}"`)));
  ['exportLibraryBackup', 'importLibraryBackup'].forEach(name => assert.match(appSource, new RegExp(name)));
});
check('desktop app shell is configured for Mac and Windows local runs', () => {
  assert.strictEqual(packageJson.main, 'electron/main.js');
  assert.strictEqual(packageJson.license, 'MIT');
  assert.ok(packageJson.scripts.bootstrap);
  assert.ok(packageJson.scripts.desktop);
  assert.ok(packageJson.scripts['desktop:smoke']);
  assert.ok(packageJson.scripts.doctor);
  assert.ok(packageJson.scripts.verify);
  assert.ok(packageJson.scripts['dist:win']);
  assert.ok(packageJson.scripts['dist:mac']);
  assert.strictEqual(packageJson.build.productName, 'CiteLocal');
  assert.ok(packageJson.build.win.target.includes('nsis'));
  assert.ok(packageJson.build.mac.target.includes('dmg'));
  assert.strictEqual(packageJson.build.mac.icon, 'build/icon.svg');
  assert.match(macIconSource, /viewBox="0 0 1024 1024"/);
  assert.match(electronMainSource, /CITELOCAL_DATA_DIR/);
  assert.match(electronMainSource, /CITELOCAL_SMOKE_TEST/);
  assert.match(desktopSmokeSource, /CITELOCAL_DESKTOP_READY/);
  assert.match(releaseDoctorSource, /Release doctor passed/);
  assert.match(bootstrapSource, /citation-style-language\/styles/);
  assert.match(bootstrapSource, /Bootstrap complete/);
  assert.match(windowsDesktopLauncher, /npm run bootstrap/);
  assert.match(windowsDesktopLauncher, /npm run desktop/);
  assert.match(macDesktopLauncher, /npm run bootstrap/);
  assert.match(macDesktopLauncher, /npm run desktop/);
  assert.match(licenseSource, /MIT License/);
  assert.match(electronMainSource, /BrowserWindow/);
});
check('generated desktop artifacts are ignored from source control', () => {
  assert.match(gitignoreSource, /node_modules\//);
  assert.match(gitignoreSource, /dist\//);
});
check('server exposes local storage folder APIs for desktop library files', () => {
  assert.match(serverSource, /\/api\/storage/);
  assert.match(serverSource, /\/api\/open-data-dir/);
  assert.match(serverSource, /\/api\/clipboard/);
  assert.match(serverSource, /function openFolder/);
  assert.match(serverSource, /function writeClipboard/);
  assert.match(serverSource, /\/api\/health/);
});
check('app shell exposes local library, citation workspace, and notepad regions', () => {
  ['appHealth', 'appShell', 'projectRail', 'toggleRail', 'railSections', 'compactRailSections', 'newFolder', 'folderCreator', 'folderNameInput', 'saveFolder', 'cancelFolder', 'libraryHeader', 'toolTabs', 'toolWorkspace', 'wordCountTool', 'pdfToolsPanel', 'pdfDropZone', 'pdfToolFile', 'pdfToolDrawer', 'togglePdfToolDrawer', 'closePdfToolDrawer', 'pdfToolStatus', 'restoreProj', 'sourceList', 'detailPanel', 'openNotesDrawer', 'notesBackdrop', 'notesDrawer', 'closeNotesDrawer', 'wordCountInput', 'wordCountTotal', 'wordCountClean', 'clearWordCount', 'noteList', 'addNote'].forEach(id => {
    assert.match(htmlSource, new RegExp(`id="${id}"`));
  });
  assert.match(htmlSource, /<body data-rs-theme="slate" data-rs-color-mode="dark"/);
  assert.match(htmlSource, /theme\.css\?v=\d+/);
  assert.match(htmlSource, /vendor\/reshaped-slate\.theme\.css\?v=\d+/);
  assert.doesNotMatch(htmlSource, /theme-workshop/);
  assert.match(reshapedSlateThemeSource, /\[data-rs-theme~=slate\]/);
  assert.match(reshapedSlateThemeSource, /\[data-rs-theme~=slate\]\[data-rs-color-mode=dark\]/);
  assert.match(cssSource, /--rs-color-foreground-neutral/);
  assert.match(reshapedSlateThemeSource, /--rs-color-background-primary:oklch\(0\.5498 0\.192 262\.67\)/);
  assert.match(reshapedSlateThemeSource, /--rs-color-background-positive-faded/);
  assert.match(reshapedSlateThemeSource, /--rs-color-background-warning-faded/);
  assert.match(reshapedSlateThemeSource, /--rs-shadow-raised/);
  assert.match(htmlSource, /class="notes-toggle"/);
  assert.doesNotMatch(htmlSource, /id="openPdfActions"/);
  assert.doesNotMatch(htmlSource, /class="pdf-actions-toggle"/);
  assert.match(htmlSource, /id="newFolder"[^>]+class="icon-action"[\s\S]*<svg viewBox="0 0 24 24"/);
  // Consolidated single-stylesheet design (HANDOFF-DESIGN.md): every color/spacing/radius
  // resolves to a --rs-* token — no parallel token system, no hex/rgba/gradient literals.
  // oklch(from var(--rs-...) ...) is Reshaped's real relative-color syntax
  // (derives from a token, not a literal) — allowed. A hardcoded oklch(<n> <n> <n>)
  // literal, or any hex/rgb/hsl literal, is not.
  assert.doesNotMatch(cssSource, /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/);
  assert.doesNotMatch(cssSource.replace(/oklch\(from var\([^)]+\)[^)]*\)/g, ''), /oklch\(/);
  assert.doesNotMatch(cssSource, /backdrop-filter/);
  // Gradients/glow are real Reshaped visual language (verified against
  // reshaped.so's own production CSS) and used deliberately here — the
  // dot-grid canvas texture, scroll-edge fade masks, and the primary-blue
  // washes/highlights on the rail, brand mark, and active states. The rule
  // is every gradient stop must be token-derived (var(--rs-...) or
  // color-mix(...var(--rs-...)...)), never a raw hex/rgb/hsl literal.
  const gradientLines = cssSource.match(/[^\n]*gradient\([^\n]*/g) || [];
  assert.ok(gradientLines.length > 0, 'expected the dot-grid + fade-mask + glow gradients');
  for (const line of gradientLines) {
    assert.match(line, /var\(--rs-/, `unexpected gradient not built from tokens: ${line}`);
  }
  assert.match(cssSource, /margin-bottom: var\(--rs-unit-x5\)/);
  assert.match(cssSource, /--notes-drawer: clamp\(240px, 20vw, 280px\)/);
  assert.match(htmlSource, /<html[^>]+data-rs-theme="slate"[^>]+data-rs-color-mode="dark"/);
  assert.match(cssSource, /--canvas-fallback: var\(--rs-color-background-neutral\)/);
  assert.match(cssSource, /html \{[\s\S]*?background-color: var\(--canvas-fallback\);/);
  assert.match(appSource, /function onKeyboardActivate/);
  assert.match(appSource, /onKeyboardActivate\(\$\('#openNotesDrawer'\),/);
  assert.match(cssSource, /body\.notes-open \.app-shell \{/);
  assert.match(cssSource, /grid-template-columns: clamp\(204px, 15vw, 240px\) minmax\(360px, 1fr\) clamp\(240px, 21vw, 300px\) var\(--notes-drawer\)/);
  assert.match(cssSource, /grid-template-columns: 68px minmax\(420px, 1fr\) clamp\(240px, 21vw, 300px\) var\(--notes-drawer\)/);
  assert.match(cssSource, /body\.notes-open \.project-rail/);
  assert.match(cssSource, /body\.notes-open \.notes-backdrop/);
  assert.match(cssSource, /body\.notes-open \.notes-drawer/);
  assert.match(cssSource, /body\.notes-open \.pdf-tool-drawer/);
  assert.match(cssSource, /body\.pdf-drawer-expanded \.library-pane/);
  assert.doesNotMatch(cssSource, /pdf-drawer-expanded:not\(\.tool-mode\)/);
  assert.match(cssSource, /\.pdf-tool-drawer/);
  assert.match(cssSource, /\.pdf-tool-drawer\.collapsed/);
  assert.match(cssSource, /\.pdf-drawer-tab/);
  assert.match(cssSource, /\.folder-block/);
  assert.match(cssSource, /\.folder-add/);
  assert.match(cssSource, /\.folder-creator/);
  assert.match(htmlSource, /data-tool="word-count"/);
  assert.match(htmlSource, /data-tool="pdf-tools"/);
  assert.match(htmlSource, /class="word-counter word-counter-page"/);
  assert.match(htmlSource, /class="tool-section-label">Tools/);
  assert.match(appSource, /project-rail-label/);
  assert.match(appSource, /async function copyText/);
  assert.match(appSource, /\/api\/clipboard/);
  assert.match(htmlSource, /Word count/);
  assert.match(htmlSource, /Drop a PDF here/);
  assert.match(htmlSource, /Merge PDFs/);
  assert.match(htmlSource, /OCR PDF/);
  assert.match(htmlSource, /PDF to Word/);
  assert.match(cssSource, /grid-template-columns: clamp\(220px, 16vw, 260px\) minmax\(560px, 1fr\) clamp\(300px, 24vw, 360px\)/);
  assert.match(htmlSource, /id="pdfToolDrawerContent"[^>]+aria-hidden="true"/);
  assert.match(cssSource, /\.export-card \{/);
  assert.match(cssSource, /width: fit-content/);
  assert.match(cssSource, /max-width: 260px/);
  assert.match(cssSource, /align-self: start/);
  assert.match(cssSource, /body\.tool-mode \.library-header\s*\{\s*display: none;/);
  assert.match(cssSource, /\.workspace-head\s*\{[\s\S]*?margin-bottom: var\(--rs-unit-x5\);/);
  assert.match(cssSource, /\.icon-action svg, \.compact-rail-section svg\s*\{/);
  assert.match(cssSource, /\.source-list\s*\{[\s\S]*?grid-template-columns: repeat\(auto-fit, minmax\(min\(100%, 300px\), 1fr\)\);/);
  assert.match(cssSource, /\.source-row\s*\{[\s\S]*?grid-template-columns: minmax\(0, 1fr\);/);
  assert.match(cssSource, /\.source-row b\s*\{[\s\S]*?white-space: normal;[\s\S]*?overflow-wrap: anywhere;/);
  assert.match(cssSource, /\.source-row span\s*\{[\s\S]*?white-space: normal;[\s\S]*?overflow-wrap: anywhere;/);
  assert.match(cssSource, /\.tool-tab\s*\{[\s\S]*?min-height: 56px;/);
  // v4: tool tabs are square 2-up tiles at normal rail width; only the
  // narrow 176px rail breakpoint (1050px viewport) falls back to one column.
  assert.match(cssSource, /\.tool-tabs \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); \}/);
  assert.match(cssSource, /@media \(max-width: 1050px\) \{[\s\S]*?\.tool-tabs \{ grid-template-columns: 1fr; \}/);
  assert.match(cssSource, /body\.pdf-tool-mode \.pdf-tool-drawer\.collapsed\s*\{[\s\S]*?display: grid;/);
  assert.match(appSource, /const TOOL_STATE_KEY = 'citelocal-tool-state';/);
  assert.match(appSource, /function loadToolState\(\)/);
  assert.match(appSource, /function saveToolState\(\)/);
  assert.match(appSource, /function restoreToolDrafts\(\)/);
  assert.match(appSource, /toolState\.wordCountText = text;/);
  assert.match(appSource, /document\.body\.classList\.toggle\('pdf-tool-mode', activeTool === 'pdf-tools'\);/);
  assert.match(appSource, /if \(next && activeTool !== 'pdf-tools'\) return;/);
  assert.doesNotMatch(appSource, /openPdfActions/);
  assert.match(appSource, /\$\('#closePdfTools'\)\.onclick = \(\) => setActiveTool\(''\);/);
  assert.match(htmlSource, /<script type="module" src="app\.js\?v=drawer\d+"><\/script>/);
  ['saveLibrary', 'renderSourceList', 'renderNotes', 'setRailCollapsed', 'setNotesDrawerOpen', 'compactRailSections', 'notesBackdrop', 'renderLibrarySections', 'setRailSection', 'setActiveTool', 'setPdfDrawerExpanded', 'renderToolWorkspace', 'setPdfFile', 'selectPdfTool', 'visibleProjectIndexes', 'libraryFolders', 'ensureFolder', 'renderFolderBlock', 'createFolder', 'createProject', 'loadStorageInfo', 'loadAppHealth', 'renderAppHealth', 'openDataFolder', 'textWithoutParentheses', 'countWords', 'renderWordCount', 'restoreToolDrafts'].forEach(name => assert.match(appSource, new RegExp(name)));
});
check('notes can be added as rows and linked to saved sources', () => {
  assert.match(htmlSource, /id="selectedSourceNotes"/);
  assert.match(htmlSource, /ignoring parentheses/);
  ['noteRow', 'noteText', 'noteSource', 'openNoteSource', 'sourceNotesFor', 'renderSelectedSourceNotes'].forEach(name => {
    assert.match(appSource, new RegExp(name));
  });
  assert.doesNotMatch(htmlSource, /id="notePad"/);
});
check('source detail panel exposes editable metadata fields', () => {
  ['sourceDetailForm', 'detailTitle', 'detailAuthorFamily', 'detailIssued', 'saveSourceDetail'].forEach(id => {
    assert.match(htmlSource, new RegExp(`id="${id}"`));
  });
  ['renderSourceDetail', 'collectSourceDetail', 'saveSourceDetail'].forEach(name => {
    assert.match(appSource, new RegExp(name));
  });
});
check('source list exposes quality review markers for incomplete metadata', () => {
  ['sourceQualityBadge', 'reviewFilter'].forEach(id => assert.match(htmlSource, new RegExp(`id="${id}"`)));
  ['sourceQuality', 'qualityBadge', 'focusSourceReview', 'reviewTargetForMissing', 'showNeedsReviewOnly'].forEach(name => {
    assert.match(appSource, new RegExp(name));
  });
  assert.match(appSource, /role="button"/);
  assert.match(appSource, /tabindex="0"/);
});
check('capture flow exposes selectable review panel before adding sources', () => {
  ['captureReview', 'capturePreviewTitle', 'addCaptureCandidate', 'captureDuplicateNotice', 'openExistingCapture', 'mergeCaptureCandidate'].forEach(id => {
    assert.match(htmlSource, new RegExp(`id="${id}"`));
  });
  ['captureCandidates', 'selectCaptureCandidate', 'renderCaptureReview', 'captureDuplicate', 'mergeMissingSourceFields'].forEach(name => {
    assert.match(appSource, new RegExp(name));
  });
  assert.match(appSource, /findExistingSource/);
});
check('project editor supports assignment and unit naming metadata', () => {
  ['projectNameInput', 'unitCodeInput', 'projectFolderInput', 'projectMetaLine'].forEach(id => {
    assert.match(htmlSource, new RegExp(`id="${id}"`));
  });
  ['projectDisplayName', 'projectStats', 'renderProjectEditor', 'bindProjectMeta', 'moveProjectToTrash', 'restoreProjectFromTrash', 'deleteProjectPermanently'].forEach(name => {
    assert.match(appSource, new RegExp(name));
  });
  assert.match(appSource, /needs review/);
});
check('default local library includes one bibliography project and structured notes list', () => {
  const lib = defaultLibrary();
  assert.strictEqual(lib.active, 0);
  assert.strictEqual(lib.projects.length, 1);
  assert.deepStrictEqual(lib.projects[0].sources, []);
  assert.deepStrictEqual(lib.projects[0].notes, []);
  assert.strictEqual(lib.projects[0].unit, '');
  assert.strictEqual(lib.projects[0].folder, 'General');
  assert.strictEqual(lib.folders[0].name, 'General');
  assert.strictEqual(lib.projects[0].trashedAt, '');
});
check('normalizing an imported library preserves projects, notes, and sources', () => {
  const lib = normalizeLibrary({
    active: 2,
    selected: 's1',
    projects: [{ name: 'Assignment A', unit: 'NURS1004', folder: 'Week 4', trashedAt: '2026-07-08T00:00:00.000Z', notes: 'legacy note', sources: [{ id: 's1', title: 'Test' }] }],
  });
  assert.strictEqual(lib.active, 0);
  assert.strictEqual(lib.selected, 's1');
  assert.strictEqual(lib.projects[0].name, 'Assignment A');
  assert.strictEqual(lib.projects[0].unit, 'NURS1004');
  assert.strictEqual(lib.projects[0].folder, 'Week 4');
  assert.deepStrictEqual(lib.folders.map(f => f.name), ['Week 4', 'General']);
  assert.strictEqual(lib.projects[0].trashedAt, '2026-07-08T00:00:00.000Z');
  assert.strictEqual(lib.projects[0].notes[0].text, 'legacy note');
  assert.strictEqual(lib.projects[0].sources[0].id, 's1');
});
check('normalizeLibrary round-trips folders, trash, notes, and sources', () => {
  const original = {
    folders: [{ id: 'folder-nurs1004', name: 'NURS1004' }, { id: 'folder-nurs1005', name: 'NURS1005' }],
    active: 1,
    selected: 's2',
    projects: [
      { id: 'p1', name: 'Assignment 1', unit: 'NURS1004', folder: 'NURS1004', trashedAt: '', style: 'apa', notes: [{ id: 'n1', text: 'Keep this', sourceId: 's1' }], sources: [{ id: 's1', title: 'One' }] },
      { id: 'p2', name: 'Assignment 2', unit: 'NURS1005', folder: 'NURS1005', trashedAt: '2026-07-08T00:00:00.000Z', style: 'ieee', notes: [{ id: 'n2', text: 'Also keep this', sourceId: 's2' }], sources: [{ id: 's2', title: 'Two' }] },
    ],
  };
  const once = normalizeLibrary(original);
  const twice = normalizeLibrary(JSON.parse(JSON.stringify(once)));
  assert.deepStrictEqual(twice, once);
  assert.deepStrictEqual(twice.folders.map(f => f.name), ['NURS1004', 'NURS1005', 'General']);
  assert.strictEqual(twice.projects[1].trashedAt, original.projects[1].trashedAt);
  assert.strictEqual(twice.projects[1].notes[0].sourceId, 's2');
  assert.strictEqual(twice.projects[1].sources[0].title, 'Two');
});
check('word count can ignore parenthesized citations', () => {
  const textWithoutParentheses = appFunction('textWithoutParentheses');
  const countWords = appFunction('countWords');
  const sample = 'This paragraph has five words (Doe, 2024; Smith, 2023) outside.';
  assert.strictEqual(countWords(sample), 10);
  assert.strictEqual(textWithoutParentheses(sample).replace(/\s+/g, ' ').trim(), 'This paragraph has five words outside.');
  assert.strictEqual(countWords(textWithoutParentheses(sample)), 6);
  assert.strictEqual(countWords(textWithoutParentheses('Nested (ignore this (and this)) keep two')), 3);
});
check('CSL-JSON sources export to non-empty BibTeX', () => {
  const bib = new Cite([{
    id: 'export-book',
    type: 'book',
    title: 'Exportable Book',
    author: [{ family: 'Writer', given: 'Casey' }],
    publisher: 'Local Press',
    issued: { 'date-parts': [[2024]] },
  }]).format('bibtex').trim();
  assert.match(bib, /@book\{/);
  assert.match(bib, /title = \{Exportable \{Book\}\}/);
  assert.ok(bib.length > 40);
});

// --- in-text citations must be computed in-context (numbering + disambiguation) ---
// Guards the /api/format engine path: a lone-item render can't number or disambiguate.
function engineInText(styleId, items) {
  const cfg = plugins.config.get('@csl');
  const eng = cfg.engine(items, styleId, 'en-US', 'text');
  eng.updateItems(items.map(i => i.id));
  return items.map(i => eng.makeCitationCluster([{ id: i.id }]));
}
const sameYear = [
  { id: 'a', type: 'article-journal', title: 'First', author: [{ family: 'Smith', given: 'J' }], issued: { 'date-parts': [[2013]] } },
  { id: 'b', type: 'article-journal', title: 'Second', author: [{ family: 'Smith', given: 'J' }], issued: { 'date-parts': [[2013]] } },
];
check('APA disambiguates same author+year in-text (2013a / 2013b)', () => {
  assert.deepStrictEqual(engineInText('apa', sameYear), ['(Smith, 2013a)', '(Smith, 2013b)']);
});
await formatWith('ieee', book); // ensure ieee registered
check('IEEE numbers in-text distinctly ([1] / [2]), not [1] / [1]', () => {
  const out = engineInText('ieee', sameYear);
  assert.deepStrictEqual(out, ['[1]', '[2]']);
});

console.log(`\n${failed ? failed + ' FAILED' : 'all checks passed'}`);
process.exit(failed ? 1 : 0);
