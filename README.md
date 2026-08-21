# Controle de Geladeira

Sistema web para controle e gestão de consumo de bebidas/produtos em ambiente interno (escritório, empresa). Os usuários registram seus consumos via código de acesso individual de 6 dígitos e acompanham o histórico de compras em tempo real. Administradores possuem painel dedicado para gestão de produtos, usuários e relatórios consolidados.

## 🚀 Funcionalidades

- **Autenticação por Código:** Login rápido de usuários por código de acesso de 6 dígitos (sem necessidade de cadastro tradicional).
- **Acesso Administrativo:** Autenticação separada para administradores com senha criptografada.
- **Loja e Registro de Consumo:** Seleção ágil de itens e quantidades pelos próprios usuários.
- **Favoritos:** Destaque dos produtos favoritos do usuário no topo da tela inicial.
- **Histórico Individual:** Extrato paginado de compras com total acumulado.
- **Painel Administrativo Completo:**
  - Relatório geral consolidado de consumo e saldo por usuário.
  - Extrato detalhado com histórico de itens consumidos.
  - CRUD completo de usuários (cadastro, edição, inativação e exclusão).
  - CRUD completo de produtos (cadastro, alteração de preço, inativação e exclusão).
  - Zeragem de saldo (individual ou coletiva).
  - Soft-hide de lançamentos de consumo (ocultar/restaurar registros com log de auditoria).
- **Segurança & Performance:**
  - Rate limiting contra força bruta em logins e rotas de administração.
  - Sessões persistidas em banco de dados PostgreSQL com tokens seguros.
  - Cookies `HttpOnly` com proteção CSRF via Double-Submit Cookie.
  - Headers HTTP de segurança (CSP, X-Frame-Options, Referrer-Policy, etc.).
  - Suporte opcional a Materialized View para aceleração de relatórios.

---

## 🛠️ Tecnologias

- **Backend:** Node.js (>= 18) + Express 5
- **Banco de Dados:** PostgreSQL (>= 13)
- **Frontend:** HTML5, CSS3 e JavaScript Moderno (ES Modules nativos, sem bundlers/frameworks pesados)

---

## 📋 Pré-requisitos

