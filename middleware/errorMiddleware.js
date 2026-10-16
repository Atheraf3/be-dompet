export const errorHandler = (err, req, res, next) => {
  let resStatusCode = res.statusCode === 200 ? 500 : res.statusCode;
  let message = err.message || 'Terjadi kesalahan pada server.';

  if (err.name === 'ValidationError' && err.errors) {
    message = Object.values(err.errors)
      .map((item) => item.message)
      .join(', ');
    resStatusCode = 400;
  }

  if (err.name === 'ZodError' && Array.isArray(err.issues)) {
    message = err.issues[0]?.message || 'Data input tidak valid.';
    resStatusCode = 400;
  }

  res.status(resStatusCode).json({
    message,
    error: message,
    stack: process.env.NODE_ENV === 'production' ? undefined : err.stack,
  });
};

export const notFoundPath = (req, res, next) => {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  res.status(404);
  next(error);
};
