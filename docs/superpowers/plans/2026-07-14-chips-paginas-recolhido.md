# Chips de páginas na barra recolhida — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Com a sidebar "☰ Páginas" recolhida, mostrar chips clicáveis (lista plana de todas as páginas) na barra-miniatura; clicar navega direto sem expandir.

**Architecture:** Um helper puro achata a árvore (`PaginaNode[]`) em lista plana (DFS pré-ordem). Um componente `PaginasChips` carrega essa lista via o `NotebookRepo` compartilhado e renderiza os chips; clique chama `setPaginaAtiva` no store (sem tocar `railRecolhida`). O `Workspace` insere o componente dentro da `.rail-miniatura`. CSS estiliza os chips com scroll horizontal.

**Tech Stack:** React 18 + TypeScript, Zustand (store), Vitest + jsdom (testes), TipTap (não tocado aqui). Runner de testes: Vitest.

**Convenção deste projeto (importante):**
- Todos os comandos rodam a partir da pasta `grimorio/` (onde ficam `node_modules`, `package.json`, `tsconfig`).
- Testes usam o cabeçalho `// @vitest-environment jsdom` quando montam DOM.
- `PaginaNode = { slug, id, titulo, erro?, paiId, ordem, filhos: PaginaNode[] }` (`src/lib/types.ts:79-83`).
- Store: `useApp((s) => s.paginaAtivaPorCaderno[dir])` e `useApp((s) => s.setPaginaAtiva)`; `setPaginaAtiva(cadernoDir, slug)` (`src/state/store.ts:85-87`).
- `NotebookRepo`: `inicializar(): Promise<void>` (`:46`), `montarArvore(): Promise<PaginaNode[]>` (`:163`).
- Tokens CSS existentes: `--dourado`, `--dourado-claro`, `--fundo-elevado`, `--fundo-painel`, `--borda`, `--texto-fraco`.

---

### Task 1: Helper puro `achatarPaginas` (achata a árvore em lista plana)

**Files:**
- Create: `grimorio/src/lib/achatarPaginas.ts`
- Test: `grimorio/src/test/achatarPaginas.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Criar `grimorio/src/test/achatarPaginas.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { achatarPaginas } from '../lib/achatarPaginas'
import type { PaginaNode } from '../lib/types'

function no(slug: string, titulo: string, filhos: PaginaNode[] = [], erro?: boolean): PaginaNode {
  return { slug, id: slug, titulo, paiId: null, ordem: 0, erro, filhos }
}

