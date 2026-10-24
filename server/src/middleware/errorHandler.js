export default function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  const status =
    Number.isInteger(err.status) && err.status >= 400 && err.status <= 599
      ? err.status
      : 500;
  const message =
    status === 400
      ? "Invalid request body"
      : status === 413
        ? "Request body too large"
        : "Something went wrong";
  res.status(status).json({ success: false, message });
}
