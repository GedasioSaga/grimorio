# Grimório — Escrita (Notas + Split) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar ao Grimório um espaço de escrita estilo Notion/Obsidian: páginas de texto rico aninhadas (caderno), embutidas ao lado do mapa da sessão num split recolhível/animado, e um caderno livre por campanha; com imagens nas páginas que podem ser arrastadas para dentro do mapa.

**Architecture:** Uma peça reutilizável — o **Caderno** (pasta de páginas JSON) — servida por um módulo de dados `NotebookRepo` (mesmo estilo de `VaultRepo`: escrita serializada por caminho, tolerante a corrupção). A UI é um `Workspace` que compõe `PaginasRail` (árvore) + `NotasEditor` (TipTap) + `CanvasView` (mapa da v1, reusado) num split recolhível. Imagens de página são arquivos no cofre referenciados por caminho relativo (portável entre os 2 PCs), e o drop handler do canvas ganha um ramo para criar a mesma imagem no mapa sem copiar.

**Tech Stack:** Tauri v2, React 19, TypeScript, tldraw 4.5.12, Zustand, TipTap 3.27 (+ `@tiptap/extension-image`), Vitest.

**Spec:** `docs/superpowers/specs/2026-07-13-grimorio-escrita-design.md`
**Base v1:** implementada até commit `f0767dc` na branch `feature/grimorio-v1`.

**Nota de APIs (conferidas na instalação):** `@tiptap/extension-image` não está instalado (Task 1 instala). `tldraw` reexporta `AssetRecordType`, `createShapeId`, `getImageSize`, `Editor.createAssets` (cadeia `tldraw → @tldraw/editor → @tldraw/tlschema`). `@tiptap/react` já tem `ReactNodeViewRenderer`/`NodeViewWrapper`. Onde uma assinatura exata do tldraw/tiptap importar, o implementador confere no `node_modules/**/*.d.mts` antes de codar — não inventar.

**Comandos:** rodar tudo de `grimorio/`. FOREGROUND (sem background). Sem `tauri dev` nas tasks (verificação manual é um passo à parte no fim). Repo: `C:\Users\gedasio.filho\OneDrive - Vertis Capital\Área de Trabalho\Projeto Obsidian` (aspas por causa de espaços/acentos).

---

## Estrutura de arquivos

```
grimorio/src/
  lib/
    types.ts               # MOD: + Pagina, PaginaRef, PaginaNode
    caminhos.ts            # NOVO: helpers de caminho puros (testados)
    notebookRepo.ts        # NOVO: caderno (pasta de páginas) — dados, testado
  state/store.ts           # MOD: aberto discriminado, caderno/página ativa, split state
  components/
    PaginasRail.tsx        # NOVO: árvore de páginas (CRUD + arrastar reordenar/aninhar)
    ImagemCofre.tsx        # NOVO: extensão TipTap de imagem (rel + NodeView arrastável)
    NotasEditor.tsx        # NOVO: editor TipTap da página ativa + toolbar + inserir imagem
    Workspace.tsx          # NOVO: casca do split (rail | notas | mapa), recolher/redim/anim
    CanvasView.tsx         # MOD: drop handler aceita imagem de nota
    Sidebar.tsx            # MOD: entrada "Escrita" por campanha; sessão abre workspace
    App.tsx                # MOD: roteia por tipo de item aberto
  test/
    caminhos.test.ts       # NOVO
    notebookRepo.test.ts   # NOVO
  theme.css                # MOD: estilos dos componentes novos + animação
```

Camadas: `components` → `store` → `NotebookRepo`/`VaultRepo` → `FsBridge`. `NotebookRepo` é isolado e testável com o `fakeFs` da v1.

---

### Task 1: Dependência + tipos + helpers de caminho

**Files:**
- Modify: `grimorio/package.json` (via npm)
- Modify: `grimorio/src/lib/types.ts`
- Create: `grimorio/src/lib/caminhos.ts`
- Test: `grimorio/src/test/caminhos.test.ts`

- [ ] **Step 1: Instalar extensão de imagem do TipTap**

```bash
npm i @tiptap/extension-image@^3
```

Verificar que resolveu uma versão 3.27.x compatível com `@tiptap/react`/`@tiptap/starter-kit` já instalados (`npm ls @tiptap/extension-image @tiptap/react`).

- [ ] **Step 2: Tipos de página**

Adicionar ao fim de `grimorio/src/lib/types.ts`:

```typescript
export interface Pagina {
  id: string
  titulo: string
  paiId: string | null
  ordem: number
  corpo: string // HTML do TipTap (imagens guardam data-rel, sem caminho absoluto)
  criadoEm: string
  modificadoEm: string
}

/** Referência leve de página na árvore. */
export interface PaginaRef {
  slug: string
  id: string
  titulo: string
  erro?: boolean
}

export interface PaginaNode extends PaginaRef {
  paiId: string | null
  ordem: number
  filhos: PaginaNode[]
}
```

- [ ] **Step 3: Teste dos helpers de caminho (falhando)**

```typescript
// grimorio/src/test/caminhos.test.ts
import { describe, expect, it } from 'vitest'
import { dirNotasDaSessao, escritaDirDaCampanha, caminhoAbsolutoImagem } from '../lib/caminhos'

describe('dirNotasDaSessao', () => {
  it('troca .json por .notas', () => {
    expect(dirNotasDaSessao('campanhas/x/sessoes/sessao-01.json'))
      .toBe('campanhas/x/sessoes/sessao-01.notas')
  })
})

describe('escritaDirDaCampanha', () => {
  it('monta o caminho do caderno livre da campanha', () => {
    expect(escritaDirDaCampanha('minha-campanha')).toBe('campanhas/minha-campanha/escrita')
  })
})

describe('caminhoAbsolutoImagem', () => {
  it('junta vaultPath e caminho relativo', () => {
    expect(caminhoAbsolutoImagem('C:/Cofre', 'imagens-notas/a.png')).toBe('C:/Cofre/imagens-notas/a.png')
  })
})
```

- [ ] **Step 4: Rodar e ver falhar**

```bash
npm test
```
Esperado: FAIL — `../lib/caminhos` não existe.

- [ ] **Step 5: Implementar**

```typescript
// grimorio/src/lib/caminhos.ts

/** Pasta do caderno de uma sessão: irmã do arquivo do mapa. */
export function dirNotasDaSessao(caminhoSessao: string): string {
  return caminhoSessao.replace(/\.json$/, '.notas')
}

/** Pasta do caderno livre de uma campanha. */
export function escritaDirDaCampanha(campanhaSlug: string): string {
  return `campanhas/${campanhaSlug}/escrita`
}

/** Caminho absoluto de uma imagem do cofre (o que se passa a convertFileSrc). */
export function caminhoAbsolutoImagem(vaultPath: string, rel: string): string {
  return `${vaultPath}/${rel}`
}
```

- [ ] **Step 6: Rodar e ver passar**

```bash
npm test
```
Esperado: PASS. `npx tsc --noEmit` limpo.

- [ ] **Step 7: Commit**

```bash
git add grimorio/package.json grimorio/package-lock.json grimorio/src/lib/types.ts grimorio/src/lib/caminhos.ts grimorio/src/test/caminhos.test.ts
git commit -m "feat: extensao de imagem tiptap, tipos de pagina e helpers de caminho"
```

