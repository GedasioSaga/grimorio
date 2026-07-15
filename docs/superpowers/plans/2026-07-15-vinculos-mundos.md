# Vínculos & Mundos por Campanha — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Relações tipadas entre personagens/cenários, participação N:N em campanhas (`vinculos.json` único), filtro por campanha na sidebar e setas rotuladas no canvas.

**Architecture:** Lógica pura em `src/lib/{vinculos,filtroCampanha}.ts` (vitest); persistência num arquivo único via VaultRepo; estado no zustand com save debounced único; UI = aba compartilhada `AbaVinculos` nos dois modais, seletor na Sidebar (filtra as árvores ANTES de passar como prop — componentes de árvore intactos), e generalização do pipeline de setas do canvas (label via `richText`/`toRichText`).

**Tech Stack:** Tauri v2, React 19, tldraw 4.5, zustand, vitest.

**Spec:** `docs/superpowers/specs/2026-07-15-vinculos-mundos-design.md`

---

## Contexto verificado (ler antes de começar)

- `src/lib/types.ts` — `Personagem`, `Cenario`, `CampanhaNode` (HOJE SEM `id`), `PastaNode` (personagens por `ItemRef.caminho`), `PastaCenarioNode`/`CenarioNode` (cenários por `id`).
- `src/lib/vaultRepo.ts:384-411` — `montarArvore()` já lê `campanha.json` pro nome (try/catch → `erro`). Ids: `crypto.randomUUID()` (`novoId()` local, linha 9). Escrita: `this.fs.writeTextAtomic(this.abs(caminho), json)`.
- `src/state/store.ts` — padrão de save debounced fire-and-forget (`timersSalvarParcial`); `caminhoPorId` (personagem id→caminho).
- `src/components/Sidebar.tsx:79-81` — passa `tree.personagensSoltos` e `tree.cenarios` como prop `raiz` para `PersonagensSoltos`/`CenariosSoltos`. Filtro entra AQUI.
- `src/components/PerfilModal.tsx:11-21,144-156` e `CenarioModal.tsx:13-25,144-156` — padrão de abas: `type Aba`, `ABAS`, branch de render.
- `src/components/CanvasView.tsx:140-189` — `ANCORA_SETA`, `existeSetaEntre`, `criarSetaHierarquia`, `ligarCenarioNoCanvas`; drop de cenário usa `editorAtual.run(...)`; drop de personagem (linhas ~350-365) cria card SEM run.
- **Arrow label (verificado no fonte instalado, tldraw 4.5.12):** prop `richText` com `toRichText(texto)` — `toRichText` exportado por `'tldraw'` (vem do tlschema). Ex.: `editor.createShape({ type: 'arrow', props: { richText: toRichText('mora em') } })`.
- Rodar em `grimorio/`: `npm run test -- <nome>`, `npm run test`, `npm run build`. Suíte hoje: 153 passed. Erro "unhandled" pré-existente em `imagemViewRepro.test.tsx` (jsdom) é ignorável.

---

## Task 1: Tipos + helpers puros de vínculo

**Files:**
- Modify: `src/lib/types.ts`
- Create: `src/lib/vinculos.ts`
- Test: `src/test/vinculos.test.ts`

- [ ] **Step 1: Adicionar tipos em `types.ts`**

Após a interface `Cenario`:

```ts
/** Ponta de vínculo entre entidades (campanha só aparece como destino). */
export type TipoEntidadeVinculo = 'personagem' | 'cenario'

/** Relação tipada entre entidades OU participação em campanha (tipo TIPO_PARTICIPA). */
export interface Vinculo {
  id: string
  deTipo: TipoEntidadeVinculo
  deId: string
  paraTipo: TipoEntidadeVinculo | 'campanha'
  paraId: string
  tipo: string      // 'conhece', 'mora em', … ou texto livre
  notas: string     // '' quando vazia
  criadoEm: string  // ISO-8601
}
```

Em `CampanhaNode`, adicionar `id`:

```ts
export interface CampanhaNode {
  id: string // do campanha.json ('' se ilegível/sem id)
  slug: string
  nome: string
  erro?: boolean
  sessoes: ItemRef[]
  personagens: ItemRef[]
  canvases: ItemRef[]
  escritas: ItemRef[]
}
```

- [ ] **Step 2: Write the failing test**