describe('achatarPaginas', () => {
  it('DFS pré-ordem: pai antes dos filhos, recursivo em vários níveis', () => {
    const arvore: PaginaNode[] = [
      no('a', 'A', [no('a1', 'A1'), no('a2', 'A2', [no('a2x', 'A2X')])]),
      no('b', 'B'),
    ]
    expect(achatarPaginas(arvore).map((p) => p.slug)).toEqual(['a', 'a1', 'a2', 'a2x', 'b'])
  })

  it('lista vazia retorna []', () => {
    expect(achatarPaginas([])).toEqual([])
  })

  it('preserva slug, titulo e erro', () => {
    expect(achatarPaginas([no('x', 'X', [], true)])).toEqual([{ slug: 'x', titulo: 'X', erro: true }])
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run (em `grimorio/`): `npx vitest run src/test/achatarPaginas.test.ts`
Expected: FAIL — não resolve `../lib/achatarPaginas` (módulo não existe).

- [ ] **Step 3: Implementar o helper**

Criar `grimorio/src/lib/achatarPaginas.ts`:

```ts
import type { PaginaNode } from './types'

export interface PaginaPlana {
  slug: string
  titulo: string
  erro?: boolean
}

/** Achata a árvore de páginas em lista plana, em pré-ordem (pai antes dos filhos). */
export function achatarPaginas(nodes: PaginaNode[]): PaginaPlana[] {
  const out: PaginaPlana[] = []
  for (const n of nodes) {
    out.push({ slug: n.slug, titulo: n.titulo, erro: n.erro })
    if (n.filhos.length > 0) out.push(...achatarPaginas(n.filhos))
  }
  return out
}
```

(Nota: nós sem `erro` produzem `erro: undefined`; `toEqual` do Vitest ignora chaves `undefined`, por isso o primeiro/segundo teste passam sem declarar `erro`.)

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/test/achatarPaginas.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add grimorio/src/lib/achatarPaginas.ts grimorio/src/test/achatarPaginas.test.ts
git commit -m "feat(notas): helper achatarPaginas (lista plana DFS) (TDD)"
```

---

### Task 2: Componente `PaginasChips`

Carrega a lista plana via `repo` e renderiza os chips. Isolado e testável sem Tauri (repo é injetado; store é mockado).

**Files:**
- Create: `grimorio/src/components/PaginasChips.tsx`
- Test: `grimorio/src/test/PaginasChips.test.tsx`

- [ ] **Step 1: Escrever o teste que falha**

Criar `grimorio/src/test/PaginasChips.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { NotebookRepo } from '../lib/notebookRepo'
import type { PaginaNode } from '../lib/types'

// Mock do store: captura setPaginaAtiva e controla a página ativa, sem tocar Tauri.
const h = vi.hoisted(() => ({
  setPaginaAtiva: vi.fn(),
  ativa: {} as Record<string, string | null>,
}))
vi.mock('../state/store', () => ({
  useApp: (sel: (s: unknown) => unknown) =>
    sel({ paginaAtivaPorCaderno: h.ativa, setPaginaAtiva: h.setPaginaAtiva }),
}))

import { PaginasChips } from '../components/PaginasChips'

function no(slug: string, titulo: string, filhos: PaginaNode[] = [], erro?: boolean): PaginaNode {
  return { slug, id: slug, titulo, paiId: null, ordem: 0, erro, filhos }
}
function repoFake(arvore: PaginaNode[]): NotebookRepo {
  return { inicializar: async () => {}, montarArvore: async () => arvore } as unknown as NotebookRepo
}

const DIR = 'campanhas/x/notas'
const tick = () => new Promise((r) => setTimeout(r, 0))
let container: HTMLDivElement
let root: Root

async function montar(arvore: PaginaNode[]) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => { root.render(<PaginasChips repo={repoFake(arvore)} cadernoDirRel={DIR} />) })
  await act(async () => { await tick() })
}
const chips = () => Array.from(container.querySelectorAll('.rail-chip')) as HTMLButtonElement[]

beforeEach(() => { h.setPaginaAtiva.mockClear(); h.ativa = {} })
afterEach(() => { root.unmount(); container.remove() })

describe('PaginasChips', () => {
  it('renderiza um chip por página, em lista plana (pré-ordem)', async () => {
    await montar([no('a', 'A', [no('a1', 'A1')]), no('b', 'B')])
    expect(chips().map((c) => c.textContent)).toEqual(['A', 'A1', 'B'])
  })

  it('clicar num chip chama setPaginaAtiva(cadernoDirRel, slug)', async () => {
    await montar([no('a', 'A'), no('b', 'B')])
    const chipB = chips().find((c) => c.textContent === 'B')!
    await act(async () => { chipB.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(h.setPaginaAtiva).toHaveBeenCalledWith(DIR, 'b')
  })

  it('chip da página ativa recebe classe .ativa', async () => {
    h.ativa = { [DIR]: 'b' }
    await montar([no('a', 'A'), no('b', 'B')])
    const chipB = chips().find((c) => c.textContent === 'B')!
    expect(chipB.classList.contains('ativa')).toBe(true)
  })

  it('página com erro fica desabilitada e não navega', async () => {
    await montar([no('x', 'X', [], true)])
    const chip = chips()[0]
    expect(chip.disabled).toBe(true)
    await act(async () => { chip.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(h.setPaginaAtiva).not.toHaveBeenCalled()
  })

  it('sem páginas não renderiza a faixa de chips', async () => {
    await montar([])
    expect(container.querySelector('.rail-chips')).toBeNull()
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/test/PaginasChips.test.tsx`
Expected: FAIL — não resolve `../components/PaginasChips` (módulo não existe).

- [ ] **Step 3: Implementar o componente**

Criar `grimorio/src/components/PaginasChips.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { NotebookRepo } from '../lib/notebookRepo'
import { achatarPaginas, type PaginaPlana } from '../lib/achatarPaginas'
import { useApp } from '../state/store'

/**
 * Chips de páginas exibidos na barra-miniatura quando a rail "☰ Páginas" está recolhida.
 * Carrega a lista plana via o MESMO `repo` do Workspace (a rail expandida está desmontada,
 * então sua árvore não está disponível aqui). Clicar navega sem expandir a rail.
 */
export function PaginasChips({ repo, cadernoDirRel }: { repo: NotebookRepo; cadernoDirRel: string }) {
  const [paginas, setPaginas] = useState<PaginaPlana[] | null>(null)
  const ativa = useApp((s) => s.paginaAtivaPorCaderno[cadernoDirRel] ?? null)
  const setPaginaAtiva = useApp((s) => s.setPaginaAtiva)

  useEffect(() => {
    let vivo = true
    repo.inicializar()
      .then(() => repo.montarArvore())
      .then((arv) => { if (vivo) setPaginas(achatarPaginas(arv)) })
      .catch(() => { if (vivo) setPaginas([]) })
    return () => { vivo = false }
  }, [repo])

  if (!paginas || paginas.length === 0) return null

  // roda vertical do mouse rola a faixa horizontalmente (linha única, sem overflow vertical)
  function aoRolar(e: React.WheelEvent<HTMLDivElement>) {
    if (e.deltaY === 0) return
    e.currentTarget.scrollLeft += e.deltaY
  }

  return (
    <div className="rail-chips" onWheel={aoRolar}>
      {paginas.map((p) => (
        <button
          key={p.slug}
          className={`rail-chip${ativa === p.slug ? ' ativa' : ''}`}
          disabled={p.erro}
          title={p.erro ? 'Página com erro' : p.titulo}
          onClick={() => { if (!p.erro) setPaginaAtiva(cadernoDirRel, p.slug) }}
        >
          {p.titulo}
        </button>
      ))}
    </div>
  )
}
```

(Nota: `React.WheelEvent` sem importar `React` segue o padrão de `PaginasRail.tsx` que usa `React.MouseEvent` do mesmo jeito.)

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/test/PaginasChips.test.tsx`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add grimorio/src/components/PaginasChips.tsx grimorio/src/test/PaginasChips.test.tsx
git commit -m "feat(notas): componente PaginasChips na barra recolhida (TDD)"
```

---

### Task 3: Ligar `PaginasChips` na barra-miniatura do `Workspace`

Sem teste automatizado (montar o `Workspace` exige mocks pesados de Tauri/CanvasView/NotasEditor — fora do valor). Verificação é manual (Task 5).

**Files:**
- Modify: `grimorio/src/components/Workspace.tsx:2` (import) e `:106-108` (render da miniatura)

- [ ] **Step 1: Adicionar o import**

Em `grimorio/src/components/Workspace.tsx`, logo após a linha 2 (`import { PaginasRail } from './PaginasRail'`), adicionar:

```tsx
import { PaginasChips } from './PaginasChips'
```

- [ ] **Step 2: Inserir o componente na miniatura**

Substituir o bloco atual (`Workspace.tsx:105-108`):

```tsx
              <div className="rail-miniatura">
                <button className="btn-icon" title="Abrir páginas" onClick={() => setSplit((s) => ({ ...s, railRecolhida: false }))}>☰ Páginas</button>
              </div>
```

por:

```tsx
              <div className="rail-miniatura">
                <button className="btn-icon" title="Abrir páginas" onClick={() => setSplit((s) => ({ ...s, railRecolhida: false }))}>☰ Páginas</button>
                <PaginasChips repo={repo} cadernoDirRel={cadernoDirRel} />
              </div>
```

- [ ] **Step 3: Verificar tipos**

Run (em `grimorio/`): `npx tsc --noEmit`
Expected: sem erros (0 erros de tipo).

- [ ] **Step 4: Rodar toda a suíte de testes (nada quebrou)**

Run: `npx vitest run`
Expected: todos os testes PASS (incluindo Task 1 e Task 2).

- [ ] **Step 5: Commit**

```bash
git add grimorio/src/components/Workspace.tsx
git commit -m "feat(notas): chips de paginas na miniatura recolhida do Workspace"
```

---

### Task 4: Estilos dos chips (`theme.css`)

**Files:**
- Modify: `grimorio/src/theme.css:272-276` (adicionar `gap` na `.rail-miniatura`) e adicionar novo bloco após a linha 276

- [ ] **Step 1: Adicionar `gap` à `.rail-miniatura`**

Substituir o bloco atual (`theme.css:272-275`):

```css
.rail-miniatura {
  padding: 4px 8px; border-bottom: 1px solid var(--borda);
  background: var(--fundo-painel); display: flex; align-items: center;
}
```

por (acrescenta `gap: 8px;`):

```css
.rail-miniatura {
  padding: 4px 8px; border-bottom: 1px solid var(--borda);
  background: var(--fundo-painel); display: flex; align-items: center; gap: 8px;
}
```

- [ ] **Step 2: Adicionar o bloco de estilos dos chips**

Logo após a linha `.rail-miniatura .btn-icon { font-size: 12px; }` (`theme.css:276`), adicionar:

```css
/* chips das páginas na barra recolhida: linha única com scroll horizontal */
.rail-chips { display: flex; gap: 4px; overflow-x: auto; white-space: nowrap; flex: 1; min-width: 0; scrollbar-width: thin; }
.rail-chip {
  flex: 0 0 auto; font-size: 11px; padding: 2px 8px; border-radius: 10px;
  border: 1px solid var(--borda); background: var(--fundo-elevado); cursor: pointer;
  max-width: 160px; overflow: hidden; text-overflow: ellipsis;
}
.rail-chip:hover { border-color: var(--dourado); }
.rail-chip.ativa { border-color: var(--dourado); color: var(--dourado-claro); }
.rail-chip:disabled { opacity: 0.5; cursor: default; }
```

- [ ] **Step 3: Commit**

```bash
git add grimorio/src/theme.css
git commit -m "style(notas): estilos dos chips de paginas na barra recolhida"
```

---

### Task 5: Verificação manual na aplicação (o usuário roda)

Não dá para dirigir o app Tauri desktop a partir daqui — o usuário verifica.

- [ ] **Step 1: Subir o app**

Run (em `grimorio/`): o comando de dev normal do usuário (ex.: `npm run tauri dev`).

- [ ] **Step 2: Checklist visual**

Abrir um caderno de Notas com **várias** páginas (incluindo subpáginas), então:

1. Recolher a rail "☰ Páginas" (botão `‹`). A barra-miniatura aparece no topo.
2. **Confirmar:** ao lado de "☰ Páginas" aparecem os chips com os nomes de **todas** as páginas (subpáginas achatadas na mesma lista).
3. Clicar num chip → o editor troca para aquela página **e a barra continua recolhida** (não expande).
4. O chip da página aberta fica **destacado** (dourado).
5. Chip de página com erro (se houver) aparece **esmaecido e não clicável**.
6. Com muitas páginas, a faixa **rola horizontalmente** (roda do mouse sobre os chips rola de lado).
7. Caderno sem páginas → só o botão "☰ Páginas", sem chips.

- [ ] **Step 3: Sanidade final (build)**

Run (em `grimorio/`): `npm run build`
Expected: build sem erros.

---

## Self-Review (feito na escrita do plano)

**Cobertura do spec:**
- Formato chips inline → Task 2 (`.rail-chips`) + Task 3 (wiring) + Task 4 (CSS). ✓
- Overflow scroll horizontal + roda do mouse → Task 2 (`aoRolar`) + Task 4 (`overflow-x:auto`). ✓
- Todas as páginas em lista plana (DFS) → Task 1 (`achatarPaginas`). ✓
- Página ativa destacada → Task 2 (classe `.ativa`) + Task 4 (`.rail-chip.ativa`). ✓
- Clicar navega sem expandir → Task 2 (`setPaginaAtiva`, não toca `railRecolhida`). ✓
- Bordas (sem páginas / erro / loading) → Task 2 (`return null`, `disabled`). ✓

**Placeholders:** nenhum — todo passo tem código/comando concreto.

**Consistência de tipos:** `PaginaPlana { slug, titulo, erro? }` definida na Task 1 e usada igual na Task 2. `achatarPaginas`, `setPaginaAtiva(cadernoDir, slug)`, `montarArvore()`, `inicializar()` batem com as fontes reais. Classe CSS `.rail-chip`/`.ativa`/`.rail-chips` consistente entre Task 2 (JSX) e Task 4 (CSS).
