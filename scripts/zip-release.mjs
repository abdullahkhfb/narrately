/**
 * @fileoverview Zips release/<browser> into release/narrately-<version>-<browser>.zip
 * (source maps excluded) using the system `zip` tool.
 */

import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

const {version} = JSON.parse(readFileSync('package.json', 'utf8'));
for (const target of ['chrome', 'firefox']) {
  const out = resolve(`release/narrately-${version}-${target}.zip`);
  execFileSync('zip', ['-qr', out, '.', '-x', '*.map'], {
    cwd: resolve(`release/${target}`),
    stdio: 'inherit',
  });
  console.log(`Created ${out}`);
}
