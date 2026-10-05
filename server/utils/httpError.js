/**
 * Throw this from a controller to send a clean error response:
 *   throw httpError(404, 'Booking not found');
 *   throw httpError(400, 'Validation failed', { email: 'Enter a valid email address.' });
 */
export default function httpError(statusCode, message, fieldErrors) {
  const err = new Error(message);
  err.statusCode = statusCode;
  if (fieldErrors) err.fieldErrors = fieldErrors;
  return err;
}
