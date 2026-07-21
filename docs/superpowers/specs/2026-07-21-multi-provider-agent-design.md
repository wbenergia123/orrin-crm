# Design: Agente multi-provedor (Claude + Gemini) e mídia de conversa

## Contexto

Hoje o agente de IA (Ana/Pedro) só chama a API da Anthropic diretamente em
`backend/src/lib/claude-agent.ts`. Cada tenant já pode escolher um *modelo*
Claude (Haiku/Sonnet/Opus) via dropdown no Admin (`ana_model` em
`configuracoes`), mas não pode trocar de *provedor*.

Motivação: o Gemini lançou um tier gratuito mais generoso (Flash/Flash-Lite)
e há interesse em oferecer os dois provedores para todos os tenants,
incluindo um novo cliente do ramo de ripado (orçamentos, cálculos, endereço,
recebimento de fotos/vídeo por WhatsApp).

Foto e vídeo hoje chegam ao webhook mas não são realmente processados: uma
foto vira o texto fixo `"[Foto recebida]"` e vídeo não tem tratamento
nenhum (mensagem é ignorada). Isso será corrigido como parte deste trabalho,
mas **sem** dar visão ao agente — só armazenamento e exibição no painel.

## Escopo

1. Dropdown de modelo no Admin passa a oferecer Claude (Haiku/Sonnet/Opus,
   como hoje) **e** Gemini (Flash-Lite/Flash), para todos os tenants —
   clínicas, Agrokhan (vertical agro) e o novo tenant de ripado.
2. Sem fallback automático entre provedores: se a chamada ao provedor
   escolhido falhar, comportamento é o mesmo de hoje (mensagem de
   contingência genérica ao cliente via `registrarFalhaTecnica`).
3. Fotos e vídeos recebidos via WhatsApp passam a ser baixados e salvos em
   Storage, e ficam visíveis no painel do CRM (`ConversaPanel`) para a
   equipe humana ver depois.
4. O agente **não analisa** o conteúdo de foto nem vídeo em nenhum
   provedor — nem o Gemini, que suportaria vídeo nativamente. Esse
   tratamento é idêntico para os dois tipos de mídia e os dois provedores.
   (Pode ser revisitado depois, mas está fora de escopo agora.)

## Fora de escopo

- Visão computacional / análise de mídia pelo agente.
- Fallback automático entre provedores em caso de erro.
- Nova coluna de "provedor" — o provedor é inferido do próprio valor de
  `ana_model` (prefixo `gemini-` vs `claude-`).
- Qualquer mudança em `agents/pedro.ts` além de removê-lo (código morto).

## Arquitetura: seleção de provedor

### Situação atual

`processarComAgente` (em `claude-agent.ts`) monta o `systemPrompt` e a
lista de `messages`, entra num loop de até `MAX_ITERATIONS` chamando
`client.messages.create(...)` (SDK da Anthropic) diretamente, executa as
tools retornadas via `executarTool`/`executarToolAgro`, e repete até
receber `stop_reason: 'end_turn'`.

As definições de tools (`TOOLS`/`TOOLS_AGRO`) usam o formato
`Anthropic.Tool` — `{ name, description, input_schema: { type, properties,
required } }`. Levantamento das ~20 tools existentes confirma que elas só
usam `type`, `properties`, `required`, `description` e um `enum` — nenhuma
keyword de JSON Schema exótica que não exista no formato de
`function_declarations` do Gemini. Ou seja, dá para gerar as declarações do
Gemini automaticamente a partir das mesmas definições, sem duplicar os
arquivos de tools.

### Mudança proposta

- **Extrair a chamada ao modelo** de dentro do loop para uma função
  dedicada `chamarClaude(systemPrompt, tools, messages, modelo)`, que
  devolve um formato interno comum:
  ```ts
  type RespostaProvedor =
    | { tipo: 'texto'; texto: string }
    | { tipo: 'tool_use'; chamadas: { id: string; nome: string; input: unknown }[]; blocosAssistant: unknown }
  ```
- **Nova função `chamarGemini(systemPrompt, tools, messages, modelo)`** em
  `lib/gemini-agent.ts`, usando o SDK oficial do Google, devolvendo o
  mesmo formato interno.
- **Conversão de tools**: uma função `converterToolsParaGemini(tools:
  Anthropic.Tool[])` mapeia `input_schema` → `parameters` (mesma forma,
  troca só o nome da chave). Roda uma vez por chamada, sem duplicar as
  definições de tools em dois arquivos.
- **Conversão de histórico de mensagens**: função equivalente para
  converter o array de `messages` (formato Anthropic: `role` +
  `content` com blocos) para o formato de `contents` do Gemini (`role:
  'user'|'model'` + `parts`). Necessário porque os dois SDKs não
  compartilham o mesmo shape de mensagem.
- **Roteamento**: `processarComAgente` decide qual função de chamada usar
  com base no prefixo do `modelo` (`gemini-*` → `chamarGemini`, senão →
  `chamarClaude`). O restante do loop (iterações, execução de tool via
  `executarTool`/`executarToolAgro`, contagem de falhas consecutivas,
  `registrarFalhaTecnica`, mensagens de contingência) **não muda** — é
  código já genérico o suficiente.
