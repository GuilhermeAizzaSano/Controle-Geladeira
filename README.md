# Controle de Geladeira

Sistema web para controle e gestão de consumo de bebidas/produtos em ambiente interno (escritório, empresa). Os usuários registram seus consumos via código de acesso individual de 6 dígitos e acompanham o histórico de compras em tempo real. Administradores possuem painel dedicado para gestão de produtos, usuários e relatórios consolidados.

## 🚀 Funcionalidades

- **Autenticação por Código:** Login rápido de usuários por código de acesso de 6 dígitos (sem necessidade de cadastro tradicional).
- **Acesso Administrativo:** Autenticação separada para administradores com senha criptografada.
- **Loja e Registro de Consumo:** Seleção ágil de itens e quantidades pelos próprios usuários.
- **Favoritos:** Destaque dos produtos favoritos do usuário no topo da tela inicial.
- **Histórico Individual:** Extrato paginado de compras com total acumulado e congelamento de preço histórico no momento da compra.
- **Painel Administrativo Completo:**
  - Relatório geral consolidado de consumo e saldo por usuário com cache otimizado.
  - Extrato detalhado com histórico de itens consumidos e auditoria.
  - CRUD completo de usuários (cadastro, edição, inativação e exclusão).
  - CRUD completo de produtos (cadastro, alteração de preço, inativação e exclusão).
  - Zeragem de saldo desacoplada: individual (por usuário) ou em massa (atômica no PostgreSQL apenas para saldos devedores).
  - Soft-hide de lançamentos de consumo (ocultar/restaurar registros com coluna booleana indexada e log de auditoria).
- **Segurança & Performance:**
  - Rate limiting contra força bruta em logins e rotas de administração.
  - Sessões persistidas em banco de dados PostgreSQL com tokens seguros.
  - Cookies `HttpOnly` com proteção CSRF via Double-Submit Cookie.
  - Headers HTTP de segurança (CSP, X-Frame-Options, Referrer-Policy, etc.).
  - Cache HTTP estático com ETag para componentes e scripts.
  - Materialized View com criação automática e atualização com debounce inteligente.
- **UI/UX Moderna:**
  - Transições suaves de tela via View Transitions API nativa.
  - Paleta de cores corporativa integrada e clean.
  - Scrollbars customizadas para modo escuro e indicadores acessíveis de `:focus-visible`.

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

> **Automação Completa:** Todas as tabelas, colunas, índices, migrações de schema e a **Materialized View (`mv_relatorio`)** são criados e validados **automaticamente e de forma idempotente** na inicialização do servidor.

### Tabelas Principais:
- `usuarios`: Cadastro de usuários, permissões e hash de senha administrativa.
- `produtos`: Itens disponíveis, status e histórico de preços.
- `consumo`: Registro das compras efetuadas, com congelamento de preço histórico (`preco`) e coluna booleana indexada de visibilidade (`oculto`).
- `zeragens`: Marcações de fechamento/quitação de saldo por usuário.
- `consumos_ocultos`: Log de auditoria dos registros de consumo ocultados pelo administrador.
- `favoritos`: Produtos destacados por usuário com ordenação rápida.
- `sessions`: Controle de sessões ativas persistidas no banco.

### Estratégia de Performance (Materialized View & Cache)
- O relatório geral utiliza a Materialized View `mv_relatorio` com índice único para aceleração de leituras de agregação (`SUM` / `COUNT`).
- A atualização da view utiliza `REFRESH MATERIALIZED VIEW CONCURRENTLY` com uma camada de **debounce assíncrono** de 2.5 segundos, evitando múltiplos recálculos pesados durante picos de compras concorrentes.
- Durante a janela de atualização, a aplicação lê automaticamente do *fallback* direto nas tabelas, garantindo consistência e dados sempre atualizados para o administrador.

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
│   └── admin-routes.js       # Rotas do painel administrativo (relatórios, produtos, usuários, zeragem)
├── lib/
│   ├── config.js             # Carregamento e validação das variáveis de ambiente
│   ├── db.js                 # Conexão e pool do PostgreSQL
│   ├── queries.js            # Prepared statements e consultas SQL otimizadas
│   ├── schema.js             # Criação e atualização automática das tabelas, índices e view
│   ├── auth.js               # Middlewares de autenticação, admin e validação CSRF
│   ├── admin-password.js     # Hashing e verificação de senha admin (scrypt)
│   ├── session-store.js      # Gerenciamento de sessões persistidas no banco
│   ├── security-headers.js   # Headers CSP, CORS e controle de timeout
│   ├── rate-limit.js         # Controle de taxa de requisições por IP
│   └── relatorio-cache.js    # Gerenciamento de cache e debounce da Materialized View
├── public/                   # Frontend estático (HTML/CSS/JS)
│   ├── index.html            # Estrutura base da interface
│   ├── style.css             # Folha de estilos, tokens de cor e scrollbars
│   ├── partials/             # Componentes de telas e modais carregados dinamicamente
│   └── js/                   # Módulos JavaScript (ES Modules nativos)
├── scripts/                  # Scripts auxiliares de manutenção e banco
├── test/                     # Testes unitários automatizados (node:test)
└── .env.example              # Modelo de configuração de variáveis de ambiente
```
