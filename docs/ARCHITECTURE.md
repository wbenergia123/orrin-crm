# Arquitetura Técnica — Orrin CRM

## Stack

| Camada | Tecnologia | Hosting |
|---|---|---|
| Frontend | React 19 + Vite + TypeScript + Tailwind | Vercel |
| Backend | Node.js + Express + TypeScript | Render |
| Banco de dados | PostgreSQL via Supabase | Supabase |
| Auth | Supabase Auth (ECC JWT P-256) | Supabase |
| IA | Claude 3.5 Sonnet (Anthropic SDK) | — |
| WhatsApp | UAZAPI | — |

---

## Repositório

- GitHub: `https://github.com/wbenergia123/orrin-crm`
- Estrutura:
  ```
  orrin-crm/
  ├── backend/          # Express API (Node.js)
  │   └── src/
  │       ├── agents/pedro.ts       # Agente IA
  │       ├── lib/slug.ts           # Validação de slug
  │       ├── middleware/auth.ts    # JWT auth + role check
  │       ├── routes/               # Endpoints REST
  │       ├── services/supabase.ts  # Cliente Supabase admin
  │       └── types/index.ts        # Tipos TypeScript
  ├── frontend/         # React SPA
  │   └── src/
  │       ├── components/           # AppShell, Sidebar, ui/card
  │       ├── lib/                  # api.ts, supabase.ts, tenant.ts, utils.ts
  │       └── pages/                # Telas da aplicação
  └── docs/             # Esta documentação
  ```

---

## Domínio e Multi-Tenancy

- Provedor de domínio: Hostinger
- DNS: Nameservers apontando para Vercel (`ns1.vercel-dns.com`, `ns2.vercel-dns.com`)
- Vercel serve wildcard `*.orrin.com.br`
- Frontend detecta o tenant via subdomínio:
  ```ts
  // frontend/src/lib/tenant.ts
  hostname → extrai slug antes de .orrin.com.br
  slug === null   → Landing Page
  slug === 'admin' → Super Admin Panel
  slug === 'empresa' → CRM da empresa
  ```
- Isolamento de dados: `tenant_id` em todas as tabelas + filtro no backend por `req.user.tenant_id`

---

## Autenticação (Supabase ECC JWT)

> **CRÍTICO**: Supabase agora usa JWT com assinatura ECC (P-256) por padrão, **não HS256**.

### Fluxo de auth no backend
1. Frontend envia `Authorization: Bearer <token>`
2. Backend chama `supabaseAdmin.auth.getUser(token)` — funciona com ECC e HS256
3. Backend busca `role` e `tenant_id` diretamente em `public.usuarios` (não usa JWT claims)
4. Monta `req.user = { id, role, tenant_id }`

### Regras de acesso
| Role | Acesso |
|---|---|
| `super_admin` | Todas as rotas + `/api/admin/*` |
| `admin` | Rotas do próprio tenant |
| `vendedor` | Rotas do próprio tenant |

### Auth Hook (Supabase)
- Hook `custom_access_token_hook` habilitado em Supabase → Authentication → Hooks
- Requer permissões no banco:
  ```sql
  GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
  GRANT SELECT ON public.usuarios TO supabase_auth_admin;
  ```

---

## CORS

Backend aceita requisições de:
```
https://*.orrin.com.br
http://localhost:*
```
Regex: `/^https:\/\/([a-z0-9-]+\.)?orrin\.com\.br$/`

---

## Variáveis de Ambiente

### Backend (`backend/.env`)
```env
SUPABASE_URL=https://ffwtirbtjumxzikkzucs.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
JWT_SECRET=<não usado para verificação, Supabase usa ECC>
PORT=3001
NODE_ENV=production
UAZAPI_URL=https://sua-instancia.uazapi.com
UAZAPI_TOKEN=seu-token-uazapi
ANTHROPIC_API_KEY=sk-ant-...
```

### Frontend (Vercel Environment Variables)
```env
VITE_SUPABASE_URL=https://ffwtirbtjumxzikkzucs.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_API_URL=https://orrin-crm.onrender.com
VITE_DEV_TENANT=demo   # só para desenvolvimento local
```

---

## Deploy

### Frontend → Vercel
- Conectado ao GitHub (`wbenergia123/orrin-crm`)
- Auto-deploy em push para `main`
- Build: `cd frontend && npm run build`
- Output: `frontend/dist`
- `frontend/vercel.json` tem SPA routing (todas as rotas → `index.html`)
- Domínios configurados: `orrin.com.br` + `*.orrin.com.br`

### Backend → Render
- Serviço: `orrin-crm` em `https://orrin-crm.onrender.com`
- Auto-deploy em push para `main`
- Build: `cd backend && npm install && npm run build`
- Start: `node dist/index.js`
- Env vars configuradas manualmente no painel do Render

### Para deployar alterações
```bash
git add .
git commit -m "descrição da mudança"
git push origin main
# Vercel e Render detectam automaticamente e fazem deploy
```

---

## WhatsApp — UAZAPI

- Cada organização tem uma instância UAZAPI separada
- A instância aponta o webhook para: `https://orrin-crm.onrender.com/api/webhook/whatsapp/:tenantSlug`
- O `tenantSlug` na URL identifica qual org está recebendo a mensagem
- Fluxo:
  ```
  WhatsApp do lead
    → UAZAPI
    → POST /api/webhook/whatsapp/:slug
    → Backend verifica org
    → Cria/busca cliente
    → Chama Pedro (Claude)
    → Responde via UAZAPI
    → Salva conversa no banco
  ```

---

## Supabase — Projeto

- URL: `https://ffwtirbtjumxzikkzucs.supabase.co`
- JWT signing: **ECC P-256** (chave atual) + HS256 (chave anterior, ainda válida)
- Site URL: `https://admin.orrin.com.br`
- Redirect URLs: `https://*.orrin.com.br/**`

---

## Desenvolvimento Local

```bash
# Backend
cd backend
cp .env.example .env   # preencher com valores reais
npm install
npm run dev            # porta 3001

# Frontend
cd frontend
npm install
# .env.local:
# VITE_API_URL=http://localhost:3001
# VITE_SUPABASE_URL=...
# VITE_SUPABASE_ANON_KEY=...
# VITE_DEV_TENANT=demo
npm run dev            # porta 5173
```
