# Versões de Personagem — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Dar a cada personagem N versões (formas/evoluções/transformações — ex: Bruce Banner ↔ Hulk), cada uma com nome + imagem + textos próprios, alternáveis por setas no card.

**Architecture:** Espelha o sistema de versões de cenário (branch `feat/versoes-cenario`, commits `05a8586..HEAD`), com 3 diferenças: (1) conteúdo por-versão inclui **`nome`** (a forma tem nome próprio); (2) `Personagem.nome` no topo vira **espelho** do nome da versão ativa, mantido em sincronia — assim sidebar/vínculos/refs em disco (que leem `nome` do topo) continuam corretos sem mudança; (3) campo `extras` no lugar de `eventos`/`itens`.

**Tech stack:** React 19 + TS + tldraw + zustand + Tauri; vitest.

**Convenções:** commits terminam com `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. Comandos da raiz do repo; app em `grimorio/`. **NÃO rodar `npm run build`/`tsc` até a Task P6** (mudança de tipo é transversal — vitest transpila sem typar; verifique com `npx vitest run`).

**Referência:** cada task mecânica espelha um commit do cenário — leia `git show <sha>` + o arquivo de personagem atual e aplique a transformação análoga com a lista de campos do personagem.

---

## Diferenças de nomenclatura (personagem usa sufixo `Personagem` pra não colidir com as ações de cenário no store)
- Helpers: `versaoAtivaPersonagem`, `versaoVizinhaPersonagem`, `resumoAtivoPersonagem`, `retratoAtivoPersonagem`, `comNomeEspelho`, `aplicarPatchPersonagem`, `PatchPersonagem` — em `grimorio/src/lib/personagemVersao.ts`.
- Ações do store: `definirVersaoAtivaPersonagem`, `adicionarVersaoPersonagem`, `renomearVersaoPersonagem`, `removerVersaoPersonagem`.
- Componente: `grimorio/src/components/BarraVersoesPersonagem.tsx`.
- CSS: **reutiliza** as classes já existentes (`.barra-versoes`, `.versao-pill*`, `.card-versao-*`). Nada novo.

---

## Task P1: Modelo + helpers de versão de personagem (TDD)

**Files:** Modify `grimorio/src/lib/types.ts`; Create `grimorio/src/lib/personagemVersao.ts`, `grimorio/src/test/personagemVersao.test.ts`.

- [ ] **Step 1: `types.ts` — reformar `Personagem` (linhas 6-19)** para:

```ts
export interface VersaoPersonagem {
  id: string
  nome: string       // nome do personagem NESTA forma (ex: "Bruce Banner", "Hulk")
  retrato: string | null
  resumo: string
  descricao: string  // HTML TipTap (era `corpo`)
  informacao: string // HTML
  historia: string   // HTML
  extras: string     // HTML
  anotacoes: string  // HTML
  imagens: ImagemPersonagem[]
}

export interface Personagem {
  id: string
  nome: string          // ESPELHO do nome da versão ativa (para sidebar/vínculos/refs que leem nome do topo)
  versoes: VersaoPersonagem[]
  versaoAtivaId: string
  criadoEm: string
  modificadoEm: string
}
```

- [ ] **Step 2: teste `personagemVersao.test.ts`** (roda FAIL: módulo não existe):

```ts
import { describe, expect, it } from 'vitest'
import { versaoAtivaPersonagem, versaoVizinhaPersonagem, aplicarPatchPersonagem, resumoAtivoPersonagem, retratoAtivoPersonagem, comNomeEspelho } from '../lib/personagemVersao'
import type { Personagem, VersaoPersonagem } from '../lib/types'

function v(id: string, nome: string, over: Partial<VersaoPersonagem> = {}): VersaoPersonagem {
  return { id, nome, retrato: null, resumo: '', descricao: '', informacao: '', historia: '', extras: '', anotacoes: '', imagens: [], ...over }
}
function p(over: Partial<Personagem> = {}): Personagem {
  const vs = over.versoes ?? [v('v1', 'Bruce'), v('v2', 'Hulk')]
  return { id: 'p1', nome: vs[0].nome, versoes: vs, versaoAtivaId: over.versaoAtivaId ?? vs[0].id, criadoEm: 'x', modificadoEm: 'y', ...over }
}

