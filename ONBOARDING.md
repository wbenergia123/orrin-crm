# Checklist de Onboarding — Orrin CRM

Tempo estimado: 45–60 minutos

---

## 1. Supabase — criar banco do cliente

- [ ] Acessar [supabase.com](https://supabase.com) e criar novo projeto
- [ ] Anotar `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`
- [ ] Abrir **SQL Editor** e rodar cada arquivo em ordem:
  - [ ] `supabase/migrations/001_schema_orrin.sql`
  - [ ] `supabase/migrations/002_seed.sql`

---

## 2. Criar usuário admin

No **SQL Editor** do Supabase, rodar:

```sql
INSERT INTO usuarios (email, senha_hash, role)
VALUES (
  'seu-email@orrin.com',
  crypt('sua-senha', gen_salt('bf')),
  'admin'
);
```

> Trocar `seu-email@orrin.com` e `sua-senha` pelos dados do cliente.

---

## 3. Configurar variáveis de ambiente

### Backend:

Copiar `backend/.env.example` para `backend/.env` e preencher:

```env
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
JWT_SECRET=string-aleatoria-longa-unica-por-cliente
PORT=3001

UAZAPI_URL=https://sua-instancia.uazapi.com
UAZAPI_TOKEN=seu-token-uazapi

ANTHROPIC_API_KEY=sk-ant-...
```

### Frontend:

Criar `frontend/.env`:

```env
VITE_API_URL=http://localhost:3001
```

---

## 4. UAZAPI — conectar WhatsApp

- [ ] Criar instância para o cliente no painel UAZAPI
- [ ] Anotar URL e token
- [ ] Escanear QR Code do WhatsApp no app UAZAPI
- [ ] Verificar que aparece "Conectado"

---

## 5. Subir o backend

```bash
cd backend
npm install
npm run dev
```

Verificar que está rodando: `GET /api/health` retorna `200`

---

## 6. Subir o frontend

```bash
cd frontend
npm install
npm run dev
```

Acessar: `http://localhost:5173`

---

## 7. Testar no CRM

- [ ] Logar com `admin@orrin.com` e senha configurada
- [ ] Ir para **Clientes** e adicionar um novo cliente de teste
- [ ] Enviar mensagem de teste via WhatsApp
- [ ] Verificar que Pedro responde automaticamente
- [ ] Ir para **Reuniões** e agendar uma reunião de teste
- [ ] Verificar **Dashboard** — métricas aparecem

---

## 8. Customizar para o Cliente

No CRM, ir para **Configurações**:

- [ ] Nome da empresa
- [ ] Email de contato
- [ ] Customizar prompt do Pedro (se necessário)

---

## Custos mensais estimados

| Serviço | Custo |
|---------|-------|
| Supabase Pro | ~R$ 130/mês |
| Servidor backend (Railway/Render) | ~R$ 50/mês |
| UAZAPI | conforme plano |
| Anthropic API | ~R$ 50–200/mês |
| **Total** | **~R$ 250–400/mês** |

**Margem com preço de R$ 1.500/mês: ~R$ 1.100+**

---

## Troubleshooting

### Pedro não responde
- [ ] Verificar `ANTHROPIC_API_KEY` está correto
- [ ] Verificar logs do backend (npm run dev)
- [ ] Testar endpoint: `GET /api/health`

### WhatsApp não recebe mensagens
- [ ] Verificar `UAZAPI_URL` e `UAZAPI_TOKEN`
- [ ] Verificar que a instância UAZAPI está conectada
- [ ] Testar webhook manualmente com curl

### Reuniões não aparecem
- [ ] Verificar migrations do Supabase rodaram sem erro
- [ ] Verificar `SUPABASE_URL` está correto
- [ ] Rodar `SELECT * FROM reunioes;` no SQL Editor

---

## Próximos Passos

- [ ] Deploy do backend (Railway, Render, Vercel)
- [ ] Deploy do frontend (Vercel, Netlify)
- [ ] Configurar domínio customizado
- [ ] Setup de backup automático
- [ ] Documentação do cliente
