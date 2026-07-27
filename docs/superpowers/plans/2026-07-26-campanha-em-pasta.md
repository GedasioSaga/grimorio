# Campanha ao criar pasta — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar `id` à pasta para que ela participe de campanha como as demais entidades, com dois efeitos: aparecer no filtro da sidebar mesmo vazia, e passar sua campanha por herança para os itens criados dentro dela.

**Architecture:** Pasta vira uma entidade de vínculo (`deTipo: 'pasta'` em `vinculos.json`), com `id` gravado em `pasta.json`. Uma função pura nova (`lib/herancaCampanha.ts`) sobe a cadeia de diretórios procurando a pasta com campanha mais próxima; `associarNaCriacao` a consulta antes de perguntar. O filtro (`lib/filtroCampanha.ts`) ganha um parâmetro `herdado`, exatamente como `filtrarCenarios` já usa hoje para arrastar a subárvore de um cenário permitido.

**Tech Stack:** React 19, TypeScript 5.8, zustand 5, Vitest 4.

**Spec:** `docs/superpowers/specs/2026-07-26-campanha-em-pasta-design.md`

**Independente do plano A** (`2026-07-26-opcoes-e-trocar-cofre.md`) — não há arquivo em comum além de `Sidebar.tsx`, e em regiões diferentes (header vs. cálculo do filtro).

**Todos os comandos rodam a partir de `grimorio/`.**

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/types.ts` (modificar) | `'pasta'` em `TipoEntidadeVinculo`; `id?` em `PastaNode` e `PastaCenarioNode`. |
| `src/lib/vinculos.ts` (modificar) | Aceitar `deTipo: 'pasta'` na normalização (nunca em `paraTipo`). |
| `src/lib/vaultRepo.ts` (modificar) | `criarPasta` gera e devolve `id`; `garantirIdDePasta` (migração preguiçosa); árvores leem o `id`. |
| `src/lib/herancaCampanha.ts` (novo) | `idsDePastas` e `campanhasHerdadas`. Puro. |
| `src/lib/filtroCampanha.ts` (modificar) | Pasta com campanha passa a subárvore inteira, mesmo vazia. |
| `src/components/dialogoCampanhas.tsx` (modificar) | `associarNaCriacao` ganha `dirPai` e consulta a herança. |
| `src/components/PersonagensSoltos.tsx` (modificar) | Criar pasta pergunta campanha; 🏷️ na pasta; `dirPai` na criação de item; limpar vínculo ao excluir. |
| `src/components/CenariosSoltos.tsx` (modificar) | Idem, do lado dos cenários. |
| `src/state/store.ts` (modificar) | `removerVinculosDe`. |
| `src/components/Sidebar.tsx` (modificar) | Passar `idsFiltro` ao filtro de pastas de personagens. |
| `src/test/herancaCampanha.test.ts` (novo) | Herança e mapa de ids. |
| `src/test/filtroCampanhaPastas.test.ts` (novo) | Comportamento novo do filtro. |
| `src/test/associarNaCriacao.test.ts` (novo) | Precedência filtro > herança > perguntar. |

---

### Task 1: Pasta como entidade de vínculo

**Files:**
- Modify: `src/lib/types.ts:53`, `src/lib/types.ts:104-110`, `src/lib/types.ts:126-132`
- Modify: `src/lib/vinculos.ts:94`
- Test: `src/test/vinculos.test.ts` (acrescentar)

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar ao fim de `src/test/vinculos.test.ts`, dentro de um `describe` novo:

```ts
describe('pasta como ponta de vínculo', () => {
  it('aceita deTipo pasta', () => {
    const out = normalizarVinculos({
      vinculos: [{ id: 'v1', deTipo: 'pasta', deId: 'pasta-1', paraTipo: 'campanha', paraId: 'c1', tipo: 'participa', notas: '', criadoEm: '' }],
    })
    expect(out).toHaveLength(1)
    expect(out[0].deTipo).toBe('pasta')
  })
  it('rejeita paraTipo pasta (pasta nunca é alvo de relação)', () => {
    const out = normalizarVinculos({
      vinculos: [{ id: 'v1', deTipo: 'personagem', deId: 'p1', paraTipo: 'pasta', paraId: 'pasta-1', tipo: 'mora em', notas: '', criadoEm: '' }],
    })
    expect(out).toEqual([])
  })
})
```

Se `normalizarVinculos` e `describe`/`it`/`expect` ainda não estiverem importados nesse arquivo, usar os imports que já existem no topo dele.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- src/test/vinculos.test.ts`
Expected: FAIL — o primeiro teste devolve `[]` (deTipo `'pasta'` é descartado em `vinculos.ts:94`)

- [ ] **Step 3: Abrir o domínio do tipo**

Em `src/lib/types.ts`, substituir a linha 52-53:

```ts
/** Ponta de vínculo. Canvas e pasta só participam de campanha (nunca são alvo de relação). */
export type TipoEntidadeVinculo = 'personagem' | 'cenario' | 'canvas' | 'pasta'
```

- [ ] **Step 4: Aceitar na normalização**

Em `src/lib/vinculos.ts`, substituir a linha 94:

```ts
    if (v.deTipo !== 'personagem' && v.deTipo !== 'cenario' && v.deTipo !== 'canvas' && v.deTipo !== 'pasta') continue
```

A linha 96 (whitelist de `paraTipo`) **não muda** — é ela que rejeita `paraTipo: 'pasta'`.

- [ ] **Step 5: Dar `id` aos nós de pasta**

Em `src/lib/types.ts`, substituir o bloco de `PastaNode` (linhas 103-110):

```ts
/** Nó de pasta na área de Personagens soltos (pastas aninhadas + personagens). */
export interface PastaNode {
  slug: string
  nome: string
  caminho: string // dir relativo ao cofre, ex.: "personagens-soltos/vilões"
  /** id do pasta.json; ausente em pasta criada antes da campanha-em-pasta */
  id?: string
  subpastas: PastaNode[]
  personagens: ItemRef[]
}
```

E o bloco de `PastaCenarioNode` (linhas 125-132):

```ts
/** Pasta organizacional de cenários: contém pastas e cenários raiz. */
export interface PastaCenarioNode {
  slug: string
  nome: string
  caminho: string
  /** id do pasta.json; ausente em pasta criada antes da campanha-em-pasta */
  id?: string
  subpastas: PastaCenarioNode[]
  cenarios: CenarioNode[]
}
```

