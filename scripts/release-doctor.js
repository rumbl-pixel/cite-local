import { access, readFile, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { platform } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const checks = [];

async function exists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function check(name, fn) {
  try {
    const detail = await fn();
    checks.push({ name, ok: true, detail });
  } catch (e) {
    checks.push({ name, ok: false, detail: e.message });
  }
}

await check('Node runtime', () => process.version);
await check('Electron runtime', () => require('electron'));
await check('Electron Builder installed', () => require.resolve('electron-builder'));
await check('CSL styles index', async () => {
  const data = JSON.parse(await readFile('styles-index.json', 'utf8'));
  if (!Array.isArray(data) || data.length < 1000) throw new Error('styles-index.json is missing or too small');
  return `${data.length} styles indexed`;
});
await check('Bundled APA style', async () => {
  if (!await exists(join('styles', 'apa.csl'))) throw new Error('styles/apa.csl missing');
  return 'styles/apa.csl found';
});
await check('Windows icon', async () => {
  const info = await stat('citelocal.ico');
  if (info.size < 4000) throw new Error('citelocal.ico looks too small for packaging');
  return `${info.size} bytes`;
});
await check('macOS icon source', async () => {
  const svg = await readFile(join('build', 'icon.svg'), 'utf8');
  if (!svg.includes('viewBox="0 0 1024 1024"')) throw new Error('build/icon.svg must be a 1024 viewBox source');
  return 'build/icon.svg ready';
});
await check('Package scripts', async () => {
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));
  ['bootstrap', 'desktop', 'desktop:smoke', 'pack', 'dist:win', 'dist:mac', 'test', 'verify'].forEach(script => {
    if (!pkg.scripts?.[script]) throw new Error(`missing npm script: ${script}`);
  });
  return 'desktop/test/build scripts present';
});
await check('Desktop launchers', async () => {
  const ps1 = await readFile('launch-citelocal-desktop.ps1', 'utf8');
  const mac = await readFile('launch-citelocal-desktop.command', 'utf8');
  if (!ps1.includes('npm run bootstrap') || !ps1.includes('npm run desktop')) {
    throw new Error('Windows launcher must bootstrap and run desktop mode');
  }
  if (!mac.includes('npm run bootstrap') || !mac.includes('npm run desktop')) {
    throw new Error('macOS launcher must bootstrap and run desktop mode');
  }
  return 'Windows and macOS launch helpers present';
});

const failed = checks.filter(c => !c.ok);
checks.forEach(c => {
  console.log(`${c.ok ? 'ok  ' : 'FAIL'} ${c.name}: ${c.detail}`);
});
console.log(`\nPlatform: ${platform()}`);
if (platform() === 'win32') console.log('Windows build command: npm run dist:win');
else if (platform() === 'darwin') console.log('macOS build command: npm run dist:mac');
else console.log('Use npm run desktop for local Linux smoke testing; packaged Linux target is not configured yet.');

if (failed.length) {
  console.error(`\n${failed.length} release doctor check(s) failed.`);
  process.exit(1);
}
console.log('\nRelease doctor passed.');
