# Plano de Follow-up Automático por Clínica

## Resumo

Cada clínica configura suas próprias regras de follow-up em **Configurações → Follow-up**. Um job periódico no backend lê essas regras e dispara mensagens via WhatsApp (UAZAPI) nos momentos certos.

---

## 1. Configuração por clínica

### 1.1 Configurações gerais

Ficam na tabela `configuracoes`, com prefixo `followup_`:

| Chave | Tipo | Descrição |
|-------|------|-----------|
| `followup_ativo` | boolean | Liga/desliga todo o módulo de follow-up da clínica |
| `followup_timezone` | string | Fuso horário da clínica, ex: `America/Sao_Paulo` |
| `followup_horario_comercial_inicio` | string | Ex: `08:00` — não dispara antes disso |
| `followup_horario_comercial_fim` | string | Ex: `20:00` — não dispara depois disso |

### 1.2 Regras individuais

Cada regra fica em uma tabela dedicada `followup_regras`:

```sql
CREATE TABLE followup_regras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizacoes(id),
  nome text NOT NULL,
  gatilho text NOT NULL,
  delay_horas int,
  horario_fixo time,
  template text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  ordem_prioridade int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
```

Vantagens:
- Uma query só carrega todas as regras da clínica.
- Fácil adicionar/remover regras no futuro.
- Frontend renderiza a lista dinamicamente.

---

## 2. Regras de follow-up

Cada regra tem: **gatilho**, **tempo**, **template de mensagem**, **flag ativo/inativo** e **prioridade**.

### 2.1 Antes do agendamento

| Nome | Gatilho | Quando dispara | Exemplo de mensagem | Prioridade |
|------|---------|----------------|---------------------|------------|
| **Não respondeu** | Paciente entrou em contato e parou de responder | 1h, 2h ou 3h depois da última mensagem do paciente | "Oi [nome], vi que você entrou em contato. Ainda tem interesse em marcar?" | Baixa |
| **Orçamento não respondido** | Orçamento/proposta enviada, paciente não respondeu | 24h depois | "Oi [nome], ficou alguma dúvida sobre o valor que enviamos?" | Média |
| **Avaliação não fechou** | Paciente fez avaliação mas não agendou | 7 dias depois | "Oi [nome], quer reservar um horário para o procedimento?" | Média |

### 2.2 Lembretes de agendamento

| Nome | Gatilho | Quando dispara | Exemplo de mensagem | Prioridade |
|------|---------|----------------|---------------------|------------|
| **Confirmação manhã** | Agendamento confirmado no dia | No mesmo dia, às 08:00 (configurável) | "Bom dia [nome]! Passando para confirmar seu horário às [hora] com [profissional]." | Alta |
| **Lembrete 24h** | Agendamento confirmado | 24h antes | "Oi [nome], amanhã você tem [serviço] às [hora]. Confirma?" | Alta |
| **Lembrete 2h** | Agendamento confirmado | 2h antes | "Oi [nome], daqui a pouco, às [hora], temos seu [serviço]. Te espero!" | Alta |

### 2.3 Pós-atendimento

| Nome | Gatilho | Quando dispara | Exemplo de mensagem | Prioridade |
|------|---------|----------------|---------------------|------------|
| **Como está se sentindo?** | Agendamento concluído | 24h depois | "Oi [nome], como você está se sentindo após o procedimento de ontem?" | Média |
| **Pedir foto de evolução** | Procedimento estético concluído | 7 dias depois | "Oi [nome], consegue nos enviar uma foto da evolução?" | Média |
| **Revisão** | Botox/filler/procedimento com revisão concluído | 15 dias depois | "Oi [nome], vamos agendar sua revisão?" | Média |
| **Avaliação no Google** | Atendimento concluído | 48h depois | "Oi [nome], se puder, deixa uma avaliação no Google para a gente? [link]" | Baixa |

**Quem marca como concluído?**
- Pode ser manual (recepcionista clica em "concluir" no atendimento).
- Pode ser automático: quando o horário do agendamento passou, um job diário marca como `concluido`.
- Recomendação: começar com manual. Automático pode vir depois.

### 2.4 Recorrência e reengajamento

| Nome | Gatilho | Quando dispara | Exemplo de mensagem | Prioridade |
|------|---------|----------------|---------------------|------------|
| **Retorno mensal** | Serviço recorrente concluído | 30 dias após o último atendimento | "Oi [nome], já está na hora da sua próxima limpeza de pele. Quer agendar?" | Média |
| **Retorno semestral** | Procedimento com manutenção semestral concluído | 5 meses após o último | "Oi [nome], seu retorno semestral está próximo. Vamos marcar?" | Média |
| **Reativação 60 dias** | Paciente inativo | 60 dias sem interação | "Sentimos sua falta, [nome]! Temos uma condição especial para você voltar." | Baixa |
| **Reativação 90 dias** | Paciente inativo | 90 dias sem interação | "Oi [nome], gostaríamos de te ver de novo. Que tal agendar?" | Baixa |
| **Aniversário** | Data de nascimento do paciente | No dia do aniversário, às 08:00 | "Parabéns, [nome]! [nome da clínica] tem um presente especial para você 🎉" | Alta |