- [ ] **Step 6: Rodar e ver passar**

Run: `npm test -- src/test/vinculos.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/lib/types.ts src/lib/vinculos.ts src/test/vinculos.test.ts
git commit -m "feat(campanha): pasta vira ponta de vínculo (deTipo pasta)"
```

---

### Task 2: `criarPasta` com id + `garantirIdDePasta`

**Files:**
- Modify: `src/lib/vaultRepo.ts:179-190`
- Test: `src/test/vaultRepo.test.ts` (acrescentar; o teste existente de `criarPasta` está em ~`:205-230`)

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar a `src/test/vaultRepo.test.ts` um `describe` novo (usar o mesmo helper de montagem de `repo` que os testes acima do arquivo já usam):

```ts
describe('id de pasta', () => {
  it('criarPasta grava um id e devolve caminho + id', async () => {
    const fs = criarFakeFs()
    const repo = new VaultRepo('C:/cofre', fs)
    const { caminho, id } = await repo.criarPasta('personagens-soltos', 'Vilões')
    expect(caminho).toBe('personagens-soltos/viloes')
    expect(id).toBeTruthy()
    const meta = JSON.parse(fs.arquivos.get(`C:/cofre/${caminho}/pasta.json`)!)
    expect(meta.id).toBe(id)
    expect(meta.nome).toBe('Vilões')
  })

  it('renomearItem preserva o id da pasta', async () => {
    const fs = criarFakeFs()
    const repo = new VaultRepo('C:/cofre', fs)
    const { caminho, id } = await repo.criarPasta('personagens-soltos', 'Vilões')
    await repo.renomearItem(`${caminho}/pasta.json`, 'Heróis')
    const meta = JSON.parse(fs.arquivos.get(`C:/cofre/${caminho}/pasta.json`)!)
    expect(meta.id).toBe(id)
    expect(meta.nome).toBe('Heróis')
  })

  it('garantirIdDePasta gera uma vez e depois devolve o mesmo', async () => {
    const fs = criarFakeFs()
    const repo = new VaultRepo('C:/cofre', fs)
    // pasta legada: pasta.json sem id
    await fs.writeTextAtomic('C:/cofre/personagens-soltos/antiga/pasta.json', JSON.stringify({ nome: 'Antiga', criadoEm: 'x' }))
    const primeiro = await repo.garantirIdDePasta('personagens-soltos/antiga')
    const segundo = await repo.garantirIdDePasta('personagens-soltos/antiga')
    expect(primeiro).toBeTruthy()
    expect(segundo).toBe(primeiro)
    const meta = JSON.parse(fs.arquivos.get('C:/cofre/personagens-soltos/antiga/pasta.json')!)
    expect(meta.nome).toBe('Antiga')
  })

  it('garantirIdDePasta funciona em pasta sem pasta.json', async () => {
    const fs = criarFakeFs()
    const repo = new VaultRepo('C:/cofre', fs)
    const id = await repo.garantirIdDePasta('personagens-soltos/solta')
    expect(id).toBeTruthy()
    const meta = JSON.parse(fs.arquivos.get('C:/cofre/personagens-soltos/solta/pasta.json')!)
    expect(meta.nome).toBe('solta')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- src/test/vaultRepo.test.ts`
Expected: FAIL — `caminho` é `undefined` (hoje `criarPasta` devolve string) e `repo.garantirIdDePasta is not a function`

- [ ] **Step 3: Implementar**

Em `src/lib/vaultRepo.ts`, substituir o método `criarPasta` inteiro (linhas 179-190) por:

```ts
  /** Cria uma pasta (com pasta.json guardando nome e id) dentro de dirPai. */
  async criarPasta(dirPai: string, nome: string): Promise<{ caminho: string; id: string }> {
    let existentes: string[] = []
    try {
      existentes = (await this.fs.listDir(this.abs(dirPai))).filter((e) => e.isDir).map((e) => e.name)
    } catch { /* dirPai ainda não existe */ }
    const slug = slugUnico(slugify(nome), existentes)
    const dir = `${dirPai}/${slug}`
    const id = novoId()
    await this.fs.mkdirAll(this.abs(dir))
    await this.fs.writeTextAtomic(this.abs(`${dir}/pasta.json`), JSON.stringify({ nome, id, criadoEm: agora() }, null, 2))
    return { caminho: dir, id }
  }

  /**
   * Id da pasta, gerando e gravando na primeira vez. Pastas criadas antes da
   * campanha-em-pasta não têm id; em vez de gravar durante a varredura da árvore
   * (leitura que escreve), o id nasce no primeiro uso — o clique no 🏷️.
   */
  async garantirIdDePasta(dirDaPasta: string): Promise<string> {
    const caminho = `${dirDaPasta}/pasta.json`
    return this.naFila(caminho, async () => {
      // ATENÇÃO: ler e parsear são passos SEPARADOS de propósito. Um try único
      // em volta dos dois transforma "arquivo ilegível" em "arquivo ausente" e
      // sobrescreve metadados recuperáveis — foi o bug desta task na v1.
      let bruto: string | null = null
      try {
        bruto = await this.fs.readText(this.abs(caminho))
      } catch {
        // sem pasta.json: pasta criada à mão no disco, metadados nascem agora
      }
      const cru = bruto?.trim()
      // ausente OU vazio: não há metadado a preservar. Conteúdo presente porém
      // ilegível NÃO cai aqui — lança, para não destruir o que não entendeu.
      const lido: unknown = cru ? JSON.parse(cru) : null
      if (cru && (typeof lido !== 'object' || lido === null || Array.isArray(lido))) {
        // array é o caso traiçoeiro: obj.id = x numa array vira propriedade
        // não-índice, que JSON.stringify descarta — gravaria [] e devolveria
        // um id que nunca chegou ao disco
        throw new Error(`pasta.json inválido em ${dirDaPasta}`)
      }
      const obj: Record<string, unknown> = (lido as Record<string, unknown> | null)
        ?? { nome: dirDaPasta.split('/').pop() || dirDaPasta, criadoEm: agora() }
      if (typeof obj.id === 'string' && obj.id) return obj.id
      const id = novoId()
      obj.id = id
      obj.modificadoEm = agora()
      await this.fs.writeTextAtomic(this.abs(caminho), JSON.stringify(obj, null, 2))
      return id
    })
  }
```

- [ ] **Step 4: Corrigir os chamadores que quebraram**