- **`getModeloAna`** (cache de modelo por tenant) não muda de assinatura —
  continua devolvendo uma string; só passa a aceitar valores `gemini-*`
  além dos `claude-*` que já aceita.
- **Dropdown do Admin** (`Admin.tsx`): adiciona um `<optgroup label="Gemini">`
  com duas opções (`gemini-3.1-flash-lite`, `gemini-3.5-flash` — modelos GA
  atuais confirmados em julho/2026), ao lado do `<optgroup label="Claude">`
  que já existe hoje (sem optgroup atualmente, vira um ao agrupar).
- **Limpeza**: `agents/pedro.ts` não é importado por nenhum arquivo — é
  código morto de uma versão anterior que chamava a Anthropic
  independentemente do loop principal. Será removido nesta mudança.

### Alternativas descartadas

- **Duplicar o loop inteiro para o Gemini** (dois `processarComAgente`
  paralelos): mais rápido de escrever, mas duplica toda a lógica de
  iteração/erro/contingência — qualquer ajuste futuro (ex: mudar
  `MAX_ITERATIONS`) precisaria ser feito em dois lugares.
- **Classe adapter formal por provedor** (interface `AIProvider` com
  métodos, factory, etc.): abstração desnecessária para dois provedores
  fixos — YAGNI.
- **Coluna `provedor` separada na tabela `configuracoes`**: redundante,
  já que o prefixo do `ana_model` identifica o provedor sem ambiguidade.

## Arquitetura: mídia de conversa (foto e vídeo)

### Situação atual

`webhook.ts` já detecta `isAudio` (baixa via UAZAPI, transcreve com Groq) e
`isImage` (só marca texto `"[Foto recebida]"`, sem baixar nada). Vídeo não
tem detecção — mensagens sem texto são ignoradas (`webhook.ts:98-101`).

### Mudança proposta

- **Detecção de vídeo**: adicionar `isVideo` (`messageType ===
  'VideoMessage'` ou `mediaType === 'video'`), no mesmo padrão de `isAudio`
  / `isImage`.
- **Download**: para `isImage` e `isVideo`, reaproveitar o mesmo mecanismo
  já usado para áudio — `POST {baseUrl}/message/download` com
  `return_base64: true` na UAZAPI.
- **Upload**: subir o base64 decodificado para o bucket `fotos-pacientes`
  do Supabase Storage (mesmo bucket/padrão já usado em
  `imagens-referencia.ts`), path `{tenant_id}/{paciente_id}/{timestamp}.{ext}`,
  pegar a `publicUrl`.
- **Migration nova**: colunas `midia_url TEXT` e `midia_tipo VARCHAR(10)
  CHECK (midia_tipo IN ('image','video'))` em `conversas_pacientes`.
- **Persistência**: a linha de conversa salva o texto placeholder de hoje
  (`[Foto recebida]` / `[Vídeo recebido]`) **e** `midia_url`/`midia_tipo`.
  O texto placeholder é o que vai pro histórico do agente (não muda o
  comportamento do agente); a URL é só para exibição.
- **Painel (`ConversaPanel.tsx`)**: ao renderizar uma mensagem com
  `midia_url` presente, mostra `<img>` (tipo `image`) ou `<video
  controls>` (tipo `video`) na bolha, no lugar do texto placeholder cru.

### Fora de escopo (confirmado com o usuário)

- Nenhuma tool nova para o agente "ver" a mídia.
- Nenhuma mudança de prompt.
- Tratamento idêntico entre Claude e Gemini, e entre foto e vídeo: em
  nenhum caso o agente analisa o conteúdo.

## Testes / verificação mínima

- Um teste de integração para `converterToolsParaGemini` garantindo que as
  ~20 tools atuais convertem sem perda de campos obrigatórios.
- Um teste manual (documentado, não automatizado) do fluxo webhook →
  Storage → painel para foto e vídeo, em um tenant de teste.
- Teste manual de ponta a ponta trocando o `ana_model` de um tenant de
  teste para `gemini-3.5-flash` e confirmando que uma tool (ex:
  `verificar_slots`) executa corretamente.

## Arquivos afetados (visão geral)

- `backend/src/lib/claude-agent.ts` (extrai `chamarClaude`, adiciona
  roteamento por prefixo)
- `backend/src/lib/gemini-agent.ts` (novo)
- `backend/src/lib/tool-schema-convert.ts` (novo — conversão de tools e
  de histórico de mensagens)
- `backend/src/routes/webhook.ts` (detecção + download de vídeo, upload de
  foto/vídeo)
- `backend/src/agents/pedro.ts` (removido — código morto)
- `frontend/src/pages/Admin.tsx` (optgroups no dropdown de modelo)
- `frontend/src/components/ConversaPanel.tsx` (renderização de mídia)
- Nova migration SQL (`midia_url`, `midia_tipo` em `conversas_pacientes`)
- `backend/package.json` (nova dependência: SDK do Google Gemini)
