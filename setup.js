// Builds styles-index.json from the cloned CSL styles repo.
// Run once after `git clone` of styles/. Re-run to refresh.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const STYLES_DIR = 'styles';
// ponytail: title/id via regex on the <title> tag, not a full XML parse — 10k files, we only need two strings each
const titleRe = /<title[^>]*>([^<]+)<\/title>/;

async function indexDir(dir, prefix = '') {
  const out = [];
  const entries = await readdir(join(STYLES_DIR, dir), { withFileTypes: true });
  for (const e of entries) {
    if (e.isDirectory()) {
      // only recurse into dependent/ (the one real subdir of styles); ignore .git etc.
      if (!dir && e.name === 'dependent') out.push(...await indexDir('dependent', 'dependent/'));
      continue;
    }
    if (!e.name.endsWith('.csl')) continue;
    const id = e.name.slice(0, -4);
    try {
      const xml = await readFile(join(STYLES_DIR, dir, e.name), 'utf8');
      const m = xml.match(titleRe);
      out.push({ id, path: prefix + e.name, title: m ? m[1].trim() : id });
    } catch { /* skip unreadable */ }
  }
  return out;
}

const index = await indexDir('');
index.sort((a, b) => a.title.localeCompare(b.title));
await writeFile('styles-index.json', JSON.stringify(index));
console.log(`Indexed ${index.length} styles -> styles-index.json`);