`src/test/vinculos.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  TIPO_PARTICIPA,
  adicionarVinculo,
  removerVinculo,
  vinculosDaEntidade,
  campanhasDe,
  idsDaCampanha,
  vinculosEntre,
  participacaoDe,
  normalizarVinculos,
} from '../lib/vinculos'
import type { Vinculo } from '../lib/types'

function v(parcial: Partial<Vinculo>): Vinculo {
  return {
    id: parcial.id ?? 'v1',
    deTipo: parcial.deTipo ?? 'personagem',
    deId: parcial.deId ?? 'a',
    paraTipo: parcial.paraTipo ?? 'personagem',
    paraId: parcial.paraId ?? 'b',
    tipo: parcial.tipo ?? 'conhece',
    notas: parcial.notas ?? '',
    criadoEm: parcial.criadoEm ?? '2026-07-15T00:00:00Z',
  }
}

describe('adicionarVinculo', () => {
  it('adiciona vínculo novo', () => {
    expect(adicionarVinculo([], v({}))).toHaveLength(1)
  })
  it('dedupe por (deId, paraId, tipo): retorna a MESMA lista', () => {
    const lista = [v({})]
    expect(adicionarVinculo(lista, v({ id: 'v2' }))).toBe(lista)
  })
  it('mesmo par com tipo diferente entra', () => {
    expect(adicionarVinculo([v({})], v({ id: 'v2', tipo: 'aliado de' }))).toHaveLength(2)
  })
})

describe('removerVinculo', () => {
  it('remove por id', () => {
    expect(removerVinculo([v({})], 'v1')).toHaveLength(0)
  })
})

describe('vinculosDaEntidade', () => {
  const lista = [
    v({}),                                                          // a → b
    v({ id: 'v2', deId: 'c', paraId: 'a', tipo: 'teme' }),          // c → a
    v({ id: 'v3', paraTipo: 'campanha', paraId: 'camp1', tipo: TIPO_PARTICIPA }), // a participa
  ]
  it('inclui as duas direções e exclui participação', () => {
    const r = vinculosDaEntidade(lista, 'a')
    expect(r.map((x) => x.id)).toEqual(['v1', 'v2'])
  })
})

describe('participação em campanha', () => {
  const lista = [
    v({ id: 'p1', paraTipo: 'campanha', paraId: 'camp1', tipo: TIPO_PARTICIPA }),          // a
    v({ id: 'p2', deTipo: 'cenario', deId: 'cen1', paraTipo: 'campanha', paraId: 'camp1', tipo: TIPO_PARTICIPA }),
    v({ id: 'p3', paraTipo: 'campanha', paraId: 'camp2', tipo: TIPO_PARTICIPA }),          // a em camp2
  ]
  it('campanhasDe lista as campanhas da entidade', () => {
    expect(campanhasDe(lista, 'a')).toEqual(['camp1', 'camp2'])
  })
  it('idsDaCampanha devolve as entidades participantes', () => {
    expect([...idsDaCampanha(lista, 'camp1')].sort()).toEqual(['a', 'cen1'])
  })
  it('participacaoDe acha o vínculo exato', () => {
    expect(participacaoDe(lista, 'a', 'camp1')?.id).toBe('p1')
    expect(participacaoDe(lista, 'a', 'zzz')).toBeUndefined()
  })
})

describe('vinculosEntre', () => {
  const lista = [v({}), v({ id: 'v2', deId: 'b', paraId: 'a', tipo: 'teme' }), v({ id: 'v3', paraId: 'c' })]
  it('acha relações do par nas duas direções', () => {
    expect(vinculosEntre(lista, 'a', 'b').map((x) => x.id)).toEqual(['v1', 'v2'])
  })
})

describe('normalizarVinculos', () => {
  it('aceita formato { vinculos: [...] }', () => {
    expect(normalizarVinculos({ vinculos: [v({})] })).toHaveLength(1)
  })
  it('descarta entradas sem deId/paraId/tipo', () => {
    const suja = { vinculos: [v({}), { id: 'x' }, null] }
    expect(normalizarVinculos(suja)).toHaveLength(1)
  })
  it('lixo total → lista vazia', () => {
    expect(normalizarVinculos(null)).toEqual([])
    expect(normalizarVinculos('oi')).toEqual([])
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test -- vinculos.test`
Expected: FAIL — `Cannot find module '../lib/vinculos'`.

- [ ] **Step 4: Implement `src/lib/vinculos.ts`**

```ts
import type { Vinculo } from './types'

/** Tipo reservado do vínculo entidade↔campanha. */
export const TIPO_PARTICIPA = 'participa'

/** Sugestões do dropdown de tipos (o UI também aceita texto livre). */
export const TIPOS_SUGERIDOS = [
  'conhece', 'aliado de', 'inimigo de', 'família de', 'mentor de',
  'deve favor a', 'mora em', 'frequenta', 'protege', 'teme',
]

/** Adiciona com dedupe por (deId, paraId, tipo). Retorna a MESMA lista se nada mudou. */
export function adicionarVinculo(lista: Vinculo[], v: Vinculo): Vinculo[] {
  const existe = lista.some((x) => x.deId === v.deId && x.paraId === v.paraId && x.tipo === v.tipo)
  return existe ? lista : [...lista, v]
}

export function removerVinculo(lista: Vinculo[], id: string): Vinculo[] {
  return lista.filter((x) => x.id !== id)
}

/** Relações da entidade nas duas direções (participação em campanha fica de fora). */
export function vinculosDaEntidade(lista: Vinculo[], id: string): Vinculo[] {
  return lista.filter((x) => x.paraTipo !== 'campanha' && (x.deId === id || x.paraId === id))
}

/** Ids das campanhas em que a entidade participa. */
export function campanhasDe(lista: Vinculo[], entidadeId: string): string[] {
  return lista
    .filter((x) => x.paraTipo === 'campanha' && x.tipo === TIPO_PARTICIPA && x.deId === entidadeId)
    .map((x) => x.paraId)
}

/** Entidades (personagens e cenários) que participam da campanha. */
export function idsDaCampanha(lista: Vinculo[], campanhaId: string): Set<string> {
  const ids = new Set<string>()
  for (const x of lista) {
    if (x.paraTipo === 'campanha' && x.tipo === TIPO_PARTICIPA && x.paraId === campanhaId) ids.add(x.deId)
  }
  return ids
}

/** Relações diretas entre o par (a, b), nas duas direções. */
export function vinculosEntre(lista: Vinculo[], aId: string, bId: string): Vinculo[] {
  return lista.filter(
    (x) => x.paraTipo !== 'campanha' &&
      ((x.deId === aId && x.paraId === bId) || (x.deId === bId && x.paraId === aId)),
  )
}

/** Vínculo de participação exato entidade↔campanha, se existir. */
export function participacaoDe(lista: Vinculo[], entidadeId: string, campanhaId: string): Vinculo | undefined {
  return lista.find(
    (x) => x.paraTipo === 'campanha' && x.tipo === TIPO_PARTICIPA && x.deId === entidadeId && x.paraId === campanhaId,
  )
}

/** Normaliza o conteúdo lido de vinculos.json; entradas inválidas são descartadas. */
export function normalizarVinculos(raw: unknown): Vinculo[] {
  const lista = (raw as { vinculos?: unknown })?.vinculos
  if (!Array.isArray(lista)) return []
  return lista.filter((x): x is Vinculo => {
    const v = x as Vinculo | null
    return !!v && typeof v.deId === 'string' && !!v.deId &&
      typeof v.paraId === 'string' && !!v.paraId &&
      typeof v.tipo === 'string' && !!v.tipo && typeof v.id === 'string' && !!v.id
  })
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test -- vinculos.test`
Expected: PASS (12 testes).

