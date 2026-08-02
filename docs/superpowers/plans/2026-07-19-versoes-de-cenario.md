# Versões de Cenário — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar a cada cenário N versões (Dia/Noite/…), cada uma com imagem+textos próprios, alternáveis por setas no card do canvas.

**Architecture:** Conteúdo migra para `VersaoCenario[]` dentro da entidade `Cenario`; `versaoAtivaId` (na entidade) escolhe a versão exibida/editada. Helpers puros (`versaoAtiva`, `aplicarPatchCenario`) roteiam leitura/escrita. Migração lazy embrulha cenários planos legados numa versão "Base". Só `nome` e `personagens` ficam no nível do cenário.

**Tech Stack:** React 19 + TypeScript + Vite + tldraw 4 + zustand + Tauri v2; testes em vitest.

**Convenções:** todos os commits terminam com o trailer:
`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
Comandos rodam a partir da raiz do repo (a app está em `grimorio/`).

---

## Mapa de arquivos

- **Criar:** `grimorio/src/lib/cenarioVersao.ts` — helpers puros (`versaoAtiva`, `versaoVizinha`, `resumoAtivo`, `retratoAtivo`, `aplicarPatchCenario`, `PatchCenario`, `CHAVES_VERSAO`).
- **Criar:** `grimorio/src/components/BarraVersoes.tsx` — pills de versão no modal (ativar/renomear/excluir/adicionar).
- **Criar:** `grimorio/src/test/cenarioVersao.test.ts`, `grimorio/src/test/versoesStore.test.ts`.
- **Modificar:** `grimorio/src/lib/types.ts` (modelo), `grimorio/src/lib/vaultRepo.ts` (migração+criação), `grimorio/src/state/store.ts` (ações de versão), `grimorio/src/components/CenarioCardShape.tsx` (leitura+setas), `grimorio/src/components/CenarioModal.tsx` (pills+versão ativa), `grimorio/src/lib/copiaImagemCard.ts`, `grimorio/src/lib/contextoIA.ts`, `grimorio/src/components/ChatIA.tsx`, `grimorio/src/theme.css`.
- **Atualizar testes:** `grimorio/src/test/normalizarCenario.test.ts`, `grimorio/src/test/cenarioRepo.test.ts`.

---

## Task 0: Branch de trabalho

- [ ] **Step 1: Criar branch**

```bash
git checkout -b feat/versoes-cenario
```

---

## Task 1: Modelo + helpers puros de versão (TDD)

**Files:**
- Modify: `grimorio/src/lib/types.ts` (reforma `Cenario` ~21-36 + novo `VersaoCenario`)
- Create: `grimorio/src/lib/cenarioVersao.ts`
- Test: `grimorio/src/test/cenarioVersao.test.ts`

> **Nota (mudança transversal de tipo):** reformar `types.ts` quebra o `tsc` dos consumidores ainda não migrados (card, modal, ChatIA, …). É esperado — só volta ao verde no Task 9. Neste task, verifique APENAS com o `npx vitest run` indicado (vitest transpila sem typar); NÃO rode `npm run build`/`tsc`.

- [ ] **Step 1: Escrever o teste que falha**

Create `grimorio/src/test/cenarioVersao.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { versaoAtiva, versaoVizinha, aplicarPatchCenario, resumoAtivo, retratoAtivo } from '../lib/cenarioVersao'
import type { Cenario, VersaoCenario } from '../lib/types'

function versao(id: string, nome: string, over: Partial<VersaoCenario> = {}): VersaoCenario {
  return { id, nome, retrato: null, resumo: '', descricao: '', informacao: '', historia: '', eventos: '', itens: '', anotacoes: '', imagens: [], ...over }
}
function cenario(over: Partial<Cenario> = {}): Cenario {
  const vs = over.versoes ?? [versao('v1', 'Base'), versao('v2', 'Noite')]
  return { id: 'c1', nome: 'Cidade', personagens: [], versoes: vs, versaoAtivaId: over.versaoAtivaId ?? vs[0].id, criadoEm: 'x', modificadoEm: 'y', ...over }
}

describe('versaoAtiva', () => {
  it('retorna a versão do id ativo', () => {
    expect(versaoAtiva(cenario({ versaoAtivaId: 'v2' })).nome).toBe('Noite')
  })
  it('cai na primeira quando o id ativo não existe', () => {
    expect(versaoAtiva(cenario({ versaoAtivaId: 'sumiu' })).id).toBe('v1')
  })
})

describe('versaoVizinha', () => {
  it('próxima é cíclica (última volta pra primeira)', () => {
    expect(versaoVizinha(cenario({ versaoAtivaId: 'v2' }), 1)).toBe('v1')
  })
  it('anterior é cíclica (primeira volta pra última)', () => {
    expect(versaoVizinha(cenario({ versaoAtivaId: 'v1' }), -1)).toBe('v2')
  })
})

describe('aplicarPatchCenario', () => {
  it('roteia campo de conteúdo só pra versão ativa', () => {
    const r = aplicarPatchCenario(cenario({ versaoAtivaId: 'v2' }), { descricao: '<p>noite</p>' })
    expect(r.versoes[1].descricao).toBe('<p>noite</p>')
    expect(r.versoes[0].descricao).toBe('')
  })
  it('roteia campo compartilhado pro topo, sem tocar versões', () => {
    const c = cenario()
    const r = aplicarPatchCenario(c, { nome: 'Nova', versaoAtivaId: 'v2' })
    expect(r.nome).toBe('Nova')
    expect(r.versaoAtivaId).toBe('v2')
    expect(r.versoes).toBe(c.versoes)
  })
  it('não muta o original', () => {
    const c = cenario()
    aplicarPatchCenario(c, { resumo: 'x' })
    expect(c.versoes[0].resumo).toBe('')
  })
})

