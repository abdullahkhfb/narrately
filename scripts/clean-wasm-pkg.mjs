/**
 * @fileoverview Removes the `.gitignore` that wasm-pack writes into its output
 * folder. It contains `*`, which would override the exceptions in the root
 * `.gitignore` (the repository keeps exactly one `.gitignore`).
 */

import {rm} from 'node:fs/promises';
import {resolve} from 'node:path';

await rm(resolve(import.meta.dirname, '../src/wasm/pkg/.gitignore'), {force: true});