- [ ] **Step 6: Commit**

```bash
git add src/lib/types.ts src/lib/vinculos.ts src/test/vinculos.test.ts
git commit -m "feat(vinculos): tipos e helpers puros de vinculo"
```

Nota: `CampanhaNode.id` novo vai quebrar o build até a Task 3 preencher no `montarArvore` — como `montarArvore` monta objeto literal, o tsc acusa campo faltando SÓ lá. Se `npm run build` for rodado agora e falhar por isso, siga direto — Task 3 resolve. (Testes não compilam vaultRepo? Compilam — se o teste `cenarioRepo.test.ts` falhar de tipo, adicione `id: ''` provisório no literal de `montarArvore` já nesta task e anote no commit.)

---

## Task 2: Filtros de árvore por campanha (puros)

**Files:**
- Create: `src/lib/filtroCampanha.ts`
- Test: `src/test/filtroCampanha.test.ts`

- [ ] **Step 1: Write the failing test**

`src/test/filtroCampanha.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { filtrarPastaPersonagens, filtrarArvoreCenarios } from '../lib/filtroCampanha'
import type { PastaCenarioNode, PastaNode } from '../lib/types'

const pastaP: PastaNode = {
  slug: 'raiz', nome: 'raiz', caminho: 'personagens-soltos',
  subpastas: [
    {
      slug: 'viloes', nome: 'viloes', caminho: 'personagens-soltos/viloes', subpastas: [],
      personagens: [{ slug: 'x', nome: 'X', caminho: 'personagens-soltos/viloes/x.json' }],
    },
    { slug: 'vazia', nome: 'vazia', caminho: 'personagens-soltos/vazia', subpastas: [], personagens: [] },
  ],
  personagens: [
    { slug: 'a', nome: 'A', caminho: 'personagens-soltos/a.json' },
    { slug: 'b', nome: 'B', caminho: 'personagens-soltos/b.json' },
  ],
}

describe('filtrarPastaPersonagens', () => {
  it('mantém só caminhos permitidos e poda pastas vazias', () => {
    const r = filtrarPastaPersonagens(pastaP, new Set(['personagens-soltos/a.json']))
    expect(r.personagens.map((p) => p.slug)).toEqual(['a'])
    expect(r.subpastas).toHaveLength(0) // viloes sem match e vazia podadas
  })
  it('subpasta com match sobrevive', () => {
    const r = filtrarPastaPersonagens(pastaP, new Set(['personagens-soltos/viloes/x.json']))
    expect(r.personagens).toHaveLength(0)
    expect(r.subpastas.map((s) => s.slug)).toEqual(['viloes'])
  })
})

function cen(id: string, filhos: PastaCenarioNode['cenarios'] = []) {
  return { id, slug: id, nome: id, caminho: id, filhos }
}
const arvoreC: PastaCenarioNode = {
  slug: 'cenarios', nome: 'Cenários', caminho: 'cenarios',
  subpastas: [
    { slug: 'p1', nome: 'p1', caminho: 'cenarios/p1', subpastas: [], cenarios: [cen('d')] },
  ],
  cenarios: [cen('a', [cen('b', [cen('c')])])],
}

describe('filtrarArvoreCenarios', () => {
  it('mantém cenário permitido', () => {
    const r = filtrarArvoreCenarios(arvoreC, new Set(['a']))
    expect(r.cenarios.map((c) => c.id)).toEqual(['a'])
    expect(r.subpastas).toHaveLength(0)
  })
  it('ancestral de permitido fica (contexto), irmãos caem', () => {
    const r = filtrarArvoreCenarios(arvoreC, new Set(['c']))
    expect(r.cenarios.map((c) => c.id)).toEqual(['a'])
    expect(r.cenarios[0].filhos.map((c) => c.id)).toEqual(['b'])
    expect(r.cenarios[0].filhos[0].filhos.map((c) => c.id)).toEqual(['c'])
  })
  it('pasta sem nada permitido é podada; com match fica', () => {
    expect(filtrarArvoreCenarios(arvoreC, new Set(['d'])).subpastas.map((s) => s.slug)).toEqual(['p1'])
    expect(filtrarArvoreCenarios(arvoreC, new Set(['a'])).subpastas).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- filtroCampanha`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Implement `src/lib/filtroCampanha.ts`**

