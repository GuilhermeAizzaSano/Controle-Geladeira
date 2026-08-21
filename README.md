# Controle de Geladeira Interno

Sistema web para controle de consumo de bebidas em ambiente interno (escritório, empresa). Usuários registram suas compras via código de acesso de 6 dígitos e acompanham seu histórico de consumo. Administradores gerenciam usuários, produtos e visualizam relatórios consolidados.

## Funcionalidades

- Login de usuário por código de acesso de 6 dígitos (sem cadastro de senha tradicional)
- Login de administrador por senha própria, separada do código de acesso do usuário
- Registro de consumo de bebidas/produtos pelo próprio usuário, com escolha de quantidade
- Favoritar produtos na loja: itens favoritados ficam destacados em seção própria, no topo
- Histórico paginado de compras com total gasto
- Painel administrativo completo:
  - Relatório geral de consumo por usuário
  - Detalhes individuais de consumo
  - Gerenciamento de usuários (criar, editar, inativar, excluir)
  - Gerenciamento de produtos (criar, editar, inativar, excluir)
  - Zerar saldo individual ou de todos os usuários
  - Ocultar registros de consumo específicos
- Rate limiting no login e nas rotas administrativas
- Suporte a Materialized View PostgreSQL para relatórios otimizados
- Headers de segurança (CSP, X-Frame-Options, Referrer-Policy, etc.)
- Sessões persistidas no PostgreSQL (cookie HttpOnly + CSRF via double-submit), com TTL de 15 minutos e extensão por atividade

## Tecnologias

- **Backend:** Node.js + Express 5
- **Banco de dados:** PostgreSQL
- **Frontend:** HTML/CSS/JS puro (sem framework), organizado em ES Modules nativos (sem bundler)

## Pré-requisitos

- Node.js 18+
- PostgreSQL 13+

## Instalação

```bash
git clone https://github.com/GuilhermeAizzaSano/Controle-Geladeira-Interno.git
cd Controle-Geladeira-Interno
npm install
```

## Configuração

Crie um arquivo `.env` na raiz do projeto com base no `.env.example`:

```bash
cp .env.example .env
```

Edite o `.env` com suas credenciais:

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=bebidas_db
DB_USER=postgres
DB_PASSWORD=sua_senha_aqui
PORT=3000
HOST=0.0.0.0
```

### Variáveis opcionais

| Variável | Padrão | Descrição |
|---|---|---|
| `TRUST_PROXY` | `false` | Habilita `trust proxy` para uso atrás de reverse proxy |
| `CORS_ORIGIN` | desabilitado | Origens permitidas separadas por vírgula |
| `ENABLE_HSTS` | `false` | Envia header HSTS (requer HTTPS) |
| `REQUEST_TIMEOUT_MS` | `15000` | Timeout de requisição em ms |
| `ENABLE_ADMIN_RATE_LIMIT` | `false` | Habilita rate limiting nas rotas admin |
| `ADMIN_RATE_WINDOW_MS` | `60000` | Janela de tempo do rate limit admin em ms |
| `ADMIN_RATE_MAX_REQUESTS` | `120` | Máximo de requisições admin por janela |
| `LOGIN_RATE_WINDOW_MS` | `60000` | Janela de tempo do rate limit de login em ms |
| `LOGIN_RATE_MAX_ATTEMPTS` | `10` | Máximo de tentativas de login por janela |

## Banco de dados

Basta criar o banco — **as tabelas e os índices são criados automaticamente na
primeira execução** do servidor:

```sql
CREATE DATABASE bebidas_db;
```

Na inicialização, o servidor garante (de forma idempotente) todo o schema base:

- `usuarios` — id, nome, codigo_acesso, ativo, is_admin, admin_senha_hash
- `produtos` — id, nome, preco, ativo
- `consumo` — id, id_usuario, id_produto, data_hora
- `zeragens` — id, id_usuario, data_hora
- `consumos_ocultos` — id, id_consumo, id_usuario, id_admin, data_hora
- `favoritos` — id_usuario, id_produto, data_hora (chave composta id_usuario+id_produto)

`consumos_ocultos` é a tabela de soft-hide: um consumo nunca é apagado de
`consumo`; ocultá-lo apenas insere uma linha aqui (e restaurá-lo a remove). A
coluna `id_admin` registra qual administrador ocultou o lançamento (auditoria);
é nullable, então lançamentos ocultados antes dessa coluna existir ficam com
`id_admin` nulo.

Em bancos já existentes nada é sobrescrito: `CREATE TABLE IF NOT EXISTS` é no-op
e colunas eventualmente ausentes (`usuarios.ativo`, `usuarios.is_admin`,
`usuarios.admin_senha_hash`, `consumos_ocultos.id_admin`) são adicionadas
automaticamente.

### Índices

Os índices de performance abaixo também são criados automaticamente no boot
(`CREATE INDEX IF NOT EXISTS`); não é preciso rodá-los à mão:

```sql
CREATE INDEX idx_consumo_usuario_datahora   ON consumo (id_usuario, data_hora DESC);
CREATE INDEX idx_consumo_usuario_produto    ON consumo (id_usuario, id_produto);
CREATE INDEX idx_zeragens_usuario_datahora  ON zeragens (id_usuario, data_hora DESC);
CREATE INDEX idx_consumos_ocultos_usuario_data ON consumos_ocultos (id_usuario, data_hora DESC);
CREATE INDEX idx_produtos_ativos_nome       ON produtos (nome) WHERE ativo = TRUE;
CREATE INDEX idx_usuarios_codigo_ativo      ON usuarios (codigo_acesso) WHERE ativo = TRUE;
CREATE INDEX idx_favoritos_usuario_data     ON favoritos (id_usuario, data_hora DESC);
CREATE INDEX idx_favoritos_produto          ON favoritos (id_produto);
```

### Materialized View (opcional, recomendada para produção)

```sql
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
    LEFT JOIN consumos_ocultos co ON co.id_consumo = c.id
    LEFT JOIN ultimas_zeragens uz ON uz.id_usuario = c.id_usuario
    WHERE co.id_consumo IS NULL
      AND c.data_hora > COALESCE(uz.data_corte, '1970-01-01')
    GROUP BY c.id_usuario
  )
  SELECT u.id, u.nome, u.codigo_acesso,
         COALESCE(a.total_gasto, 0)::FLOAT AS total_gasto,
         COALESCE(a.total_itens, 0)::INT   AS total_itens
  FROM usuarios u
  LEFT JOIN agg a ON a.id_usuario = u.id
  WHERE u.is_admin IS NOT TRUE;

