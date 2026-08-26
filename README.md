# 🥤 Controle de Geladeira / Bebidas

Sistema moderno, robusto e responsivo para gestão e controle de consumo de itens (bebidas, snacks e produtos), com painel administrativo integrado, relatórios agregados em tempo real, suporte a PWA mobile e arquitetura de alta performance com PostgreSQL.

---

## ✨ Funcionalidades Principais

- **Experiência do Usuário (Loja & Autoatendimento):**
  - Autenticação simplificada por código de acesso de 6 dígitos.
  - Catálogo de produtos com sistema de favoritos e ordenação dinâmica.
  - Compra rápida com seletor de quantidade (com validação e limites sincronizados dinamicamente).
  - Extrato detalhado em tempo real com histórico de compras e valor acumulado.
  - Alteração de código de acesso pelo próprio usuário logado.
  - Interface otimizada para dispositivos móveis (PWA com `manifest.json`, suporte a safe-area e prevenção de zoom acidental).
- **Painel Administrativo:**
  - Autenticação com verificação em duas etapas (desafio + senha forte com hash `scrypt`).
  - Relatório geral consolidado com extrato por usuário e cálculo automático de saldos.
  - Gestão de produtos (cadastro, alteração de preço, inativação e exclusão).
  - Gestão de usuários (cadastro, edição de código de acesso, inativação e exclusão).
  - Estorno e reativação de lançamentos de consumo com log de auditoria (`consumos_ocultos`).
  - Zeragem de saldo: individual por usuário ou em massa (atômica no PostgreSQL apenas para saldos devedores).
- **Segurança & Engenharia:**
  - Sessões seguras gerenciadas no PostgreSQL com cookies `HttpOnly`, `SameSite=Strict` e tokens SHA-256.
  - Proteção CSRF com *Double-Submit Cookie*, limpeza total no logout e validação segura contra *timing attacks* e caracteres multibyte (`Buffer.timingSafeEqual`).
  - Rate limiting em memória por IP para proteção contra força bruta.
  - Headers HTTP de segurança (CSP, X-Frame-Options, Referrer-Policy, HSTS, etc.).
  - Centralização de tratamento assíncrono de rotas via `asyncHandler`.
  - Logging estruturado em formato JSON para fácil agregação no PM2.
- **Performance & Banco de Dados:**
  - Operações livres de N+1 (consultas agregadas via CTEs e Materialized Views).
  - Inserções de compras em lote atômicas usando `generate_series`.
  - Materialized View (`mv_relatorio`) com atualização concorrente assíncrona (`REFRESH MATERIALIZED VIEW CONCURRENTLY`) e *dirty checking* para evitar *stale reads*.

---

## 🛠️ Tecnologias

- **Backend:** Node.js (>= 18) + Express 5
- **Banco de Dados:** PostgreSQL (>= 13)
- **Frontend:** HTML5, CSS3, JavaScript Moderno (ES Modules nativos sem bundlers/frameworks pesados)
- **Test Runner:** Node.js Test Runner nativo (`node:test` e `node:assert/strict`)

---

## 📋 Pré-requisitos