describe('resumoAtivo / retratoAtivo', () => {
  it('undefined vira vazio/null', () => {
    expect(resumoAtivo(undefined)).toBe('')
    expect(retratoAtivo(undefined)).toBeNull()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd grimorio && npx vitest run src/test/cenarioVersao.test.ts`
Expected: FAIL — `Cannot find module '../lib/cenarioVersao'`.

- [ ] **Step 3: Reformar `types.ts` e implementar `cenarioVersao.ts`**

First, in `grimorio/src/lib/types.ts`, replace the whole `Cenario` interface (currently lines 21-36) with:

```ts
export interface VersaoCenario {
  id: string
  nome: string          // "Base", "Dia", "Noite", "Destruído"
  retrato: string | null // rel ao cofre, ex.: "imagens-cenarios/retrato-<cenId>-<verId>.png"
  resumo: string
  descricao: string  // HTML TipTap
  informacao: string // HTML
  historia: string   // HTML
  eventos: string    // HTML
  itens: string      // HTML
  anotacoes: string  // HTML
  imagens: ImagemPersonagem[]
}

export interface Cenario {
  id: string
  nome: string              // compartilhado por todas as versões
  personagens: string[]     // ids de personagens vinculados (N:N) — compartilhado
  versoes: VersaoCenario[]  // sempre >= 1
  versaoAtivaId: string     // id de uma versoes[]
  criadoEm: string // ISO-8601
  modificadoEm: string
}
```

Then create `grimorio/src/lib/cenarioVersao.ts`:

```ts
import type { Cenario, VersaoCenario } from './types'

/** Campos de conteúdo que pertencem à VERSÃO ativa (não ao cenário como um todo). */
export const CHAVES_VERSAO = [
  'retrato', 'resumo', 'descricao', 'informacao',
  'historia', 'eventos', 'itens', 'anotacoes', 'imagens',
] as const

/** Patch de salvarCenarioParcial/agendarSalvar: chaves de conteúdo vão pra versão ativa; o resto, pro cenário. */
export type PatchCenario =
  Partial<Pick<Cenario, 'nome' | 'personagens' | 'versaoAtivaId' | 'modificadoEm'>> &
  Partial<Omit<VersaoCenario, 'id' | 'nome'>>

type CenarioMin = Pick<Cenario, 'versoes' | 'versaoAtivaId'>

/** Versão ativa; cai na primeira se o id ativo não existir (sempre há ≥1 versão). */
export function versaoAtiva(c: CenarioMin): VersaoCenario {
  return c.versoes.find((v) => v.id === c.versaoAtivaId) ?? c.versoes[0]
}

/** Id da versão vizinha (cíclico): dir=+1 próxima, dir=-1 anterior. */
export function versaoVizinha(c: CenarioMin, dir: 1 | -1): string {
  const i = c.versoes.findIndex((v) => v.id === c.versaoAtivaId)
  const base = i < 0 ? 0 : i
  const n = c.versoes.length
  return c.versoes[(base + dir + n) % n].id
}

/** Resumo da versão ativa (ou '' se cenário ausente). */
export function resumoAtivo(c: CenarioMin | undefined): string {
  return c ? versaoAtiva(c).resumo : ''
}

/** Retrato (rel) da versão ativa (ou null). */
export function retratoAtivo(c: CenarioMin | undefined): string | null {
  return c ? versaoAtiva(c).retrato : null
}

const SET_CHAVES_VERSAO: ReadonlySet<string> = new Set(CHAVES_VERSAO)

/** Aplica um patch: chaves de conteúdo entram na versão ativa; o resto, no topo. Puro (novo objeto). */
export function aplicarPatchCenario(c: Cenario, patch: PatchCenario): Cenario {
  const versaoPatch: Record<string, unknown> = {}
  const cenarioPatch: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(patch)) {
    if (SET_CHAVES_VERSAO.has(k)) versaoPatch[k] = v
    else cenarioPatch[k] = v
  }
  const idAtiva = c.versoes.some((v) => v.id === c.versaoAtivaId) ? c.versaoAtivaId : c.versoes[0]?.id
  const versoes = Object.keys(versaoPatch).length > 0
    ? c.versoes.map((v) => (v.id === idAtiva ? { ...v, ...versaoPatch } : v))
    : c.versoes
  return { ...c, ...cenarioPatch, versoes } as Cenario
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd grimorio && npx vitest run src/test/cenarioVersao.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add grimorio/src/lib/types.ts grimorio/src/lib/cenarioVersao.ts grimorio/src/test/cenarioVersao.test.ts
git commit -m "feat(cenario): modelo VersaoCenario + helpers puros (versaoAtiva, aplicarPatchCenario)"
```

---

## Task 2: Migração + criação no vaultRepo (TDD)

> Depende do Task 1 (tipos `VersaoCenario`/`Cenario` já reformados). Verifique só com `npx vitest run` (não `tsc`).

**Files:**
- Modify: `grimorio/src/lib/vaultRepo.ts` (`normalizarCenario` ~39-56; `criarCenarioEm` ~267-279; import de tipos linha 2)
- Test: `grimorio/src/test/normalizarCenario.test.ts` (reescrever), `grimorio/src/test/cenarioRepo.test.ts` (2 ajustes)

- [ ] **Step 1: Reescrever os testes (definem o novo formato)**

Replace ALL of `grimorio/src/test/normalizarCenario.test.ts` with:

```ts
import { describe, expect, it } from 'vitest'
import { normalizarCenario } from '../lib/vaultRepo'

describe('normalizarCenario', () => {
  it('objeto vazio ganha uma versão Base ativa', () => {
    const c = normalizarCenario({})
    expect(c.id).toBeTruthy()
    expect(c.nome).toBe('')
    expect(c.personagens).toEqual([])
    expect(c.versoes).toHaveLength(1)
    expect(c.versoes[0].nome).toBe('Base')
    expect(c.versoes[0].retrato).toBeNull()
    expect(c.versoes[0].descricao).toBe('')
    expect(c.versoes[0].eventos).toBe('')
    expect(c.versoes[0].imagens).toEqual([])
    expect(c.versaoAtivaId).toBe(c.versoes[0].id)
    expect(c.criadoEm).toBeTruthy()
  })

  it('JSON antigo (plano) migra conteúdo para a versão Base', () => {
    const c = normalizarCenario({
      id: 'abc', nome: 'Cidade Alta', resumo: 'capital', descricao: '<p>d</p>', eventos: '<p>e</p>',
      retrato: 'imagens-cenarios/r.png', personagens: ['p1'],
      criadoEm: '2020-01-01T00:00:00.000Z', modificadoEm: '2020-01-02T00:00:00.000Z',
    })
    expect(c.id).toBe('abc')
    expect(c.nome).toBe('Cidade Alta')
    expect(c.personagens).toEqual(['p1'])
    expect(c.versoes).toHaveLength(1)
    expect(c.versoes[0].nome).toBe('Base')
    expect(c.versoes[0].id).not.toBe('abc')            // id da versão é novo, não o do cenário
    expect(c.versoes[0].resumo).toBe('capital')
    expect(c.versoes[0].descricao).toBe('<p>d</p>')
    expect(c.versoes[0].eventos).toBe('<p>e</p>')
    expect(c.versoes[0].retrato).toBe('imagens-cenarios/r.png')
    expect(c.versaoAtivaId).toBe(c.versoes[0].id)
    expect(c.criadoEm).toBe('2020-01-01T00:00:00.000Z')
  })

  it('formato novo (com versões) passa intocado', () => {
    const completo = {
      id: 'x', nome: 'N', personagens: ['p1', 'p2'],
      versoes: [
        { id: 'va', nome: 'Base', retrato: 'imagens-cenarios/r.png', resumo: 'r', descricao: '<p>d</p>', informacao: '<p>i</p>', historia: '<p>h</p>', eventos: '<p>e</p>', itens: '<p>it</p>', anotacoes: '<p>a</p>', imagens: [{ rel: 'imagens-cenarios/g.png', legenda: 'l' }] },
        { id: 'vb', nome: 'Noite', retrato: null, resumo: '', descricao: '', informacao: '', historia: '', eventos: '', itens: '', anotacoes: '', imagens: [] },
      ],
      versaoAtivaId: 'vb',
      criadoEm: '2020-01-01T00:00:00.000Z', modificadoEm: '2020-01-02T00:00:00.000Z',
    }
    expect(normalizarCenario(completo)).toEqual(completo)
  })
})
```

In `grimorio/src/test/cenarioRepo.test.ts`, replace the line:

```ts
    expect(cru.eventos).toBe('')
```

with:

```ts
    expect(cru.versoes).toHaveLength(1)
    expect(cru.versoes[0].nome).toBe('Base')
    expect(cru.versoes[0].eventos).toBe('')
    expect(cru.versaoAtivaId).toBe(cru.versoes[0].id)
```

And in the same file replace:

```ts
    await repo.salvarCenario(ref.caminho, { ...c, resumo: 'capital', modificadoEm: '2000-01-01T00:00:00.000Z' })
    const relido = await repo.lerCenario(ref.caminho)
    expect(relido.resumo).toBe('capital')
```

with:

```ts
    await repo.salvarCenario(ref.caminho, { ...c, versoes: c.versoes.map((v) => ({ ...v, resumo: 'capital' })), modificadoEm: '2000-01-01T00:00:00.000Z' })
    const relido = await repo.lerCenario(ref.caminho)
    expect(relido.versoes[0].resumo).toBe('capital')
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd grimorio && npx vitest run src/test/normalizarCenario.test.ts src/test/cenarioRepo.test.ts`
Expected: FAIL — `c.versoes is undefined` / asserts de versão quebram.

- [ ] **Step 3: Reformar `normalizarCenario` + `criarCenarioEm` em `vaultRepo.ts`**

> `types.ts` já foi reformado no Task 1 (VersaoCenario + Cenario). Aqui é só o vaultRepo.

In `grimorio/src/lib/vaultRepo.ts`, add `VersaoCenario` to the type import on line 2 (append to the existing list):

```ts
import type { Campanha, CampanhaNode, CanvasDoc, Cenario, CenarioNode, CenarioRef, ItemRef, PastaCenarioNode, PastaNode, Personagem, VaultTree, VersaoCenario, Vinculo } from './types'
```

Replace the whole `normalizarCenario` function (currently lines 38-56) with:

```ts
/** Normaliza uma versão de cenário (campos faltando ganham defaults; id só é gerado se ausente). */
export function normalizarVersaoCenario(raw: Record<string, any>, nomePadrao = 'Base'): VersaoCenario {
  return {
    id: typeof raw?.id === 'string' ? raw.id : novoId(),
    nome: raw?.nome ?? nomePadrao,
    retrato: raw?.retrato ?? null,
    resumo: raw?.resumo ?? '',
    descricao: raw?.descricao ?? '',
    informacao: raw?.informacao ?? '',
    historia: raw?.historia ?? '',
    eventos: raw?.eventos ?? '',
    itens: raw?.itens ?? '',
    anotacoes: raw?.anotacoes ?? '',
    imagens: Array.isArray(raw?.imagens) ? raw.imagens : [],
  }
}

/**
 * Normaliza um cenário lido do disco. Migração lazy:
 * cenário plano legado (sem `versoes`) vira uma versão "Base" com o conteúdo antigo.
 */
export function normalizarCenario(raw: Record<string, any>): Cenario {
  const versoesRaw = Array.isArray(raw?.versoes) && raw.versoes.length > 0 ? raw.versoes : null
  const versoes: VersaoCenario[] = versoesRaw
    ? versoesRaw.map((v: Record<string, any>) => normalizarVersaoCenario(v))
    : [normalizarVersaoCenario({
        // só os campos de conteúdo do formato plano — id/nome do cenário NÃO viram da versão
        retrato: raw?.retrato, resumo: raw?.resumo, descricao: raw?.descricao,
        informacao: raw?.informacao, historia: raw?.historia, eventos: raw?.eventos,
        itens: raw?.itens, anotacoes: raw?.anotacoes, imagens: raw?.imagens,
      }, 'Base')]
  const versaoAtivaId = typeof raw?.versaoAtivaId === 'string' && versoes.some((v) => v.id === raw.versaoAtivaId)
    ? raw.versaoAtivaId
    : versoes[0].id
  return {
    id: typeof raw?.id === 'string' ? raw.id : novoId(),
    nome: raw?.nome ?? '',
    personagens: Array.isArray(raw?.personagens) ? raw.personagens : [],
    versoes,
    versaoAtivaId,
    criadoEm: raw?.criadoEm ?? agora(),
    modificadoEm: raw?.modificadoEm ?? agora(),
  }
}
```

Replace the body of `criarCenarioEm` (the `const c: Cenario = {…}` block, currently lines 270-275) with:

```ts
    const versaoBase: VersaoCenario = {
      id: novoId(), nome: 'Base', retrato: null, resumo: '',
      descricao: '', informacao: '', historia: '', eventos: '', itens: '', anotacoes: '', imagens: [],
    }
    const c: Cenario = {
      id: novoId(), nome, personagens: [],
      versoes: [versaoBase], versaoAtivaId: versaoBase.id,
      criadoEm: agora(), modificadoEm: agora(),
    }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd grimorio && npx vitest run src/test/normalizarCenario.test.ts src/test/cenarioRepo.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add grimorio/src/lib/vaultRepo.ts grimorio/src/test/normalizarCenario.test.ts grimorio/src/test/cenarioRepo.test.ts
git commit -m "feat(cenario): migração lazy do cenário pra versão Base + criação com Base"
```

---

## Task 3: Ações de versão no store (TDD)

**Files:**
- Modify: `grimorio/src/state/store.ts`
- Test: `grimorio/src/test/versoesStore.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Create `grimorio/src/test/versoesStore.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { useApp } from '../state/store'
import type { Cenario } from '../lib/types'

function cen(): Cenario {
  return {
    id: 'c1', nome: 'Cidade', personagens: [],
    versoes: [{ id: 'v1', nome: 'Base', retrato: null, resumo: 'dia', descricao: '', informacao: '', historia: '', eventos: '', itens: '', anotacoes: '', imagens: [] }],
    versaoAtivaId: 'v1', criadoEm: 'x', modificadoEm: 'y',
  }
}

beforeEach(() => {
  useApp.setState({ repo: null, caminhoCenarioPorId: {}, cenarios: { c1: cen() } })
})

describe('ações de versão no store', () => {
  it('adicionarVersao clona a ativa e ativa a nova', () => {
    useApp.getState().adicionarVersao('c1', 'Noite')
    const c = useApp.getState().cenarios.c1
    expect(c.versoes).toHaveLength(2)
    expect(c.versoes[1].nome).toBe('Noite')
    expect(c.versoes[1].resumo).toBe('dia')   // clonou o conteúdo da ativa
    expect(c.versoes[1].id).not.toBe('v1')
    expect(c.versaoAtivaId).toBe(c.versoes[1].id)
  })

  it('definirVersaoAtiva troca só se o id existir', () => {
    useApp.getState().adicionarVersao('c1', 'Noite')
    const novaId = useApp.getState().cenarios.c1.versoes[1].id
    useApp.getState().definirVersaoAtiva('c1', 'v1')
    expect(useApp.getState().cenarios.c1.versaoAtivaId).toBe('v1')
    useApp.getState().definirVersaoAtiva('c1', 'inexistente')
    expect(useApp.getState().cenarios.c1.versaoAtivaId).toBe('v1')  // inalterado
    useApp.getState().definirVersaoAtiva('c1', novaId)
    expect(useApp.getState().cenarios.c1.versaoAtivaId).toBe(novaId)
  })

  it('salvarCenarioParcial roteia conteúdo pra versão ativa', () => {
    useApp.getState().salvarCenarioParcial('c1', { descricao: '<p>x</p>' })
    expect(useApp.getState().cenarios.c1.versoes[0].descricao).toBe('<p>x</p>')
  })

  it('removerVersao respeita a guarda da última e recua a ativa', () => {
    useApp.getState().removerVersao('c1', 'v1')
    expect(useApp.getState().cenarios.c1.versoes).toHaveLength(1) // não removeu a última
    useApp.getState().adicionarVersao('c1', 'Noite')
    const novaId = useApp.getState().cenarios.c1.versoes[1].id
    useApp.getState().removerVersao('c1', novaId)   // remove a ativa
    expect(useApp.getState().cenarios.c1.versoes).toHaveLength(1)
    expect(useApp.getState().cenarios.c1.versaoAtivaId).toBe('v1')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd grimorio && npx vitest run src/test/versoesStore.test.ts`
Expected: FAIL — `adicionarVersao is not a function`.

- [ ] **Step 3: Imports + helper de persistência em `store.ts`**

In `grimorio/src/state/store.ts`, add to the `types` import (line 2) `VersaoCenario`, and add a new import after line 6:

```ts
import { aplicarPatchCenario, versaoAtiva, type PatchCenario } from '../lib/cenarioVersao'
```

Immediately after the `timersSalvarCenario` declaration (currently line 17), add:

```ts
/** Agenda a persistência debounced do cenário `id` (reusada por edições e ações de versão). */
function agendarSalvarCenario(get: () => AppState, id: string) {
  const pendente = timersSalvarCenario.get(id)
  if (pendente) clearTimeout(pendente)
  timersSalvarCenario.set(
    id,
    setTimeout(() => {
      timersSalvarCenario.delete(id)
      const { repo, caminhoCenarioPorId, cenarios } = get()
      const caminho = caminhoCenarioPorId[id]
      const c = cenarios[id]
      if (!repo || !caminho || !c) return
      repo.salvarCenario(caminho, { ...c }).catch((e) => {
        console.error('Falha ao salvar cenário:', e)
      })
    }, SALVAR_PARCIAL_DEBOUNCE_MS),
  )
}
```

- [ ] **Step 4: Interface `AppState` — trocar assinatura + 4 ações novas**

In the `AppState` interface, replace the line:

```ts
  salvarCenarioParcial(id: string, mudancas: Partial<Cenario>): void
```

with:

```ts
  salvarCenarioParcial(id: string, mudancas: PatchCenario): void
  /** Torna `versaoId` a versão ativa/visível do cenário (ignora id inexistente). */
  definirVersaoAtiva(id: string, versaoId: string): void
  /** Cria uma versão clonando a ativa; a nova vira ativa. */
  adicionarVersao(id: string, nome: string): void
  renomearVersao(id: string, versaoId: string, nome: string): void
  /** Remove a versão (nunca a última); se remover a ativa, recua pra primeira. */
  removerVersao(id: string, versaoId: string): void
```

- [ ] **Step 5: Reescrever `salvarCenarioParcial` + adicionar as ações**

Replace the whole `salvarCenarioParcial(id, mudancas) { … }` implementation (currently lines 225-248) with:

```ts
  salvarCenarioParcial(id, mudancas) {
    const atual = get().cenarios[id]
    if (!atual) return
    set((s) => ({
      cenarios: { ...s.cenarios, [id]: aplicarPatchCenario(s.cenarios[id], mudancas) },
    }))
    agendarSalvarCenario(get, id)
  },

  definirVersaoAtiva(id, versaoId) {
    const c = get().cenarios[id]
    if (!c || !c.versoes.some((v) => v.id === versaoId)) return
    get().salvarCenarioParcial(id, { versaoAtivaId: versaoId })
  },

  adicionarVersao(id, nome) {
    const c = get().cenarios[id]
    if (!c) return
    const base = versaoAtiva(c)
    const nova: VersaoCenario = { ...base, id: crypto.randomUUID(), nome, imagens: base.imagens.map((i) => ({ ...i })) }
    set((s) => {
      const atual = s.cenarios[id]
      return { cenarios: { ...s.cenarios, [id]: { ...atual, versoes: [...atual.versoes, nova], versaoAtivaId: nova.id } } }
    })
    agendarSalvarCenario(get, id)
  },

  renomearVersao(id, versaoId, nome) {
    if (!get().cenarios[id]) return
    set((s) => {
      const atual = s.cenarios[id]
      return { cenarios: { ...s.cenarios, [id]: { ...atual, versoes: atual.versoes.map((v) => (v.id === versaoId ? { ...v, nome } : v)) } } }
    })
    agendarSalvarCenario(get, id)
  },

  removerVersao(id, versaoId) {
    const c = get().cenarios[id]
    if (!c || c.versoes.length <= 1) return
    const versoes = c.versoes.filter((v) => v.id !== versaoId)
    const versaoAtivaId = c.versaoAtivaId === versaoId ? versoes[0].id : c.versaoAtivaId
    set((s) => ({ cenarios: { ...s.cenarios, [id]: { ...s.cenarios[id], versoes, versaoAtivaId } } }))
    agendarSalvarCenario(get, id)
  },
```

- [ ] **Step 6: Rodar e ver passar**

Run: `cd grimorio && npx vitest run src/test/versoesStore.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add grimorio/src/state/store.ts grimorio/src/test/versoesStore.test.ts
git commit -m "feat(cenario): ações de versão no store (add/rename/remove/definir ativa)"
```

---

## Task 4: `copiaImagemCard.ts` lê retrato da versão ativa

**Files:**
- Modify: `grimorio/src/lib/copiaImagemCard.ts`

- [ ] **Step 1: Aplicar mudança**

Replace the import line 1 and the `cenario-card` branch. New file top import:

```ts
import type { Cenario, Personagem } from './types'
import { retratoAtivo } from './cenarioVersao'
```

Change the `cenarios` param type and the cenario branch in `relRetratoDoCard`:

```ts
  cenarios: Record<string, Pick<Cenario, 'versoes' | 'versaoAtivaId'>>,
```

```ts
  if (shape.type === 'cenario-card') {
    return retratoAtivo(cenarios[shape.props.cenarioId as string])
  }
```

- [ ] **Step 2: Rodar a suíte relacionada (não deve quebrar nada)**

Run: `cd grimorio && npx vitest run`
Expected: PASS (nenhum teste importa a UI; `copiaImagemCard` transpila sem erro).

- [ ] **Step 3: Commit**

```bash
git add grimorio/src/lib/copiaImagemCard.ts
git commit -m "refactor(cenario): copiaImagemCard usa retrato da versão ativa"
```

---

## Task 5: Contexto de IA lê resumo da versão ativa

**Files:**
- Modify: `grimorio/src/lib/contextoIA.ts`
- Modify: `grimorio/src/components/ChatIA.tsx`

- [ ] **Step 1: `contextoIA.ts`**

Add `Cenario` to the type import (line 1) and a new import:

```ts
import type { CampanhaNode, Cenario, CenarioNode, PastaCenarioNode, VaultTree, Vinculo } from './types'
import { resumoAtivo } from './cenarioVersao'
```

In `DepsContexto`, change the `cenarios` field type:

```ts
  cenarios: Record<string, Pick<Cenario, 'nome' | 'versoes' | 'versaoAtivaId'>>
```

In `montarContextoDaCampanha`, replace:

```ts
  const linhasCen = achatarCenarios(filtrarArvoreCenarios(tree.cenarios, ids), (id) => cenarios[id]?.resumo ?? '')
```

with:

```ts
  const linhasCen = achatarCenarios(filtrarArvoreCenarios(tree.cenarios, ids), (id) => resumoAtivo(cenarios[id]))
```

(The `nomeDe` line using `cenarios[id]?.nome` stays — `nome` is still top-level.)

- [ ] **Step 2: `ChatIA.tsx`**

Add near the other lib imports:

```ts
import { resumoAtivo, versaoAtiva } from '../lib/cenarioVersao'
```

Replace the resumo lambda (line ~129):

```ts
    const linhasCen = achatarCenarios(arvoreCen, (id) => resumoAtivo(cenarios[id]))
```

Replace the `cenario-card` branch in `anexarCardSelecionado` (lines ~174-179):

```ts
    } else if (shape.type === 'cenario-card') {
      const c = cenarios[(shape as CenarioCardShapeType).props.cenarioId]
      if (!c) { setErro('Entidade do card não encontrada.'); return }
      const v = versaoAtiva(c)
      nome = c.nome
      retratoRel = v.retrato
      bloco = `Card anexado — Cenário: ${c.nome}\nResumo: ${v.resumo}\nDescrição: ${htmlParaTexto(v.descricao)}`
    } else {
```

- [ ] **Step 3: Rodar a suíte (segue verde)**

Run: `cd grimorio && npx vitest run`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add grimorio/src/lib/contextoIA.ts grimorio/src/components/ChatIA.tsx
git commit -m "refactor(cenario): contexto de IA e chat leem a versão ativa"
```

---

## Task 6: Card do canvas — leitura pela versão ativa + setas ‹ ›

**Files:**
- Modify: `grimorio/src/components/CenarioCardShape.tsx`

- [ ] **Step 1: Import**

After line 19 (`import { CardRetrato } …`), add:

```ts
import { versaoAtiva, versaoVizinha } from '../lib/cenarioVersao'
```

- [ ] **Step 2: Puxar a ação do store**

Right after `const salvarParcial = useApp((s) => s.salvarCenarioParcial)` (~line 170), add:

```ts
  const definirVersaoAtiva = useApp((s) => s.definirVersaoAtiva)
```

- [ ] **Step 3: Retrato via versão ativa**

Replace (line ~180):

```ts
  const retratoSrc = c?.retrato && vaultPath ? convertFileSrc(`${vaultPath}/${c.retrato}`) : null
```

with:

```ts
  const retratoRel = c ? versaoAtiva(c).retrato : null
  const retratoSrc = retratoRel && vaultPath ? convertFileSrc(`${vaultPath}/${retratoRel}`) : null
```

- [ ] **Step 4: `va` após a guarda**

Right after the `if (!c) { … }` block closes (the guard that renders "Cenário removido", ~line 223), add:

```ts
  const va = versaoAtiva(c)
```

- [ ] **Step 5: Trocar as leituras de conteúdo**

- Section content (~line 300): `c[chave]` → `va[chave]`
- Resumo (~line 325):

```tsx
            {va.resumo ? <div className="char-card-resumo">{va.resumo}</div> : null}
```

- Descrição (~line 354): `c.descricao` → `va.descricao`

(The `c.nome` reads at ~320/324 stay — nome é compartilhado.)

- [ ] **Step 6: Setas de versão ao lado do controle de fonte**

Immediately after the `</...>` closing the `<ControlesFonte … />` element and before the closing `</div>` of `char-card-texto` (~line 335), insert:

```tsx
            {c.versoes.length >= 2 && (
              <span className="card-versao-ctrl" onPointerDown={(e) => e.stopPropagation()}>
                <button title="Versão anterior" onClick={() => definirVersaoAtiva(cenarioId, versaoVizinha(c, -1))}>‹</button>
                <span className="card-versao-nome">{va.nome}</span>
                <button title="Próxima versão" onClick={() => definirVersaoAtiva(cenarioId, versaoVizinha(c, 1))}>›</button>
              </span>
            )}
```

- [ ] **Step 7: Commit**

```bash
git add grimorio/src/components/CenarioCardShape.tsx
git commit -m "feat(cenario): card lê a versão ativa e ganha setas de troca"
```

---

## Task 7: Modal — barra de versões + edição da versão ativa

**Files:**
- Create: `grimorio/src/components/BarraVersoes.tsx`
- Modify: `grimorio/src/components/CenarioModal.tsx`

- [ ] **Step 1: Criar `BarraVersoes.tsx`**

Create `grimorio/src/components/BarraVersoes.tsx`:

```tsx
import { ask } from '@tauri-apps/plugin-dialog'
import { pedirTexto } from './dialogos'
import { useApp } from '../state/store'

/** Barra de versões do cenário (topo do modal): pills clicáveis (ativar), duplo-clique renomeia, × exclui, + adiciona. */
export function BarraVersoes({ cenarioId }: { cenarioId: string }) {
  const c = useApp((s) => s.cenarios[cenarioId])
  const definirVersaoAtiva = useApp((s) => s.definirVersaoAtiva)
  const adicionarVersao = useApp((s) => s.adicionarVersao)
  const renomearVersao = useApp((s) => s.renomearVersao)
  const removerVersao = useApp((s) => s.removerVersao)
  if (!c) return null

  async function criar() {
    const nome = await pedirTexto('Nome da nova versão', '', 'Criar')
    if (nome) adicionarVersao(cenarioId, nome)
  }
  async function renomear(versaoId: string, atual: string) {
    const nome = await pedirTexto('Renomear versão', atual, 'Renomear')
    if (nome) renomearVersao(cenarioId, versaoId, nome)
  }
  async function excluir(versaoId: string, nome: string) {
    const ok = await ask(`Excluir a versão "${nome}"? As imagens dela permanecem no cofre.`, { title: 'Grimório', kind: 'warning' })
    if (ok) removerVersao(cenarioId, versaoId)
  }

  return (
    <div className="barra-versoes">
      {c.versoes.map((v) => (
        <span key={v.id} className={v.id === c.versaoAtivaId ? 'versao-pill ativa' : 'versao-pill'}>
          <button
            className="versao-pill-nome"
            title="Clique: ativar • Duplo-clique: renomear"
            onClick={() => definirVersaoAtiva(cenarioId, v.id)}
            onDoubleClick={() => void renomear(v.id, v.nome)}
          >
            {v.nome}
          </button>
          {c.versoes.length > 1 && (
            <button className="versao-pill-x" title="Excluir versão" onClick={() => void excluir(v.id, v.nome)}>×</button>
          )}
        </span>
      ))}
      <button className="versao-add" title="Nova versão (copia a atual)" onClick={() => void criar()}>+ versão</button>
    </div>
  )
}
```

- [ ] **Step 2: `CenarioModal.tsx` — imports**

Add after the existing imports:

```ts
import { BarraVersoes } from './BarraVersoes'
import { aplicarPatchCenario, versaoAtiva, type PatchCenario } from '../lib/cenarioVersao'
```

- [ ] **Step 3: Retrato via versão ativa (com cache-bust por versão)**

Replace the `retratoSrc` block (lines ~70-72):

```ts
  const retratoRel = c ? versaoAtiva(c).retrato : null
  const retratoSrc = c && retratoRel && vaultPath
    ? `${convertFileSrc(`${vaultPath}/${retratoRel}`)}?v=${encodeURIComponent(`${c.modificadoEm}:${c.versaoAtivaId}`)}`
    : null
```

- [ ] **Step 4: `va` + `agendarSalvar` roteado**

Right after the `if (!c) return null` guard (~line 90), add:

```ts
  const va = versaoAtiva(c)
```

Change the `agendarSalvar` signature and its optimistic merge:

```ts
  function agendarSalvar(mudancas: PatchCenario) {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      timer.current = null
      void salvar()
    }, AUTOSAVE_DEBOUNCE_MS)
    useApp.setState((s) => ({
      cenarios: { ...s.cenarios, [cenarioId]: aplicarPatchCenario(s.cenarios[cenarioId], mudancas) },
    }))
  }
```

- [ ] **Step 5: Retrato salvo por versão**

In `trocarRetrato`, replace the `destinoRel` line (~132):

```ts
      const destinoRel = `imagens-cenarios/retrato-${cenarioId}-${c.versaoAtivaId}.${ext}`
```

- [ ] **Step 6: Cabeçalho — resumo da versão**

Replace the resumo input `value` (~line 163):

```tsx
            <input className="perfil-resumo" placeholder="Resumo curto (aparece no cartão)"
              value={va.resumo}
              onChange={(e) => agendarSalvar({ resumo: e.target.value })} />
```

(The `nome` input above stays: `value={c.nome}` / `agendarSalvar({ nome })`.)

- [ ] **Step 7: `AcoesIA` — snapshot/imagens/destino/inserir pela versão ativa**

Replace the four `AcoesIA` callbacks `snapshot`, `imagensParaIA`, `conteudoDoDestino`, `onInserir` (lines ~172-201) with:

```tsx
            snapshot={() => {
              const s = useApp.getState()
              const ent = s.cenarios[cenarioId]
              const vEnt = ent ? versaoAtiva(ent) : null
              const ehTexto = aba !== 'imagens' && aba !== 'conteudo' && aba !== 'vinculos'
              return {
                dadosBase: `# Cenário\nNome: ${ent?.nome ?? ''}\nResumo: ${vEnt?.resumo ?? ''}`,
                textoAtual: ehTexto && vEnt ? htmlParaTexto((vEnt as unknown as Record<string, string>)[aba] ?? '') : '',
                contexto: s.tree ? contextoDeEntidade(cenarioId, { ...s, tree: s.tree }) : '',
              }
            }}
            imagensParaIA={async (incluirGaleria) => {
              const s = useApp.getState()
              const ent = s.cenarios[cenarioId]
              if (!ent || !s.vaultPath) return []
              const vEnt = versaoAtiva(ent)
              const rels = vEnt.retrato ? [vEnt.retrato] : []
              if (incluirGaleria) for (const img of vEnt.imagens ?? []) rels.push(img.rel)
              return carregarImagensIA(s.vaultPath, rels)
            }}
            conteudoDoDestino={(dest) => {
              const ent = useApp.getState().cenarios[cenarioId]
              return ent ? htmlParaTexto((versaoAtiva(ent) as unknown as Record<string, string>)[dest] ?? '') : ''
            }}
            onInserir={(abaDestino, textoCru, modo) => {
              const html = textoParaHtml(textoCru)
              const atual = useApp.getState().cenarios[cenarioId]
              const base = atual ? (versaoAtiva(atual) as unknown as Record<string, string>)[abaDestino] ?? '' : ''
              const novo = modo === 'substituir' ? html : base + html
              agendarSalvar({ [abaDestino]: novo } as PatchCenario)
              setAba(abaDestino as Aba)
            }}
```

- [ ] **Step 8: Inserir a barra de versões + abas/galeria/editor pela versão**

Immediately before `<div className="perfil-abas">` (~line 205), add:

```tsx
        <BarraVersoes cenarioId={cenarioId} />
```

Replace the Galeria `imagens` prop (~line 215):

```tsx
            imagens={va.imagens}
```

Replace the `EditorTexto` block (~lines 223-227):

```tsx
          <EditorTexto
            key={`${aba}:${c.versaoAtivaId}`}
            value={va[aba as AbaTexto]}
            onChange={(html) => agendarSalvar({ [aba]: html } as PatchCenario)}
          />
```

(`AbaConteudo` — sub-cenários + personagens — não muda: `personagens` é compartilhado.)

- [ ] **Step 9: Commit**

```bash
git add grimorio/src/components/BarraVersoes.tsx grimorio/src/components/CenarioModal.tsx
git commit -m "feat(cenario): modal com barra de versões editando a versão ativa"
```

---

## Task 8: Estilos das setas e das pills

**Files:**
- Modify: `grimorio/src/theme.css` (append no fim)

- [ ] **Step 1: Adicionar CSS**

Append to `grimorio/src/theme.css`:

```css
/* --- Versões de cenário --- */
.card-versao-ctrl {
  display: inline-flex;
  align-items: center;
  gap: calc(2px * var(--card-fe, 1));
  margin-left: auto;
  font-size: calc(0.72em * var(--card-fe, 1));
}
.card-versao-ctrl button {
  border: none;
  background: transparent;
  cursor: pointer;
  color: currentColor;
  padding: 0 2px;
  line-height: 1;
}
.card-versao-ctrl button:hover { opacity: 0.7; }
.card-versao-nome { opacity: 0.85; min-width: 3ch; text-align: center; }

.barra-versoes {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 8px 12px 0;
}
.versao-pill {
  display: inline-flex;
  align-items: center;
  border: 1px solid currentColor;
  border-radius: 999px;
  opacity: 0.55;
}
.versao-pill.ativa { opacity: 1; background: rgba(127, 127, 127, 0.18); }
.versao-pill-nome {
  border: none; background: transparent; cursor: pointer; color: inherit;
  padding: 3px 10px; font-size: 0.85em;
}
.versao-pill-x {
  border: none; background: transparent; cursor: pointer; color: inherit;
  opacity: 0.6; padding: 3px 6px 3px 0;
}
.versao-pill-x:hover { opacity: 1; }
.versao-add {
  border: 1px dashed currentColor; border-radius: 999px; background: transparent;
  cursor: pointer; color: inherit; padding: 3px 10px; font-size: 0.85em; opacity: 0.7;
}
.versao-add:hover { opacity: 1; }
```

- [ ] **Step 2: Commit**

```bash
git add grimorio/src/theme.css
git commit -m "style(cenario): estilos das setas de versão e das pills"
```

---

## Task 9: Gate de tipo + suíte completa + verificação manual

**Files:** nenhum edit planejado; corrige sobras que o `tsc` apontar.

- [ ] **Step 1: Typecheck (pega qualquer leitor de conteúdo esquecido)**

Run: `cd grimorio && npm run build`
Expected: sem erros. Se aparecer `Property 'X' does not exist on type 'Cenario'` (X ∈ retrato/resumo/descricao/informacao/historia/eventos/itens/anotacoes/imagens) num arquivo não listado:
- importar `versaoAtiva` de `../lib/cenarioVersao` naquele arquivo;
- trocar `<cenario>.X` por `versaoAtiva(<cenario>).X` (leitura) — só quando `<cenario>` é um `Cenario` do cache do store, nunca em nós de árvore (`CenarioNode`, que têm só id/nome/caminho).
Re-rodar até verde. Commitar a correção se houver:

```bash
git commit -am "fix(cenario): rotear leitor de conteúdo remanescente pela versão ativa"
```

- [ ] **Step 2: Suíte completa**

Run: `cd grimorio && npx vitest run`
Expected: PASS em tudo.

- [ ] **Step 3: Verificação manual no app (Tauri)**

Run: `cd grimorio && npm run tauri dev`
Checklist (abrir o cofre existente):
1. Cada cenário existente abre com conteúdo intacto; no modal, a barra mostra 1 pill "Base"; no card não há setas (1 versão).
2. No modal, `+ versão` → nome "Noite" → nova pill ativa, conteúdo clonado da Base.
3. Trocar a foto e a descrição na "Noite"; a "Base" continua com a foto/descrição antigas.
4. No card do canvas, aparecem `‹ Noite ›` ao lado de A−/A+; clicar `‹`/`›` troca foto e textos ao vivo.
5. Fechar e reabrir o app → cada cenário reabre na última versão ativa.
6. No modal, duplo-clique numa pill renomeia; `×` pede confirmação e, ao confirmar, remove a versão (arquivos de imagem permanecem no cofre); a última versão não pode ser removida.
7. Criar um cenário novo pela sidebar → abre com 1 versão "Base", tudo funcional.

- [ ] **Step 4: Commit final (se a verificação exigiu ajustes)**

```bash
git commit -am "fix(cenario): ajustes da verificação manual de versões"
```

---

## Cobertura do spec

- Modelo Base+variações → Task 2 (migração p/ "Base"). ✅
- Card inteiro (conteúdo por versão) → Task 2 (`VersaoCenario`) + Tasks 6/7 (leitura/escrita). ✅
- Versão ativa na entidade → `versaoAtivaId` (Task 2) + `definirVersaoAtiva` (Task 3). ✅
- Setas ‹ › ao lado do controle de fonte → Task 6. ✅
- Nova versão copia a ativa e vira ativa → Task 3 (`adicionarVersao`). ✅
- Excluir confirma + mantém imagens + nunca a última → Tasks 3 e 7. ✅
- Editar == ver (pill ativa) → Task 7. ✅
- Retrato por versão → Task 7 (`retrato-<cenId>-<verId>`). ✅
- Consumidores (copiaImagem, contextoIA, ChatIA) → Tasks 4/5. ✅
- Verificação → Task 9. ✅
```