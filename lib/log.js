function logError(context, err, req = null) {
  const reqInfo = req ? ` [${req.method} ${req.originalUrl}] [${req.requestId}]` : '';
  console.error(`${context}${reqInfo}:`, err && err.stack ? err.stack : err);
}

module.exports = { logError };
