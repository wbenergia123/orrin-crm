# Plano de Implementação — Orrin CRM

## Visão Geral

Orrin CRM é uma solução B2B de prospecção e captura de clientes que utiliza um agente de IA chamado **Pedro** para:

- 📱 Interagir automaticamente via WhatsApp
- 🎯 Focar em marcar reuniões (nunca menciona preço)
- 💼 Qualificar leads e clientes
- 📊 Fornecer métricas em tempo real
- 🤖 Oferecer follow-up inteligente

---

## 15 Tarefas Implementadas

### ✅ Task 1: Setup estrutura inicial
**Commit:** init: setup estrutura inicial do Orrin CRM
- Criar pastas: backend/src, frontend/src, supabase/migrations, nginx
- Criar arquivos base: .env.example, .gitignore

### ✅ Task 2: Criar schema Supabase
**Commit:** feat: criar schema Supabase para Orrin (sem clínica, sem CPF)
- Criar tabelas: usuarios, clientes, reunioes, conversas, configuracoes
- Definir relacionamentos e índices
- Arquivo: `supabase/migrations/001_schema_orrin.sql`

### ✅ Task 3: Criar types TypeScript
**Commit:** feat: criar types para Orrin (Cliente, Reuniao, remover Profissional)
- Definir interfaces: Cliente, Reuniao, Usuario, Conversa, Configuracao
- Arquivo: `backend/src/types/index.ts`

### ✅ Task 4: Seed inicial
**Commit:** feat: seed inicial com usuario admin e config padrão
- Criar usuário admin padrão
- Criar configurações padrão da empresa
- Arquivo: `supabase/migrations/002_seed.sql`

### ✅ Task 5: Agente Pedro
**Commit:** feat: criar agente Pedro para prospecção
- Implementar chamada para Claude 3.5 Sonnet
- Prompt customizado para prospecção via WhatsApp
- Arquivo: `backend/src/agents/pedro.ts`

### ✅ Task 6: Rotas CRUD Clientes
**Commit:** feat: criar rotas CRUD para clientes
- GET /api/clientes
- GET /api/clientes/:id
- POST /api/clientes
- PATCH /api/clientes/:id
- DELETE /api/clientes/:id
- Arquivo: `backend/src/routes/clientes.ts`

### ✅ Task 7: Rotas CRUD Reuniões
**Commit:** feat: criar rotas CRUD para reuniões
- GET /api/reunioes
- GET /api/reunioes/:id
- POST /api/reunioes
- PATCH /api/reunioes/:id
- DELETE /api/reunioes/:id
- Arquivo: `backend/src/routes/reunioes.ts`

### ✅ Task 8: Webhook WhatsApp
**Commit:** feat: adaptar webhook WhatsApp para chamar agente Pedro
- POST /api/webhook/whatsapp
- Validar token UAZAPI
- Chamar agente Pedro
- Enviar resposta via UAZAPI
- Arquivo: `backend/src/routes/webhook.ts`

### ✅ Task 9: Rotas Auth
**Commit:** feat: criar rotas de autenticação
- POST /api/auth/login (email + senha)
- POST /api/auth/register (se habilitado)
- Middleware JWT
- Arquivo: `backend/src/routes/auth.ts`

### ✅ Task 10: Serviço Supabase
**Commit:** feat: criar serviço Supabase
- Inicializar cliente Supabase
- Autenticação via JWT
- Arquivo: `backend/src/services/supabase.ts`

### ✅ Task 11: Index Backend
**Commit:** feat: criar index.ts do backend com todas as rotas
- Setupar Express com middlewares (CORS, JSON)
- Registrar todas as rotas
- Health check endpoint
- Arquivo: `backend/src/index.ts`

### ✅ Task 12: Página Clientes (Frontend)
**Commit:** feat: criar página de listagem de clientes
- Listar clientes
- Adicionar novo cliente
- Status tracking
- Arquivo: `frontend/src/pages/Clientes.tsx`

### ✅ Task 13: Página Reuniões (Frontend)
**Commit:** feat: criar página de reuniões agendadas
- Listar reuniões
- Agendar nova reunião
- Timeline de reuniões
- Arquivo: `frontend/src/pages/Reunioes.tsx`

### ✅ Task 14: Dashboard Prospecção (Frontend)
**Commit:** feat: criar dashboard de prospecção com métricas
- Total de Leads
- Contatos Feitos (%)
- Reuniões Agendadas
- Taxa de Conversão
- Funil de Vendas
- Arquivo: `frontend/src/pages/Prospeccao.tsx`

### ✅ Task 15: Documentação
**Commits:**
- feat: seed inicial com usuario admin e config padrão
- docs: adicionar .env.example e ONBOARDING.md
- docs: criar README.md do Orrin CRM

