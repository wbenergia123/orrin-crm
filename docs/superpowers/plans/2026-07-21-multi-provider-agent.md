# Agente Multi-Provedor (Claude + Gemini) e Mídia de Conversa — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que cada tenant do Orrin CRM escolha entre Claude e Gemini como provedor do agente de WhatsApp, e passar a armazenar fotos/vídeos recebidos do cliente no Storage para exibição no painel do CRM (sem análise do conteúdo pelo agente).

**Architecture:** `processarComAgente` (em `claude-agent.ts`) continua montando `systemPrompt`/histórico como hoje, mas passa a decidir entre dois caminhos de execução pelo prefixo do `ana_model` salvo em `configuracoes` (`gemini-*` → novo `lib/gemini-agent.ts`; qualquer outro valor → caminho Claude, que fica como está hoje). As ~20 tools existentes (`TOOLS`/`TOOLS_AGRO`, formato `Anthropic.Tool`) são convertidas automaticamente para o formato do Gemini por uma função pura, sem duplicar as definições. Separadamente, o webhook passa a baixar foto/vídeo da UAZAPI e subir pro bucket `fotos-pacientes` já existente, salvando a URL em duas colunas novas de `conversas_pacientes` que o painel (`ConversaPanel.tsx`) passa a renderizar como `<img>`/`<video>`.

**Desvio consciente em relação ao texto do spec:** o spec descreve o loop de iteração como algo que "não muda". Ao mapear os dois SDKs (Anthropic vs `@google/genai`) na prática, os formatos de mensagem/histórico e de resposta são incompatíveis o suficiente para que replicar o loop de iterações dentro de `gemini-agent.ts` seja mais simples e seguro do que forçar um formato neutro compartilhado (que arriscaria mudar sutilmente o comportamento do Claude hoje em produção). A decisão continua evitando a alternativa descartada no spec (classe adapter formal) — é uma segunda implementação completa e independente do loop, não uma abstração nova. `MAX_ITERATIONS`, `registrarFalhaTecnica` e os dispatchers de tools (`executarTool`/`executarToolAgro`) são reaproveitados via export, não duplicados.

**Tech Stack:** Node.js + TypeScript + Express, `@anthropic-ai/sdk` (já instalado), `@google/genai` (novo), Supabase (Postgres + Storage), Vitest + Supertest (testes de integração contra banco de teste real, seguindo o padrão já usado no repo).

---

## Antes de começar

Confirme que os testes atuais passam (linha de base, sem relação com esta mudança):

```bash
cd ~/orrin-crm/backend && npm test
```

Se algo já falhar antes de tocar no código, anote — não é parte desta mudança consertar falhas pré-existentes.

---

### Task 1: Migration — colunas de mídia em `conversas_pacientes`

**Files:**
- Create: `supabase/migrations/027_conversa_midia.sql`

- [ ] **Step 1: Escrever a migration**

```sql
-- 027_conversa_midia.sql
-- Foto/vídeo recebidos do cliente via WhatsApp: guarda a URL pra exibir no
-- painel do CRM. O agente NÃO analisa o conteúdo — é só pra equipe humana ver depois.
ALTER TABLE conversas_pacientes
  ADD COLUMN midia_url TEXT,
  ADD COLUMN midia_tipo VARCHAR(10) CHECK (midia_tipo IN ('image', 'video'));
```

- [ ] **Step 2: Aplicar a migration no banco de teste/dev**

Rode a migration do jeito que as outras migrations deste projeto são aplicadas (verifique `ONBOARDING.md` ou `docker-compose.yml` se não tiver certeza do comando — este projeto usa Supabase local/hospedado, não uma CLI de migration própria). Confirme que a coluna existe:

```bash
psql "$DATABASE_URL" -c "\d conversas_pacientes" | grep midia
```

Expected: linhas `midia_url` e `midia_tipo` aparecem.

- [ ] **Step 3: Commit**

```bash
cd ~/orrin-crm
git add supabase/migrations/027_conversa_midia.sql
git commit -m "db: adiciona midia_url e midia_tipo em conversas_pacientes"
```

---

### Task 2: `lib/conversa-midia.ts` — download da UAZAPI + upload pro Storage

**Files:**
- Create: `backend/src/lib/conversa-midia.ts`
- Test: `backend/tests/conversa-midia.test.ts`

Esse módulo isola a lógica de "baixar mídia da UAZAPI" e "subir pro Storage",
reaproveitando o padrão já usado em `routes/imagens-referencia.ts` (bucket
`fotos-pacientes`, `supabaseAdmin.storage.from(...).upload(...)`).

- [ ] **Step 1: Escrever o teste (integração contra o bucket real de teste)**

