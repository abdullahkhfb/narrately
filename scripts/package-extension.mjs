import {cp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {manifestFor} from './manifest.mjs';

const target = process.argv.includes('--browser=firefox') ? 'firefox' : 'chrome';
const source = resolve('dist');
const destination = resolve(`release/${target}`);

await rm(destination, {recursive: true, force: true});
await mkdir(dirname(destination), {recursive: true});
await cp(source, destination, {recursive: true});

const base = JSON.parse(await readFile(resolve('manifest.json'), 'utf8'));
const {version} = JSON.parse(await readFile(resolve('package.json'), 'utf8'));
await writeFile(
  resolve(destination, 'manifest.json'),
  JSON.stringify(manifestFor(base, target, version), null, 2),
);
console.log(`Prepared ${destination}`);
