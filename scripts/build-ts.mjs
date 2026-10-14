/**
 * @fileoverview Bundles the extension into `dist/`.
 */

import {cp, readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {build} from 'vite';
import {manifestFor} from './manifest.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const OUT_DIR = 'dist';

/** Bundles one classic-script entry as a single self-contained IIFE file. */
async function buildClassicScript(name, entry, isFirstPass) {
  await build({
    configFile: false,
    root: ROOT,
    logLevel: 'info',
    build: {
      outDir: OUT_DIR,
      emptyOutDir: isFirstPass,
      sourcemap: true,
      rollupOptions: {
        input: resolve(ROOT, entry),
        output: {
          format: 'iife',
          inlineDynamicImports: true,
          entryFileNames: `src/${name}.js`,
          assetFileNames: 'assets/[name]-[hash][extname]',
        },
      },
    },
  });
}

/** Bundles every module-context entry in one code-splitting build. */
async function buildModuleContexts() {
  await build({
    configFile: false,
    root: ROOT,
    logLevel: 'info',
    build: {
      outDir: OUT_DIR,
      emptyOutDir: false,
      sourcemap: true,
      chunkSizeWarningLimit: 5000,
      rollupOptions: {
        input: {
          inference_worker: resolve(ROOT, 'src/inference/worker.ts'),
          popup: resolve(ROOT, 'src/popup/index.html'),
          debug: resolve(ROOT, 'src/popup/debug.html'),
          host: resolve(ROOT, 'src/inference/host.html'),
        },
        output: {
          entryFileNames: 'src/[name].js',
          chunkFileNames: 'src/chunks/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash][extname]',
        },
      },
    },
    plugins: [copyExtensionAssets()],
  });
}

function copyExtensionAssets() {
  return {
    name: 'copy-extension-assets',
    async closeBundle() {
      const base = JSON.parse(await readFile(resolve(ROOT, 'manifest.json'), 'utf8'));
      const {version} = JSON.parse(await readFile(resolve(ROOT, 'package.json'), 'utf8'));
      await writeFile(
        resolve(ROOT, 'dist/manifest.json'),
        JSON.stringify(manifestFor(base, 'chrome', version), null, 2),
      );
      await cp(
        resolve(ROOT, 'src/icons/toolbar'),
        resolve(ROOT, 'dist/src/icons/toolbar'),
        {recursive: true},
      );
      await cp(resolve(ROOT, 'models'), resolve(ROOT, 'dist/models'), {
        recursive: true,
      });
      await cp(
        resolve(ROOT, 'src/wasm/pkg'),
        resolve(ROOT, 'dist/src/wasm/pkg'),
        {recursive: true},
      );
    },
  };
}

await buildClassicScript('background', 'src/background/index.ts', true);
await buildClassicScript('content', 'src/content/index.ts', false);
await buildModuleContexts();
console.log('Extension build complete: dist/');
