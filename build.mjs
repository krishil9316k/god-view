// Bundles src/ into public/app.js and copies the page. Vercel runs this on every deploy.
import { build } from 'esbuild';
import { mkdirSync, copyFileSync } from 'node:fs';

mkdirSync('public', { recursive: true });
copyFileSync('index.html', 'public/index.html');
await build({
  entryPoints: ['src/main.js'],
  bundle: true,
  minify: true,
  format: 'esm',
  target: 'es2020',
  outfile: 'public/app.js',
  legalComments: 'linked',
  logLevel: 'info',
});