---

### Task 2: NotebookRepo — camada de dados do caderno (TDD)

**Files:**
- Create: `grimorio/src/lib/notebookRepo.ts`
- Test: `grimorio/src/test/notebookRepo.test.ts`

- [ ] **Step 1: Testes (escrever primeiro)**

```typescript
// grimorio/src/test/notebookRepo.test.ts
import { beforeEach, describe, expect, it } from 'vitest'
import { criarFakeFs } from './fakeFs'
import { NotebookRepo } from '../lib/notebookRepo'

let fs: ReturnType<typeof criarFakeFs>
let repo: NotebookRepo

beforeEach(() => {
  fs = criarFakeFs()
  repo = new NotebookRepo('C:/Cofre/campanhas/x/escrita', fs)
})

describe('NotebookRepo', () => {
  it('cria página raiz com ordem 0', async () => {
    const ref = await repo.criarPagina('O Gancho', null)
    expect(ref.slug).toBe('o-gancho')
    const p = await repo.lerPagina(ref.slug)
    expect(p.titulo).toBe('O Gancho')
    expect(p.paiId).toBeNull()
    expect(p.ordem).toBe(0)
    expect(p.id).toBeTruthy()
  })

  it('irmãos ganham ordem incremental', async () => {
    await repo.criarPagina('A', null)
    const b = await repo.criarPagina('B', null)
    expect((await repo.lerPagina(b.slug)).ordem).toBe(1)
  })

  it('subpágina referencia o pai', async () => {
    const pai = await repo.criarPagina('Pai', null)
    const filho = await repo.criarPagina('Filho', pai.id)
    expect((await repo.lerPagina(filho.slug)).paiId).toBe(pai.id)
  })

  it('salvarCorpo preserva id e título', async () => {
    const ref = await repo.criarPagina('Nota', null)
    const idAntes = (await repo.lerPagina(ref.slug)).id
    await repo.salvarCorpo(ref.slug, '<p>texto</p>')
    const p = await repo.lerPagina(ref.slug)
    expect(p.corpo).toBe('<p>texto</p>')
    expect(p.titulo).toBe('Nota')
    expect(p.id).toBe(idAntes)
  })

  it('renomeia página (muda título, mantém arquivo)', async () => {
    const ref = await repo.criarPagina('Velho', null)
    await repo.renomearPagina(ref.slug, 'Novo')
    expect((await repo.lerPagina(ref.slug)).titulo).toBe('Novo')
  })

  it('monta árvore aninhada e ordenada', async () => {
    const pai = await repo.criarPagina('Pai', null)
    await repo.criarPagina('Filho 1', pai.id)
    await repo.criarPagina('Filho 2', pai.id)
    await repo.criarPagina('Solto', null)
    const arv = await repo.montarArvore()
    expect(arv).toHaveLength(2) // Pai, Solto
    const noPai = arv.find((n) => n.titulo === 'Pai')!
    expect(noPai.filhos.map((f) => f.titulo)).toEqual(['Filho 1', 'Filho 2'])
  })

  it('excluir remove a página e as descendentes', async () => {
    const pai = await repo.criarPagina('Pai', null)
    const filho = await repo.criarPagina('Filho', pai.id)
    await repo.excluirPagina(pai.slug)
    expect(await fs.exists(`C:/Cofre/campanhas/x/escrita/${pai.slug}.json`)).toBe(false)
    expect(await fs.exists(`C:/Cofre/campanhas/x/escrita/${filho.slug}.json`)).toBe(false)
  })

  it('mover reparenta e renumera irmãos', async () => {
    const a = await repo.criarPagina('A', null)
    const b = await repo.criarPagina('B', null)
    const c = await repo.criarPagina('C', null)
    // move C para o topo (ordem 0) sob a raiz
    await repo.moverPagina(c.id, null, 0)
    const arv = await repo.montarArvore()
    expect(arv.map((n) => n.titulo)).toEqual(['C', 'A', 'B'])
    // ids preservados
    expect(arv[0].id).toBe((await repo.lerPagina(c.slug)).id)
    // e A/B mantidos
    expect(a.id && b.id).toBeTruthy()
  })

  it('mover para dentro da própria descendência é ignorado (sem ciclo)', async () => {
    const pai = await repo.criarPagina('Pai', null)
    const filho = await repo.criarPagina('Filho', pai.id)
    await repo.moverPagina(pai.id, filho.id, 0)
    // pai continua na raiz
    const arv = await repo.montarArvore()
    expect(arv.find((n) => n.id === pai.id)).toBeTruthy()
  })

  it('página corrompida vira nó com erro, sem derrubar a árvore', async () => {
    await repo.criarPagina('Boa', null)
    await fs.writeTextAtomic('C:/Cofre/campanhas/x/escrita/quebrada.json', '{nao é json')
    const arv = await repo.montarArvore()
    const quebrada = arv.find((n) => n.slug === 'quebrada')
    expect(quebrada?.erro).toBe(true)
    expect(arv.find((n) => n.titulo === 'Boa')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npm test
```
Esperado: FAIL — `../lib/notebookRepo` não existe.

- [ ] **Step 3: Implementar**

