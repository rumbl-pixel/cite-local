import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { spawn } from 'node:child_process';

const stylesRepo = 'https://github.com/citation-style-language/styles.git';

async function exists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', ...options });
    child.on('exit', code => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} exited with ${code}`));
    });
    child.on('error', reject);
  });
}

async function commandWorks(command, args) {
  try {
    await run(command, args, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

if (!await exists('styles/apa.csl')) {
  if (await exists('styles')) {
    throw new Error('styles/ exists but styles/apa.csl is missing. Delete or fix styles/, then rerun npm run bootstrap.');
  }
  if (!await commandWorks('git', ['--version'])) {
    throw new Error(`Git is required to fetch CSL styles automatically. Install Git, then rerun npm run bootstrap, or manually clone ${stylesRepo} into ./styles.`);
  }
  console.log(`Cloning CSL styles into ./styles ...`);
  await run('git', ['clone', '--depth', '1', stylesRepo, 'styles']);
} else {
  console.log('CSL styles already present.');
}

console.log('Building styles-index.json ...');
await run(process.execPath, ['setup.js']);
console.log('Bootstrap complete. Run npm run verify next.');
