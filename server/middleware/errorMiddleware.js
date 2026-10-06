/**
 * Last stop for every error. Always answers with:
 *   { success: false, message: '...', errors?: { field: 'message' } }
 */
export const notFound = (req, res, next) => {
  const err = new Error(`Not found: ${req.method} ${req.originalUrl}`);
  err.statusCode = 404;
  next(err);
};

// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, req, res, next) => {
  let status = err.statusCode || 500;
  let message = err.message || 'Server error';
  let errors;

  if (err.name === 'ValidationError' && err.errors) {
    // Mongoose schema validation → one message per field
    status = 400;
    message = 'Validation failed';
    errors = Object.fromEntries(Object.entries(err.errors).map(([field, e]) => [field, e.message]));
  } else if (err.name === 'CastError') {
    status = 400;
    message = `Invalid ${err.path}: ${err.value}`;
  } else if (err.code === 11000) {
    // Unique index violation
    status = 409;
    const field = Object.keys(err.keyValue || {})[0];
    message = (field === 'slotKey' || field === 'slotKeys')
      ? 'That time slot has just been taken. Please choose another.'
      : `${field || 'Value'} already exists`;
  } else if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    status = 401;
    message = 'Not authorized. Please log in again.';
  } else if (err.type === 'entity.parse.failed') {
    status = 400;
    message = 'Invalid JSON in request body';
  } else if (err.type === 'entity.too.large') {
    status = 413;
    message = 'Request body too large';
  }

  // Errors thrown with httpError(status, message, { field: 'message' })
  if (!errors && err.fieldErrors) errors = err.fieldErrors;

  if (status >= 500) {
    console.error(err);
    if (process.env.NODE_ENV === 'production') message = 'Something went wrong on our side. Please try again.';
  }

  res.status(status).json({
    success: false,
    message,
    ...(errors && { errors }),
    ...(process.env.NODE_ENV !== 'production' && status >= 500 && { stack: err.stack }),
  });
};