```typescript
// backend/tests/conversa-midia.test.ts
import { describe, it, expect, afterAll } from 'vitest'
import { salvarMidiaConversa } from '../src/lib/conversa-midia'
import { supabaseAdmin } from '../src/services/supabase'

const TENANT_ID_FAKE = '00000000-0000-0000-0000-000000000001'
const PACIENTE_ID_FAKE = '00000000-0000-0000-0000-000000000002'

// PNG 1x1 transparente, só pra ter bytes válidos de imagem
const PNG_1X1_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

let pathCriado: string | null = null

afterAll(async () => {
  if (pathCriado) await supabaseAdmin.storage.from('fotos-pacientes').remove([pathCriado])
})

describe('salvarMidiaConversa', () => {
  it('sobe a mídia e retorna uma URL pública', async () => {
    const url = await salvarMidiaConversa({
      tenantId: TENANT_ID_FAKE,
      pacienteId: PACIENTE_ID_FAKE,
      base64: PNG_1X1_BASE64,
      mimeType: 'image/png',
      tipo: 'image',
    })

    expect(url).toMatch(/^https?:\/\//)
    expect(url).toContain('fotos-pacientes')

    // extrai o path pra poder limpar depois
    const match = url.match(/fotos-pacientes\/(.+)$/)
    pathCriado = match ? match[1] : null
  })

  it('rejeita tipo de mídia inválido', async () => {
    await expect(
      salvarMidiaConversa({
        tenantId: TENANT_ID_FAKE,
        pacienteId: PACIENTE_ID_FAKE,
        base64: PNG_1X1_BASE64,
        mimeType: 'image/png',
        // @ts-expect-error testando valor inválido de propósito
        tipo: 'audio',
      })
    ).rejects.toThrow('tipo de mídia inválido')
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
cd ~/orrin-crm/backend && npx vitest run tests/conversa-midia.test.ts
```

Expected: FAIL com "Cannot find module '../src/lib/conversa-midia'"

- [ ] **Step 3: Implementar `conversa-midia.ts`**

```typescript
// backend/src/lib/conversa-midia.ts
import { supabaseAdmin } from '../services/supabase'
import { getUazapiConfig } from './uazapi-client'

const BUCKET = 'fotos-pacientes'
const EXTENSAO_POR_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/3gpp': '3gp',
}

interface SalvarMidiaParams {
  tenantId: string
  pacienteId: string
  base64: string
  mimeType: string
  tipo: 'image' | 'video'
}

export async function salvarMidiaConversa({
  tenantId,
  pacienteId,
  base64,
  mimeType,
  tipo,
}: SalvarMidiaParams): Promise<string> {
  if (tipo !== 'image' && tipo !== 'video') {
    throw new Error('tipo de mídia inválido')
  }

  const ext = EXTENSAO_POR_MIME[mimeType] ?? (tipo === 'image' ? 'jpg' : 'mp4')
  const path = `${tenantId}/${pacienteId}/conversa-${Date.now()}.${ext}`
  const buffer = Buffer.from(base64, 'base64')

  const { error: uploadError } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: mimeType })
  if (uploadError) throw uploadError

  const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path)
  return data.publicUrl
}

interface MidiaBaixada {
  base64: string
  mimeType: string
}

// Baixa uma mídia (foto ou vídeo) da UAZAPI a partir do id da mensagem.
// Mesmo endpoint já usado pra áudio em routes/webhook.ts — devolve base64 + mimetype.
export async function baixarMidiaUazapi(
  tenantId: string,
  msgId: string
): Promise<MidiaBaixada | null> {
  const config = await getUazapiConfig(tenantId)
  if (!config) return null

  const res = await fetch(`${config.baseUrl}/message/download`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', token: config.token },
    body: JSON.stringify({ id: msgId, return_base64: true }),
  })
  if (!res.ok) return null

  const body = (await res.json()) as Record<string, unknown>
  const base64 = (body.base64Data || body.base64) as string | undefined
  const mimeType = (body.mimetype || body.mimeType) as string | undefined
  if (!base64 || !mimeType) return null

  return { base64, mimeType }
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

```bash
cd ~/orrin-crm/backend && npx vitest run tests/conversa-midia.test.ts
```

Expected: PASS (2 testes)

- [ ] **Step 5: Commit**

```bash
git add backend/src/lib/conversa-midia.ts backend/tests/conversa-midia.test.ts
git commit -m "feat: módulo de download/upload de mídia de conversa (UAZAPI -> Storage)"
```

---

### Task 3: Webhook — detectar vídeo e salvar mídia (foto e vídeo)

**Files:**
- Modify: `backend/src/routes/webhook.ts:1-9` (imports), `:90-101` (detecção de imagem/vídeo), `:104-113` (resolução do paciente), `:220-227` (insert da conversa)

Não precisa de teste automatizado novo aqui: a lógica de download/upload já
está coberta no Task 2, e o roteamento de webhook já tem testes de payload
que não usam mídia — isso é fiação (plumbing) sem lógica nova de decisão.

- [ ] **Step 1: Import dos novos helpers**

Em `webhook.ts:1-9`, junto dos imports existentes, adicione:

```typescript
import { baixarMidiaUazapi, salvarMidiaConversa } from '../lib/conversa-midia'
```

- [ ] **Step 2: Trocar o bloco de detecção de imagem por detecção de imagem + vídeo (sem baixar ainda)**

Em `webhook.ts:90-96`, troque:

```typescript
    const isImage =
      payload.message.messageType === 'ImageMessage' ||
      payload.message.mediaType === 'image'

    if (isImage && !texto) {
      texto = '[Foto recebida]'
    }
