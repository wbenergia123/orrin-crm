-- supabase/migrations/003_multi_tenant.sql

-- Extensão para CITEXT (case-insensitive text)
CREATE EXTENSION IF NOT EXISTS citext;

-- ============================================================
-- TABELA: organizacoes
-- ============================================================
CREATE TABLE organizacoes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       CITEXT UNIQUE NOT NULL,
  nome       VARCHAR(255) NOT NULL,
  ativo      BOOLEAN DEFAULT TRUE,
  deleted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_organizacoes_slug ON organizacoes(slug) WHERE deleted_at IS NULL;

-- ============================================================
-- ADICIONAR tenant_id EM TODAS AS TABELAS
-- ============================================================
ALTER TABLE usuarios      ADD COLUMN tenant_id UUID REFERENCES organizacoes(id);
ALTER TABLE clientes      ADD COLUMN tenant_id UUID NOT NULL REFERENCES organizacoes(id);
ALTER TABLE reunioes      ADD COLUMN tenant_id UUID NOT NULL REFERENCES organizacoes(id);
ALTER TABLE conversas     ADD COLUMN tenant_id UUID NOT NULL REFERENCES organizacoes(id);
ALTER TABLE configuracoes ADD COLUMN tenant_id UUID UNIQUE NOT NULL REFERENCES organizacoes(id);

-- Unique composto: mesmo telefone pode existir em tenants diferentes
ALTER TABLE clientes DROP CONSTRAINT IF EXISTS clientes_telefone_key;
ALTER TABLE clientes ADD CONSTRAINT clientes_tenant_telefone UNIQUE (tenant_id, telefone);

-- ============================================================
-- INDEXES EM tenant_id
-- ============================================================
CREATE INDEX idx_clientes_tenant          ON clientes(tenant_id);
CREATE INDEX idx_reunioes_tenant          ON reunioes(tenant_id);
CREATE INDEX idx_conversas_tenant         ON conversas(tenant_id);
CREATE INDEX idx_usuarios_tenant          ON usuarios(tenant_id);
CREATE INDEX idx_clientes_tenant_telefone ON clientes(tenant_id, telefone);
CREATE INDEX idx_reunioes_tenant_data     ON reunioes(tenant_id, data_hora);

-- ============================================================
-- RLS: ativar em todas as tabelas
-- ============================================================
ALTER TABLE clientes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE reunioes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversas      ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios       ENABLE ROW LEVEL SECURITY;
ALTER TABLE configuracoes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizacoes   ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- POLICIES em tabelas de negócio
-- Nota: auth.tenant_id() não pode ser criada via SQL Editor (permissão negada)
-- Solução: inline (auth.jwt() ->> 'tenant_id')::UUID diretamente nas policies
-- ============================================================
CREATE POLICY "tenant_isolation" ON clientes
  USING      (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR (auth.jwt() ->> 'role') = 'super_admin')
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR (auth.jwt() ->> 'role') = 'super_admin');

CREATE POLICY "tenant_isolation" ON reunioes
  USING      (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR (auth.jwt() ->> 'role') = 'super_admin')
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR (auth.jwt() ->> 'role') = 'super_admin');

CREATE POLICY "tenant_isolation" ON conversas
  USING      (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR (auth.jwt() ->> 'role') = 'super_admin')
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR (auth.jwt() ->> 'role') = 'super_admin');

CREATE POLICY "tenant_isolation" ON usuarios
  USING      (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR (auth.jwt() ->> 'role') = 'super_admin')
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR (auth.jwt() ->> 'role') = 'super_admin');

CREATE POLICY "tenant_isolation" ON configuracoes
  USING      (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR (auth.jwt() ->> 'role') = 'super_admin')
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR (auth.jwt() ->> 'role') = 'super_admin');

-- Policy em organizacoes: usuário vê só a sua, super_admin vê todas
CREATE POLICY "org_self_read" ON organizacoes
  USING      (id = (auth.jwt() ->> 'tenant_id')::UUID OR (auth.jwt() ->> 'role') = 'super_admin')
  WITH CHECK ((auth.jwt() ->> 'role') = 'super_admin');

-- ============================================================
-- AUDIT LOG (somente super_admin)
-- ============================================================
CREATE TABLE admin_audit_log (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id   UUID REFERENCES usuarios(id),
  action     VARCHAR(50) NOT NULL,
  target_id  UUID,
  metadata   JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_audit_log_created  ON admin_audit_log(created_at DESC);
CREATE INDEX idx_audit_log_admin    ON admin_audit_log(admin_id, created_at DESC);

ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_super_admin_only" ON admin_audit_log
  USING      ((auth.jwt() ->> 'role') = 'super_admin')
  WITH CHECK ((auth.jwt() ->> 'role') = 'super_admin');

-- ============================================================
-- AUTH HOOK: injeta tenant_id + role no JWT
-- (Ativar em: Authentication → Hooks → Custom Access Token)
-- ============================================================
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb AS $$
DECLARE
  claims    jsonb;
  user_row  RECORD;
BEGIN
  SELECT tenant_id, role INTO user_row
  FROM public.usuarios WHERE id = (event->>'user_id')::uuid;

  -- If user not found in public.usuarios yet, return event unchanged
  IF NOT FOUND THEN
    RETURN event;
  END IF;

  claims := event->'claims';
  claims := jsonb_set(claims, '{tenant_id}', to_jsonb(user_row.tenant_id::text));
  claims := jsonb_set(claims, '{role}',      to_jsonb(user_row.role));

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- TRIGGER: sincroniza auth.users → public.usuarios
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  -- Always insert into public.usuarios
  -- Super admin has NULL tenant_id (nullable column)
  -- Regular users must supply tenant_id in metadata
  INSERT INTO public.usuarios (id, email, tenant_id, role)
  VALUES (
    NEW.id,
    NEW.email,
    NULLIF(NEW.raw_user_meta_data->>'tenant_id', '')::uuid,
    COALESCE(NEW.raw_user_meta_data->>'role', 'vendedor')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