describe('versaoAtivaPersonagem / vizinha', () => {
  it('ativa pelo id, fallback na primeira', () => {
    expect(versaoAtivaPersonagem(p({ versaoAtivaId: 'v2' })).nome).toBe('Hulk')
    expect(versaoAtivaPersonagem(p({ versaoAtivaId: 'x' })).id).toBe('v1')
  })
  it('vizinha cíclica', () => {
    expect(versaoVizinhaPersonagem(p({ versaoAtivaId: 'v2' }), 1)).toBe('v1')
    expect(versaoVizinhaPersonagem(p({ versaoAtivaId: 'v1' }), -1)).toBe('v2')
  })
})

describe('aplicarPatchPersonagem', () => {
  it('roteia conteúdo pra versão ativa E atualiza o espelho do nome', () => {
    const r = aplicarPatchPersonagem(p({ versaoAtivaId: 'v2' }), { nome: 'Hulk Cinza', descricao: '<p>x</p>' })
    expect(r.versoes[1].nome).toBe('Hulk Cinza')
    expect(r.versoes[1].descricao).toBe('<p>x</p>')
    expect(r.versoes[0].nome).toBe('Bruce')     // outra versão intacta
    expect(r.nome).toBe('Hulk Cinza')           // espelho = nome da versão ativa
  })
  it('trocar versaoAtivaId recomputa o espelho', () => {
    const r = aplicarPatchPersonagem(p({ versaoAtivaId: 'v1' }), { versaoAtivaId: 'v2' })
    expect(r.versaoAtivaId).toBe('v2')
    expect(r.nome).toBe('Hulk')
    expect(r.versoes).toEqual(p().versoes)      // versões intactas
  })
  it('não muta o original', () => {
    const orig = p()
    aplicarPatchPersonagem(orig, { resumo: 'z' })
    expect(orig.versoes[0].resumo).toBe('')
  })
})

describe('helpers undefined-safe + comNomeEspelho', () => {
  it('resumo/retrato ativos', () => {
    const x = p({ versaoAtivaId: 'v2', versoes: [v('v1', 'Bruce', { resumo: 'a', retrato: 'a.png' }), v('v2', 'Hulk', { resumo: 'b', retrato: 'b.png' })] })
    expect(resumoAtivoPersonagem(x)).toBe('b')
    expect(retratoAtivoPersonagem(x)).toBe('b.png')
    expect(resumoAtivoPersonagem(undefined)).toBe('')
    expect(retratoAtivoPersonagem(undefined)).toBeNull()
  })
  it('comNomeEspelho força nome = versão ativa', () => {
    const x = comNomeEspelho({ ...p({ versaoAtivaId: 'v2' }), nome: 'errado' })
    expect(x.nome).toBe('Hulk')
  })
})
```

- [ ] **Step 3: implementar `personagemVersao.ts`**:

```ts
import type { Personagem, VersaoPersonagem } from './types'

// nome É por-versão (transformação). O top-level Personagem.nome é ESPELHO da versão ativa.
export const CHAVES_VERSAO_PERSONAGEM = [
  'nome', 'retrato', 'resumo', 'descricao', 'informacao', 'historia', 'extras', 'anotacoes', 'imagens',
] as const

export type PatchPersonagem =
  Partial<Pick<Personagem, 'versaoAtivaId' | 'modificadoEm'>> &
  Partial<Omit<VersaoPersonagem, 'id'>>

type PersonagemMin = Pick<Personagem, 'versoes' | 'versaoAtivaId'>

export function versaoAtivaPersonagem(p: PersonagemMin): VersaoPersonagem {
  return p.versoes.find((v) => v.id === p.versaoAtivaId) ?? p.versoes[0]
}

export function versaoVizinhaPersonagem(p: PersonagemMin, dir: 1 | -1): string {
  const i = p.versoes.findIndex((v) => v.id === p.versaoAtivaId)
  const base = i < 0 ? 0 : i
  const n = p.versoes.length
  return p.versoes[(base + dir + n) % n].id
}

export function resumoAtivoPersonagem(p: PersonagemMin | undefined): string {
  return p ? versaoAtivaPersonagem(p).resumo : ''
}
export function retratoAtivoPersonagem(p: PersonagemMin | undefined): string | null {
  return p ? versaoAtivaPersonagem(p).retrato : null
}

/** Força o top-level `nome` a espelhar o nome da versão ativa (sidebar/vínculos/refs). */
export function comNomeEspelho(p: Personagem): Personagem {
  return { ...p, nome: versaoAtivaPersonagem(p).nome }
}

const SET_CHAVES: ReadonlySet<string> = new Set(CHAVES_VERSAO_PERSONAGEM)