Run: `npx tsc --noEmit`
Expected: erros em `src/components/PersonagensSoltos.tsx:50,99`, `src/components/CenariosSoltos.tsx:70,119` e possivelmente no teste antigo de `criarPasta` — todos por usar o retorno como string.

Correção provisória (a definitiva vem nas Tasks 8 e 9): trocar `await repo.criarPasta(X, nome)` por `await repo.criarPasta(X, nome)` seguido do uso de `.caminho` onde o valor era consumido. Nos 4 call sites da UI o retorno é ignorado, então **basta manter a chamada como está** — só o teste antigo precisa passar a ler `.caminho`.

- [ ] **Step 5: Rodar e ver passar**

Run: `npm test -- src/test/vaultRepo.test.ts && npx tsc --noEmit`
Expected: PASS e zero erro de tipo

- [ ] **Step 6: Commit**

```bash
git add src/lib/vaultRepo.ts src/test/vaultRepo.test.ts
git commit -m "feat(campanha): pasta.json ganha id; garantirIdDePasta migra pasta antiga sob demanda"
```

---

### Task 3: Árvore lê o id da pasta

**Files:**
- Modify: `src/lib/vaultRepo.ts:396-404` (cenários) e `:534-542` (personagens)
- Test: `src/test/vaultRepo.test.ts` (acrescentar ao `describe` da Task 2)

- [ ] **Step 1: Escrever o teste que falha**

```ts
  it('a árvore de personagens expõe o id da pasta', async () => {
    const fs = criarFakeFs()
    const repo = new VaultRepo('C:/cofre', fs)
    const { id } = await repo.criarPasta('personagens-soltos', 'Vilões')
    const raiz = await repo.montarArvorePastas('personagens-soltos')
    expect(raiz.subpastas[0].id).toBe(id)
    expect(raiz.id).toBeUndefined() // a raiz não tem pasta.json
  })

  it('a árvore de cenários expõe o id da pasta', async () => {
    const fs = criarFakeFs()
    const repo = new VaultRepo('C:/cofre', fs)
    const { id } = await repo.criarPasta('cenarios', 'Reinos')
    const raiz = await repo.montarArvoreCenarios()
    expect(raiz.subpastas[0].id).toBe(id)
  })
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- src/test/vaultRepo.test.ts`
Expected: FAIL — `expected undefined to be '<uuid>'`

- [ ] **Step 3: Ler o id em `montarArvoreCenarios`**

Em `src/lib/vaultRepo.ts`, substituir as linhas 396-404 por:

```ts
    let nome = dir.split('/').pop() ?? dir
    let id: string | undefined
    try {
      const meta = JSON.parse(await this.fs.readText(this.abs(`${dir}/pasta.json`))) as { nome: string; id?: string }
      nome = meta.nome
      id = meta.id
    } catch {
      // raiz ou pasta sem metadados
    }
    subpastas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    cenarios.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    return { slug: dir.split('/').pop() ?? dir, nome, id, caminho: dir, subpastas, cenarios }
```

- [ ] **Step 4: Ler o id em `montarArvorePastas`**

Substituir as linhas 534-542 por:

```ts
    let nome = dir.split('/').pop() ?? dir
    let id: string | undefined
    try {
      const meta = JSON.parse(await this.fs.readText(this.abs(`${dir}/pasta.json`))) as { nome: string; id?: string }
      nome = meta.nome
      id = meta.id
    } catch {
      // raiz ou pasta sem metadados
    }
    subpastas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    personagens.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    return { slug: dir.split('/').pop() ?? dir, nome, id, caminho: dir, subpastas, personagens }
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npm test -- src/test/vaultRepo.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/vaultRepo.ts src/test/vaultRepo.test.ts
git commit -m "feat(campanha): árvore da sidebar expõe o id das pastas"
```

---

### Task 4: Herança de campanha (`lib/herancaCampanha.ts`)

**Files:**
- Create: `src/lib/herancaCampanha.ts`
- Test: `src/test/herancaCampanha.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/test/herancaCampanha.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { campanhasHerdadas, idsDePastas } from '../lib/herancaCampanha'
import type { PastaCenarioNode, PastaNode, VaultTree, Vinculo } from '../lib/types'

function pasta(caminho: string, id: string | undefined, subpastas: PastaNode[] = []): PastaNode {
  const slug = caminho.split('/').pop()!
  return { slug, nome: slug, caminho, id, subpastas, personagens: [] }
}

function pastaCen(caminho: string, id: string | undefined, subpastas: PastaCenarioNode[] = []): PastaCenarioNode {
  const slug = caminho.split('/').pop()!
  return { slug, nome: slug, caminho, id, subpastas, cenarios: [] }
}

function participa(deId: string, paraId: string): Vinculo {
  return { id: `v-${deId}-${paraId}`, deTipo: 'pasta', deId, paraTipo: 'campanha', paraId, tipo: 'participa', notas: '', criadoEm: '' }
}

const tree: VaultTree = {
  campanhas: [],
  canvasesSoltos: [],
  personagensSoltos: pasta('personagens-soltos', undefined, [
    pasta('personagens-soltos/viloes', 'pasta-viloes', [
      pasta('personagens-soltos/viloes/chefes', 'pasta-chefes'),
    ]),
    pasta('personagens-soltos/sem-id', undefined),
  ]),
  cenarios: pastaCen('cenarios', undefined, [pastaCen('cenarios/reinos', 'pasta-reinos')]),
}

describe('idsDePastas', () => {
  it('mapeia dir → id das duas árvores, pulando pasta sem id', () => {
    expect(idsDePastas(tree)).toEqual({
      'personagens-soltos/viloes': 'pasta-viloes',
      'personagens-soltos/viloes/chefes': 'pasta-chefes',
      'cenarios/reinos': 'pasta-reinos',
    })
  })
  it('árvore nula devolve mapa vazio', () => {
    expect(idsDePastas(null)).toEqual({})
  })
})

describe('campanhasHerdadas', () => {
  const mapa = idsDePastas(tree)

  it('pega a campanha da própria pasta', () => {
    const v = [participa('pasta-viloes', 'camp-1')]
    expect(campanhasHerdadas('personagens-soltos/viloes', mapa, v)).toEqual(['camp-1'])
  })
  it('sobe até a pasta com campanha mais próxima', () => {
    const v = [participa('pasta-viloes', 'camp-1')]
    expect(campanhasHerdadas('personagens-soltos/viloes/chefes', mapa, v)).toEqual(['camp-1'])
  })
  it('a pasta mais próxima vence — não acumula níveis', () => {
    const v = [participa('pasta-viloes', 'camp-1'), participa('pasta-chefes', 'camp-2')]
    expect(campanhasHerdadas('personagens-soltos/viloes/chefes', mapa, v)).toEqual(['camp-2'])
  })
  it('pasta com id mas sem campanha não interrompe a subida', () => {
    const v = [participa('pasta-viloes', 'camp-1')]
    // 'chefes' tem id e nenhuma campanha → continua subindo até 'viloes'
    expect(campanhasHerdadas('personagens-soltos/viloes/chefes', mapa, v)).toEqual(['camp-1'])
  })
  it('cadeia sem campanha nenhuma devolve []', () => {
    expect(campanhasHerdadas('personagens-soltos/sem-id', mapa, [])).toEqual([])
  })
  it('funciona para cenários', () => {
    const v = [participa('pasta-reinos', 'camp-3')]
    expect(campanhasHerdadas('cenarios/reinos/cidade-alta', mapa, v)).toEqual(['camp-3'])
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- src/test/herancaCampanha.test.ts`
Expected: FAIL — `Failed to resolve import "../lib/herancaCampanha"`