```ts
import type { CenarioNode, PastaCenarioNode, PastaNode } from './types'

/**
 * Filtra a árvore de personagens soltos: mantém personagens cujo CAMINHO está no
 * conjunto e poda subpastas que ficarem sem nada (personagem é referenciado por
 * caminho na árvore; o chamador converte ids → caminhos via caminhoPorId).
 */
export function filtrarPastaPersonagens(pasta: PastaNode, caminhosPermitidos: Set<string>): PastaNode {
  const personagens = pasta.personagens.filter((p) => caminhosPermitidos.has(p.caminho))
  const subpastas = pasta.subpastas
    .map((s) => filtrarPastaPersonagens(s, caminhosPermitidos))
    .filter((s) => s.personagens.length > 0 || s.subpastas.length > 0)
  return { ...pasta, personagens, subpastas }
}

/** Mantém o cenário se o id é permitido OU se algum descendente é (ancestral fica p/ contexto). */
function filtrarCenarios(nos: CenarioNode[], ids: Set<string>): CenarioNode[] {
  const out: CenarioNode[] = []
  for (const n of nos) {
    const filhos = filtrarCenarios(n.filhos, ids)
    if (ids.has(n.id) || filhos.length > 0) out.push({ ...n, filhos })
  }
  return out
}

/** Filtra a árvore de cenários por ids permitidos; pastas vazias são podadas. */
export function filtrarArvoreCenarios(raiz: PastaCenarioNode, ids: Set<string>): PastaCenarioNode {
  const cenarios = filtrarCenarios(raiz.cenarios, ids)
  const subpastas = raiz.subpastas
    .map((s) => filtrarArvoreCenarios(s, ids))
    .filter((s) => s.cenarios.length > 0 || s.subpastas.length > 0)
  return { ...raiz, cenarios, subpastas }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- filtroCampanha`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/filtroCampanha.ts src/test/filtroCampanha.test.ts
git commit -m "feat(vinculos): filtros de arvore por campanha"
```

---

## Task 3: Repo — `vinculos.json` + id da campanha na árvore

**Files:**
- Modify: `src/lib/vaultRepo.ts`

- [ ] **Step 1: Ler/salvar vínculos**

Adicionar import no topo do `vaultRepo.ts`: `import { normalizarVinculos } from './vinculos'` e `Vinculo` ao import de types.

Adicionar métodos na classe (perto de `lerCenario`/`salvarCenario`, seguindo o MESMO padrão de escrita dos vizinhos — ler `salvarPersonagem` antes e usar o mesmo mecanismo/fila):

```ts
/** Lê vinculos.json da raiz do cofre; ausente/corrompido → lista vazia. */
async lerVinculos(): Promise<Vinculo[]> {
  try {
    return normalizarVinculos(JSON.parse(await this.fs.readText(this.abs('vinculos.json'))))
  } catch {
    return []
  }
}

async salvarVinculos(lista: Vinculo[]): Promise<void> {
  await this.fs.writeTextAtomic(this.abs('vinculos.json'), JSON.stringify({ vinculos: lista }, null, 2))
}
```

(Se `salvarPersonagem` usar um wrapper de fila — ex.: `this.enfileirar(...)` — usar o mesmo aqui. Ajustar ao padrão real do arquivo.)

- [ ] **Step 2: `id` no CampanhaNode**

Em `montarArvore()` (linhas ~384-403), preencher o id lendo o mesmo `campanha.json` já lido pro nome:

```ts
const base = `campanhas/${d.name}`
let nome = d.name
let id = ''
let erro = false
try {
  const meta = JSON.parse(await this.fs.readText(this.abs(`${base}/campanha.json`))) as Campanha
  nome = meta.nome
  id = meta.id ?? ''
} catch {
  erro = true
}
campanhas.push({
  id,
  slug: d.name,
  nome,
  erro: erro || undefined,
  ...
})
```

- [ ] **Step 3: Build + suíte**

Run: `npm run build` — sem erros (o campo `id` do `CampanhaNode` agora existe no literal).
Run: `npm run test` — verde (repo não tem teste de I/O novo; `normalizarVinculos` já coberto na Task 1).

- [ ] **Step 4: Commit**

```bash
git add src/lib/vaultRepo.ts
git commit -m "feat(vinculos): vinculos.json no repo e id da campanha na arvore"
```

---

## Task 4: Store — estado de vínculos + filtro de campanha

**Files:**
- Modify: `src/state/store.ts`

- [ ] **Step 1: Estado e ações**

Imports novos: `Vinculo` em types; `adicionarVinculo as adicionarVinculoPuro, removerVinculo as removerVinculoPuro, participacaoDe, TIPO_PARTICIPA` de `../lib/vinculos`; `TipoEntidadeVinculo` de types.

Timer de módulo (junto dos outros):

```ts
// um arquivo só (vinculos.json): um timer só
let timerSalvarVinculos: ReturnType<typeof setTimeout> | null = null
```

No `AppState`, adicionar:

```ts
vinculos: Vinculo[]
campanhaFiltro: string | null
carregarVinculos(): Promise<void>
adicionarVinculo(v: Omit<Vinculo, 'id' | 'criadoEm'>): void
removerVinculo(id: string): void
alternarParticipacao(entidadeTipo: TipoEntidadeVinculo, entidadeId: string, campanhaId: string): void
setCampanhaFiltro(id: string | null): void
```

Estado inicial: `vinculos: [], campanhaFiltro: null,`.

Implementações (padrão dos vizinhos):

```ts
async carregarVinculos() {
  const { repo, tree } = get()
  if (!repo) return
  const vinculos = await repo.lerVinculos()
  // restaura o filtro salvo; campanha apagada → volta a "Todas"
  const salvo = localStorage.getItem('grimorio.campanhaFiltro')
  const valido = !!salvo && !!tree?.campanhas.some((c) => c.id === salvo)
  set({ vinculos, campanhaFiltro: valido ? salvo : null })
},