```typescript
// grimorio/src/lib/notebookRepo.ts
import type { FsBridge } from './fsBridge'
import type { Pagina, PaginaNode, PaginaRef } from './types'
import { slugify, slugUnico } from './slug'

function agora(): string {
  return new Date().toISOString()
}
function novoId(): string {
  return crypto.randomUUID()
}

type PaginaComSlug = Pagina & { slug: string; erro?: boolean }

/**
 * Caderno = pasta de páginas JSON. `raiz` é o caminho ABSOLUTO da pasta do caderno.
 * Arquivos nomeados por slug; identidade por `id`; hierarquia por `paiId`/`ordem`.
 * Escritas no mesmo arquivo são serializadas (mesma ideia do VaultRepo.naFila).
 */
export class NotebookRepo {
  private filas = new Map<string, Promise<unknown>>()

  constructor(
    private raiz: string,
    private fs: FsBridge,
  ) {}

  private abs(slug: string): string {
    return `${this.raiz}/${slug}.json`
  }

  private naFila<T>(slug: string, op: () => Promise<T>): Promise<T> {
    const anterior = this.filas.get(slug) ?? Promise.resolve()
    const proxima = anterior.then(op, op)
    this.filas.set(slug, proxima)
    return proxima
  }

  async inicializar(): Promise<void> {
    await this.fs.mkdirAll(this.raiz)
  }

  private async listaComSlug(): Promise<PaginaComSlug[]> {
    let entries: { name: string; isDir: boolean }[] = []
    try {
      entries = await this.fs.listDir(this.raiz)
    } catch {
      return []
    }
    const out: PaginaComSlug[] = []
    for (const e of entries) {
      if (e.isDir || !e.name.endsWith('.json')) continue
      const slug = e.name.replace(/\.json$/, '')
      try {
        const p: Pagina = JSON.parse(await this.fs.readText(this.abs(slug)))
        out.push({ ...p, slug })
      } catch {
        out.push({
          id: `erro:${slug}`, titulo: slug, paiId: null, ordem: 9999,
          corpo: '', criadoEm: '', modificadoEm: '', slug, erro: true,
        })
      }
    }
    return out
  }

  private async slugsExistentes(): Promise<string[]> {
    return (await this.listaComSlug()).map((p) => p.slug)
  }

  async criarPagina(titulo: string, paiId: string | null): Promise<PaginaRef> {
    await this.inicializar()
    const lista = await this.listaComSlug()
    const slug = slugUnico(slugify(titulo), lista.map((p) => p.slug))
    const ordem = lista.filter((p) => p.paiId === paiId).reduce((m, p) => Math.max(m, p.ordem), -1) + 1
    const pag: Pagina = {
      id: novoId(), titulo, paiId, ordem, corpo: '',
      criadoEm: agora(), modificadoEm: agora(),
    }
    await this.fs.writeTextAtomic(this.abs(slug), JSON.stringify(pag, null, 2))
    return { slug, id: pag.id, titulo }
  }

  async lerPagina(slug: string): Promise<Pagina> {
    return JSON.parse(await this.fs.readText(this.abs(slug)))
  }

  async salvarCorpo(slug: string, corpo: string): Promise<void> {
    return this.naFila(slug, async () => {
      const atual: Pagina = JSON.parse(await this.fs.readText(this.abs(slug)))
      const salvo = { ...atual, corpo, modificadoEm: agora() }
      await this.fs.writeTextAtomic(this.abs(slug), JSON.stringify(salvo, null, 2))
    })
  }

  async renomearPagina(slug: string, novoTitulo: string): Promise<void> {
    return this.naFila(slug, async () => {
      const atual: Pagina = JSON.parse(await this.fs.readText(this.abs(slug)))
      const salvo = { ...atual, titulo: novoTitulo, modificadoEm: agora() }
      await this.fs.writeTextAtomic(this.abs(slug), JSON.stringify(salvo, null, 2))
    })
  }

  /** Exclui a página e todas as descendentes. */
  async excluirPagina(slug: string): Promise<void> {
    const lista = await this.listaComSlug()
    const alvo = lista.find((p) => p.slug === slug)
    if (!alvo) {
      await this.fs.removePath(this.abs(slug))
      return
    }
    const remover = new Set<string>()
    const coletar = (id: string) => {
      remover.add(id)
      for (const f of lista.filter((p) => p.paiId === id)) coletar(f.id)
    }
    coletar(alvo.id)
    for (const p of lista.filter((p) => remover.has(p.id))) {
      await this.fs.removePath(this.abs(p.slug))
    }
  }

  /** Move a página (por id) para novo pai e posição; renumera os irmãos do destino. */
  async moverPagina(id: string, novoPaiId: string | null, novaOrdem: number): Promise<void> {
    const lista = await this.listaComSlug()
    const movida = lista.find((p) => p.id === id)
    if (!movida) return

    // guarda de ciclo: novo pai não pode ser a própria página nem descendente dela
    const descendencia = new Set<string>()
    const coletar = (pid: string) => {
      descendencia.add(pid)
      for (const f of lista.filter((p) => p.paiId === pid)) coletar(f.id)
    }
    coletar(id)
    if (novoPaiId && descendencia.has(novoPaiId)) return

    const irmaos = lista
      .filter((p) => p.paiId === novoPaiId && p.id !== id)
      .sort((a, b) => a.ordem - b.ordem)
    const idx = Math.max(0, Math.min(novaOrdem, irmaos.length))
    irmaos.splice(idx, 0, { ...movida, paiId: novoPaiId })

    for (let i = 0; i < irmaos.length; i++) {
      const alvo = lista.find((x) => x.id === irmaos[i].id)!
      const precisa = alvo.ordem !== i || alvo.paiId !== novoPaiId || alvo.id === id
      if (!precisa) continue
      const arquivo: Pagina = JSON.parse(await this.fs.readText(this.abs(alvo.slug)))
      const salvo = { ...arquivo, paiId: novoPaiId, ordem: i, modificadoEm: agora() }
      await this.fs.writeTextAtomic(this.abs(alvo.slug), JSON.stringify(salvo, null, 2))
    }
  }

  async montarArvore(): Promise<PaginaNode[]> {
    const lista = await this.listaComSlug()
    const nodes = new Map<string, PaginaNode>()
    for (const p of lista) {
      nodes.set(p.id, {
        slug: p.slug, id: p.id, titulo: p.titulo, erro: p.erro,
        paiId: p.paiId, ordem: p.ordem, filhos: [],
      })
    }
    const raiz: PaginaNode[] = []
    for (const n of nodes.values()) {
      if (n.paiId && nodes.has(n.paiId)) nodes.get(n.paiId)!.filhos.push(n)
      else raiz.push(n)
    }
    const ordenar = (arr: PaginaNode[]) => {
      arr.sort((a, b) => a.ordem - b.ordem)
      arr.forEach((n) => ordenar(n.filhos))
    }
    ordenar(raiz)
    return raiz
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

```bash
npm test
```
Esperado: PASS (todos, incluindo os 22 da v1). `npx tsc --noEmit` limpo.

- [ ] **Step 5: Commit**

```bash
git add grimorio/src/lib/notebookRepo.ts grimorio/src/test/notebookRepo.test.ts
git commit -m "feat: NotebookRepo (caderno de paginas aninhadas) com testes"
```

---

### Task 3: Store — item aberto discriminado, caderno/página ativa, split

**Files:**
- Modify: `grimorio/src/state/store.ts`

- [ ] **Step 1: Estender o store**

Trocar a interface `ItemAberto` e adicionar estado/ações. Substituir a definição atual de `ItemAberto` por:

```typescript
export type TipoAberto = 'sessao' | 'canvas' | 'escrita'

export interface ItemAberto {
  tipo: TipoAberto
  /** sessao/canvas: caminho do .json do mapa. escrita: caminho da pasta do caderno (relativo ao cofre). */
  caminho: string
  nome: string
}
```

No `AppState`, adicionar campos e ações (mantendo os existentes):

```typescript
  /** slug da página ativa por caderno (chave = dir do caderno relativo ao cofre) */
  paginaAtivaPorCaderno: Record<string, string | null>
  setPaginaAtiva(cadernoDir: string, slug: string | null): void
```

E ajustar `abrirItem` para aceitar o tipo:

```typescript
  abrirItem(tipo: TipoAberto, caminho: string, nome: string): void
```

Implementação das partes novas dentro do `create(...)`:

```typescript
  paginaAtivaPorCaderno: {},

  abrirItem(tipo, caminho, nome) {
    set({ aberto: { tipo, caminho, nome } })
  },

  setPaginaAtiva(cadernoDir, slug) {
    set((s) => ({ paginaAtivaPorCaderno: { ...s.paginaAtivaPorCaderno, [cadernoDir]: slug } }))
  },
