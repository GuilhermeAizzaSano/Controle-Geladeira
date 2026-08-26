'use strict';

const express = require('express');
const { asyncHandler } = require('../lib/async-handler');

function createAdminRouter(deps) {
  const {
    pool,
    Q,
    requireAdmin,
    adminRateLimitMiddleware,
    tableHasColumn,
    invalidateAndRefreshRelatorio,
    getAdminRelatorioRows,
    zerarSaldoIndividual,
    zerarTodosElegiveis,
    withTransaction,
    requireCsrf,
    sessionStore,
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

  router.put('/senha', asyncHandler(async (req, res) => {
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
  }));

  router.get('/relatorio', asyncHandler(async (req, res) => {
    const now = Date.now();

    if (deps.relatorioCacheRef.value && now - deps.relatorioCacheRef.at < deps.relatorioCacheRef.ttl) {
      return res.json(deps.relatorioCacheRef.value);
    }

    const rows = await getAdminRelatorioRows();

    deps.relatorioCacheRef.value = rows;
    deps.relatorioCacheRef.at = Date.now();

    res.json(rows);
  }));

  router.get('/detalhes/:id_usuario', asyncHandler(async (req, res) => {
    const userId = parsePositiveInt(req.params.id_usuario);
    if (!userId) return res.status(400).json({ error: 'Usuário inválido.' });

    const { page, limit, offset } = parsePagination(req.query, 20, 100);

    const resetResult = await pool.query({ ...Q.LAST_RESET, values: [userId] });
    const lastReset = resetResult.rows[0].last_reset;

    const [dataResult, statsResult, resumoResult, ocultosResult] = await Promise.all([
      pool.query({ ...Q.DETALHES_DATA, values: [userId, lastReset, limit, offset] }),
      pool.query({ ...Q.DETALHES_STATS, values: [userId, lastReset] }),
      pool.query({ ...Q.DETALHES_RESUMO, values: [userId, lastReset] }),
      pool.query({ ...Q.OCULTOS_COUNT, values: [userId, lastReset] }),
    ]);

    const { total_itens: total, total_gasto } = statsResult.rows[0];
    const resumo = resumoResult.rows;
    const favorito = resumo.length > 0 ? { produto: resumo[0].produto, freq: resumo[0].qtd } : null;
    const total_ocultos = ocultosResult.rows[0].total_count;

    res.json({
      data: dataResult.rows,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      stats: { total_gasto, total_itens: total, favorito, total_ocultos, resumo },
    });
  }));

  router.get('/usuarios', asyncHandler(async (req, res) => {
    const hasAtivo = await tableHasColumn('usuarios', 'ativo');
    const query = hasAtivo
      ? 'SELECT id, nome, codigo_acesso, ativo, is_admin FROM usuarios ORDER BY nome ASC'
      : 'SELECT id, nome, codigo_acesso, TRUE AS ativo, FALSE AS is_admin FROM usuarios ORDER BY nome ASC';

    const result = await pool.query(query);
    res.json(result.rows);
  }));

  router.post('/usuarios', asyncHandler(async (req, res) => {
    const nome = req.body?.nome?.trim();
    const codigo_acesso = parseCodigoAcesso(req.body?.codigo_acesso);

    if (!nome || nome.length < 2 || nome.length > 100)
      return res.status(400).json({ error: 'Nome deve ter entre 2 e 100 caracteres.' });

    if (!codigo_acesso)
      return res.status(400).json({ error: 'Código de acesso deve ter exatamente 6 dígitos.' });

    const isAdmin = parseBoolean(req.body?.is_admin, false);

    let usuario;
    try {
      usuario = await withTransaction(pool, async client => {
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
    } catch (err) {
      if (err.code === '23505')
        return res.status(409).json({ error: 'Este código de acesso já está em uso.' });
      throw err;
    }

    await invalidateAndRefreshRelatorio();

    res.json({ success: true, usuario });
  }));

  router.put('/usuarios/:id', asyncHandler(async (req, res) => {
    const userId = parsePositiveInt(req.params.id);
    if (!userId) return res.status(400).json({ error: 'Usuário inválido.' });

    const nome = req.body?.nome?.trim();
    const codigo_acesso = parseCodigoAcesso(req.body?.codigo_acesso);

    if (!nome || nome.length < 2 || nome.length > 100)
      return res.status(400).json({ error: 'Nome deve ter entre 2 e 100 caracteres.' });

    if (!codigo_acesso)
      return res.status(400).json({ error: 'Código de acesso deve ter exatamente 6 dígitos.' });

    const isAdmin = parseBoolean(req.body?.is_admin, false);

    let usuario;
    try {
      usuario = await withTransaction(pool, async client => {
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
    } catch (err) {
      if (err.code === '23505')
        return res.status(409).json({ error: 'Este código de acesso já está em uso.' });
      throw err;
    }

    if (!usuario)
      return res.status(404).json({ error: 'Usuário não encontrado.' });

    await sessionStore.destroyUserSessions(userId);
    await invalidateAndRefreshRelatorio();

    res.json({ success: true, usuario });
  }));

  router.delete('/usuarios/:id', asyncHandler(async (req, res) => {
    const userId = parsePositiveInt(req.params.id);
    if (!userId) return res.status(400).json({ error: 'Usuário inválido.' });

    const acao = ['inativar', 'ativar', 'excluir'].includes(req.query?.acao)
      ? req.query.acao
      : 'inativar';

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
  }));

  router.get('/produtos', asyncHandler(async (req, res) => {
    const result = await pool.query(
      'SELECT id, nome, preco, ativo FROM produtos ORDER BY ativo DESC, nome ASC'
    );
    res.json(result.rows);
  }));

  router.post('/produtos', asyncHandler(async (req, res) => {
    const nome = req.body?.nome?.trim();
    const preco = parseNonNegativeNumber(req.body?.preco);
    const ativo = parseBoolean(req.body?.ativo, true);

    if (!nome || nome.length < 2 || nome.length > 100)
      return res.status(400).json({ error: 'Nome deve ter entre 2 e 100 caracteres.' });

    if (preco === null)
      return res.status(400).json({ error: 'Informe um preço válido.' });

    const result = await pool.query(
      `INSERT INTO produtos (nome, preco, ativo)
       VALUES ($1, $2, $3)
       RETURNING id, nome, preco, ativo`,
      [nome, preco, ativo]
    );

    await invalidateAndRefreshRelatorio();

    res.json({ success: true, produto: result.rows[0] });
  }));

  router.put('/produtos/:id', asyncHandler(async (req, res) => {
    const productId = parsePositiveInt(req.params.id);
    if (!productId) return res.status(400).json({ error: 'Produto inválido.' });

    const nome = req.body?.nome?.trim();
    const preco = parseNonNegativeNumber(req.body?.preco);
    const ativo = parseBoolean(req.body?.ativo, false);

    if (!nome || nome.length < 2 || nome.length > 100)
      return res.status(400).json({ error: 'Nome deve ter entre 2 e 100 caracteres.' });

    if (preco === null)
      return res.status(400).json({ error: 'Informe um preço válido.' });

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
  }));

  router.delete('/produtos/:id', asyncHandler(async (req, res) => {
    const productId = parsePositiveInt(req.params.id);
    if (!productId) return res.status(400).json({ error: 'Produto inválido.' });

    const acao = ['inativar', 'ativar', 'excluir'].includes(req.query?.acao)
      ? req.query.acao
      : 'inativar';

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
  }));

  // Estorna um consumo (soft-hide): o registro permanece em `consumo` (oculto = TRUE)
  // e é registrado em `consumos_ocultos` para auditoria de qual admin executou o estorno.
  async function estornarConsumo(consumoId, idAdmin) {
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

  async function handleEstornar(req, res) {
    const consumoId = parsePositiveInt(req.params.id);
    if (!consumoId) return res.status(400).json({ error: 'Registro inválido.' });

    const { notFound } = await estornarConsumo(consumoId, req.session.userId);
    if (notFound)
      return res.status(404).json({ error: 'Registro de consumo não encontrado.' });

    res.json({ success: true });
  }

  // Reativa (des-estorna) um consumo: remove a marcação de `consumos_ocultos` e
  // volta `oculto = FALSE`. Se o item for anterior à última zeragem, atualiza data_hora para NOW().
  async function handleReativar(req, res) {
    const consumoId = parsePositiveInt(req.params.id);
    if (!consumoId) return res.status(400).json({ error: 'Registro inválido.' });

    await pool.query('UPDATE consumo SET oculto = FALSE WHERE id = $1', [consumoId]);
    await pool.query('DELETE FROM consumos_ocultos WHERE id_consumo = $1', [consumoId]);

    const consumoResult = await pool.query(
      'SELECT id_usuario, data_hora FROM consumo WHERE id = $1',
      [consumoId]
    );
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
  }

  // Rotas canônicas
  router.post('/consumo/:id/estornar', asyncHandler(handleEstornar));
  router.post('/consumo/:id/reativar', asyncHandler(handleReativar));

  router.get('/ocultos/:id_usuario', asyncHandler(async (req, res) => {
    const userId = parsePositiveInt(req.params.id_usuario);
    if (!userId) return res.status(400).json({ error: 'Usuário inválido.' });

    const { page, limit, offset } = parsePagination(req.query, 20, 100);

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
  }));

  router.post('/zerar-individual/:id_usuario', asyncHandler(async (req, res) => {
    const userId = parsePositiveInt(req.params.id_usuario);
    if (!userId) return res.status(400).json({ error: 'Usuário inválido.' });

    const user = await pool.query(
      'SELECT id FROM usuarios WHERE id = $1',
      [userId]
    );
    if (!user.rows.length)
      return res.status(404).json({ error: 'Usuário não encontrado.' });

    await zerarSaldoIndividual(userId);
    await invalidateAndRefreshRelatorio();

    res.json({ success: true, message: 'Conta zerada (dados preservados no banco).' });
  }));

  router.post('/zerar-em-massa', asyncHandler(async (req, res) => {
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
  }));

  return router;
}

module.exports = {
  createAdminRouter,
};
