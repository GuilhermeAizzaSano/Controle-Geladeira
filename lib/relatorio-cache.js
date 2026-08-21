const RELATORIO_TTL = 30_000;

/**
   * Zera o saldo de um único usuário específico.
   *
   * @param {number} userId
   * @returns {Promise<object>} registro inserido em zeragens
   */
  async function zerarSaldoIndividual(userId) {
    const result = await pool.query(Q.ZERAR_SALDO_INDIVIDUAL, [userId]);
    return result.rows[0];
  }

  /**
   * Zera o saldo de todos os usuários devedores (total_gasto > 0) em massa de forma atômica.
   *
   * @returns {Promise<number[]>} ids dos usuários que tiveram o saldo zerado
   */
  async function zerarSaldosEmMassa() {
    const exists = await checkMvRelatorioExists();

    if (exists && mvRelatorioHealthy && !relatorioDirty) {
      try {
        const result = await pool.query(Q.ZERAR_SALDOS_EM_MASSA_MV);
        return result.rows.map(r => r.id_usuario);
      } catch (err) {
        console.warn('⚠️ Falha ao zerar via mv_relatorio, usando fallback:', err.message);
        mvRelatorioHealthy = false;
      }
    }

    const fallback = await pool.query(Q.ZERAR_SALDOS_EM_MASSA_FALLBACK);
    return fallback.rows.map(r => r.id_usuario);
  }

  return {
    relatorioCacheRef,
    invalidarRelatorioCache,
    checkMvRelatorioExists,
    invalidateAndRefreshRelatorio,
    getAdminRelatorioRows,
    zerarSaldoIndividual,
    zerarSaldosEmMassa,
    zerarTodosElegiveis: zerarSaldosEmMassa,
  };
}

module.exports = { createRelatorio };