/** Roteia conteúdo (inclui `nome`) pra versão ativa; chaves de topo pro personagem; recomputa o espelho do nome. Puro. */
export function aplicarPatchPersonagem(p: Personagem, patch: PatchPersonagem): Personagem {
  const versaoPatch: Record<string, unknown> = {}
  const topPatch: Record<string, unknown> = {}
  for (const [k, val] of Object.entries(patch)) {
    if (SET_CHAVES.has(k)) versaoPatch[k] = val
    else topPatch[k] = val
  }
  const idAtiva = p.versoes.some((v) => v.id === p.versaoAtivaId) ? p.versaoAtivaId : p.versoes[0]?.id
  const versoes = Object.keys(versaoPatch).length > 0
    ? p.versoes.map((v) => (v.id === idAtiva ? { ...v, ...versaoPatch } : v))
    : p.versoes
  return comNomeEspelho({ ...p, ...topPatch, versoes } as Personagem)
}
```

- [ ] **Step 4:** `cd grimorio && npx vitest run src/test/personagemVersao.test.ts` → PASS.
- [ ] **Step 5:** commit `feat(personagem): modelo VersaoPersonagem + helpers (nome por-versão + espelho)`. `git add` types.ts, personagemVersao.ts, personagemVersao.test.ts.

---

## Task P2: Migração + criação no vaultRepo (TDD) — espelha `daa1ca1`

**Files:** Modify `grimorio/src/lib/vaultRepo.ts`; rewrite `grimorio/src/test/normalizarPersonagem.test.ts`; fix personagem asserts em `grimorio/src/test/vaultRepo.test.ts`.

Diferença crítica vs cenário: **a versão "base" da migração herda o NOME do personagem** (não vira "Base") — senão o espelho quebraria o nome exibido.

- [ ] **Step 1:** rewrite `normalizarPersonagem.test.ts` cobrindo: objeto vazio → 1 versão, `versaoAtivaId` setado, `nome` topo = nome da versão; legado plano (`{id,nome:'Bruce',corpo:'...',...}`) → migra pra `versoes[0]` com `nome:'Bruce'` (NÃO 'Base'), `descricao` vindo de `corpo`, `p.nome` (topo) = 'Bruce', `versoes[0].id !== p.id`; formato novo (com `versoes`) passa intocado. Também: em `vaultRepo.test.ts`, trocar os asserts de conteúdo plano do personagem (`p.descricao/informacao/historia/extras/anotacoes/imagens` em ~37-49, ~51-67 "Legado", ~69-79/181-192 `resumo`) pra ler de `versoes[0]`, e `cru.descricao`/`corpo` → `cru.versoes[0].descricao`. (padrão idêntico ao ajuste feito em `cenarioRepo.test.ts` no `daa1ca1` + o fix de `cru.imagens`.)
- [ ] **Step 2:** rodar os 2 arquivos → FAIL.
- [ ] **Step 3:** em `vaultRepo.ts`: add `VersaoPersonagem` ao import de tipos; substituir `normalizarPersonagem` (19-36) por `normalizarVersaoPersonagem` + novo `normalizarPersonagem`:

```ts
export function normalizarVersaoPersonagem(raw: Record<string, any>): VersaoPersonagem {
  return {
    id: typeof raw?.id === 'string' ? raw.id : novoId(),
    nome: raw?.nome ?? '',
    retrato: raw?.retrato ?? null,
    resumo: raw?.resumo ?? '',
    descricao: raw?.descricao ?? raw?.corpo ?? '',
    informacao: raw?.informacao ?? '',
    historia: raw?.historia ?? '',
    extras: raw?.extras ?? '',
    anotacoes: raw?.anotacoes ?? '',
    imagens: Array.isArray(raw?.imagens) ? raw.imagens : [],
  }
}

