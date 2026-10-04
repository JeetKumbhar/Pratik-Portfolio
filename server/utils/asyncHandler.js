/** Express 4 doesn't catch errors thrown inside async handlers. Wrap controllers with this. */
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
export default asyncHandler;
