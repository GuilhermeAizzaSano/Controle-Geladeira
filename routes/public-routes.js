const express = require('express');

function createPublicRouter(deps) {
  const {
    pool,
    Q,
    requireAuth,
    logError,
    ensureUsuariosIsAdminColumn,
    ensureUsuariosAdminSenhaColumn,
    tableHasColumn,
    ensureConsumoPrecoColumn,
    ensureConsumosOcultosTable,
    ensureFavoritosTable,
    invalidateAndRefreshRelatorio,
    parseCodigoAcesso,
    parsePositiveInt,
    parsePagination,
    parseQuantidade,
    MAX_QUANTIDADE,
    getClientIp,
    isLoginRateLimited,
    registerLoginAttempt,
    generateToken,
    sessionStore,
    cookieHelpers,
    cookieSecure,
    requireCsrf,
    adminChallenges,
    adminChallengeTtlMs,
    adminChallengeMaxAttempts,
    verifyAdminPassword,
  } = deps;

  const router = express.Router();

  router.post('/login', async (req, res) => {
    const ip = getClientIp(req);

    if (isLoginRateLimited(ip)) {
      return res.status(429).json({ error: 'Muitas tentativas. Tente novamente em instantes.' });
    }

    const codigo_acesso = parseCodigoAcesso(req.body?.codigo_acesso);
    if (!codigo_acesso) {
      registerLoginAttempt(ip, false);
      return res.status(400).json({ error: 'Código de acesso deve ter exatamente 6 dígitos.' });
    }

    try {
      await ensureUsuariosIsAdminColumn();

      const hasAtivo = await tableHasColumn('usuarios', 'ativo');

      const result = hasAtivo
        ? await pool.query({ ...Q.LOGIN, values: [codigo_acesso] })
        : await pool.query(
          'SELECT id, nome, is_admin FROM usuarios WHERE codigo_acesso = $1',
          [codigo_acesso]
        );

      if (!result.rows.length) {
        registerLoginAttempt(ip, false);
        return res.status(401).json({ error: 'Código de acesso inválido.' });
      }

      const usuario = result.rows[0];

      if (usuario.is_admin === true) {
        await ensureUsuariosAdminSenhaColumn();
        const hashResult = await pool.query(
          'SELECT admin_senha_hash FROM usuarios WHERE id = $1',
          [usuario.id]
        );
        const adminSenhaHash = hashResult.rows[0]?.admin_senha_hash ?? null;

        if (!adminSenhaHash) {
          return res.status(403).json({
            error: 'Senha de administrador não configurada. Execute o script de configuração.',
          });
        }

        const challenge = generateToken();
        adminChallenges.set(challenge, { userId: usuario.id, createdAt: Date.now(), attempts: 0 });
        return res.json({ requiresAdminPassword: true, challenge });
      }

      const rawToken  = await sessionStore.createSession({ userId: usuario.id, isAdmin: false });
      const csrfToken = generateToken();
      registerLoginAttempt(ip, true);

      cookieHelpers.setSessionCookie(res, rawToken, cookieSecure);
      cookieHelpers.setCsrfCookie(res, csrfToken, cookieSecure);

      res.json({
        success: true,
        usuario: { id: usuario.id, nome: usuario.nome, is_admin: false },
      });
    } catch (err) {
      logError('/login', err, req);
      res.status(500).json({ error: 'Erro interno.' });
    }
  });

  router.post('/login/admin', async (req, res) => {
    const ip = getClientIp(req);

    if (isLoginRateLimited(ip)) {
      return res.status(429).json({ error: 'Muitas tentativas. Tente novamente em instantes.' });
    }

    const { challenge, senha } = req.body ?? {};

    if (!challenge || typeof challenge !== 'string' || !senha || typeof senha !== 'string') {
      return res.status(400).json({ error: 'Dados inválidos.' });
    }

    const entry = adminChallenges.get(challenge);

    if (
      !entry ||
      Date.now() - entry.createdAt > adminChallengeTtlMs ||
      entry.attempts >= adminChallengeMaxAttempts
    ) {
      adminChallenges.delete(challenge);
      return res.status(401).json({ error: 'Sessão de verificação inválida ou expirada.' });
    }

    try {
      await ensureUsuariosAdminSenhaColumn();
      const userResult = await pool.query(
        'SELECT id, nome, admin_senha_hash FROM usuarios WHERE id = $1',
        [entry.userId]
      );

      if (!userResult.rows.length) {
        adminChallenges.delete(challenge);
        return res.status(401).json({ error: 'Usuário não encontrado.' });
      }

      const { id, nome, admin_senha_hash } = userResult.rows[0];

      if (!verifyAdminPassword(senha, admin_senha_hash)) {
        entry.attempts += 1;
        registerLoginAttempt(ip, false);
        return res.status(401).json({ error: 'Senha de administrador incorreta.' });
      }

      adminChallenges.delete(challenge);
      registerLoginAttempt(ip, true);

      const rawToken  = await sessionStore.createSession({ userId: id, isAdmin: true });
      const csrfToken = generateToken();

      cookieHelpers.setSessionCookie(res, rawToken, cookieSecure);
      cookieHelpers.setCsrfCookie(res, csrfToken, cookieSecure);

      res.json({
        success: true,
        usuario: { id, nome, is_admin: true },
      });
    } catch (err) {
      logError('/login/admin', err, req);
      res.status(500).json({ error: 'Erro interno.' });
    }
  });

  router.post('/logout', requireCsrf, async (req, res) => {
    const raw = cookieHelpers.parseSessionTokenFromCookie(req);
    if (raw) {
      try { await sessionStore.destroySession(raw); } catch (_) {}
    }
    cookieHelpers.clearSessionCookie(res, cookieSecure);
    res.json({ success: true });
  });

  router.put('/alterar-codigo', requireCsrf, requireAuth, async (req, res) => {
    const userId = req.session.userId;
    const codigo_atual = parseCodigoAcesso(req.body?.codigo_atual);
    const codigo_novo = parseCodigoAcesso(req.body?.codigo_novo);

    if (!codigo_atual)
      return res.status(400).json({ error: 'Código atual deve ter exatamente 6 dígitos.' });

    if (!codigo_novo)
      return res.status(400).json({ error: 'Novo código deve ter exatamente 6 dígitos.' });

    if (codigo_atual === codigo_novo)
      return res.status(400).json({ error: 'O novo código deve ser diferente do atual.' });

    try {
      const check = await pool.query({ ...Q.VERIFICAR_CODIGO, values: [userId, codigo_atual] });

      if (!check.rows.length)
        return res.status(401).json({ error: 'Código atual incorreto.' });

      await pool.query(
        'UPDATE usuarios SET codigo_acesso = $1 WHERE id = $2',
        [codigo_novo, userId]
      );

      res.json({ success: true, message: 'Código alterado com sucesso.' });
    } catch (err) {
      if (err.code === '23505')
        return res.status(409).json({ error: 'Este código já está em uso por outro usuário.' });
      logError('/alterar-codigo', err, req);
      res.status(500).json({ error: 'Erro ao alterar código.' });
    }
  });

  router.get('/produtos', requireAuth, async (req, res) => {
    try {
      await ensureFavoritosTable();
      const result = await pool.query({
        ...Q.PRODUTOS_ATIVOS_FAVORITOS,
        values: [req.session.userId],
      });
      res.json(result.rows);
    } catch (err) {
      logError('/produtos', err, req);
      res.status(500).json({ error: 'Erro ao buscar produtos.' });
    }
  });

  router.post('/favoritos/:id_produto', requireCsrf, requireAuth, async (req, res) => {
    const id_usuario = req.session.userId;
    const id_produto = parsePositiveInt(req.params.id_produto);

    if (!id_produto) {
      return res.status(400).json({ error: 'id_produto é obrigatório.' });
    }

    try {
      await ensureFavoritosTable();

      const prod = await pool.query(
        'SELECT id FROM produtos WHERE id = $1 AND ativo = TRUE',
        [id_produto]
      );
      if (!prod.rows.length) return res.status(404).json({ error: 'Produto não encontrado.' });

      await pool.query(
        `INSERT INTO favoritos (id_usuario, id_produto)
         VALUES ($1, $2)
         ON CONFLICT (id_usuario, id_produto) DO NOTHING`,
        [id_usuario, id_produto]
      );

      res.json({ success: true, favorito: true });
    } catch (err) {
      logError('/favoritos', err, req);
      res.status(500).json({ error: 'Erro ao favoritar produto.' });
    }
  });

  router.delete('/favoritos/:id_produto', requireCsrf, requireAuth, async (req, res) => {
    const id_usuario = req.session.userId;
    const id_produto = parsePositiveInt(req.params.id_produto);

    if (!id_produto) {
      return res.status(400).json({ error: 'id_produto é obrigatório.' });
    }

    try {
      await ensureFavoritosTable();

      await pool.query(
        'DELETE FROM favoritos WHERE id_usuario = $1 AND id_produto = $2',
        [id_usuario, id_produto]
      );

      res.json({ success: true, favorito: false });
    } catch (err) {
      logError('/favoritos', err, req);
      res.status(500).json({ error: 'Erro ao desfavoritar produto.' });
    }
  });

  router.post('/comprar', requireCsrf, requireAuth, async (req, res) => {
    const id_usuario = req.session.userId;
    const id_produto = parsePositiveInt(req.body?.id_produto);

    if (!id_produto) {
      return res.status(400).json({ error: 'id_produto é obrigatório.' });
    }

    // Ausente vira 1: clientes antigos que não enviam o campo seguem funcionando.
    const quantidade = parseQuantidade(req.body?.quantidade);

    if (quantidade === null) {
      return res.status(400).json({
        error: `Quantidade deve ser um número inteiro entre 1 e ${MAX_QUANTIDADE}.`,
      });
    }

    try {
      const [prod, user] = await Promise.all([
        pool.query(
          'SELECT id, nome, preco FROM produtos WHERE id = $1 AND ativo = TRUE',
          [id_produto]
        ),
        pool.query('SELECT id FROM usuarios WHERE id = $1', [id_usuario]),
      ]);

      if (!prod.rows.length) return res.status(404).json({ error: 'Produto não encontrado.' });
      if (!user.rows.length) return res.status(404).json({ error: 'Usuário não encontrado.' });

      await ensureConsumoPrecoColumn();

      // Uma linha por unidade — mesmo formato de N compras separadas, o que
      // mantém intactos relatório, zeragem, ocultar e paginação. generate_series
      // faz isso numa única instrução: atômica e com uma só ida ao banco.
      // O preço vai gravado na linha (congelado): editar o preço do produto
      // depois não reescreve o valor desta compra.
      const consumo = await pool.query(
        `INSERT INTO consumo (id_usuario, id_produto, preco)
         SELECT $1, $2, $3 FROM generate_series(1, $4)
         RETURNING id, data_hora`,
        [id_usuario, id_produto, prod.rows[0].preco, quantidade]
      );

      await invalidateAndRefreshRelatorio();

      res.json({
        success: true,
        quantidade: consumo.rowCount,
        consumo: {
          // Uma linha por unidade: são N ids, não um. O data_hora é único
          // porque o DEFAULT NOW() é o mesmo para todas as linhas do INSERT.
          ids: consumo.rows.map(row => row.id),
          data_hora: consumo.rows[0].data_hora,
          produto: prod.rows[0],
        },
      });
    } catch (err) {
      logError('/comprar', err, req);
      res.status(500).json({ error: 'Erro ao registrar compra.' });
    }
  });

  router.get('/historico', requireAuth, async (req, res) => {
    const { page, limit, offset } = parsePagination(req.query);
    const userId = req.session.userId;

    try {
      await ensureConsumosOcultosTable();

      const resetResult = await pool.query({ ...Q.LAST_RESET, values: [userId] });
      const lastReset = resetResult.rows[0].last_reset;

      const [dataResult, statsResult] = await Promise.all([
        pool.query({ ...Q.HISTORICO_DATA, values: [userId, lastReset, limit, offset] }),
        pool.query({ ...Q.HISTORICO_STATS, values: [userId, lastReset] }),
      ]);

      const { total_count: total, total_valor } = statsResult.rows[0];

      res.json({
        data: dataResult.rows,
        pagination: {
          page, limit, total,
          totalPages: Math.ceil(total / limit),
          total_valor,
        },
      });
    } catch (err) {
      logError('/historico', err, req);
      res.status(500).json({ error: 'Erro ao buscar histórico.' });
    }
  });

  return router;
}

module.exports = {
  createPublicRouter,
};