export function normalizarPersonagem(raw: Record<string, any>): Personagem {
  const versoesRaw = Array.isArray(raw?.versoes) && raw.versoes.length > 0 ? raw.versoes : null
  const versoes: VersaoPersonagem[] = versoesRaw
    ? versoesRaw.map((v: Record<string, any>) => normalizarVersaoPersonagem(v))
    : [normalizarVersaoPersonagem({
        // migração: a forma base herda o NOME do personagem + conteúdo plano (corpo→descricao)
        nome: raw?.nome, retrato: raw?.retrato, resumo: raw?.resumo,
        descricao: raw?.descricao, corpo: raw?.corpo, informacao: raw?.informacao,
        historia: raw?.historia, extras: raw?.extras, anotacoes: raw?.anotacoes, imagens: raw?.imagens,
      })]
  const versaoAtivaId = typeof raw?.versaoAtivaId === 'string' && versoes.some((v) => v.id === raw.versaoAtivaId)
    ? raw.versaoAtivaId
    : versoes[0].id
  const ativa = versoes.find((v) => v.id === versaoAtivaId) ?? versoes[0]
  return {
    id: typeof raw?.id === 'string' ? raw.id : novoId(),
    nome: ativa.nome,   // espelho
    versoes,
    versaoAtivaId,
    criadoEm: raw?.criadoEm ?? agora(),
    modificadoEm: raw?.modificadoEm ?? agora(),
  }
}
```

Em `salvarPersonagem` (197-202): antes de gravar, forçar o espelho — computar a versão ativa e gravar `{ ...p, nome: <ativa>.nome, modificadoEm: agora() }` (garante que o `nome` em disco, lido pelas refs da árvore, é o da versão ativa).

Em `criarPersonagemEm` (131-142): construir `versaoBase: VersaoPersonagem` com `nome` = o nome recebido, e `Personagem` com `versoes:[versaoBase]`, `versaoAtivaId: versaoBase.id`, `nome: nome` (espelho).

- [ ] **Step 4:** rodar os 2 testes → PASS.
- [ ] **Step 5:** commit `feat(personagem): migração lazy pra versão + espelho do nome no save/criação`.

---

## Task P3: Ações de versão no store (TDD) — espelha `d7e596f`

**Files:** Modify `grimorio/src/state/store.ts`; Create `grimorio/src/test/versoesPersonagemStore.test.ts`.

- [ ] **Step 1:** teste (mirror de `versoesStore.test.ts`, seed `useApp.setState({ repo:null, caminhoPorId:{}, personagens:{ p1: <personagem 1-versão 'Bruce'> } })`): `adicionarVersaoPersonagem('p1','Hulk')` clona ativa, nova vira ativa, `versoes[1].nome==='Hulk'`, **`personagens.p1.nome==='Hulk'` (espelho)**; `definirVersaoAtivaPersonagem` troca só id existente **e atualiza o espelho** (`.nome` volta pra 'Bruce'); `salvarPersonagemParcial('p1',{descricao})` roteia pra versão ativa; `renomearVersaoPersonagem('p1', <ativaId>, 'Bruce B.')` muda o nome da versão **e o espelho**; `removerVersaoPersonagem` guarda a última e recua a ativa + espelho.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** em `store.ts`: import `aplicarPatchPersonagem, versaoAtivaPersonagem, comNomeEspelho, type PatchPersonagem` de `../lib/personagemVersao` + `VersaoPersonagem` de types. Extrair `agendarSalvarPersonagem(get, id)` (mirror de `agendarSalvarCenario` :20-39, usando `timersSalvarParcial` + `repo.salvarPersonagem`). Reescrever `salvarPersonagemParcial` (203-225) pra `aplicarPatchPersonagem` + `agendarSalvarPersonagem`. Trocar assinatura na interface (`Partial<Personagem>` → `PatchPersonagem`) e add as 4 ações (interface + corpo):

```ts
  definirVersaoAtivaPersonagem(id, versaoId) {
    const p = get().personagens[id]
    if (!p || !p.versoes.some((v) => v.id === versaoId)) return
    get().salvarPersonagemParcial(id, { versaoAtivaId: versaoId })   // aplicarPatchPersonagem recomputa o espelho
  },
  adicionarVersaoPersonagem(id, nome) {
    const p = get().personagens[id]
    if (!p) return
    const base = versaoAtivaPersonagem(p)
    const nova: VersaoPersonagem = { ...base, id: crypto.randomUUID(), nome, imagens: base.imagens.map((i) => ({ ...i })) }
    set((s) => {
      const a = s.personagens[id]
      return { personagens: { ...s.personagens, [id]: comNomeEspelho({ ...a, versoes: [...a.versoes, nova], versaoAtivaId: nova.id }) } }
    })
    agendarSalvarPersonagem(get, id)
  },
  renomearVersaoPersonagem(id, versaoId, nome) {
    if (!get().personagens[id]) return
    set((s) => {
      const a = s.personagens[id]
      return { personagens: { ...s.personagens, [id]: comNomeEspelho({ ...a, versoes: a.versoes.map((v) => (v.id === versaoId ? { ...v, nome } : v)) }) } }
    })
    agendarSalvarPersonagem(get, id)
  },
  removerVersaoPersonagem(id, versaoId) {
    const p = get().personagens[id]
    if (!p || p.versoes.length <= 1) return
    const versoes = p.versoes.filter((v) => v.id !== versaoId)
    const versaoAtivaId = p.versaoAtivaId === versaoId ? versoes[0].id : p.versaoAtivaId
    set((s) => ({ personagens: { ...s.personagens, [id]: comNomeEspelho({ ...s.personagens[id], versoes, versaoAtivaId }) } }))
    agendarSalvarPersonagem(get, id)
  },