```

Nota: o estado do split (proporção/recolhido) NÃO fica no store — vive em `localStorage` chaveado pelo caminho, lido/escrito direto no `Workspace` (Task 7), pra não reder­izar o app todo a cada arrasto da divisória.

- [ ] **Step 2: Verificar**

```bash
npx tsc --noEmit
```
Esperado: erros de tipo em `Sidebar.tsx`/`App.tsx` porque `abrirItem` mudou de assinatura — **isso é esperado** e será resolvido na Task 8. Para não deixar a base quebrada entre tasks, fazer o ajuste mínimo agora: em `Sidebar.tsx`, nas chamadas atuais `abrirItem(item.caminho, item.nome)`, trocar para `abrirItem('canvas', item.caminho, item.nome)`; em `App.tsx`, onde lê `aberto` e renderiza `CanvasView`, manter — `aberto.tipo` existe. Rodar `npx tsc --noEmit` de novo: limpo.

```bash
npm test
```
Esperado: 22/22 (sem novos testes nesta task; store não é testado unitariamente).

- [ ] **Step 3: Commit**

```bash
git add grimorio/src/state/store.ts grimorio/src/components/Sidebar.tsx grimorio/src/App.tsx
git commit -m "feat: item aberto discriminado (sessao/canvas/escrita) e pagina ativa no store"
```

---

### Task 4: PaginasRail — árvore de páginas (CRUD + arrastar)

**Files:**
- Create: `grimorio/src/components/PaginasRail.tsx`

- [ ] **Step 1: Implementar**

```tsx
// grimorio/src/components/PaginasRail.tsx
import { useEffect, useState } from 'react'
import { NotebookRepo } from '../lib/notebookRepo'
import type { PaginaNode } from '../lib/types'
import { useApp } from '../state/store'

async function comAviso(acao: () => Promise<void>) {
  try {
    await acao()
  } catch (e) {
    alert(`Operação falhou: ${e}`)
  }
}

/**
 * `repo` é a MESMA instância do NotebookRepo usada pelo NotasEditor (criada no Workspace),
 * para que rename/mover (rail) e salvarCorpo (editor) da mesma página sejam serializados
 * pela mesma fila `naFila` e nunca se sobrescrevam.
 * cadernoDirRel = caminho relativo ao cofre (chave da página ativa no store).
 */
export function PaginasRail({ repo, cadernoDirRel }: { repo: NotebookRepo; cadernoDirRel: string }) {
  const [arvore, setArvore] = useState<PaginaNode[] | null>(null)
  const ativa = useApp((s) => s.paginaAtivaPorCaderno[cadernoDirRel] ?? null)
  const setPaginaAtiva = useApp((s) => s.setPaginaAtiva)

  async function recarregar() {
    setArvore(await repo.montarArvore())
  }

  useEffect(() => {
    repo.inicializar().then(recarregar)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo])

  async function nova(paiId: string | null) {
    const titulo = prompt('Título da página:')
    if (!titulo) return
    await comAviso(async () => {
      const ref = await repo.criarPagina(titulo, paiId)
      await recarregar()
      setPaginaAtiva(cadernoDirRel, ref.slug)
    })
  }

  async function onDropReparent(arrastadaId: string, novoPaiId: string | null) {
    if (arrastadaId === novoPaiId) return
    await comAviso(async () => {
      await repo.moverPagina(arrastadaId, novoPaiId, 0)
      await recarregar()
    })
  }

  if (!arvore) return <div className="rail rail-vazio">Carregando…</div>

  return (
    <div
      className="rail"
      onDragOver={(e) => { if (e.dataTransfer.types.includes('application/x-grimorio-pagina')) e.preventDefault() }}
      onDrop={(e) => {
        const id = e.dataTransfer.getData('application/x-grimorio-pagina')
        if (id) void onDropReparent(id, null) // solto na área vazia = vira raiz
      }}
    >
      <div className="rail-header">
        <span>Páginas</span>
        <button className="btn-icon" title="Nova página" onClick={() => void nova(null)}>+</button>
      </div>
      {arvore.length === 0 && <div className="rail-vazio">Sem páginas ainda.</div>}
      {arvore.map((n) => (
        <LinhaPagina
          key={n.id}
          node={n}
          nivel={0}
          ativa={ativa}
          onAbrir={(slug) => setPaginaAtiva(cadernoDirRel, slug)}
          onNova={nova}
          onReparent={onDropReparent}
          repo={repo}
          recarregar={recarregar}
          cadernoDirRel={cadernoDirRel}
        />
      ))}
    </div>
  )
}