- [ ] **Step 3: Implementar**

Criar `src/lib/herancaCampanha.ts`:

```ts
import type { PastaCenarioNode, PastaNode, VaultTree, Vinculo } from './types'
import { campanhasDe } from './vinculos'

/**
 * Mapa "dir relativo → id da pasta", para as duas árvores que têm pastas
 * organizacionais. Derivado da árvore já carregada no store: nenhum I/O novo.
 */
export function idsDePastas(tree: VaultTree | null): Record<string, string> {
  const mapa: Record<string, string> = {}
  if (!tree) return mapa
  const dePersonagens = (p: PastaNode) => {
    if (p.id) mapa[p.caminho] = p.id
    p.subpastas.forEach(dePersonagens)
  }
  const deCenarios = (p: PastaCenarioNode) => {
    if (p.id) mapa[p.caminho] = p.id
    p.subpastas.forEach(deCenarios)
  }
  dePersonagens(tree.personagensSoltos)
  deCenarios(tree.cenarios)
  return mapa
}

/**
 * Campanhas herdadas por um item criado em `dirPai`: sobe a cadeia de diretórios e
 * devolve as da PRIMEIRA pasta que tiver alguma. Não acumula níveis — a pasta mais
 * próxima vence, para que uma subpasta possa corrigir a campanha da pasta acima.
 */
export function campanhasHerdadas(
  dirPai: string,
  idPorDiretorio: Record<string, string>,
  vinculos: Vinculo[],
): string[] {
  let dir = dirPai
  while (dir) {
    const id = idPorDiretorio[dir]
    if (id) {
      const camps = campanhasDe(vinculos, id)
      if (camps.length > 0) return camps
    }
    const corte = dir.lastIndexOf('/')
    if (corte < 0) break
    dir = dir.slice(0, corte)
  }
  return []
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- src/test/herancaCampanha.test.ts`
Expected: PASS — 8 testes

- [ ] **Step 5: Commit**

```bash
git add src/lib/herancaCampanha.ts src/test/herancaCampanha.test.ts
git commit -m "feat(campanha): herança de campanha pela pasta mais próxima"
```

---

### Task 5: `associarNaCriacao` consulta a herança

Precedência: **filtro ativo > herança da pasta > perguntar**. O filtro ganha porque "estou trabalhando na campanha X" é intenção mais recente que a marcação da pasta.

**Files:**
- Modify: `src/components/dialogoCampanhas.tsx:58-73`
- Test: `src/test/associarNaCriacao.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/test/associarNaCriacao.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { useApp } from '../state/store'
import { associarNaCriacao, useDialogoCampanhas } from '../components/dialogoCampanhas'
import { campanhasDe } from '../lib/vinculos'
import type { PastaCenarioNode, PastaNode, VaultTree, Vinculo } from '../lib/types'

function pasta(caminho: string, id?: string, subpastas: PastaNode[] = []): PastaNode {
  const slug = caminho.split('/').pop()!
  return { slug, nome: slug, caminho, id, subpastas, personagens: [] }
}

const tree: VaultTree = {
  campanhas: [
    { id: 'camp-1', slug: 'c1', nome: 'Campanha 1', sessoes: [], personagens: [], canvases: [], escritas: [] },
    { id: 'camp-2', slug: 'c2', nome: 'Campanha 2', sessoes: [], personagens: [], canvases: [], escritas: [] },
  ],
  canvasesSoltos: [],
  personagensSoltos: pasta('personagens-soltos', undefined, [pasta('personagens-soltos/viloes', 'pasta-viloes')]),
  cenarios: { slug: 'cenarios', nome: 'cenarios', caminho: 'cenarios', subpastas: [], cenarios: [] } as PastaCenarioNode,
}

const vinculoPastaViloes: Vinculo = {
  id: 'v1', deTipo: 'pasta', deId: 'pasta-viloes',
  paraTipo: 'campanha', paraId: 'camp-1', tipo: 'participa', notas: '', criadoEm: '',
}

beforeEach(() => {
  useDialogoCampanhas.setState({ pedido: null })
  useApp.setState({ repo: null, tree, vinculos: [vinculoPastaViloes], campanhaFiltro: null })
})

describe('associarNaCriacao', () => {
  it('com filtro ativo etiqueta na campanha filtrada, sem perguntar', async () => {
    useApp.setState({ campanhaFiltro: 'camp-2' })
    await associarNaCriacao('personagem', 'p1', 'Novo', 'personagens-soltos/viloes')
    expect(useDialogoCampanhas.getState().pedido).toBeNull()
    expect(campanhasDe(useApp.getState().vinculos, 'p1')).toEqual(['camp-2'])
  })

  it('sem filtro, herda da pasta e não abre o seletor', async () => {
    await associarNaCriacao('personagem', 'p2', 'Novo', 'personagens-soltos/viloes')
    expect(useDialogoCampanhas.getState().pedido).toBeNull()
    expect(campanhasDe(useApp.getState().vinculos, 'p2')).toEqual(['camp-1'])
  })

  it('sem filtro e sem herança, abre o seletor', async () => {
    const promessa = associarNaCriacao('personagem', 'p3', 'Novo', 'personagens-soltos')
    // o modal fica aberto esperando resposta
    expect(useDialogoCampanhas.getState().pedido?.titulo).toBe('Campanhas de "Novo":')
    useDialogoCampanhas.getState().responder(['camp-2'])
    await promessa
    expect(campanhasDe(useApp.getState().vinculos, 'p3')).toEqual(['camp-2'])
  })

  it('sem dirPai continua perguntando (comportamento antigo)', async () => {
    const promessa = associarNaCriacao('personagem', 'p4', 'Novo')
    expect(useDialogoCampanhas.getState().pedido).not.toBeNull()
    useDialogoCampanhas.getState().responder(null)
    await promessa
    expect(campanhasDe(useApp.getState().vinculos, 'p4')).toEqual([])
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- src/test/associarNaCriacao.test.ts`
Expected: FAIL — o teste "herda da pasta" abre o seletor (a herança ainda não existe)