```

- [ ] **Step 4:** rodar teste + `npx vitest run` (suíte) → PASS.
- [ ] **Step 5:** commit `feat(personagem): ações de versão no store + espelho do nome`.

---

## Task P4: Consumidores + fixtures — espelha `2529ff2`

**Files:** `grimorio/src/lib/copiaImagemCard.ts`, `grimorio/src/lib/contextoIA.ts`, `grimorio/src/components/ChatIA.tsx`; fixtures `grimorio/src/test/copiaImagemCard.test.ts`, `grimorio/src/test/contextoIA.test.ts`.

**Importante:** `nome` NÃO muda nos consumidores (leem o espelho top-level). Só `retrato`/`resumo`/`descricao` (conteúdo) mudam.

- [ ] **Step 1:** 
  - `copiaImagemCard.ts`: import `retratoAtivoPersonagem`; param `personagens` → `Record<string, Pick<Personagem, 'versoes' | 'versaoAtivaId'>>`; branch `character-card` (linha 22) → `retratoAtivoPersonagem(personagens[shape.props.personagemId as string])`.
  - `contextoIA.ts`: `DepsContexto.personagens` (110) → `Record<string, Pick<Personagem, 'id' | 'nome' | 'versoes' | 'versaoAtivaId'>>`; import `resumoAtivoPersonagem`; em `montarContextoDaCampanha` (125) a projeção vira `.map((p) => ({ nome: p.nome, resumo: resumoAtivoPersonagem(p) }))` (nome = espelho, fica); `nomeDe` (127) inalterado.
  - `ChatIA.tsx`: import `resumoAtivoPersonagem, versaoAtivaPersonagem`; branch `character-card` de `anexarCardSelecionado` (169-174) → `const vp = versaoAtivaPersonagem(p)`; `retratoRel = vp.retrato`; `bloco = \`...Personagem: ${p.nome}\nResumo: ${vp.resumo}\nDescrição: ${htmlParaTexto(vp.descricao)}\`` (nome = espelho, fica `p.nome`); `montarContexto` (126) `resumo: p.resumo` → `resumo: resumoAtivoPersonagem(personagens[p.id])` — ou, como `p` é o Personagem completo, `resumoAtivoPersonagem(p)`.
  - Fixtures: `copiaImagemCard.test.ts:4` (personagem `{retrato}`) → shape versionado `{ versoes:[{...retrato}], versaoAtivaId }` (mantém c1 com retrato, c2 null). `contextoIA.test.ts:159` (`personagens.p1 = {id,nome:'Alice',resumo:'maga'}`) → versionado com uma versão `nome:'Alice', resumo:'maga'` + `versaoAtivaId` (mantém asserts `- Alice — maga`). Se `AbaVinculos.test.tsx:74` quebrar por tipo, dar `versoes`/`versaoAtivaId` mínimos.
- [ ] **Step 2:** `npx vitest run` (suíte) → verde (ajuste qualquer fixture antigo que quebrar em runtime, como no `2529ff2`).
- [ ] **Step 3:** commit `refactor(personagem): consumidores leem a versão ativa (nome via espelho)`.

---

## Task P5: Card do personagem — espelha `a16ffe0` + `e0e47d5`

**Files:** `grimorio/src/components/CharacterCardShape.tsx`. **NÃO** roda tsc ainda.