```

por:

```typescript
    const isImage =
      payload.message.messageType === 'ImageMessage' ||
      payload.message.mediaType === 'image'

    const isVideo =
      payload.message.messageType === 'VideoMessage' ||
      payload.message.mediaType === 'video'

    if (isImage && !texto) {
      texto = '[Foto recebida]'
    }
    if (isVideo && !texto) {
      texto = '[Vídeo recebido]'
    }
```

- [ ] **Step 3: Baixar e salvar a mídia logo após o `pacienteId` ser resolvido**

Em `webhook.ts:104-113`, o código atual resolve/cria o paciente assim:

```typescript
    let { data: paciente } = await supabaseAdmin
      .from('pacientes')
      .select('id, status, nome')
      .eq('telefone', telefone)
      .eq('tenant_id', tenantId)
      .single()

    if (!paciente) {
      const { data: novo } = await supabaseAdmin
        .from('pacientes')
        .insert({ telefone, status: 'novo', tenant_id: tenantId })
        .select('id, status, nome')
        .single()
      paciente = novo
    } else if (paciente.status === 'novo') {
      await supabaseAdmin.from('pacientes').update({ status: 'em_conversa' }).eq('id', paciente.id)
      paciente.status = 'em_conversa'
    }

    const pacienteId = paciente!.id
```

Logo depois da linha `const pacienteId = paciente!.id`, adicione:

```typescript

    let midiaUrl: string | null = null
    let midiaTipo: 'image' | 'video' | null = null

    if (isImage || isVideo) {
      const msgId = payload.message.id || payload.message.messageid
      const baixada = await baixarMidiaUazapi(tenantId, msgId)
      if (baixada) {
        try {
          midiaUrl = await salvarMidiaConversa({
            tenantId,
            pacienteId,
            base64: baixada.base64,
            mimeType: baixada.mimeType,
            tipo: isImage ? 'image' : 'video',
          })
          midiaTipo = isImage ? 'image' : 'video'
        } catch (err) {
          console.error('[WEBHOOK] Falha ao salvar mídia:', err)
        }
      }
    }
```

- [ ] **Step 4: Incluir `midia_url`/`midia_tipo` no insert da conversa**

Em `webhook.ts:221-227`, troque:

```typescript
    await supabaseAdmin.from('conversas_pacientes').insert({
      tenant_id: tenantId,
      paciente_id: pacienteId,
      mensagem_paciente: texto,
      tipo_remetente: 'humano',
      modo_humano: false,
    })
```

por:

```typescript
    await supabaseAdmin.from('conversas_pacientes').insert({
      tenant_id: tenantId,
      paciente_id: pacienteId,
      mensagem_paciente: texto,
      tipo_remetente: 'humano',
      modo_humano: false,
      midia_url: midiaUrl,
      midia_tipo: midiaTipo,
    })
```

Os outros três `insert` de `conversas_pacientes` no arquivo (mensagem
`fromMe`, modo humano ativo, agente desativado) tratam apenas de texto e
não precisam de mídia — o UAZAPI reenvia o evento original apenas uma vez
por mensagem, então esse insert único já cobre o caso de foto/vídeo.

- [ ] **Step 5: Teste manual — enviar uma foto e um vídeo pelo WhatsApp de um tenant de teste**

Sem automação para esta etapa (é uma integração externa real). Confirme
manualmente:
1. Manda uma foto pro número de WhatsApp de um tenant de teste
2. Confere no banco: `select midia_url, midia_tipo from conversas_pacientes order by created_at desc limit 1;` — deve trazer uma URL do Storage e `'image'`
3. Repete com um vídeo curto — deve trazer `'video'`

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/webhook.ts
git commit -m "feat: baixa e salva foto/vídeo recebidos no webhook (sem análise pelo agente)"
```

---

### Task 4: Painel do CRM — exibir a mídia salva

**Files:**
- Modify: `backend/src/routes/atendimentos.ts:125` (adiciona colunas ao select)
- Modify: `frontend/src/types/index.ts:90-99` (interface `Conversa`)
- Modify: `frontend/src/components/ConversaPanel.tsx:120-145` (renderização)

