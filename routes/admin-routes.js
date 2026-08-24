const express = require('express');

function createAdminRouter(deps) {
  const {
    pool,
    Q,
    requireAdmin,
    adminRateLimitMiddleware,
    logError,
    tableHasColumn,
    ensureUsuariosAtivoColumn,
    ensureUsuariosAdminSenhaColumn,
    ensureConsumosOcultosTable,
    invalidateAndRefreshRelatorio,
    getAdminRelatorioRows,
    zerarSaldoIndividual,
    zerarSaldosEmMassa,
    zerarTodosElegiveis,
    withTransaction,
    requireCsrf,
    sessionStore,
    cookieHelpers,
    cookieSecure,
    parseBoolean,
    parseCodigoAcesso,
    parsePositiveInt,
    parseNonNegativeNumber,
    parsePagination,
    verifyAdminPassword,
    hashAdminPassword,
    validateAdminPasswordStrength,
    DEFAULT_ADMIN_PASSWORD,
  } = deps;

  const router = express.Router();

  router.use((req, res, next) => {
    if (req.method === 'GET') return next();
    requireCsrf(req, res, next);
  });

  router.use(adminRateLimitMiddleware, requireAdmin);

  router.put('/senha', async (req, res) => {
    const userId = req.session.userId;
    const { senha_atual, senha_nova } = req.body ?? {};

    if (!senha_atual || typeof senha_atual !== 'string') {
      return res.status(400).json({ error: 'Senha atual é obrigatória.' });
    }
    if (!senha_nova || typeof senha_nova !== 'string') {
      return res.status(400).json({ error: 'Nova senha é obrigatória.' });
    }
    if (!validateAdminPasswordStrength(senha_nova)) {
      return res.status(400).json({ error: 'Nova senha deve ter entre 6 e 100 caracteres.' });
    }

    try {
      await ensureUsuariosAdminSenhaColumn();
      const result = await pool.query(
        'SELECT admin_senha_hash FROM usuarios WHERE id = $1',
        [userId]
      );

      if (!result.rows.length) {
        return res.status(404).json({ error: 'Usuário não encontrado.' });
      }

      const currentHash = result.rows[0].admin_senha_hash;

      if (!verifyAdminPassword(senha_atual, currentHash)) {
        return res.status(401).json({ error: 'Senha atual incorreta.' });
      }

      if (verifyAdminPassword(senha_nova, currentHash)) {
        return res.status(400).json({ error: 'A nova senha deve ser diferente da atual.' });
      }

      await pool.query(
        'UPDATE usuarios SET admin_senha_hash = $1 WHERE id = $2',
        [hashAdminPassword(senha_nova), userId]
      );

      res.json({ success: true, message: 'Senha de administrador alterada com sucesso.' });
    } catch (err) {
      logError('/admin/senha', err, req);
      res.status(500).json({ error: 'Erro ao alterar senha.' });
    }
  });

  router.get('/relatorio', async (req, res) => {
    const now = Date.now();

    if (deps.relatorioCacheRef.value && now - deps.relatorioCacheRef.at < deps.relatorioCacheRef.ttl) {
      return res.json(deps.relatorioCacheRef.value);
    }

    try {
      await ensureConsumosOcultosTable();

      const rows = await getAdminRelatorioRows();

      deps.relatorioCacheRef.value = rows;
      deps.relatorioCacheRef.at = Date.now();

      res.json(rows);
    } catch (err) {
      logError('/admin/relatorio', err, req);
      res.status(500).json({ error: 'Erro ao gerar relatório.' });
    }
  });

  router.get('/detalhes/:id_usuario', async (req, res) => {
    const userId = parsePositiveInt(req.params.id_usuario);
    if (!userId) return res.status(400).json({ error: 'Usuário inválido.' });

    const { page, limit, offset } = parsePagination(req.query, 20, 100);

    try {
      await ensureConsumosOcultosTable();

      const resetResult = await pool.query({ ...Q.LAST_RESET, values: [userId] });
      const lastReset = resetResult.rows[0].last_reset;

      const [dataResult, statsResult, favResult, ocultosResult] = await Promise.all([
        pool.query({ ...Q.DETALHES_DATA, values: [userId, lastReset, limit, offset] }),
        pool.query({ ...Q.DETALHES_STATS, values: [userId, lastReset] }),
        pool.query({ ...Q.DETALHES_FAV, values: [userId, lastReset] }),
        pool.query({ ...Q.OCULTOS_COUNT, values: [userId, lastReset] }),
      ]);

      const { total_itens: total, total_gasto } = statsResult.rows[0];
      const favorito = favResult.rows[0] || null;
      const total_ocultos = ocultosResult.rows[0].total_count;

      res.json({
        data: dataResult.rows,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        stats: { total_gasto, total_itens: total, favorito, total_ocultos },
      });
    } catch (err) {
      logError('/admin/detalhes', err, req);
      res.status(500).json({ error: 'Erro ao buscar detalhes.' });
    }
  });

  router.get('/usuarios', async (req, res) => {
    try {
      const hasAtivo = await tableHasColumn('usuarios', 'ativo');
      const query = hasAtivo
        ? 'SELECT id, nome, codigo_acesso, ativo, is_admin FROM usuarios ORDER BY nome ASC'
        : 'SELECT id, nome, codigo_acesso, TRUE AS ativo, FALSE AS is_admin FROM usuarios ORDER BY nome ASC';

      const result = await pool.query(query);
      res.json(result.rows);
    } catch (err) {
      logError('/admin/usuarios GET', err, req);
      res.status(500).json({ error: 'Erro ao buscar usuários.' });
    }
  });

  router.post('/usuarios', async (req, res) => {
    const nome = req.body?.nome?.trim();
    const codigo_acesso = parseCodigoAcesso(req.body?.codigo_acesso);

    if (!nome || nome.length < 2 || nome.length > 100)
      return res.status(400).json({ error: 'Nome deve ter entre 2 e 100 caracteres.' });

    if (!codigo_acesso)
      return res.status(400).json({ error: 'Código de acesso deve ter exatamente 6 dígitos.' });

    try {
      const isAdmin = parseBoolean(req.body?.is_admin, false);

      if (isAdmin) await ensureUsuariosAdminSenhaColumn();

      // INSERT do usuário + (se admin) UPDATE do hash de senha andam juntos numa
      // transação: se a segunda escrita falhar, o ROLLBACK desfaz a primeira — sem
      // isso, um erro no meio do caminho deixaria um admin com senha nula, incapaz
      // de logar (público-routes.js rejeita hash ausente com 403).
      const usuario = await withTransaction(pool, async client => {
        const result = await client.query(
          `INSERT INTO usuarios (nome, codigo_acesso, is_admin)
           VALUES ($1, $2, $3)
           RETURNING id, nome, codigo_acesso, is_admin`,
          [nome, codigo_acesso, isAdmin]
        );

        if (isAdmin) {
          await client.query(
            'UPDATE usuarios SET admin_senha_hash = $1 WHERE id = $2',
            [hashAdminPassword(DEFAULT_ADMIN_PASSWORD), result.rows[0].id]
          );
        }

        return result.rows[0];
      });

      await invalidateAndRefreshRelatorio();

      res.json({ success: true, usuario });
    } catch (err) {
      if (err.code === '23505')
        return res.status(409).json({ error: 'Este código de acesso já está em uso.' });
      logError('/admin/usuarios POST', err, req);
      res.status(500).json({ error: 'Erro ao criar usuário.' });
    }
  });

  router.put('/usuarios/:id', async (req, res) => {
    const userId = parsePositiveInt(req.params.id);
    if (!userId) return res.status(400).json({ error: 'Usuário inválido.' });

    const nome = req.body?.nome?.trim();
    const codigo_acesso = parseCodigoAcesso(req.body?.codigo_acesso);

    if (!nome || nome.length < 2 || nome.length > 100)
      return res.status(400).json({ error: 'Nome deve ter entre 2 e 100 caracteres.' });

    if (!codigo_acesso)
      return res.status(400).json({ error: 'Código de acesso deve ter exatamente 6 dígitos.' });

    try {
      const isAdmin = parseBoolean(req.body?.is_admin, false);

      if (isAdmin) await ensureUsuariosAdminSenhaColumn();

      // UPDATE do usuário + (se admin) UPDATE do hash de senha andam juntos numa
      // transação — mesmo motivo do POST acima: evitar um admin com senha nula se
      // a segunda escrita falhar.
      const usuario = await withTransaction(pool, async client => {
        const result = await client.query(
          `UPDATE usuarios
           SET nome = $1, codigo_acesso = $2, is_admin = $3
           WHERE id = $4
           RETURNING id, nome, codigo_acesso, is_admin`,
          [nome, codigo_acesso, isAdmin, userId]
        );

        if (!result.rows.length) return null;

        if (isAdmin) {
          await client.query(
            'UPDATE usuarios SET admin_senha_hash = $1 WHERE id = $2 AND admin_senha_hash IS NULL',
            [hashAdminPassword(DEFAULT_ADMIN_PASSWORD), userId]
          );
        }

        return result.rows[0];
      });

      if (!usuario)
        return res.status(404).json({ error: 'Usuário não encontrado.' });

      // Sessões e cache são efeitos colaterais de outro domínio — rodam só depois
      // do commit, nunca desfeitos/refeitos junto com um eventual rollback acima.
      await sessionStore.destroyUserSessions(userId);
      await invalidateAndRefreshRelatorio();

      res.json({ success: true, usuario });
    } catch (err) {
      if (err.code === '23505')
        return res.status(409).json({ error: 'Este código de acesso já está em uso.' });
      logError('/admin/usuarios PUT', err, req);
      res.status(500).json({ error: 'Erro ao atualizar usuário.' });
    }
  });

  router.delete('/usuarios/:id', async (req, res) => {
    const userId = parsePositiveInt(req.params.id);
    if (!userId) return res.status(400).json({ error: 'Usuário inválido.' });

    const acao = ['inativar', 'ativar', 'excluir'].includes(req.query?.acao)
      ? req.query.acao
      : 'inativar';

    try {
      if (acao === 'excluir') {
        const result = await pool.query(
          'DELETE FROM usuarios WHERE id = $1 RETURNING id',
          [userId]
        );
        if (!result.rows.length)
          return res.status(404).json({ error: 'Usuário não encontrado.' });

        await sessionStore.destroyUserSessions(userId);

        await invalidateAndRefreshRelatorio();

        return res.json({ success: true });
      }

      await ensureUsuariosAtivoColumn();
      const result = await pool.query(
        'UPDATE usuarios SET ativo = $1 WHERE id = $2 RETURNING id',
        [acao === 'ativar', userId]
      );

      if (!result.rows.length)
        return res.status(404).json({ error: 'Usuário não encontrado.' });

      if (acao === 'inativar') {
        await sessionStore.destroyUserSessions(userId);
      }

      await invalidateAndRefreshRelatorio();

      res.json({ success: true });
    } catch (err) {
      logError('/admin/usuarios DELETE', err, req);
      res.status(500).json({ error: 'Erro ao remover usuário.' });
    }
  });

  router.get('/produtos', async (req, res) => {
    try {
      const result = await pool.query(
        'SELECT id, nome, preco, ativo FROM produtos ORDER BY ativo DESC, nome ASC'
      );
      res.json(result.rows);
    } catch (err) {
      logError('/admin/produtos', err, req);
      res.status(500).json({ error: 'Erro ao buscar produtos.' });
    }
  });

  router.post('/produtos', async (req, res) => {
    const nome = req.body?.nome?.trim();
    const preco = parseNonNegativeNumber(req.body?.preco);
    const ativo = parseBoolean(req.body?.ativo, true);

    if (!nome || nome.length < 2 || nome.length > 100)
      return res.status(400).json({ error: 'Nome deve ter entre 2 e 100 caracteres.' });

    if (preco === null)
      return res.status(400).json({ error: 'Informe um preço válido.' });

    try {
      const result = await pool.query(
        `INSERT INTO produtos (nome, preco, ativo)
         VALUES ($1, $2, $3)
         RETURNING id, nome, preco, ativo`,
        [nome, preco, ativo]
      );

      await invalidateAndRefreshRelatorio();

      res.json({ success: true, produto: result.rows[0] });
    } catch (err) {
      logError('/admin/produtos POST', err, req);
      res.status(500).json({ error: 'Erro ao criar produto.' });
    }
  });

  router.put('/produtos/:id', async (req, res) => {
    const productId = parsePositiveInt(req.params.id);
    if (!productId) return res.status(400).json({ error: 'Produto inválido.' });

    const nome = req.body?.nome?.trim();
    const preco = parseNonNegativeNumber(req.body?.preco);
    const ativo = parseBoolean(req.body?.ativo, false);

    if (!nome || nome.length < 2 || nome.length > 100)
      return res.status(400).json({ error: 'Nome deve ter entre 2 e 100 caracteres.' });

    if (preco === null)
      return res.status(400).json({ error: 'Informe um preço válido.' });

    try {
      const result = await pool.query(
        `UPDATE produtos
         SET nome = $1, preco = $2, ativo = $3
         WHERE id = $4
         RETURNING id, nome, preco, ativo`,
        [nome, preco, ativo, productId]
      );
      if (!result.rows.length)
        return res.status(404).json({ error: 'Produto não encontrado.' });

      await invalidateAndRefreshRelatorio();

      res.json({ success: true, produto: result.rows[0] });
    } catch (err) {
      logError('/admin/produtos PUT', err, req);
      res.status(500).json({ error: 'Erro ao atualizar produto.' });
    }
  });

  router.delete('/produtos/:id', async (req, res) => {
    const productId = parsePositiveInt(req.params.id);
    if (!productId) return res.status(400).json({ error: 'Produto inválido.' });

    const acao = ['inativar', 'ativar', 'excluir'].includes(req.query?.acao)
      ? req.query.acao
      : 'inativar';

    try {
      const result =
        acao === 'excluir'
          ? await pool.query('DELETE FROM produtos WHERE id = $1 RETURNING id', [productId])
          : await pool.query(
            'UPDATE produtos SET ativo = $1 WHERE id = $2 RETURNING id',
            [acao === 'ativar', productId]
          );

      if (!result.rows.length)
        return res.status(404).json({ error: 'Produto não encontrado.' });

      await invalidateAndRefreshRelatorio();

      res.json({ success: true });
    } catch (err) {
      logError('/admin/produtos DELETE', err, req);
      res.status(500).json({ error: 'Erro ao remover produto.' });
    }
  });

  // Oculta um consumo (soft-hide): o registro permanece em `consumo` e apenas é
  // marcado em `consumos_ocultos`, gravando qual admin executou a ação (auditoria).
  // Retorna 404 quando o consumo não existe, senão { success: true }.
  async function ocultarConsumo(consumoId, idAdmin) {
    await ensureConsumosOcultosTable();

    const consumo = await pool.query(
      'SELECT id, id_usuario FROM consumo WHERE id = $1',
      [consumoId]
    );
    if (!consumo.rows.length) return { notFound: true };

    await pool.query('UPDATE consumo SET oculto = TRUE WHERE id = $1', [consumoId]);

    await pool.query(
      `INSERT INTO consumos_ocultos (id_consumo, id_usuario, id_admin)
       VALUES ($1, $2, $3)
       ON CONFLICT (id_consumo) DO NOTHING`,
      [consumoId, consumo.rows[0].id_usuario, idAdmin ?? null]
    );

    await invalidateAndRefreshRelatorio();
    return { notFound: false };
  }

  async function handleOcultar(req, res) {
    const consumoId = parsePositiveInt(req.params.id);
    if (!consumoId) return res.status(400).json({ error: 'Registro inválido.' });

    try {
      const { notFound } = await ocultarConsumo(consumoId, req.session.userId);
      if (notFound)
        return res.status(404).json({ error: 'Registro de consumo não encontrado.' });

      res.json({ success: true });
    } catch (err) {
      logError('/admin/consumo ocultar', err, req);
      res.status(500).json({ error: 'Erro ao remover item.' });
    }
  }

  router.post('/consumo/:id/estornar', handleOcultar);
  router.post('/consumo/:id/ocultar', handleOcultar);

  // Restaura (des-oculta) um consumo: remove a marcação de `consumos_ocultos`.
  // O dado em `consumo` nunca foi apagado, então volta a aparecer nas telas.
  router.post('/consumo/:id/reativar', async (req, res) => {
      return handleReativar(req, res);
    });
    async function handleReativar(req, res) {
      const consumoId = parsePositiveInt(req.params.id);
      if (!consumoId) return res.status(400).json({ error: 'Registro inválido.' });
      try {
        await ensureConsumosOcultosTable();
        await pool.query('UPDATE consumo SET oculto = FALSE WHERE id = $1', [consumoId]);
        await pool.query('DELETE FROM consumos_ocultos WHERE id_consumo = $1', [consumoId]);
        const consumoResult = await pool.query('SELECT id_usuario, data_hora FROM consumo WHERE id = $1', [consumoId]);
        if (consumoResult.rows.length) {
          const { id_usuario, data_hora } = consumoResult.rows[0];
          const resetResult = await pool.query({ ...Q.LAST_RESET, values: [id_usuario] });
          const lastReset = resetResult.rows[0]?.last_reset;
          if (lastReset && new Date(data_hora) <= new Date(lastReset)) {
            await pool.query('UPDATE consumo SET data_hora = NOW() WHERE id = $1', [consumoId]);
          }
        }
        await invalidateAndRefreshRelatorio();
        res.json({ success: true });
      } catch (err) {
        logError('/admin/consumo restaurar', err, req);
        res.status(500).json({ error: 'Erro ao restaurar item.' });
      }
    }
    router.post('/consumo/:id/restaurar', async (req, res) => {
      const consumoId = parsePositiveInt(req.params.id);
      if (!consumoId) return res.status(400).json({ error: 'Registro inválido.' });

      try {
        await ensureConsumosOcultosTable();

        await pool.query('UPDATE consumo SET oculto = FALSE WHERE id = $1', [consumoId]);

        await pool.query(
          'DELETE FROM consumos_ocultos WHERE id_consumo = $1',
          [consumoId]
        );

        const consumoResult = await pool.query('SELECT id_usuario, data_hora FROM consumo WHERE id = $1', [consumoId]);
        if (consumoResult.rows.length) {
          const { id_usuario, data_hora } = consumoResult.rows[0];
          const resetResult = await pool.query({ ...Q.LAST_RESET, values: [id_usuario] });
          const lastReset = resetResult.rows[0]?.last_reset;
          if (lastReset && new Date(data_hora) <= new Date(lastReset)) {
            await pool.query('UPDATE consumo SET data_hora = NOW() WHERE id = $1', [consumoId]);
          }
        }

        await invalidateAndRefreshRelatorio();

        res.json({ success: true });
      } catch (err) {
        logError('/admin/consumo restaurar', err, req);
        res.status(500).json({ error: 'Erro ao restaurar item.' });
      }
    });

    router.get('/ocultos/:id_usuario', async (req, res) => {
    const userId = parsePositiveInt(req.params.id_usuario);
    if (!userId) return res.status(400).json({ error: 'Usuário inválido.' });

    const { page, limit, offset } = parsePagination(req.query, 20, 100);

    try {
      await ensureConsumosOcultosTable();

      const resetResult = await pool.query({ ...Q.LAST_RESET, values: [userId] });
      const lastReset = resetResult.rows[0].last_reset;

      const [dataResult, countResult] = await Promise.all([
        pool.query({ ...Q.OCULTOS_DATA, values: [userId, lastReset, limit, offset] }),
        pool.query({ ...Q.OCULTOS_COUNT, values: [userId, lastReset] }),
      ]);

      const total = countResult.rows[0].total_count;

      res.json({
        data: dataResult.rows,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      });
    } catch (err) {
      logError('/admin/ocultos', err, req);
      res.status(500).json({ error: 'Erro ao buscar itens ocultos.' });
    }
  });

  router.post('/zerar-individual/:id_usuario', async (req, res) => {
    const userId = parsePositiveInt(req.params.id_usuario);
    if (!userId) return res.status(400).json({ error: 'Usuário inválido.' });

    try {
      const user = await pool.query(
        'SELECT id FROM usuarios WHERE id = $1',
        [userId]
      );
      if (!user.rows.length)
        return res.status(404).json({ error: 'Usuário não encontrado.' });

      await pool.query('INSERT INTO zeragens (id_usuario) VALUES ($1)', [userId]);

      await invalidateAndRefreshRelatorio();

      res.json({ success: true, message: 'Conta zerada (dados preservados no banco).' });
    } catch (err) {
      logError('/admin/zerar', err, req);
      res.status(500).json({ error: 'Erro ao zerar conta.' });
    }
  });

  router.post('/zerar-em-massa', async (req, res) => {
    try {
      await ensureConsumosOcultosTable();

      // Filtro (total_gasto > 0) e escrita rodam no Postgres numa única
      // instrução INSERT...SELECT — atômica, sem trazer a tabela inteira pro
      // Node e sem a race condition de ler o relatório numa query e escrever
      // em outra.
      const userIds = await zerarTodosElegiveis();

      if (!userIds.length) {
        return res.json({
          success: true,
          total_usuarios: 0,
          message: 'Nenhum usuário com saldo atual para zerar.',
        });
      }

      await invalidateAndRefreshRelatorio();

      res.json({
        success: true,
        total_usuarios: userIds.length,
        message: 'Saldos zerados com sucesso (dados preservados no banco).',
      });
    } catch (err) {
      logError('/admin/zerar-todos', err, req);
      res.status(500).json({ error: 'Erro ao zerar saldos.' });
    }
  });

  return router;
}

module.exports = {
  createAdminRouter,
};