Anchors (do Explore): store hook `p` :148; `salvarParcial` :150 (add `definirVersaoAtivaPersonagem` logo abaixo); `editando` :159 (add `useEffect(()=>setEditando(null),[p?.versaoAtivaId])` perto dos efeitos); `retratoSrc` :161 → derivar de `versaoAtivaPersonagem(p).retrato`; guard `if (!p)` :198 (add `const va = versaoAtivaPersonagem(p)` depois); reads → `va`: `p.informacao` :261/266/267, `p.descricao` :316/321/323, `p.resumo` :284; **nome do card** `p.nome` :280/283 → `va.nome` (mostra o nome da forma ativa); `<ControlesFonte>` :285-294 → inserir setas depois (`{p.versoes.length >= 2 && <span className="card-versao-ctrl" onPointerDown={stop}> ‹ / {va.nome} / › }` chamando `definirVersaoAtivaPersonagem(personagemId, versaoVizinhaPersonagem(p, ±1))`). Imports: add `versaoAtivaPersonagem, versaoVizinhaPersonagem` de `../lib/personagemVersao`. (O card só tem Descrição+Informações — sem historia/extras — então são só esses reads.)

- [ ] Verificar `npx vitest run` (suíte) verde; commit `feat(personagem): card lê a versão ativa + setas de troca`.

---

## Task P6: Perfil modal + barra de versões + gate tsc — espelha `4c24fb2` (é o último leitor flat)

**Files:** Create `grimorio/src/components/BarraVersoesPersonagem.tsx`; Modify `grimorio/src/components/PerfilModal.tsx`.

- [ ] **BarraVersoesPersonagem.tsx:** mirror de `BarraVersoes.tsx` (`git show 4c24fb2 -- grimorio/src/components/BarraVersoes.tsx`), trocando: prop `personagemId`; store `personagens[personagemId]`, ações `definirVersaoAtivaPersonagem/adicionarVersaoPersonagem/renomearVersaoPersonagem/removerVersaoPersonagem`; texto do `pedirTexto` "Nome da nova forma" / "Renomear forma"; `ask` "Excluir a forma \"…\"? As imagens dela permanecem no cofre." Reutiliza as classes CSS existentes.
- [ ] **PerfilModal.tsx** (anchors do Explore): imports (add `BarraVersoesPersonagem`, `aplicarPatchPersonagem, versaoAtivaPersonagem, type PatchPersonagem`); `retratoSrc` :59-61 → `versaoAtivaPersonagem(p).retrato` + cache-bust `${p.modificadoEm}:${p.versaoAtivaId}`; `const va = versaoAtivaPersonagem(p)` após `if (!p) return null` :80; `agendarSalvar` :82/89-91 → `PatchPersonagem` + `aplicarPatchPersonagem`; `trocarRetrato` :124 filename → `retrato-${personagemId}-${p.versaoAtivaId}.${ext}` (mantém `${dirCampanha}/assets/`); **input nome** :153-154 → `value={va.nome}` (edita o nome da forma ativa; `onChange` já é `agendarSalvar({ nome })` → roteia pra versão + espelho); input resumo :155-157 → `va.resumo`; callbacks `<AcoesIA>` :165-194 → `versaoAtivaPersonagem(ent)` (dadosBase `Nome: ${vEnt?.nome}`, resumo/[aba]/imagens/retrato via vEnt; onInserir `as PatchPersonagem`); galeria :208 → `va.imagens`; `EditorTexto` :215-217 → `key={\`${aba}:${p.versaoAtivaId}\`}`, `value={va[aba as AbaTexto]}`, `as PatchPersonagem`; inserir `<BarraVersoesPersonagem personagemId={personagemId} />` entre :197 (`</div>` do `.perfil-header`) e :198 (`.perfil-abas`). Remover import `Personagem` se ficar órfão.
- [ ] **Gate:** `cd grimorio && npm run build` → **exit 0** (é o último leitor flat; corrigir qualquer straggler `Property X does not exist on Personagem` via `versaoAtivaPersonagem`, remover imports órfãos). Depois `npx vitest run` (contagem verde).
- [ ] commit `feat(personagem): perfil com barra de versões (formas) editando a versão ativa`.

---

## Verificação manual (Tauri, pós-P6 — usuário)
1. Personagem existente abre com 1 pill = nome dele; card sem setas.
2. Perfil `+ versão` → "Hulk" → pill nova ativa, conteúdo clonado; edita foto/textos da forma Hulk.
3. Card: título mostra a forma ativa; setas `‹ ›` trocam Bruce↔Hulk ao vivo; sidebar/chips/vínculos passam a mostrar o nome da forma ativa (após save).
4. Editar campo inline no card → trocar forma → sem vazamento de texto.
5. Excluir forma confirma + mantém imagens; nunca a última.

## Cobertura
Modelo+helpers P1 · migração+espelho P2 · store+espelho P3 · consumidores P4 · card P5 · modal+barra+gate tsc P6. Nome-espelho garante sidebar/vínculos/refs sem tocá-los.
