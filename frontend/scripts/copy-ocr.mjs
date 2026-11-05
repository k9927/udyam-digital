// Copies the OCR engine and English model into public/ocr so documents are read on-device without any CDN.
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const out = path.join(root, 'public', 'ocr');
const copy = (from, to) => { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(from, to); };
copy(path.join(root, 'node_modules/tesseract.js/dist/worker.min.js'), path.join(out, 'worker.min.js'));
const core = path.join(root, 'node_modules/tesseract.js-core');
for (const file of fs.readdirSync(core).filter(name => /^tesseract-core.*\.(js|wasm)$/.test(name))) copy(path.join(core, file), path.join(out, 'core', file));
copy(path.join(root, 'node_modules/@tesseract.js-data/eng/4.0.0/eng.traineddata.gz'), path.join(out, 'lang', 'eng.traineddata.gz'));
console.log('OCR assets ready in public/ocr');
