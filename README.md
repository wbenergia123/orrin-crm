# Orrin CRM

<div align="center">

**CRM moderno para prospecção e captura de clientes com agente IA Pedro**

[![License](https://img.shields.io/badge/license-ISC-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-v20%2B-green.svg)](https://nodejs.org)
[![React](https://img.shields.io/badge/React-19-blue.svg)](https://react.dev)

</div>

---

## 🎯 O que é Orrin CRM?

Orrin CRM é uma solução B2B de prospecção e captura de clientes que utiliza um agente de IA chamado **Pedro** para:

- 📱 Interagir automaticamente via WhatsApp
- 🎯 Focar em marcar reuniões (nunca menciona preço)
- 💼 Qualificar leads e clientes
- 📊 Fornecer métricas em tempo real
- 🤖 Oferecer follow-up inteligente

---

## ✨ Características Principais

✅ **Agente IA Pedro** — Prospecção automática via WhatsApp  
✅ **Dashboard de Prospecção** — Métricas em tempo real (leads, conversão, funil)  
✅ **Gerenciamento de Clientes** — CRUD completo com status tracking  
✅ **Agendamento de Reuniões** — Marcar e gerenciar reuniões automaticamente  
✅ **Integração WhatsApp** — Via UAZAPI  
✅ **Histórico de Conversas** — Rastreabilidade completa  
✅ **Autenticação Segura** — JWT + bcrypt  
✅ **Customizável** — Ajuste prompt do Pedro para sua empresa  

---

## 🛠️ Tech Stack

### Backend
- **Node.js + Express** — API REST robusta
- **TypeScript** — Tipagem estática
- **Supabase (PostgreSQL)** — Banco de dados
- **Claude 3.5 Sonnet** — Agente IA via Anthropic API
- **UAZAPI** — Integração WhatsApp

### Frontend
- **React 19** — UI moderna
- **TypeScript** — Tipagem
- **Vite** — Build rápido
- **Tailwind CSS** — Styling
- **React Query** — State management
- **Recharts** — Gráficos e dashboards
- **Axios** — HTTP client

### DevOps
- **Docker** — Containerização
- **Supabase** — Banco de dados managed
- **JWT** — Autenticação

---

## 🚀 Quick Start

### Pré-requisitos
- Node.js 20+
- npm ou yarn
- Conta Supabase
- Chave API Anthropic (Claude)
- Instância UAZAPI

### Instalação Local

```bash
# 1. Clonar o repositório
git clone https://github.com/wbenergia123/orrin-crm.git
cd orrin-crm

# 2. Configurar backend
cd backend
cp .env.example .env
# Editar .env com suas credenciais
npm install
npm run dev

# 3. Em outro terminal, configurar frontend
cd frontend
npm install
npm run dev
```

Acesse: `http://localhost:5173`

### Setup Completo
Veja [ONBOARDING.md](./ONBOARDING.md) para guia passo a passo de setup em produção.

---

## 📊 Funcionalidades

### Dashboard de Prospecção
Veja em tempo real:
- **Total de Leads** — Quantos clientes você tem
- **Contatos Feitos** — % de leads que responderam
- **Reuniões Agendadas** — Meetings no pipeline
- **Taxa de Conversão** — % de leads virados clientes
- **Funil de Vendas** — Visualização do pipeline

### Agente Pedro
- Responde automaticamente via WhatsApp
- Qualifica leads com perguntas inteligentes
- Agenda reuniões diretamente no chat
- NUNCA menciona preço (customizável)
- Follow-up automático

### Gerenciamento de Clientes
- CRUD completo
- Status tracking (novo, contato_feito, reuniao_agendada, cliente, perdido)
- Histórico de conversas
- Integração com reuniões agendadas

---

## 💰 Preço

**R$ 1.500/mês** — Inclui:
- ✅ CRM completo (clientes, reuniões, dashboard)
- ✅ Agente Pedro com IA
- ✅ Integração WhatsApp
- ✅ Suporte técnico
- ✅ Customizações básicas

**Custos adicionais (por cliente):**
- Supabase Pro: ~R$ 130/mês
- Servidor backend: ~R$ 50/mês
- UAZAPI: conforme plano
- API Anthropic: ~R$ 50–200/mês

**Seu custo: ~R$ 250–400/mês**  
**Sua margem: ~R$ 1.100+/mês** 💰

---

## 📚 Documentação

### Docs técnicos (para IA e desenvolvedores)

| Arquivo | Conteúdo |
|---|---|
| [docs/PRD.md](docs/PRD.md) | Produto, features implementadas, roadmap, pipeline de status |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Stack, infra, auth ECC JWT, CORS, env vars, deploy |
| [docs/API.md](docs/API.md) | Todos os endpoints REST com exemplos de request/response |
| [docs/DATABASE.md](docs/DATABASE.md) | Schema completo, tipos, SQL aplicados |
| [docs/FRONTEND.md](docs/FRONTEND.md) | Estrutura, roteamento, api client, design system |

### Outros
- [ONBOARDING.md](./ONBOARDING.md) — Setup passo a passo
- [backend/README.md](./backend/README.md) — Documentação backend
- [frontend/README.md](./frontend/README.md) — Documentação frontend

### URLs de produção
| Ambiente | URL |
|---|---|
| Landing | `https://orrin.com.br` |
| Super Admin | `https://admin.orrin.com.br` |
| API Backend | `https://orrin-crm.onrender.com` |
| Tenant exemplo | `https://teste.orrin.com.br` |

---

## 🤝 Suporte

Para dúvidas ou issues, abra uma issue no GitHub ou envie email.

---

## 📄 License

ISC © 2024 Orrin CRM

---

## 🙏 Contribuições

Melhorias e pull requests são bem-vindas!

```bash
# Para contribuir:
git checkout -b feature/minha-feature
git commit -m "feat: minha feature"
git push origin feature/minha-feature
```

---

Made with ❤️ by Willian Batista