adicionarVinculo(v) {
  const completo: Vinculo = { ...v, id: crypto.randomUUID(), criadoEm: new Date().toISOString() }
  const nova = adicionarVinculoPuro(get().vinculos, completo)
  if (nova === get().vinculos) return // dedupe: nada mudou
  set({ vinculos: nova })
  agendarSalvarVinculos(get)
},

removerVinculo(id) {
  set({ vinculos: removerVinculoPuro(get().vinculos, id) })
  agendarSalvarVinculos(get)
},

alternarParticipacao(entidadeTipo, entidadeId, campanhaId) {
  const atual = participacaoDe(get().vinculos, entidadeId, campanhaId)
  if (atual) {
    get().removerVinculo(atual.id)
  } else {
    get().adicionarVinculo({
      deTipo: entidadeTipo, deId: entidadeId,
      paraTipo: 'campanha', paraId: campanhaId,
      tipo: TIPO_PARTICIPA, notas: '',
    })
  }
},

setCampanhaFiltro(id) {
  if (id) localStorage.setItem('grimorio.campanhaFiltro', id)
  else localStorage.removeItem('grimorio.campanhaFiltro')
  set({ campanhaFiltro: id })
},
```

Helper em nível de módulo (acima do `create`):

```ts
const SALVAR_VINCULOS_DEBOUNCE_MS = 800

function agendarSalvarVinculos(get: () => AppState) {
  if (timerSalvarVinculos) clearTimeout(timerSalvarVinculos)
  timerSalvarVinculos = setTimeout(() => {
    timerSalvarVinculos = null
    const { repo, vinculos } = get()
    if (!repo) return
    // fire-and-forget: VaultRepo serializa escritas por caminho
    repo.salvarVinculos(vinculos).catch((e) => console.error('Falha ao salvar vínculos:', e))
  }, SALVAR_VINCULOS_DEBOUNCE_MS)
}
```

- [ ] **Step 2: Carregar no boot**

Em `abrirCofre`, após `await get().carregarCenarios()`:

```ts
await get().carregarVinculos()
```

- [ ] **Step 3: Build + suíte**

Run: `npm run build` e `npm run test` — verdes.

- [ ] **Step 4: Commit**

```bash
git add src/state/store.ts
git commit -m "feat(vinculos): estado de vinculos e filtro de campanha no store"
```

---

## Task 5: Aba "Vínculos" nos dois modais

**Files:**
- Create: `src/components/AbaVinculos.tsx`
- Modify: `src/components/PerfilModal.tsx`, `src/components/CenarioModal.tsx`, `src/theme.css`

- [ ] **Step 1: Criar `AbaVinculos.tsx`**

```tsx
import { useState } from 'react'
import { useApp } from '../state/store'
import type { TipoEntidadeVinculo } from '../lib/types'
import { TIPOS_SUGERIDOS, campanhasDe, vinculosDaEntidade } from '../lib/vinculos'

const OUTRO = '__outro__'

interface Alvo {
  tipo: TipoEntidadeVinculo
  id: string
  nome: string
}

/**
 * Aba compartilhada de vínculos (PerfilModal e CenarioModal):
 * relações tipadas com outras entidades + participação em campanhas (chips).
 */
