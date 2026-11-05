export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const asyncHandler = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

export const notFound = (req, res) => res.status(404).json({ error: 'Not found.' });

// eslint-disable-next-line no-unused-vars
export function errorHandler(error, req, res, next) {
  if (error.name === 'MulterError') return res.status(400).json({ error: error.code === 'LIMIT_FILE_SIZE' ? 'Each document must be 10 MB or smaller.' : 'Upload failed.' });
  if (error.name === 'ValidationError' || error.name === 'CastError') return res.status(400).json({ error: 'Some details are not valid.' });
  // A refine() message was written for people ("That is not a valid Aadhaar number…"); pass it on. Zod's own messages are not.
  if (error.name === 'ZodError') return res.status(400).json({ error: error.issues?.find(issue => issue.code === 'custom')?.message || 'Some details are not valid.', details: error.issues?.map(issue => issue.path.join('.')) });
  const status = error.status || 500;
  if (status >= 500) console.error(error);
  res.status(status).json({ error: status >= 500 ? 'Something went wrong. Please try again.' : error.message, details: error.details });
}
