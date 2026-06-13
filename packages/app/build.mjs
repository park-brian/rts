// Minimal in-house build: one esbuild call. `node build.mjs` bundles to dist/;
// `node build.mjs serve` watches + serves. No framework, no config files.
import * as esbuild from 'esbuild';
import { cpSync, mkdirSync } from 'node:fs';

const serve = process.argv.includes('serve');
mkdirSync('dist', { recursive: true });
cpSync('index.html', 'dist/index.html');
cpSync('coi-serviceworker.js', 'dist/coi-serviceworker.js');

/** @type {import('esbuild').BuildOptions} */
const opts = {
  entryPoints: ['src/main.tsx'],
  bundle: true,
  format: 'esm',
  outfile: 'dist/bundle.js',
  jsx: 'automatic',
  jsxImportSource: 'preact',
  loader: { '.ts': 'ts', '.tsx': 'tsx' },
  target: 'es2022',
  sourcemap: true,
  minify: !serve,
  logLevel: 'info',
};

if (serve) {
  const ctx = await esbuild.context(opts);
  await ctx.watch();
  const { host, port } = await ctx.serve({ servedir: 'dist', host: '127.0.0.1', port: 5173 });
  console.log(`serving http://${host}:${port}`);
} else {
  await esbuild.build(opts);
  console.log('built -> dist/');
}
