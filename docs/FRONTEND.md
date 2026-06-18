# Frontend — Orrin CRM

## Stack

- **React 19** + **Vite 5** + **TypeScript**
- **Tailwind CSS** — estilização
- **react-router-dom v6** — roteamento SPA
- **@tanstack/react-query v5** — cache de dados do servidor
- **axios** — HTTP client (com interceptors para JWT)
- **@supabase/supabase-js** — autenticação
- **lucide-react** — ícones
- **recharts** — gráficos
- **clsx + tailwind-merge** — utilitários de classes CSS

---

## Estrutura de arquivos

```
frontend/src/
├── App.tsx                    # Ponto de entrada — routing por subdomínio
├── components/
│   ├── AppShell.tsx           # Layout: Sidebar + Outlet (react-router-dom)
│   ├── Sidebar.tsx            # Navegação lateral com NavLink
│   └── ui/
│       └── card.tsx           # Componente Card (shadcn-style)
├── lib/
│   ├── api.ts                 # Axios com baseURL + interceptor JWT automático
│   ├── supabase.ts            # Cliente Supabase (anon key)
│   ├── tenant.ts              # getTenantSlug() — detecta org pelo subdomínio
│   └── utils.ts               # cn() — clsx + tailwind-merge
└── pages/
    ├── LandingPage.tsx        # Raiz de orrin.com.br
    ├── Login.tsx              # Login do tenant
    ├── SetPassword.tsx        # Página de reset/set de senha (link do invite)
    ├── OrgNaoEncontrada.tsx   # 404 de org
    ├── SuperAdminApp.tsx      # Painel admin.orrin.com.br (sem router)
    ├── Prospeccao.tsx         # Dashboard com métricas + gráficos
    ├── Clientes.tsx           # Lista e criação de clientes
    └── Reunioes.tsx           # Lista de reuniões
```

---

## Roteamento por subdomínio

O `App.tsx` decide qual app renderizar baseado no subdomínio:

```tsx
const slug = getTenantSlug()

if (slug === null)    → LandingPage   // orrin.com.br
if (slug === 'admin') → SuperAdminApp  // admin.orrin.com.br
else                  → ClientApp     // empresa.orrin.com.br
```

`ClientApp` usa `BrowserRouter` com estas rotas:
- `/dashboard` → Prospeccao
- `/clientes` → Clientes
- `/reunioes` → Reunioes
- `/set-password` → SetPassword
- Todas as outras → redirect para `/dashboard`

---

## API Client (`lib/api.ts`)

**SEMPRE use `api` (não `axios` direto) para chamar o backend.**

```ts
import api from '../lib/api'

// ✅ Correto — tem baseURL + token JWT automático
const res = await api.get('/api/clientes')

// ❌ Errado — não tem baseURL nem token
const res = await axios.get('/api/clientes')
```

O `api` injeta automaticamente:
- `baseURL`: `VITE_API_URL` (ex: `https://orrin-crm.onrender.com`)
- `Authorization: Bearer <token>` — lido da sessão Supabase
- Em caso de 401 → faz signOut e redireciona para login

---

## Desenvolvimento local

```bash
cd frontend
npm install
# Criar .env.local:
echo "VITE_API_URL=http://localhost:3001" >> .env.local
echo "VITE_SUPABASE_URL=https://ffwtirbtjumxzikkzucs.supabase.co" >> .env.local
echo "VITE_SUPABASE_ANON_KEY=eyJ..." >> .env.local
echo "VITE_DEV_TENANT=teste" >> .env.local   # simula o slug na URL
npm run dev
```

`VITE_DEV_TENANT` define qual org é carregada em desenvolvimento (substitui a detecção pelo subdomínio).

---

## Deploy (Vercel)

- Auto-deploy em push para `main` no GitHub
- Build command: `cd frontend && npm run build`
- Output directory: `frontend/dist`
- `frontend/vercel.json` garante SPA routing (todas as rotas → `index.html`)

**Variáveis no Vercel:**
```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_API_URL=https://orrin-crm.onrender.com
```

---

## Design System

O design segue o padrão do `clinic-crm` (repositório de referência):

- Background: `bg-gray-50`
- Cards: `bg-white border border-gray-100 shadow-sm rounded-xl`
- Sidebar: `bg-white border-r border-gray-100` com NavLink active = `bg-gray-100 text-gray-900`
- Cor de destaque: `violet-600` (#7c3aed)
- Títulos: `text-xl font-semibold text-gray-800`
- Textos secundários: `text-xs text-gray-400`

### Componentes reutilizáveis
```tsx
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
// Ícones de lucide-react
```