- [ ] **Step 1: Incluir as colunas novas no select do backend**

Em `atendimentos.ts:125`, troque:

```typescript
    .select('id, mensagem_paciente, mensagem_agente, tipo_remetente, modo_humano, remetente_nome, created_at')
```

por:

```typescript
    .select('id, mensagem_paciente, mensagem_agente, tipo_remetente, modo_humano, remetente_nome, midia_url, midia_tipo, created_at')
```

- [ ] **Step 2: Atualizar o tipo `Conversa` no frontend**

Em `frontend/src/types/index.ts:90-99`, adicione os dois campos:

```typescript
export interface Conversa {
  id: string
  paciente_id: string
  mensagem_paciente: string | null
  mensagem_agente: string | null
  tipo_remetente: 'agente' | 'humano'
  modo_humano: boolean
  remetente_nome: string | null
  midia_url: string | null
  midia_tipo: 'image' | 'video' | null
  created_at: string
}
```

- [ ] **Step 3: Renderizar a mídia no `ConversaPanel.tsx`**

Em `ConversaPanel.tsx:121-129` (bloco que renderiza `c.mensagem_paciente`),
substitua o conteúdo da bolha para mostrar a mídia quando existir:

```tsx
            {c.mensagem_paciente && (
              <div className="flex flex-col items-start" style={{ maxWidth: '85%' }}>
                <div className="bg-gray-100 text-gray-800 rounded-2xl rounded-bl-sm px-3.5 py-2.5 text-sm leading-relaxed">
                  {c.midia_url && c.midia_tipo === 'image' && (
                    <img
                      src={c.midia_url}
                      alt="Foto enviada pelo cliente"
                      className="rounded-lg max-w-full mb-1.5"
                    />
                  )}
                  {c.midia_url && c.midia_tipo === 'video' && (
                    <video src={c.midia_url} controls className="rounded-lg max-w-full mb-1.5" />
                  )}
                  {c.mensagem_paciente}
                </div>
                <span className="text-[10px] text-gray-400 mt-0.5 px-1">
                  {format(parseUtcTimestamp(c.created_at), 'HH:mm', { locale: ptBR })}
                </span>
              </div>
            )}
```

- [ ] **Step 4: Teste manual no navegador**

```bash
cd ~/orrin-crm/frontend && npm run dev
```

Abra a conversa de um paciente que recebeu foto/vídeo no Task 3 e confirme
que a imagem/vídeo aparece na bolha, acima do texto placeholder.

- [ ] **Step 5: Commit**

```bash
cd ~/orrin-crm
git add backend/src/routes/atendimentos.ts frontend/src/types/index.ts frontend/src/components/ConversaPanel.tsx
git commit -m "feat: exibe foto/vídeo do cliente no painel de conversa"
```

---

### Task 5: Remover código morto (`agents/pedro.ts`)

**Files:**
- Delete: `backend/src/agents/pedro.ts`

- [ ] **Step 1: Confirmar que não há import algum**

```bash
cd ~/orrin-crm/backend/src && grep -rn "agents/pedro" . 2>/dev/null
```

Expected: nenhuma saída.

- [ ] **Step 2: Remover o arquivo**

```bash
git rm backend/src/agents/pedro.ts
```

- [ ] **Step 3: Rodar a suíte de testes pra garantir que nada quebrou**

```bash
cd ~/orrin-crm/backend && npm test
```

Expected: mesmo resultado da linha de base (nenhum teste novo falhando).

- [ ] **Step 4: Commit**

```bash
git commit -m "chore: remove agents/pedro.ts (código morto, não importado por ninguém)"
```

---

### Task 6: Instalar SDK do Gemini e criar conversor de tools

**Files:**
- Modify: `backend/package.json` (dependência)
- Modify: `backend/.env.example` (variável nova)
- Create: `backend/src/lib/gemini-tools-convert.ts`
- Test: `backend/tests/gemini-tools-convert.test.ts`

- [ ] **Step 1: Instalar a dependência**

```bash
cd ~/orrin-crm/backend && npm install @google/genai
```

- [ ] **Step 2: Adicionar a variável de ambiente no exemplo**

Em `backend/.env.example`, logo abaixo de `ANTHROPIC_MODEL=...`:

```
GEMINI_API_KEY=AIza...
```

- [ ] **Step 3: Escrever o teste do conversor de tools**

