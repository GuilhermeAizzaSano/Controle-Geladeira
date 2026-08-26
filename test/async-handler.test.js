const { test } = require('node:test');
const assert = require('node:assert/strict');
const { asyncHandler } = require('../lib/async-handler');

test('asyncHandler forwards resolved promise without calling next with error', async () => {
  let called = false;
  let nextCalledWith = null;

  const fn = asyncHandler(async (req, res, next) => {
    called = true;
  });

  await fn({}, {}, (err) => {
    nextCalledWith = err;
  });

  assert.equal(called, true);
  assert.equal(nextCalledWith, null);
});

test('asyncHandler catches rejected promise and forwards to next(err)', async () => {
  const customError = new Error('Async error');
  let nextError = null;

  const fn = asyncHandler(async () => {
    throw customError;
  });

  await new Promise((resolve) => {
    fn({}, {}, (err) => {
      nextError = err;
      resolve();
    });
  });

  assert.equal(nextError, customError);
});
