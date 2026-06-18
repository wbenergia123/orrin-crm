# API Reference — Orrin CRM Backend

Base URL de produção: `https://orrin-crm.onrender.com`

Todas as rotas protegidas requerem header:
```
Authorization: Bearer <supabase_access_token>
```

---

## Saúde

### GET `/api/health`
Verifica se o backend está no ar.

**Response:**
```json
{ "status": "ok", "timestamp": "2026-06-18T13:00:00.000Z" }
```

---

## Organizações (público)

### GET `/api/orgs/by-slug/:slug`
Verifica se uma organização existe e está ativa. Chamada pelo frontend antes do login.

**Parâmetros:** `slug` — identificador da org (ex: `teste`)

**Response 200:**
```json
{ "id": "uuid", "slug": "teste", "nome": "Empresa Teste", "ativo": true }
```

**Response 404:** Org não encontrada ou inativa.

---

## Clientes

> Requer auth. Dados são filtrados automaticamente por `tenant_id` do usuário logado.

### GET `/api/clientes`
Lista todos os clientes do tenant, ordenados por data de criação (mais recentes primeiro).

**Response:** Array de clientes.
```json
[{
  "id": "uuid",
  "tenant_id": "uuid",
  "telefone": "5511999999999",
  "nome": "João Silva",
  "empresa": "Empresa ABC",
  "email": "joao@empresa.com",
  "status": "novo",
  "ultimo_contato_at": null,
  "created_at": "2026-06-18T10:00:00Z",
  "updated_at": "2026-06-18T10:00:00Z"
}]
```

### GET `/api/clientes/:id`
Busca um cliente específico do tenant.

**Response 200:** Objeto do cliente.  
**Response 404:** Cliente não encontrado.

### POST `/api/clientes`
Cria novo cliente.

**Body:**
```json
{
  "telefone": "5511999999999",  // obrigatório
  "nome": "João Silva",         // opcional
  "empresa": "Empresa ABC",     // opcional
  "email": "joao@empresa.com"   // opcional
}
```

**Response 201:** Cliente criado. Status inicial = `novo`.

### PATCH `/api/clientes/:id`
Atualiza campos de um cliente.

**Body:** Qualquer campo: `nome`, `empresa`, `email`, `status`, etc.

**Status possíveis:** `novo` | `contato_feito` | `reuniao_agendada` | `cliente` | `perdido`

**Response 200:** Cliente atualizado.

### DELETE `/api/clientes/:id`
Remove um cliente.

**Response 200:** `{ "message": "Cliente deletado" }`

---

## Reuniões

> Requer auth. Dados filtrados por `tenant_id`.

### GET `/api/reunioes`
Lista todas as reuniões do tenant com dados do cliente (`clientes(*)`), ordenadas por `data_hora` crescente.

**Response:** Array de reuniões.
```json
[{
  "id": "uuid",
  "tenant_id": "uuid",
  "cliente_id": "uuid",
  "data_hora": "2026-06-20T14:00:00Z",
  "status": "agendada",
  "notas": null,
  "link_reuniao": "https://meet.google.com/xxx",
  "clientes": {
    "id": "uuid",
    "nome": "João Silva",
    "empresa": "Empresa ABC",
    "telefone": "5511999999999"
  }
}]
```

### POST `/api/reunioes`
Cria nova reunião. Atualiza automaticamente o status do cliente para `reuniao_agendada`.

**Body:**
```json
{
  "cliente_id": "uuid",          // obrigatório
  "data_hora": "2026-06-20T14:00:00Z",  // obrigatório (ISO 8601)
  "notas": "Discutir proposta",  // opcional
  "link_reuniao": "https://..."  // opcional
}
```

**Response 201:** Reunião criada.

### PATCH `/api/reunioes/:id`
Atualiza campos de uma reunião.

**Status possíveis:** `agendada` | `confirmada` | `cancelada` | `realizada`

**Response 200:** Reunião atualizada.

### DELETE `/api/reunioes/:id`
Remove uma reunião.

**Response 200:** `{ "message": "Reunião deletada" }`

---

## Super Admin

> Requer auth com `role = super_admin`. Acesso apenas via `admin.orrin.com.br`.

### GET `/api/admin/tenants`
Lista todas as organizações.

**Response:** Array de organizações.
```json
[{
  "id": "uuid",
  "slug": "empresa-abc",
  "nome": "Empresa ABC",
  "ativo": true,
  "created_at": "2026-06-01T10:00:00Z"
}]
```

### POST `/api/admin/tenants`
Cria nova organização e envia convite por email para o admin.

**Body:**
```json
{
  "slug": "empresa-abc",       // obrigatório, lowercase, a-z0-9-
  "nome": "Empresa ABC",       // obrigatório
  "admin_email": "admin@empresa.com"  // obrigatório
}
```

**Response 201:**
```json
{
  "org": { "id": "uuid", "slug": "empresa-abc", "nome": "Empresa ABC" },
  "url": "https://empresa-abc.orrin.com.br",
  "invite_enviado": true
}
```

**Response 409:** Slug já está em uso.

**Efeito colateral:** Envia email de convite para `admin_email` com link para `https://{slug}.orrin.com.br/set-password`

### PATCH `/api/admin/tenants/:id`
Ativa ou desativa uma organização.

**Body:**
```json
{ "ativo": false }
```

**Response 200:** Organização atualizada.

---

## Webhook WhatsApp

> Não requer auth JWT. Autenticado via URL com `tenantSlug`.

### POST `/api/webhook/whatsapp/:tenantSlug`
Recebe mensagem do WhatsApp via UAZAPI e processa com o agente Pedro.

**Configuração no UAZAPI:** Cada instância aponta para `https://orrin-crm.onrender.com/api/webhook/whatsapp/{slug_da_org}`

**Body (formato UAZAPI):**
```json
{
  "data": {
    "from": "5511999999999",
    "message": {
      "text": { "body": "Olá, tenho interesse" }
    }
  }
}
```

**Fluxo interno:**
1. Valida se org existe e está ativa
2. Busca ou cria cliente pelo telefone
3. Chama `processarMensagemCliente()` → Claude 3.5 Sonnet
4. Envia resposta via UAZAPI
5. Salva conversa em `conversas`
6. Atualiza status do cliente para `contato_feito`

**Response:** `{ "result": "ok" }`

### GET `/api/webhook/health`
Health check do webhook.

---

## Erros comuns

| Código | Significado |
|---|---|
| 401 | Token ausente ou inválido |
| 403 | Sem permissão (role incorreto ou tenant diferente) |
| 404 | Recurso não encontrado |
| 409 | Conflito (ex: slug duplicado) |
| 500 | Erro interno |
