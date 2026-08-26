// lib/async-handler.js
'use strict';

/**
 * Encapsula rotas assíncronas do Express para repassar qualquer erro
 * automaticamente ao middleware de tratamento global via next(err).
 *
 * @param {Function} fn Handler assíncrono (req, res, next)
 * @returns {import('express').RequestHandler}
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = { asyncHandler };
