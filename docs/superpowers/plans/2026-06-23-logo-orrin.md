# Logo Orrin no Login e na Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar a marca genérica "Clínica Estética" / "Clínica" pela logo Orrin (ícone transparente + texto "Orrin") na tela de login e na sidebar.

**Architecture:** Asset PNG estático (`frontend/src/assets/orrin-icon.png`, já adicionado ao projeto — ícone recortado e com fundo transparente) importado e usado como `<img>`, com o wordmark "Orrin" renderizado como texto HTML/CSS normal (não embutido na imagem) para evitar o problema de legibilidade do texto branco original em fundo claro.

**Tech Stack:** React + TypeScript + Tailwind CSS (frontend já existente, nenhuma dependência nova).

**Spec:** `docs/superpowers/specs/2026-06-23-logo-orrin-design.md`

---

## Task 1: Logo no Login

**Files:**
- Modify: `frontend/src/pages/Login.tsx`

- [ ] **Step 1: Adicionar o import do ícone**

No topo do arquivo, junto aos outros imports, adicionar:

```ts
import orrinIcon from '../assets/orrin-icon.png'
```

- [ ] **Step 2: Trocar o título pelo ícone + "Orrin"**

Trocar:

```tsx
          <CardTitle className="text-2xl font-semibold text-gray-800">
            Clínica Estética
          </CardTitle>
```

por:

```tsx
          <img src={orrinIcon} alt="Orrin" className="w-16 h-16 mx-auto mb-2" />
          <CardTitle className="text-2xl font-semibold text-gray-800">
            Orrin
          </CardTitle>
```

O parágrafo `<p className="text-sm text-gray-500">Acesse o painel de gestão</p>` logo abaixo não muda.

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
cd frontend && git add src/pages/Login.tsx
git commit -m "feat: logo Orrin na tela de login"
```

---

## Task 2: Logo na Sidebar

**Files:**
- Modify: `frontend/src/components/Sidebar.tsx`

- [ ] **Step 1: Adicionar o import do ícone**

No topo do arquivo, junto aos outros imports, adicionar:

```ts
import orrinIcon from '../assets/orrin-icon.png'
```

- [ ] **Step 2: Trocar o texto "Clínica" pelo ícone + "Orrin"**

Trocar:

```tsx
      <div className="mb-8 px-2 hidden md:block">
        <span className="font-bold text-gray-800 text-sm tracking-wide uppercase">
          Clínica
        </span>
      </div>
```

por:

```tsx
      <div className="mb-8 px-2 hidden md:flex items-center gap-2">
        <img src={orrinIcon} alt="Orrin" className="w-6 h-6" />
        <span className="font-bold text-gray-800 text-sm tracking-wide uppercase">
          Orrin
        </span>
      </div>
```

Note que `md:block` virou `md:flex` — é o mesmo comportamento de esconder a marca fora de telas md+ (sidebar estreita/mobile), só muda pra `flex` porque agora tem ícone e texto lado a lado.

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
cd frontend && git add src/components/Sidebar.tsx
git commit -m "feat: logo Orrin na sidebar"
```

---

## Task 3: Verificação manual no browser

**Pré-requisito:** frontend rodando (`npm run dev` em `frontend/`). Não precisa do backend para ver a tela de login (ela não depende de dados); para ver a sidebar é preciso estar logado.

- [ ] **Step 1: Rodar o frontend**

Run: `cd frontend && npm run dev`

- [ ] **Step 2: Checar a tela de login**

Abrir `http://localhost:5173/login` — confirmar que aparece o ícone roxo da Orrin acima do texto "Orrin", no lugar de "Clínica Estética", e que o subtítulo "Acesse o painel de gestão" continua igual.

- [ ] **Step 3: Checar a sidebar**

Logar e confirmar que, no topo do menu lateral (em tela larga, não mobile), aparece o ícone + "Orrin" no lugar de "Clínica".

- [ ] **Step 4: Reportar resultado**

Se algo não estiver certo visualmente, voltar pra Task 1 ou 2 e corrigir antes de seguir.

---

## Checklist Final

- [ ] Task 1: Login mostra o ícone Orrin + "Orrin"
- [ ] Task 2: Sidebar mostra o ícone Orrin + "Orrin"
- [ ] Task 3: Verificado visualmente no browser