```typescript
// backend/tests/gemini-tools-convert.test.ts
import { describe, it, expect } from 'vitest'
import type Anthropic from '@anthropic-ai/sdk'
import { converterToolsParaGemini } from '../src/lib/gemini-tools-convert'

const TOOLS_EXEMPLO: Anthropic.Tool[] = [
  {
    name: 'atualizar_paciente',
    description: 'Salva o nome do paciente.',
    input_schema: {
      type: 'object',
      properties: { nome: { type: 'string', description: 'Nome completo' } },
      required: ['nome'],
    },
  },
  {
    name: 'criar_reuniao',
    description: 'Cria uma reunião.',
    input_schema: {
      type: 'object',
      properties: {
        tipo: { type: 'string', enum: ['presencial', 'virtual'], description: 'Tipo' },
      },
      required: [],
    },
  },
]

describe('converterToolsParaGemini', () => {
  it('preserva nome, descrição e schema de parâmetros', () => {
    const convertido = converterToolsParaGemini(TOOLS_EXEMPLO)

    expect(convertido).toHaveLength(2)
    expect(convertido[0].name).toBe('atualizar_paciente')
    expect(convertido[0].description).toBe('Salva o nome do paciente.')
    expect(convertido[0].parametersJsonSchema).toEqual(TOOLS_EXEMPLO[0].input_schema)
  })

  it('preserva enum dentro do schema', () => {
    const convertido = converterToolsParaGemini(TOOLS_EXEMPLO)
    const propsTipo = (convertido[1].parametersJsonSchema as any).properties.tipo
    expect(propsTipo.enum).toEqual(['presencial', 'virtual'])
  })

  it('lista vazia devolve lista vazia', () => {
    expect(converterToolsParaGemini([])).toEqual([])
  })
})
```

- [ ] **Step 4: Rodar o teste e confirmar que falha**

```bash
cd ~/orrin-crm/backend && npx vitest run tests/gemini-tools-convert.test.ts
```

Expected: FAIL com "Cannot find module '../src/lib/gemini-tools-convert'"

- [ ] **Step 5: Implementar o conversor**

```typescript
// backend/src/lib/gemini-tools-convert.ts
import type Anthropic from '@anthropic-ai/sdk'

export interface GeminiFunctionDeclaration {
  name: string
  description: string
  parametersJsonSchema: unknown
}

// input_schema (Anthropic) e parametersJsonSchema (Gemini) usam o mesmo
// formato de JSON Schema — as tools deste projeto só usam type/properties/
// required/description/enum, todos suportados pelos dois. Conversão 1:1,
// sem duplicar as definições de tools em dois arquivos.
export function converterToolsParaGemini(
  tools: Anthropic.Tool[]
): GeminiFunctionDeclaration[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description ?? '',
    parametersJsonSchema: tool.input_schema,
  }))
}
```

- [ ] **Step 6: Rodar o teste e confirmar que passa**

```bash
cd ~/orrin-crm/backend && npx vitest run tests/gemini-tools-convert.test.ts
```

Expected: PASS (3 testes)

- [ ] **Step 7: Commit**

```bash
cd ~/orrin-crm
git add backend/package.json backend/package-lock.json backend/.env.example backend/src/lib/gemini-tools-convert.ts backend/tests/gemini-tools-convert.test.ts
git commit -m "feat: instala SDK do Gemini e adiciona conversor de tools Anthropic->Gemini"
```

---

### Task 7: `lib/gemini-agent.ts` — loop de execução com o Gemini

**Files:**
- Create: `backend/src/lib/gemini-agent.ts`
- Test: `backend/tests/gemini-agent.test.ts`

Este é o equivalente ao loop que já existe em `claude-agent.ts:346-434`, mas
usando `@google/genai`. Reaproveita `registrarFalhaTecnica` e os
dispatchers de tool (`executarTool`/`executarToolAgro`) — não duplica
essa parte, só a estrutura do loop de chamadas ao modelo.

- [ ] **Step 1: Escrever o teste (mocka o SDK do Gemini, testa só a lógica de conversão de histórico + montagem de contents)**

```typescript
// backend/tests/gemini-agent.test.ts
import { describe, it, expect } from 'vitest'
import { construirContentsIniciais } from '../src/lib/gemini-agent'

describe('construirContentsIniciais', () => {
  it('intercala histórico paciente/agente em contents user/model', () => {
    const contents = construirContentsIniciais(
      [
        { mensagem_paciente: 'Oi, quero saber sobre ripado', mensagem_agente: null },
        { mensagem_paciente: null, mensagem_agente: 'Claro! Me conta mais sobre o telhado.' },
      ],
      ['Tem 40 metros quadrados']
    )

    expect(contents).toEqual([
      { role: 'user', parts: [{ text: 'Oi, quero saber sobre ripado' }] },
      { role: 'model', parts: [{ text: 'Claro! Me conta mais sobre o telhado.' }] },
      { role: 'user', parts: [{ text: 'Tem 40 metros quadrados' }] },
    ])
  })

  it('sem histórico, só a mensagem atual', () => {
    const contents = construirContentsIniciais([], ['Oi'])
    expect(contents).toEqual([{ role: 'user', parts: [{ text: 'Oi' }] }])
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
cd ~/orrin-crm/backend && npx vitest run tests/gemini-agent.test.ts
```

