import { createWorker } from 'tesseract.js';
import { parseKycText } from './kycParse.js';

// Documents are read inside the browser; the OCR engine and model are served by this app (public/ocr), not a CDN.
let workerPromise;
function getWorker() {
  workerPromise ||= createWorker('eng', 1, { workerPath: '/ocr/worker.min.js', corePath: '/ocr/core', langPath: '/ocr/lang', gzip: true, workerBlobURL: false })
    .catch(error => { workerPromise = null; throw error; });
  return workerPromise;
}

// pdf.js is large, so it loads only when someone actually picks a PDF.
let pdfPromise;
function getPdf() {
  pdfPromise ||= Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]).then(([pdfjs, worker]) => {
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    return pdfjs;
  }).catch(error => { pdfPromise = null; throw error; });
  return pdfPromise;
}

// A digital PDF (an e-bill, a certificate downloaded from the portal) has a text layer: read it exactly.
// A scanned PDF has none: render the first page and read it like a photo.
async function readPdf(file) {
  const pdfjs = await getPdf();
  const task = pdfjs.getDocument({ data: await file.arrayBuffer() });
  try {
    const pdf = await task.promise;
    const page = await pdf.getPage(1);
    const content = await page.getTextContent();
    const text = content.items.map(item => `${item.str}${item.hasEOL ? '\n' : ' '}`).join('').replace(/[ \t]+\n/g, '\n').trim();
    if (text.replace(/\s/g, '').length > 40) return { text, confidence: 98, source: 'pdf-text' };
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvas, canvasContext: canvas.getContext('2d'), viewport }).promise;
    const { data } = await (await getWorker()).recognize(canvas, { rotateAuto: true });
    return { text: data.text, confidence: Math.round(data.confidence), source: 'pdf-scan' };
  } finally {
    await task.destroy();
  }
}

// The detail that only a given kind of document carries, used to spot a document put in the wrong box.
const DISTINCT = { 'GST certificate': 'gstin', 'Udyam certificate': 'udyam_number', 'Address proof': 'bill_date', 'Signatory ID': 'id_number', 'Shop licence': 'licence_number' };
const REQUIRED = { 'GST certificate': 'gstin', 'Udyam certificate': 'enterprise_name', 'Address proof': 'bill_date', 'Signatory ID': 'name', 'Shop licence': 'licence_number' };
function looksLikeOther(type, text, fields) {
  if (!REQUIRED[type] || fields[REQUIRED[type]]) return null;
  return Object.keys(DISTINCT).find(other => other !== type && parseKycText(other, text)[DISTINCT[other]]) || null;
}

export async function readDocument(file, type) {
  let text, confidence, source;
  if (file.type === 'application/pdf') ({ text, confidence, source } = await readPdf(file));
  else if (file.type.startsWith('image/')) {
    const { data } = await (await getWorker()).recognize(file, { rotateAuto: true });
    ({ text, confidence, source } = { text: data.text, confidence: Math.round(data.confidence), source: 'image' });
  } else return { confidence: 0, fields: {}, skipped: true };
  const fields = parseKycText(type, text);
  return { confidence, fields, skipped: false, source, looksLike: looksLikeOther(type, text, fields) };
}
