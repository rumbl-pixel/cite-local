import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const electronBin = require('electron');
const marker = 'CITELOCAL_DESKTOP_READY';
const timeoutMs = 30000;

let output = '';
const child = spawn(electronBin, ['.'], {
  cwd: process.cwd(),
  env: { ...process.env, CITELOCAL_SMOKE_TEST: '1' },
});

const timer = setTimeout(() => {
  child.kill('SIGTERM');
  console.error(`Desktop smoke test timed out after ${timeoutMs}ms`);
  console.error(output);
  process.exit(1);
}, timeoutMs);

child.stdout.on('data', chunk => {
  output += chunk.toString();
  process.stdout.write(chunk);
});

child.stderr.on('data', chunk => {
  output += chunk.toString();
  process.stderr.write(chunk);
});

child.on('exit', code => {
  clearTimeout(timer);
  if (!output.includes(marker)) {
    console.error('Desktop smoke test did not reach the ready marker.');
    process.exit(1);
  }
  if (code && code !== 0) {
    console.error(`Desktop smoke test exited with code ${code}.`);
    process.exit(code);
  }
  console.log('Desktop smoke test passed.');
});
