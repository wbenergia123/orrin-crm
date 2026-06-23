# Logo Orrin no Login e na Sidebar — Orrin CRM

**Data:** 2026-06-23
**Status:** Aprovado
**Arquitetura:** Ícone PNG transparente (asset estático) + wordmark "ORRIN" como texto HTML/CSS, não embutido na imagem

---

## Contexto

A tela de login e a sidebar ainda usam a marca genérica do template antigo ("Clínica Estética" / "Clínica"), de antes do pivot pra Orrin. O usuário forneceu a logo oficial (círculos roxos + wordmark "ORRIN" em branco, fundo preto, `~/Downloads/1e5d17ca-cf4a-41a2-bee0-8816855f5ee9.png`).

## Decisão: ícone + texto separados, não a imagem completa

A imagem original tem o wordmark "ORRIN" em **branco**. Testei remover o fundo preto (matte de transparência por luminância) e compor sobre fundo branco: o texto branco fica ilegível (some) em qualquer fundo claro — e tanto o login (`Card` branco) quanto a sidebar (fundo branco) são claros.

Por isso, o ícone (espiral, sem o texto) foi recortado e tratado para ter fundo transparente — funciona bem sobre claro ou escuro. O wordmark "ORRIN" passa a ser **texto real**, renderizado com Tailwind na cor que já é usada no resto da UI (`text-gray-800`), em vez de pixels fixos numa imagem. Isso evita o problema de legibilidade e deixa a cor do texto themeable se o design mudar depois.

## Asset

`frontend/src/assets/orrin-icon.png` — ícone recortado, fundo transparente, 512×457px. Já adicionado ao projeto.

## Seção 1: Login (`frontend/src/pages/Login.tsx`)

Dentro do `<CardHeader className="text-center">`, troca:

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

Import novo no topo do arquivo: `import orrinIcon from '../assets/orrin-icon.png'`.

O subtítulo `<p className="text-sm text-gray-500">Acesse o painel de gestão</p>` não muda.

## Seção 2: Sidebar (`frontend/src/components/Sidebar.tsx`)

Troca:

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

Import novo no topo do arquivo: `import orrinIcon from '../assets/orrin-icon.png'`. Mantém o `hidden md:flex` (era `md:block`) — mesmo comportamento atual de esconder a marca na sidebar estreita/mobile, só troca `block` por `flex` porque agora tem ícone + texto lado a lado (precisa do `items-center gap-2`).

## Fora de escopo

Não há mudança em nenhum outro lugar da UI (ex: favicon, título da aba do browser, outras páginas) — só os dois pontos pedidos.

## Checklist Final

- [ ] `frontend/src/assets/orrin-icon.png` presente (já copiado)
- [ ] `Login.tsx` usando o ícone + "Orrin" como título
- [ ] `Sidebar.tsx` usando o ícone + "Orrin" no lugar de "Clínica"
- [ ] Verificação visual no browser (ambos os lugares, com sidebar expandida)
