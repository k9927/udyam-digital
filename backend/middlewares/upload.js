import multer from 'multer';
import { HttpError } from './error.js';

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, done) => (ALLOWED.includes(file.mimetype) ? done(null, true) : done(new HttpError(400, 'Upload a JPEG, PNG, WebP or PDF file.'))),
});

// The browser's declared type is only a claim; check the file's own leading bytes match it.
const SIGNATURES = {
  'image/jpeg': buffer => buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
  'image/png': buffer => buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/webp': buffer => buffer.subarray(0, 4).toString('latin1') === 'RIFF' && buffer.subarray(8, 12).toString('latin1') === 'WEBP',
  'application/pdf': buffer => buffer.subarray(0, 5).toString('latin1') === '%PDF-',
};
export function verifyFileContent(req, res, next) {
  if (req.file && !SIGNATURES[req.file.mimetype]?.(req.file.buffer)) return next(new HttpError(400, 'That file is not a valid JPEG, PNG, WebP or PDF.'));
  next();
}