- [ ] **Step 3: Implementar**

Em `src/components/dialogoCampanhas.tsx`, adicionar ao import de libs:

```ts
import { campanhasHerdadas, idsDePastas } from '../lib/herancaCampanha'
```

E substituir `associarNaCriacao` (linhas 58-73) por:

```ts
/**
 * Associa uma entidade recém-criada a campanha(s). Precedência: filtro ativo ganha
 * (intenção mais recente), depois a campanha herdada da pasta em que está sendo
 * criada, e só então o multi-seletor. Sem campanhas no cofre não pergunta nada.
 */
export async function associarNaCriacao(
  tipo: TipoEntidadeVinculo,
  id: string,
  nome: string,
  dirPai?: string,
): Promise<void> {
  const { campanhaFiltro, definirCampanhas, tree, vinculos } = useApp.getState()
  if (campanhaFiltro) {
    definirCampanhas(tipo, id, [campanhaFiltro])
    return
  }
  if (dirPai) {
    const herdadas = campanhasHerdadas(dirPai, idsDePastas(tree), vinculos)
    if (herdadas.length > 0) {
      definirCampanhas(tipo, id, herdadas)
      return
    }
  }
  const opcoes = opcoesDoCofre()
  if (opcoes.length === 0) return
  const escolhidas = await pedirCampanhas(`Campanhas de "${nome}":`, opcoes, [])
  if (escolhidas) definirCampanhas(tipo, id, escolhidas)
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- src/test/associarNaCriacao.test.ts`
Expected: PASS — 4 testes

- [ ] **Step 5: Commit**

```bash
git add src/components/dialogoCampanhas.tsx src/test/associarNaCriacao.test.ts
git commit -m "feat(campanha): associarNaCriacao herda a campanha da pasta"
```

---

### Task 6: Filtro ciente de pasta

Regra: pasta com campanha que casa (ou herdada do pai) libera a **subárvore inteira, mesmo vazia**. Pasta cuja campanha não casa cai na regra atual — o conteúdo dela que casar continua aparecendo, seguindo o princípio já escrito em `filtroCampanha.ts:43-45`.

**Files:**
- Modify: `src/lib/filtroCampanha.ts:10-16` e `:33-40`
- Test: `src/test/filtroCampanhaPastas.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/test/filtroCampanhaPastas.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { filtrarArvoreCenarios, filtrarPastaPersonagens } from '../lib/filtroCampanha'
import type { CenarioNode, ItemRef, PastaCenarioNode, PastaNode } from '../lib/types'

function item(nome: string, caminho: string): ItemRef {
  return { slug: nome, nome, caminho }
}
function pasta(caminho: string, id: string | undefined, personagens: ItemRef[] = [], subpastas: PastaNode[] = []): PastaNode {
  const slug = caminho.split('/').pop()!
  return { slug, nome: slug, caminho, id, subpastas, personagens }
}
function cen(id: string, caminho: string, filhos: CenarioNode[] = []): CenarioNode {
  const slug = caminho.split('/').pop()!
  return { id, slug, nome: slug, caminho, filhos }
}
function pastaCen(caminho: string, id: string | undefined, cenarios: CenarioNode[] = [], subpastas: PastaCenarioNode[] = []): PastaCenarioNode {
  const slug = caminho.split('/').pop()!
  return { slug, nome: slug, caminho, id, subpastas, cenarios }
}

describe('filtro de personagens com pasta etiquetada', () => {
  it('pasta VAZIA da campanha aparece', () => {
    const raiz = pasta('personagens-soltos', undefined, [], [pasta('personagens-soltos/viloes', 'pasta-viloes')])
    const out = filtrarPastaPersonagens(raiz, new Set(), new Set(['pasta-viloes']))
    expect(out.subpastas).toHaveLength(1)
  })

  it('pasta da campanha arrasta os filhos não etiquetados', () => {
    const raiz = pasta('personagens-soltos', undefined, [], [
      pasta('personagens-soltos/viloes', 'pasta-viloes', [item('Sauron', 'personagens-soltos/viloes/sauron.json')]),
    ])
    const out = filtrarPastaPersonagens(raiz, new Set(), new Set(['pasta-viloes']))
    expect(out.subpastas[0].personagens.map((p) => p.nome)).toEqual(['Sauron'])
  })

  it('pasta de OUTRA campanha some quando está vazia', () => {
    const raiz = pasta('personagens-soltos', undefined, [], [pasta('personagens-soltos/viloes', 'pasta-viloes')])
    const out = filtrarPastaPersonagens(raiz, new Set(), new Set(['pasta-outra']))
    expect(out.subpastas).toHaveLength(0)
  })

  it('pasta de OUTRA campanha ainda mostra o item que casa com o filtro', () => {
    const raiz = pasta('personagens-soltos', undefined, [], [
      pasta('personagens-soltos/viloes', 'pasta-viloes', [item('Sauron', 'personagens-soltos/viloes/sauron.json')]),
    ])
    const out = filtrarPastaPersonagens(
      raiz,
      new Set(['personagens-soltos/viloes/sauron.json']),
      new Set(['pasta-outra']),
    )
    expect(out.subpastas[0].personagens.map((p) => p.nome)).toEqual(['Sauron'])
  })

  it('pasta SEM id mantém o comportamento antigo (podada quando vazia)', () => {
    const raiz = pasta('personagens-soltos', undefined, [], [pasta('personagens-soltos/legada', undefined)])
    const out = filtrarPastaPersonagens(raiz, new Set(), new Set(['pasta-viloes']))
    expect(out.subpastas).toHaveLength(0)
  })
})

describe('filtro de cenários com pasta etiquetada', () => {
  it('pasta VAZIA da campanha aparece', () => {
    const raiz = pastaCen('cenarios', undefined, [], [pastaCen('cenarios/reinos', 'pasta-reinos')])
    const out = filtrarArvoreCenarios(raiz, new Set(['pasta-reinos']))
    expect(out.subpastas).toHaveLength(1)
  })

  it('pasta da campanha arrasta os cenários não etiquetados', () => {
    const raiz = pastaCen('cenarios', undefined, [], [
      pastaCen('cenarios/reinos', 'pasta-reinos', [cen('c1', 'cenarios/reinos/gondor')]),
    ])
    const out = filtrarArvoreCenarios(raiz, new Set(['pasta-reinos']))
    expect(out.subpastas[0].cenarios.map((c) => c.id)).toEqual(['c1'])
  })

  it('cenário etiquetado continua aparecendo dentro de pasta não etiquetada', () => {
    const raiz = pastaCen('cenarios', undefined, [], [
      pastaCen('cenarios/reinos', 'pasta-reinos', [cen('c1', 'cenarios/reinos/gondor')]),
    ])
    const out = filtrarArvoreCenarios(raiz, new Set(['c1']))
    expect(out.subpastas[0].cenarios.map((c) => c.id)).toEqual(['c1'])
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- src/test/filtroCampanhaPastas.test.ts`
Expected: FAIL — as pastas vazias somem (comportamento atual)

