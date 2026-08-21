const RELATORIO_TTL = 30_000;

/**
 * Fábrica do cache + materialized view do relatório admin.
 *
 * @param {{ pool: import('pg').Pool, Q: object }} deps
 */
function createRelatorio({ pool, Q }) {
  // ─── Cache do relatório admin ─────────────────────────────
  let relatorioCache = null;
  let relatorioCacheAt = 0;
  const relatorioCacheRef = {
    get value() {
      return relatorioCache;
    },
    set value(nextValue) {
      relatorioCache = nextValue;
    },
    get at() {
      return relatorioCacheAt;
    },
    set at(nextValue) {
      relatorioCacheAt = nextValue;
    },
    ttl: RELATORIO_TTL,
  };

  function invalidarRelatorioCache() {
    relatorioCache = null;
    relatorioCacheAt = 0;
  }

  // ─── Materialized View do relatório admin ─────────────────
  let mvRelatorioChecked = false;
  let mvRelatorioExists = false;
  let mvRelatorioHealthy = true;
  let mvRefreshInFlight = null;

  // True entre uma escrita e a conclusão do REFRESH assíncrono da MV.
  // Enquanto sujo, as leituras usam o fallback direto nas tabelas (sempre atual),
  // evitando que o admin veja a MV desatualizada logo após uma ação.
  let relatorioDirty = false;

  async function checkMvRelatorioExists(force = false) {
    if (mvRelatorioChecked && !force) return mvRelatorioExists;

    try {
      const result = await pool.query(`
        SELECT 1
        FROM pg_matviews
        WHERE schemaname = 'public'
          AND matviewname = 'mv_relatorio'
        LIMIT 1
      `);

      mvRelatorioExists = result.rows.length > 0;
      mvRelatorioChecked = true;
      return mvRelatorioExists;
    } catch (err) {
      mvRelatorioExists = false;
      mvRelatorioChecked = true;
      mvRelatorioHealthy = false;
      console.warn('⚠️ Não foi possível verificar a materialized view mv_relatorio:', err.message);
      return false;
    }
  }

  async function refreshMvRelatorio() {
    const exists = await checkMvRelatorioExists();
    if (!exists) return false;

    if (mvRefreshInFlight) return mvRefreshInFlight;

    mvRefreshInFlight = (async () => {
      try {
        await pool.query('REFRESH MATERIALIZED VIEW CONCURRENTLY mv_relatorio');
        mvRelatorioHealthy = true;
        return true;
      } catch (err) {
        try {
          await pool.query('REFRESH MATERIALIZED VIEW mv_relatorio');
          mvRelatorioHealthy = true;
          return true;
        } catch (fallbackErr) {
          mvRelatorioHealthy = false;
          console.warn('⚠️ Não foi possível atualizar mv_relatorio:', fallbackErr.message);
          return false;
        }
      } finally {
        mvRefreshInFlight = null;
      }
    })();

    return mvRefreshInFlight;
  }

  let refreshTimer = null;

  function invalidateAndRefreshRelatorio() {
    // Invalida o cache de forma síncrona e marca o relatório como sujo.
    invalidarRelatorioCache();
    relatorioDirty = true;

    // Dispara o REFRESH da materialized view com debounce de 2 segundos.
    if (refreshTimer) clearTimeout(refreshTimer);
    
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      Promise.resolve()
        .then(refreshMvRelatorio)
        .then(refreshed => {
          if (refreshed) relatorioDirty = false;
          else mvRelatorioHealthy = false;
        })
        .catch(err => {
          mvRelatorioHealthy = false;
          console.warn('⚠️ Refresh assíncrono da mv_relatorio falhou:', err.message);
        });
    }, 2500);
  }

  async function getAdminRelatorioRows() {
    const exists = await checkMvRelatorioExists();

    // Só usa a MV quando ela existe, está saudável e NÃO há escrita recente pendente de
    // REFRESH (relatorioDirty). Caso contrário, lê direto das tabelas — fonte sempre atual.
    if (exists && mvRelatorioHealthy && !relatorioDirty) {
      try {
        const result = await pool.query(Q.ADMIN_RELATORIO_MV);
        return result.rows;
      } catch (err) {
        console.warn('⚠️ Falha ao consultar mv_relatorio, usando fallback:', err.message);
        mvRelatorioHealthy = false;
      }
    }

    const fallback = await pool.query(Q.ADMIN_RELATORIO_FALLBACK);
    return fallback.rows;
  }

  /**
   * Zera o saldo de todos os usuários elegíveis (total_gasto > 0) numa única
   * instrução INSERT...SELECT — o filtro roda no Postgres, não em memória, e por
   * ser uma única statement é atômico (sem a race condition de ler o relatório
   * numa query e inserir em outra). Espelha a mesma escolha MV/fallback de
   * `getAdminRelatorioRows`.
   *
   * @returns {Promise<number[]>} ids dos usuários que tiveram o saldo zerado
   */
  async function zerarTodosElegiveis() {
    const exists = await checkMvRelatorioExists();

    if (exists && mvRelatorioHealthy && !relatorioDirty) {
      try {
        const result = await pool.query(Q.ZERAR_TODOS_MV);
        return result.rows.map(r => r.id_usuario);
      } catch (err) {
        console.warn('⚠️ Falha ao zerar via mv_relatorio, usando fallback:', err.message);
        mvRelatorioHealthy = false;
      }
    }

    const fallback = await pool.query(Q.ZERAR_TODOS_FALLBACK);
    return fallback.rows.map(r => r.id_usuario);
  }

  return {
    relatorioCacheRef,
    invalidarRelatorioCache,
    checkMvRelatorioExists,
    invalidateAndRefreshRelatorio,
    getAdminRelatorioRows,
    zerarTodosElegiveis,
  };
}

module.exports = { createRelatorio };
