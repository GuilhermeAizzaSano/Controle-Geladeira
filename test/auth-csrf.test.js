const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createAuth } = require('../lib/auth');
const cookieHelpers = require('../lib/cookie-helpers');

function createDummyAuth() {
  return createAuth({
    pool: null,
    sessionStore: null,
    cookieHelpers,
    logError: () => {},
  });
}

function makeRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
  };
}

test('requireCsrf: missing header or cookie returns 403', () => {
  const { requireCsrf, sweepInterval } = createDummyAuth();
  clearInterval(sweepInterval);

  // Missing all
  const req1 = { headers: {} };
  const res1 = makeRes();
  let nextCalled = false;
  requireCsrf(req1, res1, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(res1.statusCode, 403);
  assert.equal(res1.body.error, 'CSRF token inválido.');

  // Missing cookie
  const req2 = { headers: { 'x-csrf-token': 'abc' } };
  const res2 = makeRes();
  requireCsrf(req2, res2, () => {});
  assert.equal(res2.statusCode, 403);

  // Missing header
  const req3 = { headers: { cookie: 'csrf=abc' } };
  const res3 = makeRes();
  requireCsrf(req3, res3, () => {});
  assert.equal(res3.statusCode, 403);
});

test('requireCsrf: matching tokens passes to next()', () => {
  const { requireCsrf, sweepInterval } = createDummyAuth();
  clearInterval(sweepInterval);

  const req = {
    headers: {
      'x-csrf-token': 'd8f1e2c3b4a5',
      cookie: 'csrf=d8f1e2c3b4a5',
    },
  };
  const res = makeRes();
  let nextCalled = false;
  requireCsrf(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, 200);
});

test('requireCsrf: mismatched multibyte string does NOT throw 500 and returns 403', () => {
  const { requireCsrf, sweepInterval } = createDummyAuth();
  clearInterval(sweepInterval);

  // Header has same string length (10 chars), but multibyte (e.g. emoji) has different byte length
  // '✨✨✨✨✨✨✨✨✨✨'.length === 10 (or 20 code units), byte length = 30
  // 'abcdefghij'.length === 10, byte length = 10
  const req = {
    headers: {
      'x-csrf-token': '✨✨✨✨✨✨✨✨✨✨',
      cookie: 'csrf=abcdefghij',
    },
  };
  const res = makeRes();
  let nextCalled = false;

  assert.doesNotThrow(() => {
    requireCsrf(req, res, () => { nextCalled = true; });
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.error, 'CSRF token inválido.');
});