- [ ] **Step 3: Implementar**

Em `src/lib/filtroCampanha.ts`, substituir `filtrarPastaPersonagens` (linhas 3-16) por:

```ts
/**
 * Filtra a árvore de personagens soltos.
 *
 * Pasta com campanha que casa (ou herdada do pai) libera a subárvore INTEIRA, mesmo
 * vazia — é o que faz "pasta da campanha X" significar algo no filtro. Pasta sem
 * campanha, ou de campanha que não casa, mantém a regra antiga: fica o que casa por
 * caminho, e subpasta que esvazia é podada.
 */
export function filtrarPastaPersonagens(
  pasta: PastaNode,
  caminhosPermitidos: Set<string>,
  idsPermitidos: Set<string> = new Set(),
  herdado = false,
): PastaNode {
  const permitida = herdado || (!!pasta.id && idsPermitidos.has(pasta.id))
  if (permitida) {
    return {
      ...pasta,
      subpastas: pasta.subpastas.map((s) => filtrarPastaPersonagens(s, caminhosPermitidos, idsPermitidos, true)),
    }
  }
  const personagens = pasta.personagens.filter((p) => caminhosPermitidos.has(p.caminho))
  const subpastas = pasta.subpastas
    .map((s) => filtrarPastaPersonagens(s, caminhosPermitidos, idsPermitidos, false))
    // a 3ª condição segura a pasta etiquetada que está legitimamente vazia
    .filter((s) => s.personagens.length > 0 || s.subpastas.length > 0 || (!!s.id && idsPermitidos.has(s.id)))
  return { ...pasta, personagens, subpastas }
}
```

E substituir `filtrarArvoreCenarios` (linhas 33-40) por:

```ts
/** Filtra cenários por ids permitidos (subárvore herda); ver regra de pasta em filtrarPastaPersonagens. */
export function filtrarArvoreCenarios(
  raiz: PastaCenarioNode,
  ids: Set<string>,
  herdado = false,
): PastaCenarioNode {
  const permitida = herdado || (!!raiz.id && ids.has(raiz.id))
  if (permitida) {
    return { ...raiz, subpastas: raiz.subpastas.map((s) => filtrarArvoreCenarios(s, ids, true)) }
  }
  const cenarios = filtrarCenarios(raiz.cenarios, ids, false)
  const subpastas = raiz.subpastas
    .map((s) => filtrarArvoreCenarios(s, ids, false))
    .filter((s) => s.cenarios.length > 0 || s.subpastas.length > 0 || (!!s.id && ids.has(s.id)))
  return { ...raiz, cenarios, subpastas }
}
```

- [ ] **Step 4: Rodar os dois arquivos de teste de filtro**

Run: `npm test -- src/test/filtroCampanhaPastas.test.ts src/test/filtroCampanha.test.ts`
Expected: PASS nos dois — o arquivo antigo não pode regredir (pasta sem `id` mantém o comportamento)

- [ ] **Step 5: Commit**

```bash
git add src/lib/filtroCampanha.ts src/test/filtroCampanhaPastas.test.ts
git commit -m "feat(campanha): pasta etiquetada aparece no filtro mesmo vazia"
```

---

### Task 7: `removerVinculosDe` no store

Excluir a pasta apaga o diretório (`vaultRepo.ts:286-290`), mas o vínculo dela continuaria em `vinculos.json` apontando para um id que não existe mais.

**Files:**
- Modify: `src/state/store.ts` (interface `AppState`; objeto do `create`)
- Test: `src/test/associarNaCriacao.test.ts` (acrescentar)

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar a `src/test/associarNaCriacao.test.ts`:

```ts
describe('removerVinculosDe', () => {
  it('tira todos os vínculos da entidade nas duas pontas', () => {
    useApp.setState({ vinculos: [vinculoPastaViloes] })
    useApp.getState().removerVinculosDe('pasta-viloes')
    expect(useApp.getState().vinculos).toEqual([])
  })
  it('não mexe em vínculo de outra entidade', () => {
    useApp.setState({ vinculos: [vinculoPastaViloes] })
    useApp.getState().removerVinculosDe('outra')
    expect(useApp.getState().vinculos).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- src/test/associarNaCriacao.test.ts`
Expected: FAIL — `removerVinculosDe is not a function`

- [ ] **Step 3: Declarar no `AppState`**

Em `src/state/store.ts`, dentro da interface `AppState`, logo depois de `removerVinculo(id: string): void` (linha 131):

```ts
  /** Tira todos os vínculos da entidade (as duas pontas). Usado ao excluir pasta. */
  removerVinculosDe(entidadeId: string): void
```

- [ ] **Step 4: Implementar**

Em `src/state/store.ts`, logo depois do método `removerVinculo` (linhas 388-391):

```ts
  removerVinculosDe(entidadeId) {
    const atuais = get().vinculos
    const restantes = atuais.filter((v) => v.deId !== entidadeId && v.paraId !== entidadeId)
    if (restantes.length === atuais.length) return
    set({ vinculos: restantes })
    agendarSalvarVinculos(get)
  },

```