- [Node.js](https://nodejs.org/) (versão 18 ou superior)
- [PostgreSQL](https://www.postgresql.org/) (versão 13 ou superior)

---

## 🚀 Instalação e Configuração

### 1. Clonar o repositório
```bash
git clone https://github.com/GuilhermeAizzaSano/Controle-Geladeira.git
cd Controle-Geladeira
```

### 2. Instalar dependências
```bash
npm install
```

### 3. Configurar variáveis de ambiente
Crie o arquivo `.env` a partir do modelo:

```bash
cp .env.example .env
```

Edite o arquivo `.env` com as configurações do seu ambiente:

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
| `TRUST_PROXY` | `false` | Habilita `trust proxy` para execução atrás de reverse proxy (Nginx, Caddy, etc.) |
| `CORS_ORIGIN` | Desabilitado | Lista de origens permitidas separadas por vírgula |
| `ENABLE_HSTS` | `false` | Envia header HSTS (requer HTTPS ativo) |
| `REQUEST_TIMEOUT_MS` | `15000` | Tempo limite para requisições HTTP (ms) |
| `ENABLE_ADMIN_RATE_LIMIT` | `false` | Habilita rate limiting específico para rotas administrativas |
| `ADMIN_RATE_WINDOW_MS` | `60000` | Janela de tempo do rate limit administrativo (ms) |
| `ADMIN_RATE_MAX_REQUESTS` | `120` | Limite de requisições admin por janela |
| `LOGIN_RATE_WINDOW_MS` | `60000` | Janela de tempo do rate limit de login (ms) |
| `LOGIN_RATE_MAX_ATTEMPTS` | `10` | Máximo de tentativas de login por janela |

---

## 🗄️ Banco de Dados

Crie a base de dados no PostgreSQL:

```sql
CREATE DATABASE bebidas_db;
```

> **Migrações e Schema Automáticos:** Todas as tabelas, colunas, índices, constraints e a **Materialized View (`mv_relatorio`)** são criados e validados **automaticamente e de forma idempotente** na inicialização do servidor.

### Tabelas Principais:
- `usuarios`: Usuários, códigos de acesso, permissões e hash de senha administrativa.
- `produtos`: Itens cadastrados, preços e status de ativação.
- `consumo`: Registros de compra com preço histórico congelado (`preco`) e status de visibilidade (`oculto`).
- `zeragens`: Fechamentos de conta por usuário para apuração de saldo.
- `consumos_ocultos`: Auditoria dos estornos de consumo executados por administradores.
- `favoritos`: Produtos favoritados por cada usuário com ordenação rápida.
- `sessions`: Sessões ativas persistidas e validadas no banco.

---

## 💻 Executando a Aplicação

### Modo Produção / Execução Normal
```bash
npm start
```

O servidor exibirá a porta e os endereços locais e de rede interna (IP) para acesso via navegador.

### Executando os Testes Automatizados
```bash
npm test
```
Executa a suíte completa de testes unitários (`node:test`) cobrindo hashing, cookies, middlewares de segurança, parsers, gerenciamento de estado e fluxos de negócio.

---

## 📂 Estrutura do Projeto

```text
├── server.js                 # Ponto de entrada, configuração do Express, DI e graceful shutdown
├── routes/
│   ├── public-routes.js      # Rotas públicas e de usuário (login, compras, catálogo, histórico)
│   └── admin-routes.js       # Rotas administrativas (relatório, produtos, usuários, estornos, zeragem)
├── lib/
│   ├── admin-password.js     # Hashing e validação de senhas com scrypt
│   ├── async-handler.js      # Wrapper para tratamento automático de erros assíncronos
│   ├── auth.js               # Middlewares de autenticação, admin e validação segura de CSRF
│   ├── config.js             # Validação e carregamento de variáveis de ambiente
│   ├── cookie-helpers.js     # Manipulação e limpeza de cookies de sessão e CSRF
│   ├── db.js                 # Pool de conexão e transações no PostgreSQL
│   ├── log.js                # Logger estruturado em formato JSON
│   ├── parsers.js            # Sanitização e validação de dados de entrada
│   ├── queries.js            # Prepared statements e consultas SQL otimizadas
│   ├── rate-limit.js         # Rate limiting em memória por IP
│   ├── relatorio-cache.js    # Gerenciamento de cache e debounce da Materialized View
│   ├── schema.js             # DDL e migrações idempotentes do banco de dados
│   ├── security-headers.js   # Headers de segurança HTTP e timeout
│   └── session-store.js      # Gerenciamento de sessões persistidas no banco
├── public/                   # Frontend estático (HTML/CSS/JS)
│   ├── index.html            # Estrutura base da interface
│   ├── manifest.json         # Configuração Web App Manifest (PWA)
│   ├── style.css             # Estilos globais, modo escuro e responsividade mobile
│   └── js/                   # Módulos JavaScript (ES Modules nativos)
│       ├── admin.js          # Lógica do painel de administração
│       ├── api.js            # Encapsulamento de requisições HTTP e CSRF
│       ├── app.js            # Inicialização da aplicação, roteamento de telas e eventos
│       ├── shop.js           # Catálogo de produtos, favoritos e fluxo de compra
│       ├── state.js          # Estado global reativo e hooks de reset
│       └── utils.js          # Utilitários de formatação e debounce
└── test/                     # Testes automatizados (node:test)
    ├── admin-password.test.js
    ├── async-handler.test.js
    ├── auth-csrf.test.js
    ├── cookie-helpers.test.js
    ├── frontend-*.test.js
    └── parsers.test.js
```