---

## Arquitetura

### Backend
```
backend/
├── src/
│   ├── agents/
│   │   └── pedro.ts           # Agente IA para prospecção
│   ├── routes/
│   │   ├── clientes.ts        # CRUD de clientes
│   │   ├── reunioes.ts        # CRUD de reuniões
│   │   ├── webhook.ts         # Webhook WhatsApp
│   │   └── auth.ts            # Autenticação
│   ├── services/
│   │   └── supabase.ts        # Cliente Supabase
│   ├── types/
│   │   └── index.ts           # Interfaces TypeScript
│   └── index.ts               # Express app
├── package.json               # Dependências
└── .env.example              # Variáveis de ambiente
```

### Frontend
```
frontend/
├── src/
│   ├── pages/
│   │   ├── Clientes.tsx       # Gestão de clientes
│   │   ├── Reunioes.tsx       # Gestão de reuniões
│   │   └── Prospeccao.tsx     # Dashboard com métricas
│   └── types/
└── package.json              # Dependências
```

### Banco de Dados
```
supabase/
├── migrations/
│   ├── 001_schema_orrin.sql  # Schema (usuarios, clientes, reunioes, etc)
│   └── 002_seed.sql         # Dados iniciais (admin, config)
```

---

## Tech Stack

### Backend
- **Node.js + Express** — API REST
- **TypeScript** — Tipagem estática
- **Supabase (PostgreSQL)** — Banco de dados
- **Claude 3.5 Sonnet** — Agente IA
- **UAZAPI** — Integração WhatsApp
- **JWT + bcrypt** — Autenticação

### Frontend
- **React 19** — UI moderna
- **TypeScript** — Tipagem
- **Vite** — Build rápido
- **Tailwind CSS** — Styling
- **React Query** — State management
- **Recharts** — Gráficos
- **Axios** — HTTP client

### Infra
- **Docker** — Containerização
- **Docker Compose** — Orquestração
- **Supabase** — DB managed
- **NGINX** — Reverse proxy

---

## Fluxo de Dados

### 1. Prospección via WhatsApp

```
Cliente (WhatsApp)
    ↓
UAZAPI (recebe mensagem)
    ↓
POST /api/webhook/whatsapp
    ↓
Pedro Agent (Claude 3.5 Sonnet)
    ↓
Resposta automática
    ↓
Salvar conversa em DB
    ↓
UAZAPI (envia resposta)
    ↓
Cliente (recebe no WhatsApp)
```

### 2. Dashboard em Tempo Real

```
Frontend (React)
    ↓
GET /api/clientes
GET /api/reunioes
    ↓
Backend (Express)
    ↓
Supabase (PostgreSQL)
    ↓
Dados retornados
    ↓
Gráficos Recharts
    ↓
Métricas exibidas
```

---

## Status Final

✅ **Completo**: Todos os 14 arquivos principais implementados
✅ **Tipado**: TypeScript em backend e frontend
✅ **Testável**: Estrutura pronta para compilação
✅ **Documentado**: README.md e ONBOARDING.md
✅ **Versionado**: 15 commits com histórico limpo

---

## Próximos Passos

1. **Local Development**
   - npm install em backend e frontend
   - Criar .env files com suas credenciais
   - npm run dev para rodar localmente

2. **Deploy**
   - Deploy backend (Railway, Render, ou Heroku)
   - Deploy frontend (Vercel, Netlify)
   - Configurar variáveis de ambiente em produção

3. **Customization**
   - Ajustar prompt do Pedro para sua empresa
   - Adicionar mais páginas se necessário
   - Integrar com CRM externo se necessário

4. **Monitoramento**
   - Setup de logs (Sentry, LogRocket)
   - Monitoramento de uptime
   - Alertas para erros críticos

---

## Custos Estimados (Mensal)

| Serviço | Custo | Notas |
|---------|-------|-------|
| Supabase Pro | ~R$ 130 | DB managed |
| Servidor Backend | ~R$ 50 | Railway/Render |
| UAZAPI | Variável | Conforme plano |
| Anthropic API | ~R$ 50–200 | Conforme uso |
| **Total** | **~R$ 250–400** | Por cliente |

**Preço final sugerido: R$ 1.500/mês**  
**Sua margem: ~R$ 1.100+/mês** 💰

---

## Documentação

- **README.md** — Visão geral e quick start
- **ONBOARDING.md** — Setup passo a passo
- **PLAN.md** — Este arquivo, plano completo
- **backend/src/** — Código comentado
- **frontend/src/** — Componentes com tipos

---

Made with ❤️ by Willian Batista