**Aniversário — cuidado:**
- Exige `data_nascimento` cadastrada no paciente.
- O job deve pular pacientes sem data.
- No painel, mostrar um alerta: "X pacientes ainda não têm data de nascimento cadastrada".

### 2.5 Pós-cancelamento e no-show

| Nome | Gatilho | Quando dispara | Exemplo de mensagem | Prioridade |
|------|---------|----------------|---------------------|------------|
| **Reagendar após cancelamento** | Paciente cancelou agendamento | 15 dias depois | "Oi [nome], quer remarcar seu [serviço]?" | Média |
| **No-show** | Paciente faltou ao agendamento | No mesmo dia, após o horário | "Oi [nome], vi que não conseguiu vir hoje. Quer remarcar?" | Alta |

---

## 3. Lógica de disparo

### 3.1 Jobs

- **Job principal**: roda a cada 5 minutos.
  - Busca regras ativas da clínica.
  - Para cada regra, busca pacientes elegíveis.
  - Aplica regras de colisão e silêncio.
  - Dispara mensagens via UAZAPI.
- **Job diário**: roda uma vez ao dia, às 08:00.
  - Dispara regras com horário fixo (confirmação manhã, aniversário).
  - Opcionalmente marca agendamentos passados como `concluido`.

### 3.2 Controle de envio

Usar uma tabela `followup_envios`:

```sql
CREATE TABLE followup_envios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizacoes(id),
  paciente_id uuid NOT NULL REFERENCES pacientes(id),
  regra_id uuid NOT NULL REFERENCES followup_regras(id),
  agendamento_id uuid REFERENCES agendamentos(id),
  enviado_em timestamptz DEFAULT now(),
  mensagem text NOT NULL
);
```

- Evita enviar a mesma regra 2x para o mesmo paciente/agendamento.
- Permite histórico do que foi enviado.

### 3.3 Horário comercial e fuso

- Sempre converter para o fuso da clínica antes de disparar.
- Não disparar fora do horário comercial configurado.
- Se o momento certo cair fora do horário comercial, segurar até o início do próximo dia.

### 3.4 Colisão de mensagens / silêncio

Regras para evitar spam:

1. **Prioridade vence**: se duas regras querem disparar no mesmo dia para o mesmo paciente, a de maior prioridade dispara; a outra é adiada ou cancelada.
2. **Agendamento futuro cancela "não respondeu"**: se o paciente já tem agendamento confirmado futuro, não envia follow-up de "não respondeu".
3. **Cooldown por paciente**: após qualquer mensagem automática, esperar pelo menos 4h antes de enviar outra.
4. **Resposta do paciente reseta tudo**: quando o paciente responder, para follow-ups de "não respondeu" daquele ciclo.

### 3.5 Respeito ao status — webhook da UAZAPI

- A UAZAPI deve enviar webhooks para `/api/webhook` toda vez que chegar uma mensagem.
- O backend identifica o paciente pelo telefone e atualiza `ultimo_contato_at`.
- O job, ao buscar pacientes para "não respondeu", usa esse campo para saber se o paciente respondeu depois do último envio.
- Opcionalmente, ao receber resposta, cancelar follow-ups pendentes de "não respondeu" para aquele paciente.

---

## 4. Sugestão de telas no frontend

Uma única aba **Follow-up** dentro de Configurações, dividida em cards:

1. **Geral** — ativar/desativar, fuso, horário comercial.
2. **Não respondeu** — ativar, escolher 1h/2h/3h, editar mensagem.
3. **Lembretes** — ativar lembretes 24h, 2h e confirmação da manhã.
4. **Pós-atendimento** — ativar check-in 24h, foto 7 dias, revisão 15 dias, avaliação Google.
5. **Recorrência** — retorno mensal, semestral, reativação 60/90 dias, aniversário.

Cada regra mostra:
- Nome
- Gatilho
- Tempo/horário
- Preview da mensagem
- Toggle ativo/inativo

---

## 5. Próximos passos sugeridos

Começar com as 3 regras de maior impacto imediato:

1. **Lembrete 24h** — reduz no-show imediatamente.
2. **Não respondeu (1h)** — recupera leads que pararam de responder.
3. **No-show** — recupera rápido quem faltou.

Depois, em ordem:
4. Confirmação da manhã.
5. Lembrete 2h.
6. Pós-atendimento 24h e revisão 15 dias.
7. Aniversário e reativação 60/90 dias.

Antes de codar:
- Criar migration para `followup_regras` e `followup_envios`.
- Confirmar que webhook da UAZAPI está chegando em `/api/webhook`.
