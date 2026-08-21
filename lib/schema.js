// ─── Verificação de índices na inicialização ──────────────
const REQUIRED_INDEXES = [
  { name: 'idx_consumo_usuario_datahora', table: 'consumo', rotas: '/historico, /admin/detalhes' },
  { name: 'idx_consumo_usuario_produto', table: 'consumo', rotas: '/admin/relatorio' },
  { name: 'idx_zeragens_usuario_datahora', table: 'zeragens', rotas: '/historico, /admin/detalhes' },
  { name: 'idx_consumos_ocultos_usuario', table: 'consumos_ocultos', rotas: '/admin/ocultos' },
  { name: 'idx_produtos_ativos_nome', table: 'produtos', rotas: '/produtos' },
  { name: 'idx_usuarios_codigo_ativo', table: 'usuarios', rotas: '/login' },
  { name: 'idx_favoritos_usuario_data', table: 'favoritos', rotas: '/produtos' },
  { name: 'idx_favoritos_produto', table: 'favoritos', rotas: 'DELETE /admin/produtos/:id (cascade)' },
];

/**
 * Fábrica dos helpers de schema/migração lazy. Todos dependem do `pool` e,
 * para logar falhas de forma consistente, de `logError`.
 *
 * @param {{ pool: import('pg').Pool, logError: Function }} deps
 */