- [ ] **Step 5: Rodar e ver passar**

Run: `npm test -- src/test/associarNaCriacao.test.ts`
Expected: PASS — 6 testes

- [ ] **Step 6: Commit**

```bash
git add src/state/store.ts src/test/associarNaCriacao.test.ts
git commit -m "feat(campanha): removerVinculosDe limpa vínculo órfão ao excluir entidade"
```

---

### Task 8: UI de personagens

**Files:**
- Modify: `src/components/PersonagensSoltos.tsx` (linhas 47-51, 52-61, 94-106, 113-118, 120-138)

- [ ] **Step 1: `novaPasta` pergunta a campanha**

Substituir `novaPasta` (linhas 47-51) por:

```tsx
  async function novaPasta() {
    const nome = await pedirTexto('Nome da pasta:')
    if (!nome || !repo) return
    await comAviso(async () => {
      const { id } = await repo.criarPasta(RAIZ, nome)
      await associarNaCriacao('pasta', id, nome, RAIZ)
      await aoMudar()
    })
  }
```

- [ ] **Step 2: `novoPersonagem` passa o `dirPai`**

Substituir a linha 58 por:

```tsx
      await associarNaCriacao('personagem', ref.id, nome, RAIZ)
```

- [ ] **Step 3: `criar` da `PastaLinha` cobre os dois casos**

Substituir a função `criar` (linhas 94-106) por:

```tsx
  async function criar(tipo: 'pasta' | 'personagem') {
    const nome = await pedirTexto(tipo === 'pasta' ? 'Nome da subpasta:' : 'Nome do personagem:')
    if (!nome || !repo) return
    await comAviso(async () => {
      if (tipo === 'pasta') {
        const { id } = await repo.criarPasta(pasta.caminho, nome)
        await associarNaCriacao('pasta', id, nome, pasta.caminho)
      } else {
        const ref = await repo.criarPersonagemEm(pasta.caminho, nome)
        await associarNaCriacao('personagem', ref.id, nome, pasta.caminho)
      }
      await aoMudar()
    })
  }
```

- [ ] **Step 4: Botão 🏷️ na pasta, com migração preguiçosa**

Ainda em `PastaLinha`, adicionar depois de `criar`:

```tsx
  async function campanhas(e: React.MouseEvent) {
    e.stopPropagation()
    if (!repo) return
    await comAviso(async () => {
      // pasta legada não tem id: nasce agora, no primeiro clique
      const id = pasta.id ?? (await repo.garantirIdDePasta(pasta.caminho))
      await editarCampanhas('pasta', id, pasta.nome)
      await aoMudar()
    })
  }
```

E substituir o bloco de ações (linhas 132-137) por:

```tsx
        <span className="rail-acoes" onClick={(e) => e.stopPropagation()}>
          <button className="btn-icon" title="Novo personagem" onClick={() => void criar('personagem')}>+</button>
          <button className="btn-icon" title="Nova subpasta" onClick={() => void criar('pasta')}>📁</button>
          <button className="btn-icon" title="Campanhas" onClick={campanhas}>🏷️</button>
          <button className="btn-icon" title="Renomear" onClick={renomear}>✎</button>
          <button className="btn-icon" title="Excluir" onClick={excluir}>🗑</button>
        </span>
```

- [ ] **Step 5: Excluir pasta limpa o vínculo**

Substituir `excluir` da `PastaLinha` (linhas 113-118) por:

```tsx
  async function excluir(e: React.MouseEvent) {
    e.stopPropagation()
    if (!repo) return
    if (!(await ask(`Excluir a pasta "${pasta.nome}" e tudo dentro dela?`, { title: 'Grimório', kind: 'warning' }))) return
    await comAviso(async () => {
      await repo.excluirItem(pasta.caminho)
      // sem isto o vínculo de campanha da pasta viraria órfão em vinculos.json
      if (pasta.id) useApp.getState().removerVinculosDe(pasta.id)
      await aoMudar()
    })
  }
```

- [ ] **Step 6: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erro

- [ ] **Step 7: Commit**

```bash
git add src/components/PersonagensSoltos.tsx
git commit -m "feat(campanha): pasta de personagens pergunta campanha e passa por herança"
```

---

### Task 9: UI de cenários

Mesmas mudanças do lado dos cenários.

**Files:**
- Modify: `src/components/CenariosSoltos.tsx` (linhas 67-71, 72-81, 114-126, 133-138, 152-157, 179-188)

- [ ] **Step 1: `novaPasta` pergunta a campanha**

Substituir `novaPasta` (linhas 67-71) por:

```tsx
  async function novaPasta() {
    const nome = await pedirTexto('Nome da pasta:')
    if (!nome || !repo) return
    await comAviso(async () => {
      const { id } = await repo.criarPasta(RAIZ, nome)
      await associarNaCriacao('pasta', id, nome, RAIZ)
      await aoMudar()
    })
  }
```

- [ ] **Step 2: `novoCenario` passa o `dirPai`**

Substituir a linha 78 por:

```tsx
      await associarNaCriacao('cenario', ref.id, nome, RAIZ)
```

- [ ] **Step 3: `criar` da `PastaCenarioLinha`**

Substituir a função `criar` (linhas 114-126) por:

```tsx
  async function criar(tipo: 'pasta' | 'cenario') {
    const nome = await pedirTexto(tipo === 'pasta' ? 'Nome da subpasta:' : 'Nome do cenário:')
    if (!nome || !repo) return
    await comAviso(async () => {
      if (tipo === 'pasta') {
        const { id } = await repo.criarPasta(pasta.caminho, nome)
        await associarNaCriacao('pasta', id, nome, pasta.caminho)
      } else {
        const ref = await repo.criarCenarioEm(pasta.caminho, nome)
        await associarNaCriacao('cenario', ref.id, nome, pasta.caminho)
      }
      await aoMudar()
    })
  }
```

- [ ] **Step 4: 🏷️ e exclusão limpa na `PastaCenarioLinha`**

Adicionar depois de `criar`:

```tsx
  async function campanhas(e: React.MouseEvent) {
    e.stopPropagation()
    if (!repo) return
    await comAviso(async () => {
      // pasta legada não tem id: nasce agora, no primeiro clique
      const id = pasta.id ?? (await repo.garantirIdDePasta(pasta.caminho))
      await editarCampanhas('pasta', id, pasta.nome)
      await aoMudar()
    })
  }
```

