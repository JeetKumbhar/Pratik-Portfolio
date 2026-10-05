/** throw httpError(404, 'Booking not found')  → errorMiddleware turns it into { success:false, message } with that status */
export const httpError = (statusCode, message) => Object.assign(new Error(message), { statusCode });
export default httpError;