function createSchema({ pool, logError }) {
  const schemaColumnCache = new Map();
  let consumosOcultosTableReady = null;
  let favoritosTableReady = null;

  async function checkRequiredIndexes() {
    try {
      const result = await pool.query(
        `SELECT indexname FROM pg_indexes
         WHERE schemaname = 'public'
           AND indexname = ANY($1)`,
        [REQUIRED_INDEXES.map(i => i.name)]
      );

      const found = new Set(result.rows.map(r => r.indexname));
      const missing = REQUIRED_INDEXES.filter(i => !found.has(i.name));

      if (missing.length === 0) {
        console.log('✅ Todos os índices de performance estão presentes.');
        return;
      }

      console.warn('⚠️  Índices ausentes — execute indexes.sql no pgAdmin:');
      missing.forEach(i =>
        console.warn(`   • ${i.name} (tabela: ${i.table}) — afeta: ${i.rotas}`)
      );
    } catch (err) {
      console.warn('⚠️  Não foi possível verificar os índices:', err.message);
    }
  }

  async function tableHasColumn(tableName, columnName) {
    const cacheKey = `${tableName}.${columnName}`;
    if (schemaColumnCache.has(cacheKey)) return schemaColumnCache.get(cacheKey);

    const result = await pool.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name   = $1
         AND column_name  = $2
       LIMIT 1`,
      [tableName, columnName]
    );

    const exists = result.rows.length > 0;
    schemaColumnCache.set(cacheKey, exists);
    return exists;
  }

  async function ensureUsuariosAtivoColumn() {
    if (await tableHasColumn('usuarios', 'ativo')) return;
    await pool.query('ALTER TABLE usuarios ADD COLUMN ativo BOOLEAN NOT NULL DEFAULT TRUE');
    schemaColumnCache.set('usuarios.ativo', true);
  }

  async function ensureUsuariosIsAdminColumn() {
    if (await tableHasColumn('usuarios', 'is_admin')) return;
    await pool.query('ALTER TABLE usuarios ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT FALSE');
    schemaColumnCache.set('usuarios.is_admin', true);
  }

  async function ensureUsuariosAdminSenhaColumn() {
    if (await tableHasColumn('usuarios', 'admin_senha_hash')) return;
    await pool.query('ALTER TABLE usuarios ADD COLUMN admin_senha_hash TEXT');
    schemaColumnCache.set('usuarios.admin_senha_hash', true);
  }

  // Congela o preço no momento da compra: sem esta coluna, histórico e relatório
  // liam sempre produtos.preco (o preço ATUAL), então editar o preço de um
  // produto reescrevia retroativamente todas as compras passadas dele. Roda uma
  // única vez (a checagem por coluna acima já garante isso): ao adicionar a
  // coluna, faz o backfill imediato das compras existentes com o preço atual do
  // produto — não fica NULL esperando um COALESCE pra sempre.
  
  async function ensureConsumoOcultoColumn() {
    if (await tableHasColumn('consumo', 'oculto')) return;
    await pool.query('ALTER TABLE consumo ADD COLUMN oculto BOOLEAN NOT NULL DEFAULT FALSE');
    // Backfill
    await pool.query(`
      UPDATE consumo SET oculto = TRUE
      WHERE id IN (SELECT id_consumo FROM consumos_ocultos)
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_consumo_oculto ON consumo (oculto) WHERE oculto = FALSE');
    schemaColumnCache.set('consumo.oculto', true);
  }

  async function ensureConsumoPrecoColumn() {
    if (await tableHasColumn('consumo', 'preco')) return;
    await pool.query('ALTER TABLE consumo ADD COLUMN preco NUMERIC(10,2)');
    await pool.query(`
      UPDATE consumo c SET preco = p.preco
      FROM produtos p
      WHERE p.id = c.id_produto AND c.preco IS NULL
    `);
    schemaColumnCache.set('consumo.preco', true);
  }

  // Não dá para adicionar UNIQUE num CREATE TABLE IF NOT EXISTS já existente, então
  // o índice é criado à parte, de forma lazy. Se já houver códigos duplicados no
  // banco (situação pré-existente), a criação falha com erro de unicidade — nesse
  // caso avisamos claramente no log e seguimos o boot sem derrubar o processo.
  async function ensureUsuariosCodigoAcessoUnique() {
    try {
      // Banco novo já nasce com UNIQUE inline no CREATE TABLE (índice
      // usuarios_codigo_acesso_key). Criar um segundo índice sobre a mesma coluna
      // só duplicaria o custo de escrita, então só criamos se ainda não houver
      // nenhum índice único cobrindo codigo_acesso (caso de banco legado).
      const existente = await pool.query(
        `SELECT 1 FROM pg_indexes
          WHERE tablename = 'usuarios'
            AND indexdef ILIKE '%UNIQUE%'
            AND indexdef ILIKE '%(codigo_acesso)%'
          LIMIT 1`
      );
      if (existente.rows.length) return;

      await pool.query(
        'CREATE UNIQUE INDEX IF NOT EXISTS usuarios_codigo_acesso_uniq ON usuarios (codigo_acesso)'
      );
    } catch (err) {
      console.warn(
        '⚠️  Não foi possível criar o índice único usuarios_codigo_acesso_uniq ' +
        '(provavelmente há códigos de acesso duplicados). Corrija os duplicados e ' +
        'reinicie o servidor. Detalhe:', err.message
      );
      try {
        const dup = await pool.query(
          'SELECT codigo_acesso, COUNT(*) FROM usuarios GROUP BY codigo_acesso HAVING COUNT(*) > 1'
        );
        if (dup.rows.length) {
          console.warn('⚠️  Códigos de acesso duplicados encontrados:', dup.rows);
        }
      } catch (dupErr) {
        logError('ensureUsuariosCodigoAcessoUnique (diagnóstico de duplicatas)', dupErr);
      }
    }
  }

  // Auditoria: registra qual admin ocultou o consumo. Coluna nullable para não
  // quebrar linhas antigas (id_admin permanece NULL nelas). Migração lazy no
  // padrão das demais `ensure*Column`.
  async function ensureConsumosOcultosAdminColumn() {
    if (await tableHasColumn('consumos_ocultos', 'id_admin')) return;
    await pool.query(
      'ALTER TABLE consumos_ocultos ADD COLUMN id_admin INTEGER REFERENCES usuarios(id) ON DELETE SET NULL'
    );
    schemaColumnCache.set('consumos_ocultos.id_admin', true);
  }

  async function ensureConsumosOcultosTable() {
    if (consumosOcultosTableReady) return consumosOcultosTableReady;

    consumosOcultosTableReady = (async () => {
      try {
        await pool.query(`
          CREATE TABLE IF NOT EXISTS consumos_ocultos (
            id         SERIAL  PRIMARY KEY,
            id_consumo INTEGER NOT NULL UNIQUE REFERENCES consumo(id) ON DELETE CASCADE,
            id_usuario INTEGER NOT NULL REFERENCES usuarios(id)       ON DELETE CASCADE,
            id_admin   INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
            data_hora  TIMESTAMP NOT NULL DEFAULT NOW()
          )
        `);
        // Rede de segurança lazy: cobre o caso de a tabela já existir sem a coluna
        // (banco criado antes desta migração).
        await ensureConsumosOcultosAdminColumn();
      } catch (err) {
        consumosOcultosTableReady = null;
        throw err;
      }
    })();

    return consumosOcultosTableReady;
  }

  /**
   * Favoritos por usuário. Chave composta (id_usuario, id_produto): a própria PK
   * garante unicidade — o que habilita o INSERT idempotente com ON CONFLICT — e
   * já serve de índice para as buscas com prefixo id_usuario. Não há coluna
   * SERIAL porque a linha não é referenciada por ninguém.
   */
  async function ensureFavoritosTable() {
    if (favoritosTableReady) return favoritosTableReady;

    favoritosTableReady = (async () => {
      try {
        await pool.query(`
          CREATE TABLE IF NOT EXISTS favoritos (
            id_usuario INTEGER   NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
            id_produto INTEGER   NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
            data_hora  TIMESTAMP NOT NULL DEFAULT NOW(),
            PRIMARY KEY (id_usuario, id_produto)
          )
        `);
      } catch (err) {
        favoritosTableReady = null;
        throw err;
      }
    })();

    return favoritosTableReady;
  }

  /**
   * Garante todo o schema base na inicialização: tabelas, colunas e índices.
   *
   * É idempotente e seguro tanto em banco novo (cria tudo) quanto em banco já
   * existente (`IF NOT EXISTS` vira no-op e as colunas são adicionadas pelas
   * migrações lazy). Roda uma vez no boot — as funções `ensure*` lazy continuam
   * existindo como rede de segurança por requisição.
   */
  
  async function ensureMaterializedView() {
    const res = await pool.query(`
      SELECT 1 FROM pg_matviews WHERE schemaname = 'public' AND matviewname = 'mv_relatorio' LIMIT 1
    `);
    if (res.rows.length === 0) {
      await pool.query(`
        CREATE MATERIALIZED VIEW mv_relatorio AS
          WITH ultimas_zeragens AS (
            SELECT id_usuario, MAX(data_hora) AS data_corte
            FROM zeragens GROUP BY id_usuario
          ),
          agg AS (
            SELECT c.id_usuario,
                   SUM(COALESCE(c.preco, p.preco))  AS total_gasto,
                   COUNT(c.id)   AS total_itens
            FROM consumo c
            JOIN produtos p ON p.id = c.id_produto
            LEFT JOIN ultimas_zeragens uz ON uz.id_usuario = c.id_usuario
            WHERE c.oculto = FALSE
              AND c.data_hora > COALESCE(uz.data_corte, '1970-01-01')
            GROUP BY c.id_usuario
          )
          SELECT u.id, u.nome, u.codigo_acesso,
                 COALESCE(a.total_gasto, 0)::FLOAT AS total_gasto,
                 COALESCE(a.total_itens, 0)::INT   AS total_itens
          FROM usuarios u
          LEFT JOIN agg a ON a.id_usuario = u.id
          WHERE u.is_admin IS NOT TRUE;
      `);
      await pool.query('CREATE UNIQUE INDEX ON mv_relatorio (id);');
    }
  }

  async function ensureBaseSchema() {
    // 1) Tabelas base (ordem respeita as foreign keys).
    await pool.query(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id               SERIAL  PRIMARY KEY,
        nome             TEXT    NOT NULL,
        codigo_acesso    INTEGER NOT NULL UNIQUE,
        ativo            BOOLEAN NOT NULL DEFAULT TRUE,
        is_admin         BOOLEAN NOT NULL DEFAULT FALSE,
        admin_senha_hash TEXT
      );

      CREATE TABLE IF NOT EXISTS produtos (
        id     SERIAL        PRIMARY KEY,
        nome   TEXT          NOT NULL,
        preco  NUMERIC(10,2) NOT NULL DEFAULT 0,
        ativo  BOOLEAN       NOT NULL DEFAULT TRUE
      );

      CREATE TABLE IF NOT EXISTS consumo (
        id         SERIAL        PRIMARY KEY,
        id_usuario INTEGER       NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        id_produto INTEGER       NOT NULL REFERENCES produtos(id),
        preco      NUMERIC(10,2),
        data_hora  TIMESTAMP     NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS zeragens (
        id         SERIAL    PRIMARY KEY,
        id_usuario INTEGER   NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        data_hora  TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    // 2) Colunas que podem faltar em bancos antigos (também aquece o cache).
    await ensureUsuariosAtivoColumn();
    await ensureUsuariosIsAdminColumn();
    await ensureUsuariosAdminSenhaColumn();
    await ensureUsuariosCodigoAcessoUnique();
    await ensureConsumoPrecoColumn();
    await ensureConsumoOcultoColumn();

    // 3) Tabela de consumos ocultos (depende de consumo + usuarios).
    await ensureConsumosOcultosTable();
    await ensureConsumosOcultosAdminColumn();

    // 3b) Tabela de favoritos (depende de usuarios + produtos).
    await ensureFavoritosTable();

    // 3c) Materialized View
    await ensureMaterializedView();

    // 4) Índices de performance (mesma lista de REQUIRED_INDEXES).
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_consumo_usuario_datahora  ON consumo (id_usuario, data_hora DESC);
      CREATE INDEX IF NOT EXISTS idx_consumo_usuario_produto   ON consumo (id_usuario, id_produto);
      CREATE INDEX IF NOT EXISTS idx_zeragens_usuario_datahora ON zeragens (id_usuario, data_hora DESC);
      CREATE INDEX IF NOT EXISTS idx_consumos_ocultos_usuario ON consumos_ocultos (id_usuario, data_hora DESC);
      CREATE INDEX IF NOT EXISTS idx_produtos_ativos_nome      ON produtos (nome) WHERE ativo = TRUE;
      CREATE INDEX IF NOT EXISTS idx_usuarios_codigo_ativo     ON usuarios (codigo_acesso) WHERE ativo = TRUE;
      CREATE INDEX IF NOT EXISTS idx_favoritos_usuario_data    ON favoritos (id_usuario, data_hora DESC);
      CREATE INDEX IF NOT EXISTS idx_favoritos_produto         ON favoritos (id_produto);
    `);
  }

  /**
   * Tabela de sessões (usada por lib/session-store.js). Vive aqui — junto com o
   * resto do DDL do projeto — em vez de dentro do session store, que só consome
   * a tabela (criar/ler/atualizar/apagar linhas), não deveria ser dono do schema.
   */
  async function ensureSessionsSchema() {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash    TEXT        PRIMARY KEY,
        user_id       INT         NOT NULL,
        is_admin      BOOL        NOT NULL DEFAULT FALSE,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        expires_at    TIMESTAMPTZ NOT NULL,
        last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_sessions_user_id    ON sessions(user_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)`);
  }

  return {
    REQUIRED_INDEXES,
    checkRequiredIndexes,
    tableHasColumn,
    ensureUsuariosAtivoColumn,
    ensureUsuariosIsAdminColumn,
    ensureUsuariosAdminSenhaColumn,
    ensureUsuariosCodigoAcessoUnique,
    ensureConsumoPrecoColumn,
    ensureConsumoOcultoColumn,
    ensureMaterializedView,
    ensureConsumosOcultosTable,
    ensureConsumosOcultosAdminColumn,
    ensureFavoritosTable,
    ensureBaseSchema,
    ensureSessionsSchema,
  };
}

module.exports = { createSchema, REQUIRED_INDEXES };