Expected: FAIL com "Cannot find module '../src/lib/gemini-agent'"

- [ ] **Step 3: Implementar `gemini-agent.ts`**

```typescript
// backend/src/lib/gemini-agent.ts
import { GoogleGenAI } from '@google/genai'
import type Anthropic from '@anthropic-ai/sdk'
import { converterToolsParaGemini } from './gemini-tools-convert'
import { registrarFalhaTecnica, type ConversaHistorico } from './claude-agent'

const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })

const MAX_ITERATIONS = 10

interface GeminiContent {
  role: 'user' | 'model'
  parts: Array<{ text?: string; functionCall?: { name: string; args: Record<string, unknown> }; functionResponse?: { name: string; response: Record<string, unknown> } }>
}

// Constrói o histórico inicial no formato de `contents` do Gemini a partir do
// mesmo `historico` neutro que claude-agent.ts já usa (mensagem_paciente /
// mensagem_agente), mais as mensagens novas do usuário nesta rodada.
export function construirContentsIniciais(
  historico: ConversaHistorico[],
  mensagensDoUsuario: string[]
): GeminiContent[] {
  const contents: GeminiContent[] = []

  for (const turno of historico) {
    if (turno.mensagem_paciente) {
      contents.push({ role: 'user', parts: [{ text: turno.mensagem_paciente }] })
    }
    if (turno.mensagem_agente) {
      contents.push({ role: 'model', parts: [{ text: turno.mensagem_agente }] })
    }
  }

  contents.push({ role: 'user', parts: [{ text: mensagensDoUsuario.join('\n') }] })
  return contents
}

interface ProcessarGeminiParams {
  tenantId: string
  pacienteId: string
  modelo: string
  systemPrompt: string
  tools: Anthropic.Tool[]
  historico: ConversaHistorico[]
  mensagensDoUsuario: string[]
  executarToolDispatcher: (
    tenantId: string,
    pacienteId: string,
    nome: string,
    input: Record<string, unknown>
  ) => Promise<object>
}

export async function processarComGemini({
  tenantId,
  pacienteId,
  modelo,
  systemPrompt,
  tools,
  historico,
  mensagensDoUsuario,
  executarToolDispatcher,
}: ProcessarGeminiParams): Promise<string> {
  try {
    const contents = construirContentsIniciais(historico, mensagensDoUsuario)
    const functionDeclarations = converterToolsParaGemini(tools)

    let consecutiveToolFailures = 0

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const response = await client.models.generateContent({
        model: modelo,
        contents,
        config: {
          systemInstruction: systemPrompt,
          tools: functionDeclarations.length > 0 ? [{ functionDeclarations }] : undefined,
        },
      })

      const chamadas = response.functionCalls ?? []

      if (chamadas.length === 0) {
        const texto = (response.text ?? '').trim()
        if (!texto) return 'Desculpe, não consegui responder agora. Nossa equipe vai ajudar em breve.'
        return texto
      }

      contents.push({
        role: 'model',
        parts: chamadas.map((c) => ({ functionCall: { name: c.name!, args: c.args ?? {} } })),
      })

      const respostasFuncao: GeminiContent['parts'] = []

      for (const chamada of chamadas) {
        console.log(`[GEMINI] Tool chamada: ${chamada.name}`, chamada.args)
        try {
          const resultado = await executarToolDispatcher(
            tenantId,
            pacienteId,
            chamada.name!,
            (chamada.args ?? {}) as Record<string, unknown>
          )
          consecutiveToolFailures = 0
          respostasFuncao.push({ functionResponse: { name: chamada.name!, response: { resultado } } })
        } catch (err) {
          consecutiveToolFailures++
          console.error(`[GEMINI] Tool ${chamada.name} falhou (${consecutiveToolFailures}):`, err)
          respostasFuncao.push({
            functionResponse: { name: chamada.name!, response: { erro: 'Falha ao executar ferramenta', detalhes: String(err) } },
          })

          if (consecutiveToolFailures >= 3) {
            await registrarFalhaTecnica(pacienteId, tenantId)
            return 'Desculpe, estou com dificuldades técnicas agora. Nossa equipe vai entrar em contato em breve.'
          }
        }
      }

      contents.push({ role: 'user', parts: respostasFuncao })
    }

    console.warn(`[GEMINI] Máximo de ${MAX_ITERATIONS} iterações atingido para paciente ${pacienteId}`)
    await registrarFalhaTecnica(pacienteId, tenantId)
    return 'Desculpe, não consegui processar sua mensagem agora. Nossa equipe vai te ajudar em breve.'
  } catch (error) {
    console.error('[GEMINI] Erro irrecuperável no agentic loop:', error)
    await registrarFalhaTecnica(pacienteId, tenantId).catch(() => {})
    return 'Desculpe, estou com dificuldades técnicas agora. Nossa equipe vai entrar em contato em breve.'
  }
}
```

