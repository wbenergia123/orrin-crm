# PRD — Orrin CRM

## O que é o Orrin CRM

Orrin CRM é uma plataforma B2B SaaS **multi-tenant** de prospecção de clientes com agente de IA integrado ao WhatsApp. Cada empresa cliente tem o seu próprio ambiente isolado em um subdomínio (`empresa.orrin.com.br`), com dados separados e um agente de IA (Pedro) que conversa com leads automaticamente via WhatsApp.

---

## Problema que resolve

Empresas B2B perdem leads porque não têm equipe disponível 24h para atender WhatsApp. Pedro, o agente de IA, responde automaticamente, qualifica o lead e agenda reuniões — tudo sem intervenção humana.

---

## Público-alvo

- **Clientes do Orrin CRM**: pequenas/médias empresas B2B com prospecção ativa
- **Super Admin (Willian)**: quem cria e gerencia as contas empresariais

---

## Personas

| Persona | Acesso | Responsabilidade |
|---|---|---|
| Super Admin | `admin.orrin.com.br` | Cria organizações, gerencia contas |
| Admin da Org | `empresa.orrin.com.br` | Gerencia equipe, configura Pedro |
| Vendedor | `empresa.orrin.com.br` | Acompanha leads, confirma reuniões |
| Pedro (agente IA) | Via webhook WhatsApp | Responde leads, qualifica, agenda |

---

## Features implementadas (MVP)

### Super Admin Panel (`admin.orrin.com.br`)
- [x] Login com email/senha (Supabase Auth)
- [x] Criar nova organização (slug + nome + email do admin)
- [x] Envio automático de convite para o admin da org via email
- [x] Listar todas as organizações com status
- [x] Ativar / desativar organização

### CRM do Tenant (`empresa.orrin.com.br`)
- [x] Login via Supabase Auth (convite por email)
- [x] Dashboard com métricas: total leads, contatados, reuniões, taxa de conversão
- [x] Gráficos: leads por dia (14 dias) + funil de vendas
- [x] Clientes — CRUD completo com status pipeline
- [x] Reuniões — listar, criar, atualizar status

### Agente Pedro (WhatsApp)
- [x] Webhook UAZAPI recebe mensagem WhatsApp
- [x] Cria cliente novo automaticamente se não existir
- [x] Chama Claude 3.5 Sonnet com histórico da conversa
- [x] Responde via UAZAPI
- [x] Salva conversa no banco
- [x] Detecção de intenção de reunião por palavras-chave
- [x] Prompt customizável por organização (`configuracoes.prompt_pedro`)

---

## Pipeline de Status dos Clientes

```
novo → contato_feito → reuniao_agendada → cliente
                                        ↘ perdido
```

| Status | Significado |
|---|---|
| `novo` | Lead chegou, ainda não foi contatado |
| `contato_feito` | Pedro ou vendedor já respondeu |
| `reuniao_agendada` | Lead aceitou reunião |
| `cliente` | Convertido |
| `perdido` | Descartado |

---

## Roadmap (features pendentes)

- [ ] Configuração de prompt do Pedro pelo painel
- [ ] Modo humano (pausar Pedro para atendimento manual)
- [ ] Notificações em tempo real (Supabase Realtime)
- [ ] Agendamento automático via Google Calendar
- [ ] Multi-usuário por org (convidar vendedores)
- [ ] Relatórios exportáveis (CSV/PDF)
- [ ] Integração com UAZAPI para enviar mensagens proativas

---

## Domínio e Routing

- `orrin.com.br` → Landing page (produto)
- `admin.orrin.com.br` → Super Admin Panel
- `*.orrin.com.br` → CRM da empresa (ex: `teste.orrin.com.br`)
- O frontend detecta o slug via subdomínio automaticamente
