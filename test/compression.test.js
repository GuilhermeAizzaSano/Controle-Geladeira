const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const express = require('express');
const compression = require('compression');
const http = require('node:http');

test('compression middleware: comprime respostas acima do threshold (1024 bytes) com Content-Encoding: gzip', async () => {
  const app = express();
  app.use(compression({ threshold: 1024 }));

  app.get('/large', (req, res) => {
    res.setHeader('Content-Type', 'text/plain');
    res.send('A'.repeat(2048));
  });

  app.get('/small', (req, res) => {
    res.setHeader('Content-Type', 'text/plain');
    res.send('A'.repeat(500));
  });

  app.use(express.static(path.join(__dirname, '..', 'public')));

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  try {
    // 1. Resposta dinâmica grande (> 1024 bytes) com Accept-Encoding: gzip deve ter Content-Encoding: gzip
    const resLarge = await fetch(`http://127.0.0.1:${port}/large`, {
      headers: { 'Accept-Encoding': 'gzip' },
    });
    assert.equal(resLarge.status, 200);
    assert.equal(resLarge.headers.get('content-encoding'), 'gzip');
    const textLarge = await resLarge.text();
    assert.equal(textLarge.length, 2048);

    // 2. Resposta dinâmica pequena (< 1024 bytes) NÃO deve ter Content-Encoding: gzip
    const resSmall = await fetch(`http://127.0.0.1:${port}/small`, {
      headers: { 'Accept-Encoding': 'gzip' },
    });
    assert.equal(resSmall.status, 200);
    assert.equal(resSmall.headers.get('content-encoding'), null);

    // 3. Resposta sem Accept-Encoding: gzip NÃO deve ser comprimida
    const resNoGzip = await fetch(`http://127.0.0.1:${port}/large`, {
      headers: { 'Accept-Encoding': 'identity' },
    });
    assert.equal(resNoGzip.status, 200);
    assert.equal(resNoGzip.headers.get('content-encoding'), null);

    // 4. Arquivo estático grande (> 1024 bytes, index.html) deve vir comprimido com gzip
    const resStaticLarge = await fetch(`http://127.0.0.1:${port}/index.html`, {
      headers: { 'Accept-Encoding': 'gzip' },
    });
    assert.equal(resStaticLarge.status, 200);
    assert.equal(resStaticLarge.headers.get('content-encoding'), 'gzip');

    // 5. Arquivo estático pequeno (< 1024 bytes, manifest.json) NÃO deve ser comprimido
    const resStaticSmall = await fetch(`http://127.0.0.1:${port}/manifest.json`, {
      headers: { 'Accept-Encoding': 'gzip' },
    });
    assert.equal(resStaticSmall.status, 200);
    assert.equal(resStaticSmall.headers.get('content-encoding'), null);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