- [Node.js](https://nodejs.org/) (versão 18 ou superior)
- [PostgreSQL](https://www.postgresql.org/) (versão 13 ou superior)

---

## ⚙️ Instalação e Configuração

### 1. Clonar o repositório
```bash
git clone https://github.com/GuilhermeAizzaSano/Controle-Geladeira.git
cd Controle-Geladeira
```

### 2. Instalar as dependências
```bash
npm install
```

### 3. Configurar variáveis de ambiente
Crie o arquivo `.env` a partir do modelo de exemplo:

```bash
cp .env.example .env
```

Edite o arquivo `.env` com os dados de conexão do seu banco PostgreSQL:

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=bebidas_db
DB_USER=postgres
DB_PASSWORD=sua_senha_aqui
PORT=3000
HOST=0.0.0.0
```

#### Variáveis Opcionais

| Variável | Padrão | Descrição |
|---|---|---|
| `ADMIN_DEFAULT_PASSWORD` | Automática | Senha padrão gerada no primeiro boot para novos administradores |
| `COOKIE_SECURE` | `false` | Defina como `true` caso utilize HTTPS |
| `TRUST_PROXY` | `false` | Habilita `trust proxy` para execução atrás de reverse proxy (Nginx, Caddy, Cloudflare) |
| `CORS_ORIGIN` | Desabilitado | Lista de origens permitidas separadas por vírgula |
| `ENABLE_HSTS` | `false` | Envia header HSTS (requer HTTPS ativo) |
| `REQUEST_TIMEOUT_MS` | `15000` | Tempo limite para requisições (em milissegundos) |
| `ENABLE_ADMIN_RATE_LIMIT` | `false` | Habilita rate limiting específico para rotas administrativas |
| `ADMIN_RATE_WINDOW_MS` | `60000` | Janela de tempo do rate limit administrativo (ms) |
| `ADMIN_RATE_MAX_REQUESTS` | `120` | Limite de requisições admin por janela |
| `LOGIN_RATE_WINDOW_MS` | `60000` | Janela de tempo do rate limit de login (ms) |
| `LOGIN_RATE_MAX_ATTEMPTS` | `10` | Máximo de tentativas de login por janela |

---

## 🗄️ Banco de Dados

Basta criar a base de dados no PostgreSQL:

```sql
CREATE DATABASE bebidas_db;
```

> **Automação:** Todas as tabelas, índices e migrações de schema são executados e validados **automaticamente** no primeiro boot da aplicação, de forma idempotente.

### Tabelas Principais:
- `usuarios`: Cadastro de usuários, permissões e hash de senha administrativa.
- `produtos`: Itens disponíveis e histórico de preços.
- `consumo`: Registro das compras efetuadas.
- `zeragens`: Marcações de fechamento/quitação de saldo por usuário.
- `consumos_ocultos`: Soft-hide de lançamentos com auditoria do administrador.
- `favoritos`: Produtos destacados por usuário.
- `sessions`: Controle de sessões ativas persistidas.

### Materialized View (Opcional - Recomendado para Grande Volume)

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

---

## ▶️ Executando a Aplicação

### Modo Produção / Execução Normal
```bash
npm start
```
*(ou `node server.js`)*

O servidor exibirá no terminal a porta em execução e os endereços locais e da rede interna (IP) para acesso de outros dispositivos.

### Executando Testes Unitários
```bash
npm test
```
Utiliza o test runner nativo do Node.js (`node:test`), validando rotinas de criptografia, helpers de sessão, CSRF, ordenações e regras de visão do frontend.

---

## 🔒 Notas de Segurança

- **Cookies HttpOnly + Proteção CSRF:** Autenticação baseada em sessão segura (`SameSite=Strict`, `HttpOnly`). Mutação de dados (`POST`, `PUT`, `DELETE`) exige token CSRF válido enviado no header `X-CSRF-Token`.
- **Prevenção de Timing Attacks:** Validação de tokens com `crypto.timingSafeEqual`.
- **Ambiente de Produção:** Caso exponha a aplicação fora de rede local protegida, habilite HTTPS e configure `COOKIE_SECURE=true`.

---

## 📁 Estrutura do Projeto

```text
├── server.js                 # Inicialização do servidor Express, rotas e boot
├── routes/
│   ├── public-routes.js      # Rotas de usuário (login, compras, histórico)
│   └── admin-routes.js       # Rotas do painel administrativo
├── lib/
│   ├── config.js             # Carregamento e validação das variáveis de ambiente
│   ├── db.js                 # Conexão e pool do PostgreSQL
│   ├── queries.js            # Prepared statements e consultas SQL
│   ├── schema.js             # Criação e atualização automática das tabelas/índices
│   ├── auth.js               # Middlewares de autenticação, admin e validação CSRF
│   ├── admin-password.js     # Hashing e verificação de senha admin (scrypt)
│   ├── session-store.js      # Gerenciamento de sessões persistidas no banco
│   ├── security-headers.js   # Headers CSP, CORS e controle de timeout
│   ├── rate-limit.js         # Controle de taxa de requisições por IP
│   └── relatorio-cache.js    # Gerenciamento do cache dos relatórios
├── public/                   # Frontend estático (HTML/CSS/JS)
│   ├── index.html            # Estrutura base da interface
│   ├── style.css             # Folha de estilos
│   ├── partials/             # Componentes de telas e modais carregados dinamicamente
│   └── js/                   # Módulos JavaScript (ES Modules nativos)
├── scripts/                  # Scripts auxiliares de manutenção e banco
├── test/                     # Testes unitários automatizados
└── .env.example              # Modelo de configuração de variáveis de ambiente
```

