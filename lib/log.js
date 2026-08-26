// lib/log.js
'use strict';

function logError(context, err, req = null) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    context,
    error: err && err.message ? err.message : String(err),
    stack: err && err.stack ? err.stack : undefined,
  };

  if (req) {
    logEntry.http = {
      method: req.method,
      url: req.originalUrl || req.url,
      requestId: req.requestId,
      ip: req.ip,
    };
  }

  console.error(JSON.stringify(logEntry));
}

module.exports = { logError };