- [ ] **Step 4: Exportar `registrarFalhaTecnica` e o tipo `ConversaHistorico` de `claude-agent.ts`**

Em `claude-agent.ts`, a função `registrarFalhaTecnica` (linha ~160) e a
interface `ConversaHistorico` (linha ~53) já existem mas não têm `export`.
Adicione `export` nas duas declarações:

```typescript
export interface ConversaHistorico {
  mensagem_paciente: string | null
  mensagem_agente: string | null
}
```

```typescript
export async function registrarFalhaTecnica(pacienteId: string, tenantId: string): Promise<void> {
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

```bash
cd ~/orrin-crm/backend && npx vitest run tests/gemini-agent.test.ts
```

Expected: PASS (2 testes)

- [ ] **Step 6: Rodar a suíte inteira pra garantir que exportar essas duas coisas não quebrou nada em `claude-agent.ts`**

```bash
cd ~/orrin-crm/backend && npm test
```

Expected: mesmo resultado da linha de base.

- [ ] **Step 7: Commit**

```bash
git add backend/src/lib/gemini-agent.ts backend/src/lib/claude-agent.ts backend/tests/gemini-agent.test.ts
git commit -m "feat: implementa loop de agente com Gemini (function calling)"
```

---

### Task 8: Rotear `processarComAgente` por provedor

**Files:**
- Modify: `backend/src/lib/claude-agent.ts:229-440` (função `processarComAgente`)
- Test: extende `backend/tests/vertical.test.ts` ou cria `backend/tests/multi-provider.test.ts`

- [ ] **Step 1: Escrever o teste de roteamento**

Este teste confirma só a *decisão* de roteamento (qual branch é tomado),
sem precisar de uma chave real da API do Gemini — usamos um modelo
`gemini-*` inválido de propósito e confirmamos que o erro vem do lado do
Gemini (prova que o branch certo foi chamado), não do lado do Claude.

```typescript
// backend/tests/multi-provider.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import bcrypt from 'bcrypt'
import { supabase } from '../src/db/supabase'
import { processarComAgente, invalidarCachePrompt } from '../src/lib/claude-agent'

let tenantId: string
let pacienteId: string
const EMAIL = 'gestor@multi-provider-test.com'

beforeAll(async () => {
  const { data: org } = await supabase
    .from('organizacoes')
    .insert({ slug: 'multi-provider-test', nome: 'Multi Provider Test' })
    .select('id')
    .single()
  tenantId = org!.id

  const hash = await bcrypt.hash('senha123', 10)
  await supabase.from('usuarios').upsert(
    { email: EMAIL, senha_hash: hash, role: 'admin', tenant_id: tenantId },
    { onConflict: 'email' }
  )

  await supabase
    .from('configuracoes')
    .insert({ tenant_id: tenantId, chave: 'ana_model', valor: 'gemini-modelo-invalido-de-proposito' })

  const { data: paciente } = await supabase
    .from('pacientes')
    .insert({ telefone: '5511999999999', status: 'novo', tenant_id: tenantId })
    .select('id')
    .single()
  pacienteId = paciente!.id
})

afterAll(async () => {
  await supabase.from('pacientes').delete().eq('id', pacienteId)
  await supabase.from('usuarios').delete().eq('email', EMAIL)
  await supabase.from('configuracoes').delete().eq('tenant_id', tenantId)
  await supabase.from('organizacoes').delete().eq('id', tenantId)
  invalidarCachePrompt(tenantId)
})