export function AbaVinculos({ entidadeTipo, entidadeId }: {
  entidadeTipo: TipoEntidadeVinculo
  entidadeId: string
}) {
  const vinculos = useApp((s) => s.vinculos)
  const personagens = useApp((s) => s.personagens)
  const cenarios = useApp((s) => s.cenarios)
  const tree = useApp((s) => s.tree)
  const adicionar = useApp((s) => s.adicionarVinculo)
  const remover = useApp((s) => s.removerVinculo)
  const alternarParticipacao = useApp((s) => s.alternarParticipacao)

  const [busca, setBusca] = useState('')
  const [alvo, setAlvo] = useState<Alvo | null>(null)
  const [tipoSel, setTipoSel] = useState(TIPOS_SUGERIDOS[0])
  const [tipoLivre, setTipoLivre] = useState('')
  const [nota, setNota] = useState('')

  const nomeDe = (id: string) => personagens[id]?.nome ?? cenarios[id]?.nome ?? null

  // vínculos da entidade com a outra ponta ainda viva (órfãos somem da exibição)
  const relacoes = vinculosDaEntidade(vinculos, entidadeId).filter((v) => {
    const outra = v.deId === entidadeId ? v.paraId : v.deId
    return nomeDe(outra) !== null
  })

  // candidatos do autocomplete: personagens + cenários, exclui a própria entidade
  const termo = busca.trim().toLowerCase()
  const candidatos: Alvo[] = termo
    ? [
        ...Object.values(personagens).map((p) => ({ tipo: 'personagem' as const, id: p.id, nome: p.nome })),
        ...Object.values(cenarios).map((c) => ({ tipo: 'cenario' as const, id: c.id, nome: c.nome })),
      ]
        .filter((e) => e.id !== entidadeId && e.nome.toLowerCase().includes(termo))
        .slice(0, 8)
    : []

  const campanhas = (tree?.campanhas ?? []).filter((c) => c.id)
  const participaDe = campanhasDe(vinculos, entidadeId)

  function adicionarRelacao() {
    const tipo = (tipoSel === OUTRO ? tipoLivre : tipoSel).trim()
    if (!alvo || !tipo) return
    adicionar({
      deTipo: entidadeTipo, deId: entidadeId,
      paraTipo: alvo.tipo, paraId: alvo.id,
      tipo, notas: nota.trim(),
    })
    setBusca(''); setAlvo(null); setTipoLivre(''); setNota('')
  }

  return (
    <div className="vinculos-aba">
      <div className="vinculos-secao-titulo">Relações</div>
      {relacoes.length === 0 && <div className="vinculos-vazio">Sem relações ainda.</div>}
      {relacoes.map((v) => {
        const souDe = v.deId === entidadeId
        const outraId = souDe ? v.paraId : v.deId
        return (
          <div key={v.id} className="vinculo-linha">
            <span className="vinculo-texto">
              {souDe
                ? <><em>{v.tipo}</em> → {nomeDe(outraId)}</>
                : <>{nomeDe(outraId)} → <em>{v.tipo}</em></>}
              {v.notas && <span className="vinculo-nota"> — {v.notas}</span>}
            </span>
            <button className="btn-icon" title="Remover vínculo" onClick={() => remover(v.id)}>✕</button>
          </div>
        )
      })}

      <div className="vinculo-form">
        <input
          placeholder="Buscar personagem ou cenário…"
          value={alvo ? alvo.nome : busca}
          onChange={(e) => { setAlvo(null); setBusca(e.target.value) }}
        />
        {!alvo && candidatos.length > 0 && (
          <div className="vinculo-busca-lista">
            {candidatos.map((c) => (
              <div key={c.id} className="vinculo-busca-item" onClick={() => setAlvo(c)}>
                {c.tipo === 'personagem' ? '👤' : '🗺'} {c.nome}
              </div>
            ))}
          </div>
        )}
        {!alvo && termo && candidatos.length === 0 && (
          <div className="vinculos-vazio">Nenhuma entidade encontrada.</div>
        )}
        <div className="vinculo-form-linha">
          <select value={tipoSel} onChange={(e) => setTipoSel(e.target.value)}>
            {TIPOS_SUGERIDOS.map((t) => <option key={t} value={t}>{t}</option>)}
            <option value={OUTRO}>outro…</option>
          </select>
          {tipoSel === OUTRO && (
            <input placeholder="tipo livre" value={tipoLivre} onChange={(e) => setTipoLivre(e.target.value)} />
          )}
          <input placeholder="nota (opcional)" value={nota} onChange={(e) => setNota(e.target.value)} />
          <button disabled={!alvo || (tipoSel === OUTRO && !tipoLivre.trim())} onClick={adicionarRelacao}>
            Adicionar
          </button>
        </div>
      </div>

      <div className="vinculos-secao-titulo">Campanhas</div>
      {campanhas.length === 0 && <div className="vinculos-vazio">Nenhuma campanha criada.</div>}
      <div className="vinculo-chips">
        {campanhas.map((c) => {
          const ativo = participaDe.includes(c.id)
          return (
            <button
              key={c.id}
              className={`campanha-chip${ativo ? ' ativo' : ''}`}
              title={ativo ? `Remover de ${c.nome}` : `Participar de ${c.nome}`}
              onClick={() => alternarParticipacao(entidadeTipo, entidadeId, c.id)}
            >
              {c.nome}
            </button>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Integrar no PerfilModal**

Em `PerfilModal.tsx`:
- Import: `import { AbaVinculos } from './AbaVinculos'`.
- `type Aba = 'descricao' | 'informacao' | 'historia' | 'imagens' | 'extras' | 'anotacoes' | 'vinculos'`
- `type AbaTexto = Exclude<Aba, 'imagens' | 'vinculos'>`
- `ABAS`: adicionar `{ id: 'vinculos', rotulo: 'Vínculos' },` ao fim.
- Render (o branch atual é `aba === 'imagens' ? <GaleriaPersonagem/> : <EditorTexto/>`): virar

```tsx
{aba === 'imagens' ? (
  <GaleriaPersonagem ... />
) : aba === 'vinculos' ? (
  <AbaVinculos entidadeTipo="personagem" entidadeId={personagemId} />
) : (
  <EditorTexto ... />
)}
```

- [ ] **Step 3: Integrar no CenarioModal**

Análogo em `CenarioModal.tsx`:
- Import `AbaVinculos`.
- `type Aba = ... | 'vinculos'`; `type AbaTexto = Exclude<Aba, 'imagens' | 'conteudo' | 'vinculos'>`.
- `ABAS`: adicionar `{ id: 'vinculos', rotulo: 'Vínculos' },` ao fim.
- No render em cadeia (`aba === 'imagens' ? ... : aba === 'conteudo' ? ... : ...`), adicionar o branch:

```tsx
) : aba === 'vinculos' ? (
  <AbaVinculos entidadeTipo="cenario" entidadeId={cenarioId} />
) : (
```

- [ ] **Step 4: CSS**

Em `theme.css`, após o bloco do modal de perfil:

```css
/* ---- aba Vínculos ---- */
.vinculos-aba { flex: 1; overflow-y: auto; padding: 16px 20px; display: flex; flex-direction: column; gap: 8px; }
.vinculos-secao-titulo { font-family: var(--serif); font-size: 14px; color: var(--dourado-claro); margin-top: 8px; }
.vinculos-vazio { font-size: 13px; color: var(--texto-fraco); font-style: italic; }
.vinculo-linha {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  background: var(--fundo); border: 1px solid var(--borda); border-radius: 6px; padding: 6px 10px;
}
.vinculo-texto { font-size: 13px; color: var(--texto); }
.vinculo-texto em { color: var(--dourado-claro); font-style: normal; }
.vinculo-nota { color: var(--texto-fraco); }
.vinculo-form { display: flex; flex-direction: column; gap: 6px; margin-top: 4px; }
.vinculo-form input, .vinculo-form select {
  background: var(--fundo); border: 1px solid var(--borda); border-radius: 6px;
  color: var(--texto); padding: 6px 10px; font-size: 13px;
}
.vinculo-form-linha { display: flex; gap: 6px; }
.vinculo-form-linha input { flex: 1; min-width: 0; }
.vinculo-form-linha button {
  background: var(--fundo-elevado); border: 1px solid var(--dourado); color: var(--dourado-claro);
  border-radius: 6px; padding: 6px 12px; font-size: 13px; cursor: pointer;
}
.vinculo-form-linha button:disabled { opacity: 0.4; cursor: default; }
.vinculo-busca-lista { border: 1px solid var(--borda); border-radius: 6px; overflow: hidden; }
.vinculo-busca-item { padding: 6px 10px; font-size: 13px; cursor: pointer; }
.vinculo-busca-item:hover { background: var(--fundo-elevado); color: var(--dourado-claro); }
.vinculo-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.campanha-chip {
  background: var(--fundo); border: 1px solid var(--borda); color: var(--texto-fraco);
  border-radius: 12px; padding: 4px 12px; font-size: 12px; cursor: pointer;
}
.campanha-chip.ativo { border-color: var(--dourado); color: var(--dourado-claro); background: var(--fundo-elevado); }
```

- [ ] **Step 5: Build + teste manual**

Run: `npm run build` (limpo). `npm run dev`: abrir personagem → aba Vínculos → buscar cenário → adicionar "mora em" → aparece na lista; abrir o cenário → a relação aparece na outra direção; chips de campanha alternam; fechar/reabrir app → persiste (`vinculos.json` na raiz do cofre).

- [ ] **Step 6: Commit**

```bash
git add src/components/AbaVinculos.tsx src/components/PerfilModal.tsx src/components/CenarioModal.tsx src/theme.css
git commit -m "feat(vinculos): aba Vinculos nos modais de personagem e cenario"
```

---

## Task 6: Seletor + filtro por campanha na sidebar

**Files:**
- Modify: `src/components/Sidebar.tsx`, `src/theme.css`

- [ ] **Step 1: Seletor e árvores filtradas**

Em `Sidebar.tsx`:
- Imports: `import { idsDaCampanha } from '../lib/vinculos'` e `import { filtrarArvoreCenarios, filtrarPastaPersonagens } from '../lib/filtroCampanha'`.
- Hooks extras no componente `Sidebar` (junto dos existentes):

```tsx
const vinculos = useApp((s) => s.vinculos)
const campanhaFiltro = useApp((s) => s.campanhaFiltro)
const setCampanhaFiltro = useApp((s) => s.setCampanhaFiltro)
const caminhoPorId = useApp((s) => s.caminhoPorId)
```

- Depois de `if (!tree) return ...`, calcular as raízes (personagens filtram por CAMINHO — converter ids via `caminhoPorId`):

```tsx
const idsFiltro = campanhaFiltro ? idsDaCampanha(vinculos, campanhaFiltro) : null
const raizPersonagens = idsFiltro
  ? filtrarPastaPersonagens(
      tree.personagensSoltos,
      new Set([...idsFiltro].map((id) => caminhoPorId[id]).filter((c): c is string => !!c)),
    )
  : tree.personagensSoltos
const raizCenarios = idsFiltro ? filtrarArvoreCenarios(tree.cenarios, idsFiltro) : tree.cenarios
```

- JSX: logo após `<div className="sidebar-header">…</div>`, adicionar o seletor:

```tsx
<div className="sidebar-filtro">
  <select
    title="Filtrar personagens e cenários por campanha"
    value={campanhaFiltro ?? ''}
    onChange={(e) => setCampanhaFiltro(e.target.value || null)}
  >
    <option value="">Campanha: Todas</option>
    {tree.campanhas.filter((c) => c.id).map((c) => (
      <option key={c.id} value={c.id}>{c.nome}</option>
    ))}
  </select>
</div>
```

- Trocar as props das seções: `<PersonagensSoltos raiz={raizPersonagens} ... />` e `<CenariosSoltos raiz={raizCenarios} ... />`. (Componentes de árvore NÃO mudam.)

- [ ] **Step 2: CSS**

```css
.sidebar-filtro { padding: 0 12px 8px; }
.sidebar-filtro select {
  width: 100%; background: var(--fundo); border: 1px solid var(--borda); border-radius: 6px;
  color: var(--dourado-claro); font-size: 12px; padding: 5px 8px;
}
```

- [ ] **Step 3: Build + teste manual**

Run: `npm run build`. `npm run dev`: vincular 1 personagem e 1 cenário a uma campanha (aba Vínculos) → selecionar a campanha no topo da sidebar → só eles aparecem (ancestrais de cenário mantidos); "Todas" → tudo volta. Reabrir o app → filtro lembrado.

- [ ] **Step 4: Commit**

```bash
git add src/components/Sidebar.tsx src/theme.css
git commit -m "feat(vinculos): seletor e filtro por campanha na sidebar"
```

---

## Task 7: Setas rotuladas de relação no canvas

**Files:**
- Modify: `src/components/CanvasView.tsx`

- [ ] **Step 1: Generalizar a criação de seta com rótulo**

- Import: adicionar `toRichText` ao import de `'tldraw'` e `vinculosDaEntidade` de `'../lib/vinculos'` + `Vinculo` no import de types.
- Renomear `criarSetaHierarquia` → `criarSeta` com rótulo opcional (label vai na prop `richText` — verificado no tldraw 4.5.12):

```ts
/** Cria uma seta de→para com bindings (segue os cards); rótulo opcional no meio. */
function criarSeta(editor: Editor, deShape: TLShapeId, paraShape: TLShapeId, rotulo?: string) {
  const arrowId = createShapeId()
  editor.createShape({
    id: arrowId,
    type: 'arrow',
    x: 0,
    y: 0,
    ...(rotulo ? { props: { richText: toRichText(rotulo) } } : {}),
  })
  editor.createBindings([
    { type: 'arrow', fromId: arrowId, toId: deShape, props: { terminal: 'start', ...ANCORA_SETA } },
    { type: 'arrow', fromId: arrowId, toId: paraShape, props: { terminal: 'end', ...ANCORA_SETA } },
  ])
}
```

Atualizar o call site da hierarquia (`ligarCenarioNoCanvas`): `criarSeta(editor, ps, fs)` (sem rótulo).

- [ ] **Step 2: Mapa de cards por entidade + setas de relação**

Adicionar (nível de módulo, junto das outras):

```ts
/** Shapes de card por id de entidade (personagem e cenário). */
function cardsPorEntidade(editor: Editor): Map<string, TLShapeId[]> {
  const mapa = new Map<string, TLShapeId[]>()
  for (const s of editor.getCurrentPageShapes()) {
    let eid: string | null = null
    if (s.type === 'cenario-card') eid = (s as CenarioCardShapeType).props.cenarioId
    else if (s.type === 'character-card') eid = (s as CharacterCardShapeType).props.personagemId
    if (!eid) continue
    const lista = mapa.get(eid) ?? []
    lista.push(s.id)
    mapa.set(eid, lista)
  }
  return mapa
}

/**
 * Liga a entidade recém-dropada aos cards presentes com relação direta.
 * Uma seta por par (de → para do primeiro vínculo); múltiplos tipos viram "a · b".
 */
function ligarRelacoesNoCanvas(editor: Editor, vinculos: Vinculo[], entidadeId: string) {
  const cards = cardsPorEntidade(editor)
  if (!cards.has(entidadeId)) return
  const porPar = new Map<string, { deId: string; paraId: string; tipos: string[] }>()
  for (const v of vinculosDaEntidade(vinculos, entidadeId)) {
    const outraId = v.deId === entidadeId ? v.paraId : v.deId
    const g = porPar.get(outraId)
    if (g) g.tipos.push(v.tipo)
    else porPar.set(outraId, { deId: v.deId, paraId: v.paraId, tipos: [v.tipo] })
  }
  for (const { deId, paraId, tipos } of porPar.values()) {
    for (const ds of cards.get(deId) ?? []) {
      for (const ps of cards.get(paraId) ?? []) {
        if (!existeSetaEntre(editor, ds, ps)) criarSeta(editor, ds, ps, tipos.join(' · '))
      }
    }
  }
}
```

- [ ] **Step 3: Chamar nos dois ramos de drop**

No ramo de **cenário** do `onDropCapture` (dentro do `editorAtual.run(...)` existente, logo após `ligarCenarioNoCanvas(...)`):

```ts
ligarRelacoesNoCanvas(editorAtual, useApp.getState().vinculos, cenarioId)
```

No ramo de **personagem** (hoje `editor.createShape({ type: 'character-card', ... })` solto), envolver em `run` e ligar (um passo de undo, igual ao cenário):

```ts
editor.run(() => {
  editor.createShape({
    id: createShapeId(),
    type: 'character-card',
    x: ponto.x - CARD_LARGURA_PADRAO / 2,
    y: ponto.y - CARD_ALTURA_PADRAO / 2,
    props: { personagemId: id },
  })
  ligarRelacoesNoCanvas(editor, useApp.getState().vinculos, id)
})
```

- [ ] **Step 4: Build + suíte + teste manual**

Run: `npm run build` e `npm run test` (verdes; suíte segue com os testes das Tasks 1-2).
`npm run dev`: criar relação "mora em" personagem→cenário (aba Vínculos); dropar o cenário e depois o personagem no canvas → seta rotulada "mora em" do personagem pro cenário, segue os cards; Ctrl+Z desfaz o drop inteiro; Delete na seta e re-drop religa; hierarquia continua sem rótulo.

- [ ] **Step 5: Commit**

```bash
git add src/components/CanvasView.tsx
git commit -m "feat(vinculos): setas rotuladas de relacao no canvas"
```

---

## Verificação final

- [ ] `npm run test` — suíte inteira verde (novos: vinculos, filtroCampanha).
- [ ] `npm run build` — tsc limpo.
- [ ] Manual: fluxo completo — criar relação nos dois modais (direções corretas), chips de campanha, filtro da sidebar (com persistência), setas rotuladas no canvas, `vinculos.json` legível na raiz do cofre.
- [ ] Cofre antigo (sem `vinculos.json`) abre normal, tudo vazio e funcional.

## Notas de risco

- **`salvarVinculos` e fila de escrita:** espelhar o mecanismo real de `salvarPersonagem` no `vaultRepo.ts` (se houver fila/wrapper, usar o mesmo; senão `writeTextAtomic` direto).
- **Rótulo da seta:** prop `richText` + `toRichText` verificados no fonte do tldraw 4.5.12; se o validador reclamar em runtime, checar se o import veio de `'tldraw'`.
- **Filtro de personagens usa CAMINHO** (árvore referencia por `ItemRef.caminho`): conversão id→caminho via `caminhoPorId` acontece na Sidebar; personagem sem entrada no cache simplesmente não passa no filtro.
- **Personagens DE campanha** (dentro do nó da campanha na sidebar) não são filtrados — já pertencem ao RPG deles.
