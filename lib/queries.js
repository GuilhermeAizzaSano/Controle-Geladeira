// ─── Named queries (prepared statements via pg) ───────────
const Q = {
  LOGIN: {
    name: 'login-usuario',
    text: 'SELECT id, nome, is_admin FROM usuarios WHERE codigo_acesso = $1 AND ativo = TRUE',
  },

  LAST_RESET: {
    name: 'last-reset',
    text: `SELECT COALESCE(MAX(data_hora), '1970-01-01'::timestamp) AS last_reset
           FROM zeragens WHERE id_usuario = $1`,
  },

  HISTORICO_DATA: {
    name: 'historico-data',
    text: `SELECT c.id, p.nome AS produto, COALESCE(c.preco, p.preco) AS preco, c.data_hora
           FROM consumo c
           JOIN produtos p ON p.id = c.id_produto
           LEFT JOIN consumos_ocultos co ON co.id_consumo = c.id
           WHERE c.id_usuario = $1
             AND co.id_consumo IS NULL
             AND c.data_hora > $2
           -- c.id desempata as N linhas de uma mesma compra, que compartilham
           -- o data_hora: sem isso, LIMIT/OFFSET não é determinístico.
           ORDER BY c.data_hora DESC, c.id DESC
           LIMIT $3 OFFSET $4`,
  },

  HISTORICO_STATS: {
    name: 'historico-stats',
    text: `SELECT COUNT(*)::INT AS total_count,
                  COALESCE(SUM(COALESCE(c.preco, p.preco)), 0)::FLOAT AS total_valor
           FROM consumo c
           JOIN produtos p ON p.id = c.id_produto
           LEFT JOIN consumos_ocultos co ON co.id_consumo = c.id
           WHERE c.id_usuario = $1
             AND co.id_consumo IS NULL
             AND c.data_hora > $2`,
  },

  DETALHES_DATA: {
    name: 'detalhes-data',
    text: `SELECT c.id, p.nome AS produto, COALESCE(c.preco, p.preco) AS preco, c.data_hora
           FROM consumo c
           JOIN produtos p ON p.id = c.id_produto
           LEFT JOIN consumos_ocultos co ON co.id_consumo = c.id
           WHERE c.id_usuario = $1
             AND co.id_consumo IS NULL
             AND c.data_hora > $2
           -- c.id desempata as N linhas de uma mesma compra, que compartilham
           -- o data_hora: sem isso, LIMIT/OFFSET não é determinístico.
           ORDER BY c.data_hora DESC, c.id DESC
           LIMIT $3 OFFSET $4`,
  },

  DETALHES_STATS: {
    name: 'detalhes-stats',
    text: `SELECT COUNT(*)::INT AS total_itens,
                  COALESCE(SUM(COALESCE(c.preco, p.preco)), 0)::FLOAT AS total_gasto
           FROM consumo c
           JOIN produtos p ON p.id = c.id_produto
           LEFT JOIN consumos_ocultos co ON co.id_consumo = c.id
           WHERE c.id_usuario = $1
             AND co.id_consumo IS NULL
             AND c.data_hora > $2`,
  },

  DETALHES_FAV: {
    name: 'detalhes-fav',
    text: `SELECT p.nome AS produto, COUNT(*)::INT AS freq
           FROM consumo c
           JOIN produtos p ON p.id = c.id_produto
           LEFT JOIN consumos_ocultos co ON co.id_consumo = c.id
           WHERE c.id_usuario = $1
             AND co.id_consumo IS NULL
             AND c.data_hora > $2
           GROUP BY p.nome
           ORDER BY freq DESC
           LIMIT 1`,
  },

  OCULTOS_DATA: {
    name: 'ocultos-data',
    text: `SELECT c.id, p.nome AS produto, COALESCE(c.preco, p.preco) AS preco, c.data_hora,
                  co.data_hora AS ocultado_em, a.nome AS ocultado_por,
                  (co.id_consumo IS NOT NULL) AS oculto_manual
           FROM consumo c
           JOIN produtos p ON p.id = c.id_produto
           LEFT JOIN consumos_ocultos co ON co.id_consumo = c.id
           LEFT JOIN usuarios a ON a.id = co.id_admin
           WHERE c.id_usuario = $1
             AND (co.id_consumo IS NOT NULL OR c.data_hora <= $2)
           -- c.id desempata as N linhas de uma mesma compra, que compartilham
           -- o data_hora: sem isso, LIMIT/OFFSET não é determinístico.
           ORDER BY c.data_hora DESC, c.id DESC
           LIMIT $3 OFFSET $4`,
  },

  OCULTOS_COUNT: {
    name: 'ocultos-count',
    text: `SELECT COUNT(*)::INT AS total_count
           FROM consumo c
           LEFT JOIN consumos_ocultos co ON co.id_consumo = c.id
           WHERE c.id_usuario = $1
             AND (co.id_consumo IS NOT NULL OR c.data_hora <= $2)`,
  },

  PRODUTOS_ATIVOS_FAVORITOS: {
    name: 'produtos-ativos-favoritos',
    text: `
      SELECT p.id, p.nome, p.preco,
             (f.id_produto IS NOT NULL) AS favorito
        FROM produtos p
        LEFT JOIN favoritos f
          ON f.id_produto = p.id
         AND f.id_usuario = $1
       WHERE p.ativo = TRUE
       -- Favoritos primeiro, do mais recém-favoritado ao mais antigo; o resto
       -- por nome. Sem favoritos, data_hora é sempre NULL e isto degenera em
       -- ORDER BY nome ASC — exatamente o comportamento anterior.
       ORDER BY f.data_hora DESC NULLS LAST, p.nome ASC
    `,
  },

  VERIFICAR_CODIGO: {
    name: 'verificar-codigo',
    text: 'SELECT id FROM usuarios WHERE id = $1 AND codigo_acesso = $2',
  },

  ADMIN_RELATORIO_FALLBACK: {
    name: 'admin-relatorio-fallback',
    text: `
      WITH ultimas_zeragens AS (
        SELECT id_usuario, MAX(data_hora) AS data_corte
        FROM zeragens
        GROUP BY id_usuario
      ),
      agg_consumos AS (
        SELECT
          c.id_usuario,
          SUM(COALESCE(c.preco, p.preco)) AS total_gasto,
          COUNT(c.id)  AS total_itens
        FROM consumo c
        JOIN produtos p
          ON p.id = c.id_produto
        LEFT JOIN consumos_ocultos co
          ON co.id_consumo = c.id
        LEFT JOIN ultimas_zeragens uz
          ON uz.id_usuario = c.id_usuario
        WHERE co.id_consumo IS NULL
          AND c.data_hora > COALESCE(uz.data_corte, '1970-01-01'::timestamp)
        GROUP BY c.id_usuario
      )
      SELECT
        u.id,
        u.nome,
        u.codigo_acesso,
        COALESCE(a.total_gasto, 0)::FLOAT AS total_gasto,
        COALESCE(a.total_itens, 0)::INT   AS total_itens
      FROM usuarios u
      LEFT JOIN agg_consumos a
        ON a.id_usuario = u.id
      WHERE u.is_admin IS NOT TRUE
      ORDER BY total_gasto DESC
    `,
  },

  ADMIN_RELATORIO_MV: {
    name: 'admin-relatorio-mv',
    text: `
      SELECT id, nome, codigo_acesso, total_gasto, total_itens
      FROM mv_relatorio
      ORDER BY total_gasto DESC
    `,
  },

  // Zera o saldo de todos os usuários elegíveis (total_gasto > 0) numa única
  // instrução: o filtro roda no Postgres (não traz a tabela inteira pro Node) e,
  // por ser um único INSERT...SELECT, é atômico — sem a race condition de ler o
  // relatório numa consulta e inserir em outra.
  ZERAR_TODOS_MV: {
    name: 'zerar-todos-mv',
    text: `
      INSERT INTO zeragens (id_usuario)
      SELECT id FROM mv_relatorio WHERE total_gasto > 0
      RETURNING id_usuario
    `,
  },

  ZERAR_TODOS_FALLBACK: {
    name: 'zerar-todos-fallback',
    text: `
      WITH ultimas_zeragens AS (
        SELECT id_usuario, MAX(data_hora) AS data_corte
        FROM zeragens
        GROUP BY id_usuario
      ),
      agg_consumos AS (
        SELECT
          c.id_usuario,
          SUM(COALESCE(c.preco, p.preco)) AS total_gasto
        FROM consumo c
        JOIN produtos p
          ON p.id = c.id_produto
        LEFT JOIN consumos_ocultos co
          ON co.id_consumo = c.id
        LEFT JOIN ultimas_zeragens uz
          ON uz.id_usuario = c.id_usuario
        WHERE co.id_consumo IS NULL
          AND c.data_hora > COALESCE(uz.data_corte, '1970-01-01'::timestamp)
        GROUP BY c.id_usuario
      )
      INSERT INTO zeragens (id_usuario)
      SELECT u.id
      FROM usuarios u
      JOIN agg_consumos a ON a.id_usuario = u.id
      WHERE u.is_admin IS NOT TRUE
        AND a.total_gasto > 0
      RETURNING id_usuario
    `,
  },
};

module.exports = { Q };