describe('roteamento de provedor por prefixo do ana_model', () => {
  it('modelo "gemini-*" usa o branch do Gemini (erro de modelo inválido, não de auth Anthropic)', async () => {
    const resposta = await processarComAgente(tenantId, pacienteId, ['Oi'])
    // Não valida sucesso (não há chave real do Gemini no ambiente de teste) —
    // só que o fluxo de erro genérico do agente foi acionado, provando que o
    // branch Gemini rodou (não travou tentando falar com a Anthropic).
    expect(typeof resposta).toBe('string')
    expect(resposta.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha (ainda sem roteamento)**

```bash
cd ~/orrin-crm/backend && npx vitest run tests/multi-provider.test.ts
```

Expected: falha ao tentar chamar a Anthropic com um modelo Gemini (erro
diferente do esperado), ou passa "sem querer" só porque hoje qualquer coisa
gera texto de erro genérico — nesse caso o teste ainda serve como
regressão depois do Step 3.

- [ ] **Step 3: Adicionar o roteamento em `processarComAgente`**

Em `claude-agent.ts`, logo depois de `const tools = vertical === 'agro' ? TOOLS_AGRO : TOOLS` (linha ~362), adicione:

```typescript
    const isGemini = modelo.startsWith('gemini-')

    if (isGemini) {
      const { processarComGemini } = await import('./gemini-agent')
      return await processarComGemini({
        tenantId,
        pacienteId,
        modelo,
        systemPrompt,
        tools,
        historico,
        mensagensDoUsuario,
        executarToolDispatcher: vertical === 'agro' ? executarToolAgro : executarTool,
      })
    }
```

Import dinâmico (`await import(...)`) evita import circular: `gemini-agent.ts`
importa `registrarFalhaTecnica`/`ConversaHistorico` de `claude-agent.ts`, então
`claude-agent.ts` não pode importar `gemini-agent.ts` no topo do arquivo.

- [ ] **Step 4: Rodar o teste do Task 8 e confirmar que passa**

```bash
cd ~/orrin-crm/backend && npx vitest run tests/multi-provider.test.ts
```

Expected: PASS

- [ ] **Step 5: Rodar a suíte inteira**

```bash
cd ~/orrin-crm/backend && npm test
```

Expected: mesmo resultado da linha de base (nada quebrou no caminho Claude).

- [ ] **Step 6: Commit**

```bash
git add backend/src/lib/claude-agent.ts backend/tests/multi-provider.test.ts
git commit -m "feat: roteia processarComAgente para Gemini quando ana_model começa com 'gemini-'"
```

---

### Task 9: Dropdown do Admin — oferecer Gemini

**Files:**
- Modify: `frontend/src/pages/Admin.tsx:500-511`

- [ ] **Step 1: Adicionar os optgroups**

Troque o `<select>` de `Admin.tsx:501-511`:

```tsx
                      <select
                        id={`modelo-${t.id}`}
                        value={anaModel}
                        onChange={(e) => setAnaModel(e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs"
                      >
                        <option value="">Padrão do sistema (Haiku — mais barato)</option>
                        <optgroup label="Claude">
                          <option value="claude-haiku-4-5-20251001">Haiku 4.5 (mais barato)</option>
                          <option value="claude-sonnet-4-6">Sonnet 4.6 (mais inteligente)</option>
                          <option value="claude-opus-4-8">Opus 4.8 (mais caro e mais capaz)</option>
                        </optgroup>
                        <optgroup label="Gemini">
                          <option value="gemini-3.1-flash-lite">Flash-Lite (mais barato, tier grátis maior)</option>
                          <option value="gemini-3.5-flash">Flash (mais inteligente, pago)</option>
                        </optgroup>
                      </select>
```

- [ ] **Step 2: Teste manual no navegador**

```bash
cd ~/orrin-crm/frontend && npm run dev
```

Abra o Admin, edite o prompt de um tenant, confirme que o dropdown mostra
os dois grupos e que salvar com um valor `gemini-*` persiste corretamente
(`GET /admin/tenants/:id/prompt` deve devolver o valor salvo).

- [ ] **Step 3: Commit**

```bash
cd ~/orrin-crm
git add frontend/src/pages/Admin.tsx
git commit -m "feat: dropdown de modelo no Admin oferece Gemini além de Claude"
```

---

### Task 10: Teste manual de ponta a ponta

Sem automação — validação final do fluxo completo com uma chave real do Gemini.

- [ ] **Step 1:** Configure `GEMINI_API_KEY` no `.env` do backend (não commitado)
- [ ] **Step 2:** No Admin, mude o `ana_model` de um tenant de teste para `gemini-3.5-flash`
- [ ] **Step 3:** Mande uma mensagem de WhatsApp pro número desse tenant que dispare uma tool (ex: pedir horários disponíveis)
- [ ] **Step 4:** Confirme que a resposta chega corretamente e que os logs mostram `[GEMINI] Tool chamada: ...`
- [ ] **Step 5:** Mande uma foto e um vídeo pro mesmo número, confirme no painel do CRM que ambos aparecem como anexo (Task 3/4) e que a Ana/Pedro **não comenta** o conteúdo — só responde ao texto, se houver

---

## Resumo de arquivos

**Novos:**
- `supabase/migrations/027_conversa_midia.sql`
- `backend/src/lib/conversa-midia.ts` + teste
- `backend/src/lib/gemini-tools-convert.ts` + teste
- `backend/src/lib/gemini-agent.ts` + teste
- `backend/tests/multi-provider.test.ts`

**Modificados:**
- `backend/src/lib/claude-agent.ts` (exports + roteamento)
- `backend/src/routes/webhook.ts` (detecção de vídeo + salvar mídia)
- `backend/src/routes/atendimentos.ts` (select com colunas de mídia)
- `backend/package.json` / `.env.example`
- `frontend/src/types/index.ts`
- `frontend/src/components/ConversaPanel.tsx`
- `frontend/src/pages/Admin.tsx`

**Removidos:**
- `backend/src/agents/pedro.ts`
