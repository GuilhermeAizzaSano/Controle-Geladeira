const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  parseCookies, setSessionCookie, clearSessionCookie, setCsrfCookie, clearCsrfCookie,
  parseCsrfTokenFromCookie, parseSessionTokenFromCookie,
} = require('../lib/cookie-helpers');

function makeReq(cookieHeader) {
  return { headers: { cookie: cookieHeader } };
}
function makeRes() {
  return {
    _headers: [],
    setHeader(name, val) { this._headers.push([name, val]); },
    append(name, val)    { this._headers.push([name, val]); },
  };
}

test('parseCookies', () => {
  const m = parseCookies(makeReq('session=abc; csrf=xyz'));
  assert.equal(m.get('session'), 'abc');
  assert.equal(m.get('csrf'), 'xyz');
  assert.equal(parseCookies(makeReq(undefined)).size, 0);
});

test('setSessionCookie non-secure', () => {
  const res = makeRes();
  setSessionCookie(res, 'tok123', false);
  const val = res._headers.find(([n]) => n === 'Set-Cookie')[1];
  assert.ok(val.includes('session=tok123'));
  assert.ok(val.includes('HttpOnly'));
  assert.ok(val.includes('SameSite=Strict'));
  assert.ok(!val.includes('Secure'), 'must NOT include Secure when cookieSecure=false');
});

test('setSessionCookie secure', () => {
  const res = makeRes();
  setSessionCookie(res, 'tok123', true);
  const val = res._headers.find(([n]) => n === 'Set-Cookie')[1];
  assert.ok(val.includes('Secure'));
});

test('clearSessionCookie', () => {
  const res = makeRes();
  clearSessionCookie(res, false);
  const val = res._headers.find(([n]) => n === 'Set-Cookie')[1];
  assert.ok(val.includes('Max-Age=0'));
});

test('setCsrfCookie must NOT be HttpOnly', () => {
  const res = makeRes();
  setCsrfCookie(res, 'csrftok', false);
  const val = res._headers.find(([n]) => n === 'Set-Cookie')[1];
  assert.ok(val.includes('csrf=csrftok'));
  assert.ok(!val.includes('HttpOnly'), 'csrf cookie must be readable by JS');
});

test('clearCsrfCookie', () => {
  const res = makeRes();
  clearCsrfCookie(res, false);
  const val = res._headers.find(([n]) => n === 'Set-Cookie')[1];
  assert.ok(val.includes('csrf=;'));
  assert.ok(val.includes('Max-Age=0'));
  assert.ok(!val.includes('HttpOnly'));
});

test('parseSessionTokenFromCookie / parseCsrfTokenFromCookie', () => {
  const req = makeReq('session=mytoken; csrf=mycsrf');
  assert.equal(parseSessionTokenFromCookie(req), 'mytoken');
  assert.equal(parseCsrfTokenFromCookie(req), 'mycsrf');
  assert.equal(parseSessionTokenFromCookie(makeReq('')), null);
});