Substituir `excluir` (linhas 133-138) por:

```tsx
  async function excluir(e: React.MouseEvent) {
    e.stopPropagation()
    if (!repo) return
    if (!(await ask(`Excluir a pasta "${pasta.nome}" e tudo dentro dela?`, { title: 'Grimório', kind: 'warning' }))) return
    await comAviso(async () => {
      await repo.excluirItem(pasta.caminho)
      // sem isto o vínculo de campanha da pasta viraria órfão em vinculos.json
      if (pasta.id) useApp.getState().removerVinculosDe(pasta.id)
      await aoMudar()
    })
  }
```

E substituir o bloco de ações (linhas 152-157) por:

```tsx
        <span className="rail-acoes" onClick={(e) => e.stopPropagation()}>
          <button className="btn-icon" title="Novo cenário" onClick={() => void criar('cenario')}>+</button>
          <button className="btn-icon" title="Nova subpasta" onClick={() => void criar('pasta')}>📁</button>
          <button className="btn-icon" title="Campanhas" onClick={campanhas}>🏷️</button>
          <button className="btn-icon" title="Renomear" onClick={renomear}>✎</button>
          <button className="btn-icon" title="Excluir" onClick={excluir}>🗑</button>
        </span>
```

- [ ] **Step 5: Sub-cenário herda também**

Em `CenarioLinha`, substituir a linha 185 por:

```tsx
      await associarNaCriacao('cenario', ref.id, nome, node.caminho)
```

O diretório de um cenário não está no mapa de pastas, então `campanhasHerdadas` sobe naturalmente até a pasta organizacional que o contém.

- [ ] **Step 6: Verificar tipos e testes**

Run: `npx tsc --noEmit && npm test`
Expected: sem erro de tipo; suíte verde

- [ ] **Step 7: Commit**

```bash
git add src/components/CenariosSoltos.tsx
git commit -m "feat(campanha): pasta de cenários pergunta campanha e passa por herança"
```

---

### Task 10: Ligar o filtro na Sidebar

**Files:**
- Modify: `src/components/Sidebar.tsx:75-80`

- [ ] **Step 1: Passar `idsFiltro` ao filtro de pastas**

Substituir as linhas 75-80 por:

```tsx
  const raizPersonagens = idsFiltro
    ? filtrarPastaPersonagens(
        tree.personagensSoltos,
        new Set([...idsFiltro].map((id) => caminhoPorId[id]).filter((c): c is string => !!c)),
        idsFiltro,
      )
    : tree.personagensSoltos
```

`filtrarArvoreCenarios` (linha 81) **não muda**: já recebe `idsFiltro`, e os ids de pasta estão no mesmo conjunto.

- [ ] **Step 2: Verificar tipos e testes**

Run: `npx tsc --noEmit && npm test`
Expected: sem erro; suíte verde

- [ ] **Step 3: Commit**

```bash
git add src/components/Sidebar.tsx
git commit -m "feat(campanha): sidebar passa os ids de pasta ao filtro"
```

---

### Task 11: Verificação manual

- [ ] **Step 1: Build**

Run: `npm run build`
Expected: `tsc` e `vite build` sem erro

- [ ] **Step 2: Subir o app**

Run: `npm run tauri dev`

- [ ] **Step 3: Percorrer o roteiro**

Preparação: um cofre com pelo menos 2 campanhas.

- [ ] criar pasta em Personagens com o filtro em "Todas" → **pergunta a campanha**
- [ ] filtrar por essa campanha → a **pasta vazia aparece**
- [ ] filtrar pela outra campanha → a pasta **some**
- [ ] com o filtro em "Todas", criar personagem dentro dessa pasta → **não pergunta campanha**; o 🏷️ dele mostra a campanha da pasta já marcada
- [ ] mudar a campanha desse personagem pelo 🏷️ → aceita (herança sugere, não trava)
- [ ] criar subpasta dentro da pasta etiquetada → **não pergunta**, herda
- [ ] repetir os passos acima na seção **Cenários**
- [ ] criar sub-cenário dentro de um cenário que está numa pasta etiquetada → herda a campanha da pasta
- [ ] com o filtro **ligado** numa campanha, criar pasta → não pergunta e nasce naquela campanha
- [ ] 🏷️ numa pasta criada **antes** desta versão → funciona; conferir no disco que o `pasta.json` dela só ganhou `id` depois desse clique
- [ ] renomear pasta etiquetada → mantém a campanha (conferir reabrindo o 🏷️)
- [ ] excluir pasta etiquetada → some da sidebar e `vinculos.json` não fica com vínculo órfão dela
- [ ] abrir um cofre antigo e não mexer em nada → sidebar, filtro e podas idênticos aos de antes

- [ ] **Step 4: Commit final**

```bash
git add -A
git commit -m "feat(campanha): campanha ao criar pasta, com filtro e herança"
```

---

## Verificação de cobertura do spec

| Requisito do spec | Task |
|---|---|
| `'pasta'` em `TipoEntidadeVinculo`, aceito só como `deTipo` | 1 |
| `id?` em `PastaNode` e `PastaCenarioNode` | 1 |
| `pasta.json` ganha `id`; `criarPasta` devolve `{caminho, id}` | 2 |
| `garantirIdDePasta` (migração preguiçosa, sem escrita na varredura) | 2 |
| `renomearItem` preserva o `id` | 2 (teste) |
| Árvores expõem o `id` da pasta | 3 |
| `campanhasHerdadas` — pasta mais próxima vence | 4 |
| Precedência filtro > herança > perguntar | 5 |
| Pasta etiquetada aparece no filtro mesmo vazia | 6 |
| Pasta de outra campanha não esconde item que casa | 6 |
| Pasta sem `id` mantém o comportamento antigo | 6 (teste) |
| Limpar vínculo ao excluir pasta | 7, 8, 9 |
| 🏷️ nas pastas das duas seções | 8, 9 |
| `dirPai` na criação de personagem, cenário e sub-cenário | 8, 9 |
| Sidebar passa os ids ao filtro | 10 |
| Roteiro de verificação manual | 11 |

**Ordem de release (do spec):** soltar esta versão **antes** de ligar o sync do Drive. `normalizarVinculos` descarta `deTipo` desconhecido, então uma versão antiga do app abrindo um cofre com vínculos de pasta apagaria as campanhas das pastas na próxima gravação.
