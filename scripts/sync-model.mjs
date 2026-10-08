import { createHash } from 'node:crypto';
import { access, copyFile, mkdir, writeFile } from 'node:fs/promises';

const repo = 'https://huggingface.co/onnx-community/Kokoro-82M-ONNX/resolve/f46687f7e41512228ae953af24a11b2640ea0f22';
const root = 'models/onnx-community/Kokoro-82M-ONNX';
const voice_ids = [
  'af_heart',
  'af_bella',
  'af_nicole',
  'af_sarah',
  'af_sky',
  'am_adam',
  'am_michael',
  'bf_emma',
  'bf_isabella',
  'bm_george',
  'bm_lewis'
];
const model_files = [
  ['config.json', `${repo}/config.json`],
  ['tokenizer.json', `${repo}/tokenizer.json`],
  ['tokenizer_config.json', `${repo}/tokenizer_config.json`],
  [
    'onnx/model_quantized.onnx',
    `${repo}/onnx/model_quantized.onnx`,
    '0d55b15d4b735d61a21b0105136bc81b8768c4db94753193c19354fa863cd556'
  ]
];

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function sync_model_file([relative, url, expected]) {
  const target = `${root}/${relative}`;
  if (await exists(target)) {
    console.log(`kept ${relative}`);
    return;
  }

  await mkdir(target.slice(0, target.lastIndexOf('/')), { recursive: true });
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());

  if (expected) {
    const actual = createHash('sha256').update(bytes).digest('hex');
    if (actual !== expected) {
      throw new Error(`Checksum mismatch for ${relative}: ${actual}`);
    }
  }

  await writeFile(target, bytes);
  console.log(`downloaded ${relative}`);
}

await mkdir(`${root}/voices`, { recursive: true });

// --voices-only: bundle just the voices; users download the model in the UI.
if (!process.argv.includes('--voices-only')) {
  for (const file of model_files) {
    await sync_model_file(file);
  }
}

const package_voices = 'node_modules/kokoro-js/voices';
for (const voice_id of voice_ids) {
  const source = `${package_voices}/${voice_id}.bin`;
  const target = `${root}/voices/${voice_id}.bin`;
  if (await exists(target)) {
    console.log(`kept voices/${voice_id}.bin`);
    continue;
  }
  if (!(await exists(source))) {
    throw new Error(`Missing Kokoro voice asset: ${source}`);
  }
  await copyFile(source, target);
  console.log(`copied voices/${voice_id}.bin`);
}

await writeFile(
  `${root}/REVISION.txt`,
  `Kokoro-82M-ONNX: f46687f7e41512228ae953af24a11b2640ea0f22\nKokoro.js voices: 1.2.1\n`,
  'utf8'
);
