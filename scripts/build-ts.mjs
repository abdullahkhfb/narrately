/**
 * @fileoverview Bundles the extension into `dist/`.
 *
 * Manifest-declared content scripts and background scripts are CLASSIC
 * scripts, so their bundles must be fully self-contained: no import or
 * export statements, and no import.meta expressions. Each of them is
 * therefore built alone in IIFE format with all dynamic imports inlined.
 *
 * The popup, the inference host page, and the module inference worker run
 * in module-capable extension contexts, so they share one ES-module build.
 *
 * The final pass copies static assets (manifest, icons, models, WASM
 * package, ONNX Runtime binaries) into dist.
 */

import {build} from 'vite';
import {cp, readFile, writeFile} from 'node:fs/promises';
import {manifestFor} from './manifest.mjs';
import {resolve} from 'node:path';

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
      rollupOptions: {
        input: {
          inference_worker: resolve(ROOT, 'src/inference/worker.ts'),
          popup: resolve(ROOT, 'src/popup/index.html'),
          host: resolve(ROOT, 'src/inference/host.html'),
        },
        output: {
          entryFileNames: 'src/[name].js',
          chunkFileNames: 'src/chunks/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash][extname]',
        },
      },
    },
    plugins: [copy_extension_assets()],
  });
}

function copy_extension_assets() {
  return {
    name: 'copy-extension-assets',
    async closeBundle() {
      // dist/ is the Chrome build; package-extension derives the others.
      const base = JSON.parse(await readFile(resolve(ROOT, 'manifest.json'), 'utf8'));
      const {version} = JSON.parse(await readFile(resolve(ROOT, 'package.json'), 'utf8'));
      await writeFile(
        resolve(ROOT, 'dist/manifest.json'),
        JSON.stringify(manifestFor(base, 'chrome', version), null, 2),
      );
      await cp(resolve(ROOT, 'src/icons'), resolve(ROOT, 'dist/src/icons'), {recursive: true});
      await cp(resolve(ROOT, 'models'), resolve(ROOT, 'dist/models'), {recursive: true});
      await cp(resolve(ROOT, 'src/wasm/pkg'), resolve(ROOT, 'dist/src/wasm/pkg'), {
        recursive: true,
      });
    },
  };
}

await buildClassicScript('background', 'src/background/index.ts', true);
await buildClassicScript('content', 'src/content/index.ts', false);
await buildModuleContexts();
console.log('Extension build complete: dist/');