CREATE UNIQUE INDEX ON mv_relatorio (id);
```

> **Migração:** se você já tem essa materialized view criada de uma versão
> anterior (sem a coluna `consumo.preco` congelada), rode `DROP MATERIALIZED VIEW
> mv_relatorio;` e recrie com a definição acima. Não precisa fazer isso na hora —
> o servidor detecta a ausência da MV e volta a usar a query direta nas tabelas
> (já corrigida) até você recriá-la.

## Execução

```bash
node server.js
```

O servidor exibe no console o endereço local e o IP de rede para acesso na mesma rede.

## Testes

```bash
npm test
```

Testes unitários (Node.js test runner nativo, sem dependência de banco) cobrem
hashing/verificação da senha admin, parsing/validação de input e helpers de
cookie de sessão/CSRF.

## Notas de segurança

### Cookie de sessão HttpOnly + proteção CSRF

Após o login o servidor define dois cookies:

- `session` — HttpOnly, SameSite=Strict, Path=/. Nunca acessível via JavaScript. Enviado automaticamente pelo navegador em toda requisição pra mesma origem.
- `csrf` — SameSite=Strict, Path=/ (legível via JavaScript). Precisa ser lido e enviado como header `X-CSRF-Token` em toda requisição POST, PUT e DELETE.

O servidor compara o header `X-CSRF-Token` com o valor do cookie `csrf` usando `crypto.timingSafeEqual`, rejeitando divergências com HTTP 403.

Tokens de sessão nunca são armazenados em texto puro. Apenas o hash SHA-256 é guardado na tabela `sessions`.

### HTTP vs HTTPS

Por padrão a aplicação roda em HTTP puro (`COOKIE_SECURE=false`). Nesse modo os cookies `session` e `csrf` **não** carregam a flag `Secure` e são enviados sem criptografia. Isso só é aceitável em rede local/interna.

**Não rode esta aplicação em HTTP exposto publicamente.**

#### Habilitando HTTPS (desenvolvimento local)

1. Gere um certificado autoassinado:
   ```bash
   openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes \
     -subj "/CN=localhost"
   ```

2. Atualize `server.js` — substitua a chamada final `app.listen(...)`:
   ```js
   const https = require('https');
   const fs    = require('fs');
   https.createServer(
     { key: fs.readFileSync('key.pem'), cert: fs.readFileSync('cert.pem') },
     app
   ).listen(PORT, () => console.log(`HTTPS server on port ${PORT}`));
   ```

3. Defina as variáveis de ambiente no `.env`:
   ```
   COOKIE_SECURE=true
   TRUST_PROXY=true   # apenas se estiver atrás de nginx/caddy/etc.
   ```

### Variáveis de ambiente

| Variável                  | Obrigatória | Padrão                          | Descrição |
|---------------------------|-------------|----------------------------------|-------------|
| `DB_PASSWORD`             | Sim         | —                                | Senha do PostgreSQL. O servidor não inicia sem ela. |
| `ADMIN_DEFAULT_PASSWORD`  | Não         | Gerada automaticamente no boot (exibida no console) | Senha padrão para novas contas admin. Defina isso em produção. |
| `COOKIE_SECURE`           | Não         | `false`                          | Defina como `true` ao servir via HTTPS. |
| `TRUST_PROXY`             | Não         | `false`                          | Defina como `true` quando atrás de um reverse proxy que define `X-Forwarded-For`. |

## Estrutura do projeto

```
├── server.js                 # Entry point: monta o app, os routers e o boot
├── routes/
│   ├── public-routes.js      # Rotas de usuário (login, compras, histórico)
│   └── admin-routes.js       # Rotas administrativas
├── lib/
│   ├── config.js              # Config de ambiente (CORS, cookies, rate limit, timeouts)
│   ├── db.js                  # Criação do Pool do PostgreSQL
│   ├── queries.js              # Named queries (prepared statements)
│   ├── log.js                  # logError
│   ├── schema.js                # Verificação de índices e migrações lazy de schema
│   ├── auth.js                  # requireAuth/requireAdmin/requireCsrf, challenges de admin
│   ├── relatorio-cache.js        # Cache + materialized view do relatório admin
│   ├── rate-limit.js             # Rate limiting de login e de rotas admin
│   ├── security-headers.js       # CSP/headers de segurança e timeout de request
│   ├── admin-utils.js            # Utilitários para operações admin
│   ├── admin-password.js         # Hash/verificação da senha admin (scrypt)
│   ├── cookie-helpers.js         # Parsing/geração de cookies de sessão e CSRF
│   ├── session-store.js          # Sessões persistidas no PostgreSQL
│   └── parsers.js                # Helpers de validação/parsing de input
├── public/                   # Frontend estático
│   ├── index.html             # Casca HTML; telas/modais são injetados via partials.js
│   ├── style.css
│   ├── partials/               # HTML das telas e modais, carregado sob demanda
│   │   ├── navbar.html, toast.html, icon-sprite.html
│   │   ├── screen-login.html, screen-shop.html, screen-produtos.html,
│   │   │   screen-usuarios.html, screen-admin.html
│   │   └── modals/               # Um arquivo por modal (buy, produto, usuario, zerar, ...)
│   └── js/                     # ES Modules (import/export explícito, sem bundler)
│       ├── boot.js               # Bootstrap inicial: injeta os partials antes de app.js rodar
│       ├── partials.js           # Carregador de partials HTML (fetch + injeção no DOM)
│       ├── app.js                # Entry point: delegação de eventos, DOMContentLoaded
│       ├── state.js              # Estado global compartilhado (objeto `state` único)
│       ├── api.js                # apiCall() — fetch autenticado por cookie + timeout
│       ├── utils.js              # fmtBRL, fmtDate, escapeHtml, showToast, debounce, etc.
│       ├── confirm.js            # Modal de confirmação reutilizável
│       ├── pagination.js         # Componente de paginação + registro de callbacks
│       ├── modal-stack.js        # Correção de empilhamento de modais do Bootstrap
│       ├── shop.js               # Loja: produtos, favoritos, compra, histórico
│       ├── admin.js              # Painel admin: relatório, detalhes, zerar, ocultar/restaurar
│       ├── produtos.js           # CRUD de produtos (admin)
│       ├── usuarios.js           # CRUD de usuários (admin)
│       ├── alterar-codigo.js     # Modal de troca do código de acesso
│       ├── alterar-senha-admin.js # Modal de troca da senha de administrador
│       └── lib/                  # Funções puras, sem DOM, testadas isoladamente
│           ├── filter.js           # normalizeSearchText (busca sem acento/caixa)
│           ├── html.js             # Template tag html`` com escape automático
│           ├── region.js           # Registro/render de regiões do DOM por status
│           ├── sort.js             # sortByField (ordenação genérica)
│           └── view-state.js       # Cálculo de visibilidade/estado de UI (nav, abas, header)
├── scripts/                  # Scripts utilitários (seed de senha admin, checagem manual de sessão)
├── docs/                     # Roteiros de teste manual (smoke test)
├── test/                     # Testes unitários (node --test), incluindo os módulos de public/js/lib
└── .env.example              # Modelo de configuração de ambiente
```
