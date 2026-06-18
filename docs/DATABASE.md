# Database Schema — Orrin CRM

Banco de dados: **PostgreSQL** via **Supabase**  
Projeto: `ffwtirbtjumxzikkzucs.supabase.co`

---

## Tabelas

### `organizacoes`
Multi-tenancy — cada linha é uma empresa cliente do Orrin CRM.

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | uuid (PK) | Gerado automaticamente |
| `slug` | text (UNIQUE) | Identificador da org no subdomínio (ex: `empresa-abc`) |
| `nome` | text | Nome da empresa |
| `ativo` | boolean | Se false, acesso bloqueado |
| `deleted_at` | timestamptz | Soft delete |
| `created_at` | timestamptz | Data de criação |

---

### `usuarios`
Extensão de `auth.users` do Supabase. Criado automaticamente via trigger `handle_new_user`.

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | uuid (PK, FK → auth.users) | Mesmo ID do Supabase Auth |
| `tenant_id` | uuid (FK → organizacoes) | Null apenas para super_admin |
| `email` | text | Email do usuário |
| `role` | role_usuario | `admin`, `vendedor`, `super_admin` |
| `senha_hash` | text | Legado, não usado (DEFAULT '') |
| `created_at` | timestamptz | — |

**Enum `role_usuario`:** `admin` | `vendedor` | `super_admin`

**Importante:** O `role` e `tenant_id` são lidos diretamente desta tabela no middleware de auth (não via JWT claims) para compatibilidade com ECC JWT.

---

### `clientes`
Leads/clientes de uma organização.

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | uuid (PK) | — |
| `tenant_id` | uuid (FK → organizacoes) | Isolamento multi-tenant |
| `telefone` | text | Número WhatsApp (ex: `5511999999999`) |
| `nome` | text | Nome do lead |
| `empresa` | text | Empresa do lead |
| `email` | text | Email do lead |
| `status` | status_cliente | Pipeline de prospecção |
| `ultimo_contato_at` | timestamptz | Última mensagem |
| `created_at` | timestamptz | — |
| `updated_at` | timestamptz | — |

**Enum `status_cliente`:** `novo` | `contato_feito` | `reuniao_agendada` | `cliente` | `perdido`

---

### `reunioes`
Reuniões agendadas com clientes.

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | uuid (PK) | — |
| `tenant_id` | uuid (FK → organizacoes) | — |
| `cliente_id` | uuid (FK → clientes) | — |
| `data_hora` | timestamptz | Data e hora da reunião |
| `status` | status_reuniao | Estado atual |
| `notas` | text | Observações |
| `link_reuniao` | text | Link do Google Meet / Zoom |
| `created_at` | timestamptz | — |
| `updated_at` | timestamptz | — |

**Enum `status_reuniao`:** `agendada` | `confirmada` | `cancelada` | `realizada`

---

### `conversas`
Histórico de conversas entre Pedro (agente IA) e leads.

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | uuid (PK) | — |
| `tenant_id` | uuid (FK → organizacoes) | — |
| `cliente_id` | uuid (FK → clientes) | — |
| `mensagem_cliente` | text | Mensagem recebida do WhatsApp |
| `mensagem_agente` | text | Resposta gerada pelo Pedro |
| `tipo_remetente` | tipo_remetente | `agente` ou `humano` |
| `modo_humano` | boolean | Se true, Pedro está pausado para este cliente |
| `created_at` | timestamptz | — |

**Enum `tipo_remetente`:** `agente` | `humano`

---

### `configuracoes`
Configurações por organização (uma linha por tenant).

| Coluna | Tipo | Descrição |
|---|---|---|
| `tenant_id` | uuid (FK → organizacoes) | — |
| `empresa_nome` | text | Nome da empresa para Pedro usar nas respostas |
| `email_contato` | text | — |
| `telefone` | text | — |
| `prompt_pedro` | text | System prompt customizado do agente Pedro |
| `timezone` | text | Fuso horário (ex: `America/Sao_Paulo`) |

---

### `admin_audit_log`
Registro de ações do super admin.

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | uuid (PK) | — |
| `admin_id` | uuid | ID do super admin que executou |
| `action` | text | Ex: `create_org`, `activate_org`, `deactivate_org` |
| `target_id` | uuid | ID da org afetada |
| `metadata` | jsonb | Dados extras da ação |
| `created_at` | timestamptz | — |

---

## Alterações SQL importantes

Estas alterações foram necessárias e já estão aplicadas no banco:

```sql
-- Adicionar roles novos ao enum
ALTER TYPE role_usuario ADD VALUE IF NOT EXISTS 'super_admin';
ALTER TYPE role_usuario ADD VALUE IF NOT EXISTS 'vendedor';

-- Remover obrigatoriedade de senha_hash (auth via Supabase, não senha própria)
ALTER TABLE public.usuarios ALTER COLUMN senha_hash DROP NOT NULL;
ALTER TABLE public.usuarios ALTER COLUMN senha_hash SET DEFAULT '';

-- Atualizar constraint de role para incluir super_admin
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_role_check;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_role_check 
  CHECK (role IN ('admin', 'vendedor', 'super_admin'));

-- Permissões para o Auth Hook funcionar
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
GRANT SELECT ON public.usuarios TO supabase_auth_admin;
```

---

## Segurança (RLS)

- Row Level Security habilitado em todas as tabelas
- O backend usa `supabaseAdmin` (service role) que bypassa RLS
- O isolamento é feito manualmente no backend via `WHERE tenant_id = req.user.tenant_id`
- O frontend usa `supabase` (anon key) apenas para autenticação

---

## Diagrama simplificado

```
auth.users (Supabase)
    ↓ (trigger handle_new_user)
usuarios
    ↓ tenant_id
organizacoes ──→ clientes ──→ conversas
              └──→ reunioes
              └──→ configuracoes
```