function LinhaPagina({
  node, nivel, ativa, onAbrir, onNova, onReparent, repo, recarregar, cadernoDirRel,
}: {
  node: PaginaNode
  nivel: number
  ativa: string | null
  onAbrir: (slug: string) => void
  onNova: (paiId: string | null) => void
  onReparent: (arrastadaId: string, novoPaiId: string | null) => void
  repo: NotebookRepo
  recarregar: () => Promise<void>
  cadernoDirRel: string
}) {
  const [aberto, setAberto] = useState(true)
  const setPaginaAtiva = useApp((s) => s.setPaginaAtiva)

  async function renomear(e: React.MouseEvent) {
    e.stopPropagation()
    const titulo = prompt('Novo título:', node.titulo)
    if (!titulo) return
    await comAviso(async () => {
      await repo.renomearPagina(node.slug, titulo)
      await recarregar()
    })
  }

  async function excluir(e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm(`Excluir "${node.titulo}" e as subpáginas?`)) return
    await comAviso(async () => {
      await repo.excluirPagina(node.slug)
      if (ativa === node.slug) setPaginaAtiva(cadernoDirRel, null)
      await recarregar()
    })
  }

  return (
    <div className="rail-node">
      <div
        className={`rail-linha ${ativa === node.slug ? 'ativa' : ''} ${node.erro ? 'item-erro' : ''}`}
        style={{ paddingLeft: 8 + nivel * 14 }}
        onClick={() => !node.erro && onAbrir(node.slug)}
        draggable={!node.erro}
        onDragStart={(e) => e.dataTransfer.setData('application/x-grimorio-pagina', node.id)}
        onDragOver={(e) => { if (e.dataTransfer.types.includes('application/x-grimorio-pagina')) { e.preventDefault(); e.stopPropagation() } }}
        onDrop={(e) => {
          e.stopPropagation()
          const id = e.dataTransfer.getData('application/x-grimorio-pagina')
          if (id) onReparent(id, node.id) // soltar em cima = vira filho desta
        }}
        title={node.erro ? 'Página com erro' : node.titulo}
      >
        {node.filhos.length > 0 ? (
          <span className="chevron" onClick={(e) => { e.stopPropagation(); setAberto(!aberto) }}>{aberto ? '▾' : '▸'}</span>
        ) : <span className="chevron-vazio" />}
        <span className="rail-titulo">{node.titulo}{node.erro ? ' ⚠' : ''}</span>
        <span className="rail-acoes" onClick={(e) => e.stopPropagation()}>
          <button className="btn-icon" title="Subpágina" onClick={(e) => { e.stopPropagation(); onNova(node.id) }}>+</button>
          <button className="btn-icon" title="Renomear" onClick={renomear}>✎</button>
          <button className="btn-icon" title="Excluir" onClick={excluir}>🗑</button>
        </span>
      </div>
      {aberto && node.filhos.map((f) => (
        <LinhaPagina
          key={f.id} node={f} nivel={nivel + 1} ativa={ativa}
          onAbrir={onAbrir} onNova={onNova} onReparent={onReparent}
          repo={repo} recarregar={recarregar} cadernoDirRel={cadernoDirRel}
        />
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Verificar**

```bash
npx tsc --noEmit && npm run build && npm test
```
Esperado: tsc limpo, build ok, 23/23 (22 v1 + caminhos… na verdade os testes de caminhos já entraram na Task 1). Contagem exata não importa; todos verdes.

- [ ] **Step 3: Commit**

```bash
git add grimorio/src/components/PaginasRail.tsx
git commit -m "feat: PaginasRail (arvore de paginas com CRUD e arrastar aninhar)"
```

---

### Task 5: ImagemCofre — extensão TipTap de imagem portável e arrastável

**Files:**
- Create: `grimorio/src/components/ImagemCofre.tsx`

Antes de codar, conferir em `node_modules/@tiptap/extension-image/dist/index.d.ts` que o export default é a extensão `Image` e que `addAttributes`/`parseHTML`/`renderHTML` seguem o padrão TipTap 3; e em `@tiptap/react` que `ReactNodeViewRenderer` e `NodeViewWrapper` existem (já usados no projeto? confirmar). Adaptar se a assinatura diferir.

- [ ] **Step 1: Implementar**

```tsx
// grimorio/src/components/ImagemCofre.tsx
import Image from '@tiptap/extension-image'
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from '@tiptap/react'
import { convertFileSrc } from '@tauri-apps/api/core'
import { useApp } from '../state/store'
import { caminhoAbsolutoImagem } from '../lib/caminhos'

function ImagemView(props: ReactNodeViewProps) {
  const vaultPath = useApp((s) => s.vaultPath)
  const rel = (props.node.attrs.rel as string | null) ?? null
  const src = rel && vaultPath ? convertFileSrc(caminhoAbsolutoImagem(vaultPath, rel)) : ''
  return (
    <NodeViewWrapper as="span" className="nota-img">
      <img
        src={src}
        draggable
        onDragStart={(e) => { if (rel) e.dataTransfer.setData('application/x-grimorio-imagem', rel) }}
        alt=""
      />
    </NodeViewWrapper>
  )
}

/**
 * Imagem de página: guarda só `data-rel` (caminho relativo ao cofre) no HTML salvo,
 * nunca o caminho absoluto da máquina (portável entre PCs). O src exibível é
 * calculado em tempo de render a partir do vaultPath atual.
 */
export const ImagemCofre = Image.extend({
  name: 'image',
  addAttributes() {
    return {
      rel: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-rel'),
        renderHTML: (attrs: { rel?: string | null }) => (attrs.rel ? { 'data-rel': attrs.rel } : {}),
      },
      // não persistir src absoluto no HTML salvo
      src: { default: null, renderHTML: () => ({}) },
    }
  },
  addNodeView() {
    return ReactNodeViewRenderer(ImagemView)
  },
})
```

Nota: `name: 'image'` mantém o node reconhecível ao reabrir HTML salvo. Se `ReactNodeViewProps` não existir com esse nome na versão instalada, usar o tipo que o `@tiptap/react` exporta (ex.: `NodeViewProps`) — conferir nos types.

- [ ] **Step 2: Verificar**

```bash
npx tsc --noEmit && npm run build
```
Esperado: limpo (a extensão só é exercitada de verdade no editor, Task 6).

- [ ] **Step 3: Commit**

```bash
git add grimorio/src/components/ImagemCofre.tsx
git commit -m "feat: extensao de imagem TipTap portavel e arrastavel (ImagemCofre)"
```

---

### Task 6: NotasEditor — editor da página ativa

**Files:**
- Create: `grimorio/src/components/NotasEditor.tsx`

- [ ] **Step 1: Implementar**

O `NotasEditor` é dividido em dois: um **carregador** (lê o corpo da página, assíncrono) e um **editor interno** que só monta quando o corpo já chegou. O `Workspace` já passa `key={slug}`, então cada troca de página remonta o carregador; o editor interno também é keyed pelo slug — assim o `useEditor` sempre inicia com o `content` certo, sem depender do 2º argumento de dependências do `useEditor` (evita incerteza de API).

```tsx
// grimorio/src/components/NotasEditor.tsx
import { useEffect, useRef, useState } from 'react'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { open } from '@tauri-apps/plugin-dialog'
import type { NotebookRepo } from '../lib/notebookRepo'
import { ImagemCofre } from './ImagemCofre'
import { useApp } from '../state/store'

const AUTOSAVE_MS = 800

function idImagem(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 16)
}

/** Carregador: busca o corpo da página e só então monta o editor (keyed pelo slug). */
export function NotasEditor({ repo, slug }: { repo: NotebookRepo; slug: string }) {
  const [corpo, setCorpo] = useState<string | null>(null)

  useEffect(() => {
    let ativo = true
    setCorpo(null)
    repo.lerPagina(slug)
      .then((p) => { if (ativo) setCorpo(p.corpo ?? '') })
      .catch(() => { if (ativo) setCorpo('') })
    return () => { ativo = false }
  }, [repo, slug])

  if (corpo === null) return <div className="notas-carregando">Carregando…</div>
  return <EditorInterno key={slug} repo={repo} slug={slug} corpoInicial={corpo} />
}

function EditorInterno({ repo, slug, corpoInicial }: { repo: NotebookRepo; slug: string; corpoInicial: string }) {
  const vaultPath = useApp((s) => s.vaultPath)
  const [salvarErro, setSalvarErro] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const editor = useEditor({
    extensions: [StarterKit, ImagemCofre],
    content: corpoInicial,
    onUpdate({ editor }) {
      agendarSalvar(editor.getHTML())
    },
  })

  const ativo = useEditorState({
    editor,
    selector: ({ editor }) => editor ? {
      bold: editor.isActive('bold'), italic: editor.isActive('italic'),
      h1: editor.isActive('heading', { level: 1 }), h2: editor.isActive('heading', { level: 2 }),
      h3: editor.isActive('heading', { level: 3 }),
      bullet: editor.isActive('bulletList'), ordered: editor.isActive('orderedList'),
      quote: editor.isActive('blockquote'),
    } : null,
  })

  useEffect(() => () => { if (timer.current) { clearTimeout(timer.current); void salvar() } }, [])

  function agendarSalvar(corpo: string) {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => { timer.current = null; void salvar(corpo) }, AUTOSAVE_MS)
  }

  async function salvar(corpo?: string): Promise<boolean> {
    const html = corpo ?? editor?.getHTML()
    if (html === undefined) return true
    try {
      await repo.salvarCorpo(slug, html)
      setSalvarErro(null)
      return true
    } catch (e) {
      console.error('Falha ao salvar página:', e)
      setSalvarErro(String(e))
      return false
    }
  }

  async function inserirImagem() {
    if (!editor || !vaultPath) return
    try {
      const arquivo = await open({
        title: 'Inserir imagem',
        filters: [{ name: 'Imagens', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
      })
      if (typeof arquivo !== 'string') return
      const nome = arquivo.split(/[\\/]/).pop() ?? ''
      const ext = (nome.includes('.') ? nome.split('.').pop()! : 'png').toLowerCase()
      const rel = `imagens-notas/${idImagem()}.${ext}`
      // grava a imagem no cofre reusando o VaultRepo do store (copiarParaCofre já existe na v1)
      const repoCofre = useApp.getState().repo
      if (!repoCofre) throw new Error('cofre não carregado')
      await repoCofre.copiarParaCofre(arquivo, rel)
      editor.chain().focus().insertContent({ type: 'image', attrs: { rel } }).run()
    } catch (e) {
      alert(`Falha ao inserir imagem: ${e}`)
    }
  }

  if (!editor) return <div className="notas-carregando">Carregando…</div>

  return (
    <div className="notas">
      <div className="notas-toolbar">
        <button className={ativo?.bold ? 'ativo' : ''} onClick={() => editor.chain().focus().toggleBold().run()}><b>B</b></button>
        <button className={ativo?.italic ? 'ativo' : ''} onClick={() => editor.chain().focus().toggleItalic().run()}><i>I</i></button>
        <span className="sep" />
        <button className={ativo?.h1 ? 'ativo' : ''} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>H1</button>
        <button className={ativo?.h2 ? 'ativo' : ''} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>H2</button>
        <button className={ativo?.h3 ? 'ativo' : ''} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>H3</button>
        <span className="sep" />
        <button className={ativo?.bullet ? 'ativo' : ''} onClick={() => editor.chain().focus().toggleBulletList().run()}>• Lista</button>
        <button className={ativo?.ordered ? 'ativo' : ''} onClick={() => editor.chain().focus().toggleOrderedList().run()}>1. Lista</button>
        <button className={ativo?.quote ? 'ativo' : ''} onClick={() => editor.chain().focus().toggleBlockquote().run()}>❝</button>
        <button onClick={() => editor.chain().focus().setHorizontalRule().run()}>―</button>
        <span className="sep" />
        <button onClick={() => void inserirImagem()}>🖼 Imagem</button>
      </div>
      <EditorContent editor={editor} className="notas-corpo" />
      {salvarErro && <div className="notas-salvar-erro">Falha ao salvar: {salvarErro}</div>}
    </div>
  )
}
```

- [ ] **Step 2: Verificar**

```bash
npx tsc --noEmit && npm run build && npm test
```
Esperado: limpo/ok/verde.

- [ ] **Step 3: Commit**

```bash
git add grimorio/src/components/NotasEditor.tsx
git commit -m "feat: NotasEditor (editor TipTap da pagina, toolbar, inserir imagem, autosave)"
```

---

### Task 7: Workspace — casca do split (rail | notas | mapa)

**Files:**
- Create: `grimorio/src/components/Workspace.tsx`

- [ ] **Step 1: Implementar**

```tsx
// grimorio/src/components/Workspace.tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { PaginasRail } from './PaginasRail'
import { NotasEditor } from './NotasEditor'
import { CanvasView } from './CanvasView'
import { tauriFs } from '../lib/fsBridge'
import { NotebookRepo } from '../lib/notebookRepo'
import { useApp } from '../state/store'

interface EstadoSplit {
  proporcao: number // fração larg. das Notas (0..1) quando ambos abertos
  recolhido: 'nenhum' | 'notas' | 'mapa'
}

function lerSplit(chave: string): EstadoSplit {
  try {
    const s = localStorage.getItem(`grimorio.split.${chave}`)
    if (s) return JSON.parse(s)
  } catch { /* ignora */ }
  return { proporcao: 0.5, recolhido: 'nenhum' }
}
function salvarSplit(chave: string, e: EstadoSplit) {
  localStorage.setItem(`grimorio.split.${chave}`, JSON.stringify(e))
}

/**
 * cadernoDirAbs/Rel: pasta do caderno. mapa: props do CanvasView (undefined = escrita livre, sem mapa).
 * chaveSplit: identificador estável para lembrar o layout (ex.: caminho da sessão).
 */
export function Workspace({
  cadernoDirAbs, cadernoDirRel, chaveSplit, mapa,
}: {
  cadernoDirAbs: string
  cadernoDirRel: string
  chaveSplit: string
  mapa?: { caminho: string; nome: string }
}) {
  const slugAtivo = useApp((s) => s.paginaAtivaPorCaderno[cadernoDirRel] ?? null)
  // UMA instância de NotebookRepo compartilhada entre rail e editor: serializa
  // rename/mover (rail) e salvarCorpo (editor) da mesma página na mesma fila.
  const repo = useMemo(() => new NotebookRepo(cadernoDirAbs, tauriFs), [cadernoDirAbs])
  const [split, setSplit] = useState<EstadoSplit>(() => lerSplit(chaveSplit))
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const arrastando = useRef(false)

  useEffect(() => { salvarSplit(chaveSplit, split) }, [chaveSplit, split])
  useEffect(() => { setSplit(lerSplit(chaveSplit)) }, [chaveSplit])

  const temMapa = !!mapa
  const recolhido = temMapa ? split.recolhido : 'mapa' // sem mapa: escrita sempre cheia

  function iniciarArrasto(e: React.MouseEvent) {
    if (!temMapa) return
    arrastando.current = true
    e.preventDefault()
  }
  useEffect(() => {
    function mover(e: MouseEvent) {
      if (!arrastando.current || !wrapRef.current) return
      const r = wrapRef.current.getBoundingClientRect()
      const frac = Math.min(0.85, Math.max(0.15, (e.clientX - r.left) / r.width))
      setSplit((s) => ({ ...s, proporcao: frac }))
    }
    function soltar() { arrastando.current = false }
    window.addEventListener('mousemove', mover)
    window.addEventListener('mouseup', soltar)
    return () => { window.removeEventListener('mousemove', mover); window.removeEventListener('mouseup', soltar) }
  }, [])

  const escritaFlex = recolhido === 'notas' ? 0 : recolhido === 'mapa' ? 1 : split.proporcao
  const mapaFlex = recolhido === 'mapa' ? 0 : recolhido === 'notas' ? 1 : 1 - split.proporcao

  return (
    <div className="workspace" ref={wrapRef}>
      <div className="ws-escrita" style={{ flexGrow: escritaFlex, flexBasis: 0 }}>
        <div className="ws-cabecalho">
          <span className="ws-titulo">{mapa?.nome ?? 'Escrita'}</span>
          {temMapa && (
            <button className="btn-icon" title="Recolher notas" onClick={() => setSplit((s) => ({ ...s, recolhido: s.recolhido === 'notas' ? 'nenhum' : 'notas' }))}>
              {recolhido === 'notas' ? '›' : '‹'}
            </button>
          )}
        </div>
        <div className="ws-escrita-corpo">
          <PaginasRail repo={repo} cadernoDirRel={cadernoDirRel} />
          {slugAtivo
            ? <NotasEditor key={slugAtivo} repo={repo} slug={slugAtivo} />
            : <div className="notas-vazio">Selecione ou crie uma página.</div>}
        </div>
      </div>

      {temMapa && recolhido === 'nenhum' && (
        <div className="ws-divisoria" onMouseDown={iniciarArrasto} title="Arrastar para redimensionar">⇔</div>
      )}

      {temMapa && (
        <div className="ws-mapa" style={{ flexGrow: mapaFlex, flexBasis: 0 }}>
          <div className="ws-cabecalho">
            <button className="btn-icon" title="Recolher mapa" onClick={() => setSplit((s) => ({ ...s, recolhido: s.recolhido === 'mapa' ? 'nenhum' : 'mapa' }))}>
              {recolhido === 'mapa' ? '‹' : '›'}
            </button>
          </div>
          <div className="ws-mapa-corpo">
            {recolhido !== 'mapa' && mapa && <CanvasView key={mapa.caminho} caminho={mapa.caminho} nome={mapa.nome} />}
          </div>
        </div>
      )}
    </div>
  )
}
```

Nota: `flexGrow` 0 recolhe o painel; a transição suave é feita no CSS (Task 10) com `transition: flex-grow 220ms ease`. O `CanvasView` do mapa é desmontado quando `recolhido === 'mapa'` (evita o tldraw rodando escondido); ele tem autosave-on-unmount, então nada se perde.

- [ ] **Step 2: Verificar**

```bash
npx tsc --noEmit && npm run build
```
Esperado: limpo/ok. (Ainda não montado no App — Task 8.)

- [ ] **Step 3: Commit**

```bash
git add grimorio/src/components/Workspace.tsx
git commit -m "feat: Workspace split (paginas | notas | mapa) recolhivel e redimensionavel"
```

---

### Task 8: Sidebar + App — abrir sessão como Workspace e Escrita livre

**Files:**
- Modify: `grimorio/src/components/Sidebar.tsx`
- Modify: `grimorio/src/App.tsx`

- [ ] **Step 1: Sidebar — sessão abre como 'sessao'; entrada "Escrita" por campanha**

Em `Sidebar.tsx`:

1. No `ItemLinha`, o clique de abrir de um item de sessão deve usar tipo `'sessao'`. Como distinguir sessão de canvas? Sessões vêm do grupo "Sessões" (`camp.sessoes`), canvases dos grupos "Canvases"/"Canvases soltos". Passar um prop `tipoAbertura: 'sessao' | 'canvas'` para o `ItemLinha` a partir do `Grupo` correspondente. No `CampanhaItem`, o `Grupo` de Sessões recebe `tipoAbertura="sessao"`; os de Canvases, `"canvas"`. O grupo de personagens continua abrindo perfil (não muda). Canvases soltos: `"canvas"`.

Ajustar a assinatura de `Grupo` e `ItemLinha` para carregar `tipoAbertura` e, no `abrir()` do `ItemLinha` quando `tipo === 'canvas'` (item de mapa), trocar:
```tsx
abrirItem(tipoAbertura, item.caminho, item.nome)
```
(onde `tipoAbertura` é `'sessao'` para sessões e `'canvas'` para canvases).

2. Adicionar, dentro de `CampanhaItem`, uma linha de atalho "✍ Escrita" que abre o caderno livre da campanha:

```tsx
import { escritaDirDaCampanha } from '../lib/caminhos'
// ...
const abrirItem = useApp((s) => s.abrirItem)
// dentro do render de CampanhaItem, acima dos Grupos:
<div
  className="item-linha"
  onClick={() => abrirItem('escrita', escritaDirDaCampanha(camp.slug), `Escrita — ${camp.nome}`)}
>
  <span className="item-nome">✍ Escrita</span>
</div>
```

- [ ] **Step 2: App — rotear por tipo**

Em `App.tsx`, substituir a área principal por roteamento pelo `aberto.tipo`. `vaultPath` no store está normalizado com `/`; caminhos absolutos = `vaultPath + '/' + relativo`.

```tsx
import { Workspace } from './components/Workspace'
import { dirNotasDaSessao } from './lib/caminhos'
// ...
const vaultPath = useApp((s) => s.vaultPath)
// ...
<main className="app-main">
  {!aberto && <div className="app-empty">Selecione uma sessão, canvas ou a Escrita na barra lateral</div>}

  {aberto?.tipo === 'canvas' && (
    <CanvasView key={aberto.caminho} caminho={aberto.caminho} nome={aberto.nome} />
  )}

  {aberto?.tipo === 'sessao' && vaultPath && (
    <Workspace
      key={aberto.caminho}
      chaveSplit={aberto.caminho}
      cadernoDirRel={dirNotasDaSessao(aberto.caminho)}
      cadernoDirAbs={`${vaultPath}/${dirNotasDaSessao(aberto.caminho)}`}
      mapa={{ caminho: aberto.caminho, nome: aberto.nome }}
    />
  )}

  {aberto?.tipo === 'escrita' && vaultPath && (
    <Workspace
      key={aberto.caminho}
      chaveSplit={aberto.caminho}
      cadernoDirRel={aberto.caminho}
      cadernoDirAbs={`${vaultPath}/${aberto.caminho}`}
    />
  )}
</main>
```

- [ ] **Step 3: Verificar**

```bash
npx tsc --noEmit && npm run build && npm test
```
Esperado: limpo/ok/verde.

- [ ] **Step 4: Commit**

```bash
git add grimorio/src/components/Sidebar.tsx grimorio/src/App.tsx
git commit -m "feat: sessao abre como workspace (notas+mapa) e Escrita livre por campanha"
```

---

### Task 9: Arrastar imagem da nota para dentro do mapa

**Files:**
- Modify: `grimorio/src/components/CanvasView.tsx`

Antes de codar, conferir nos types instalados: `AssetRecordType.createId()`, `Editor.createAssets(assets)`, os campos de props de um asset de imagem (`TLImageAsset` / `TLImageAssetProps`: `name, src, w, h, mimeType, isAnimated`) e de um shape de imagem (`TLImageShapeProps`: `w, h, assetId, ...`). Ajustar os objetos abaixo ao que os types exigem.

- [ ] **Step 1: Estender o drop handler**

Em `CanvasView.tsx`, importar do `tldraw`: `AssetRecordType` (além de `createShapeId` já importado). No handler `onDropCapture` que já trata `application/x-grimorio-personagem`, adicionar, ANTES de retornar, o tratamento da imagem (novo MIME). Extrair numa função:

```tsx
import { AssetRecordType } from 'tldraw'
import { convertFileSrc } from '@tauri-apps/api/core' // já importado na Task 10 da v1
import { caminhoAbsolutoImagem } from '../lib/caminhos'

async function soltarImagemNoMapa(editor: Editor, vaultPath: string, rel: string, clientX: number, clientY: number) {
  const url = convertFileSrc(caminhoAbsolutoImagem(vaultPath, rel))
  const dims = await new Promise<{ w: number; h: number }>((resolve) => {
    const img = new Image()
    img.onload = () => resolve({ w: img.naturalWidth || 320, h: img.naturalHeight || 240 })
    img.onerror = () => resolve({ w: 320, h: 240 })
    img.src = url
  })
  const ext = (rel.split('.').pop() ?? 'png').toLowerCase()
  const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : ext === 'gif' ? 'image/gif' : 'image/png'
  const assetId = AssetRecordType.createId()
  editor.createAssets([
    {
      id: assetId,
      typeName: 'asset',
      type: 'image',
      props: { name: rel.split('/').pop() ?? 'imagem', src: url, w: dims.w, h: dims.h, mimeType: mime, isAnimated: false },
      meta: { rel },
    },
  ])
  const ponto = editor.screenToPage({ x: clientX, y: clientY })
  editor.createShape({
    id: createShapeId(),
    type: 'image',
    x: ponto.x - dims.w / 2,
    y: ponto.y - dims.h / 2,
    props: { assetId, w: dims.w, h: dims.h },
  })
}
```

No `onDropCapture` (dentro de `.canvas-wrap`), acrescentar o ramo (o `vaultPath` já é lido via `useApp` no componente — garantir que está disponível no escopo; se não, adicionar `const vaultPath = useApp((s) => s.vaultPath)`):

```tsx
const relImg = e.dataTransfer.getData('application/x-grimorio-imagem')
if (relImg) {
  const editor = editorRef.current
  if (editor && vaultPath) {
    e.preventDefault()
    e.stopPropagation()
    void soltarImagemNoMapa(editor, vaultPath, relImg, e.clientX, e.clientY)
  }
  return
}
```

E no `onDragOverCapture`, aceitar também o novo MIME:

```tsx
if (e.dataTransfer.types.includes('application/x-grimorio-personagem') || e.dataTransfer.types.includes('application/x-grimorio-imagem')) {
  e.preventDefault()
  e.stopPropagation()
}
```

Como o asset criado tem `meta.rel`, o `resolve()` do asset store da v1 (Task 10 v1) reconstrói o `src` a partir do `vaultPath` atual ao reabrir — portanto a imagem arrastada é portável entre os 2 PCs, igual às coladas direto.

- [ ] **Step 2: Verificar**

```bash
npx tsc --noEmit && npm run build && npm test
```
Esperado: limpo/ok/verde.

- [ ] **Step 3: Commit**

```bash
git add grimorio/src/components/CanvasView.tsx
git commit -m "feat: arrastar imagem da nota cria a mesma imagem no mapa (sem copiar)"
```

---

### Task 10: Tema dos componentes novos + verificação final

**Files:**
- Modify: `grimorio/src/theme.css`

- [ ] **Step 1: CSS dos componentes de escrita**

Acrescentar ao fim de `grimorio/src/theme.css` (usa as variáveis de cor já definidas na v1):

```css
/* ---------- Workspace (split) ---------- */
.workspace { display: flex; height: 100%; min-height: 0; }
.ws-escrita, .ws-mapa { display: flex; flex-direction: column; min-width: 0; overflow: hidden; transition: flex-grow 220ms ease; }
.ws-escrita-corpo { flex: 1; display: flex; min-height: 0; }
.ws-mapa-corpo { flex: 1; position: relative; min-height: 0; }
.ws-cabecalho { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 4px 8px; background: var(--fundo-painel); border-bottom: 1px solid var(--borda); min-height: 30px; }
.ws-titulo { font-family: var(--serif); color: var(--dourado-claro); }
.ws-divisoria { width: 10px; min-width: 10px; cursor: col-resize; display: flex; align-items: center; justify-content: center; color: var(--dourado); background: var(--fundo-painel); border-left: 1px solid var(--borda); border-right: 1px solid var(--borda); user-select: none; }
.ws-divisoria:hover { background: var(--fundo-elevado); }

/* ---------- Rail de páginas ---------- */
.rail { width: 200px; min-width: 200px; overflow-y: auto; background: var(--fundo-painel); border-right: 1px solid var(--borda); }
.rail-header { display: flex; align-items: center; justify-content: space-between; padding: 6px 8px; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: var(--dourado); border-bottom: 1px solid var(--borda); }
.rail-vazio { padding: 8px; color: var(--texto-fraco); font-size: 12px; }
.rail-linha { display: flex; align-items: center; gap: 4px; padding: 4px 8px; cursor: pointer; border-radius: 4px; }
.rail-linha:hover { background: var(--fundo-elevado); }
.rail-linha.ativa { background: var(--fundo-elevado); color: var(--dourado-claro); }
.rail-titulo { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rail-acoes { display: none; }
.rail-linha:hover .rail-acoes { display: inline-flex; }
.chevron, .chevron-vazio { width: 12px; font-size: 10px; color: var(--texto-fraco); }

/* ---------- Editor de notas ---------- */
.notas { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.notas-toolbar { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; padding: 6px 10px; border-bottom: 1px solid var(--borda); }
.notas-toolbar .sep { width: 1px; height: 18px; background: var(--borda); margin: 0 4px; }
.notas-toolbar button.ativo { border-color: var(--dourado); color: var(--dourado-claro); }
.notas-corpo { flex: 1; overflow-y: auto; padding: 20px 28px; }
.notas-corpo .tiptap { outline: none; min-height: 100%; line-height: 1.6; }
.notas-corpo h1, .notas-corpo h2, .notas-corpo h3 { font-family: var(--serif); color: var(--dourado-claro); }
.notas-corpo blockquote { border-left: 3px solid var(--dourado); margin: 8px 0; padding-left: 12px; color: var(--texto-fraco); }
.notas-corpo hr { border: none; border-top: 1px solid var(--borda); margin: 16px 0; }
.nota-img img { max-width: 100%; border-radius: 4px; border: 1px solid var(--borda); cursor: grab; }
.notas-vazio, .notas-carregando { flex: 1; display: flex; align-items: center; justify-content: center; color: var(--texto-fraco); }
.notas-salvar-erro { color: var(--erro); font-size: 12px; padding: 6px 10px; border-top: 1px solid var(--borda); }
```

- [ ] **Step 2: Verificar build + tipos + testes**

```bash
npx tsc --noEmit && npm run build && npm test
```
Esperado: tudo limpo/verde.

- [ ] **Step 3: Roteiro manual (checklist de aceitação)**

Com o app rodando (`npm run tauri dev` — o coordenador roda, não o subagente):

1. Abrir uma sessão → aparece split: Páginas (esquerda) + Notas + Mapa (direita)
2. Criar página, subpágina, renomear, excluir — árvore reflete
3. Escrever texto rico (títulos, negrito, listas, citação, divisória); trocar de página preserva o conteúdo
4. Inserir imagem numa página (aparece) — fechar/reabrir → imagem continua
5. Arrastar a imagem da página para dentro do mapa → vira imagem no canvas; reabrir a sessão → imagem persiste no mapa
6. Recolher Notas (`‹`) → mapa em tela cheia, com animação; recolher Mapa → escrita em tela cheia; arrastar a divisória redimensiona; reabrir a sessão lembra o layout
7. Abrir "✍ Escrita" da campanha → caderno em tela cheia (sem mapa), com árvore de páginas própria
8. Copiar a pasta do cofre para o outro PC (ou outro caminho) e abrir → páginas e imagens (nas notas e no mapa) continuam funcionando (portabilidade)

- [ ] **Step 4: Commit**

```bash
git add grimorio/src/theme.css
git commit -m "feat: tema dos componentes de escrita e split"
```

---

## Cobertura do spec (self-review)

| Requisito do spec | Task |
|---|---|
| Caderno = pasta de páginas (reusável) | 2 |
| Notas da sessão (embutido) + Escrita livre por campanha | 7, 8 |
| Página: texto rico, aninhada (paiId/ordem), id/arquivo estáveis | 1, 2 |
| Armazenamento `sessoes/<s>.notas/` e `campanhas/<c>/escrita/` (sem migração) | 1 (helpers), 8 (wiring) |
| Split Páginas · Notas · Mapa | 7 |
| Recolher Notas/Mapa com animação + divisória arrastável + lembrar por sessão | 7, 10 |
| Escrita livre em tela cheia (sem mapa) | 7, 8 |
| Editor TipTap: títulos, negrito, itálico, listas, citação, divisória, imagem | 6 |
| Autosave debounced + atômico + erro visível + flush no unmount | 6 |
| Imagens salvas no cofre, caminho relativo portável | 5, 6 |
| Arrastar imagem da nota → mapa (mesmo arquivo, sem copiar), portável | 5, 9 |
| Página corrompida → item com erro, sem derrubar | 2 (repo), 4 (UI) |
| Testes Vitest no notebookRepo | 2 |
| CRUD de páginas: criar, renomear, excluir (subárvore), aninhar, reordenar | 2, 4 |
```
