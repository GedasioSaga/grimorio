# Modal de Opções + trocar de cofre — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao Grimório um modal de Opções (⚙️) com aba de Cofre que troca o cofre aberto sem reiniciar o app, mantendo uma lista de cofres recentes e configurações por cofre.

**Architecture:** Um módulo puro (`lib/cofres.ts`) é dono do registro em `localStorage` e da identidade normalizada do cofre. O store ganha `descarregarFilas()` (esvazia as gravações debounced antes de qualquer troca) e `trocarCofre()` (fecha o item, descarrega, zera o cache, reabre). A UI é um modal com abas, seguindo o padrão store-zustand + Host que `dialogos.tsx` já usa.

**Tech Stack:** React 19, TypeScript 5.8, zustand 5, Vitest 4 (jsdom quando precisa de `localStorage`), Tauri v2 (`@tauri-apps/plugin-dialog`).

**Spec:** `docs/superpowers/specs/2026-07-26-opcoes-e-trocar-cofre-design.md`

**Todos os comandos rodam a partir de `grimorio/`.**

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/cofres.ts` (novo) | Registro de cofres e chaves de configuração por cofre. Puro, sem React, sem Tauri. |
| `src/lib/classificarPasta.ts` (novo) | Diz se uma pasta escolhida é cofre, vazia ou estranha. Recebe `FsBridge` injetado. |
| `src/state/store.ts` (modificar) | `descarregarFilas`, `trocarCofre`, `estadoLimpoDeCofre`, filtro de campanha por cofre. |
| `src/components/Opcoes.tsx` (novo) | Store `useOpcoes` + `HostOpcoes` + barra de abas. |
| `src/components/OpcoesCofre.tsx` (novo) | Aba Cofre: atual, recentes, abrir outro. |
| `src/components/OpcoesIA.tsx` (novo) | Aba IA: chaves do Gemini. |
| `src/components/Sidebar.tsx` (modificar) | Botão ⚙️ no header. |
| `src/App.tsx` (modificar) | Montar `HostOpcoes`, rodar as migrações no boot, corrigir o boot que falha. |
| `src/theme.css` (modificar) | Estilos `.opcoes-*`. |
| `src/test/cofres.test.ts` (novo) | Registro e chaves. |
| `src/test/classificarPasta.test.ts` (novo) | Classificação de pasta com `fakeFs`. |
| `src/test/trocarCofre.test.ts` (novo) | Descarga das filas e limpeza de cache. |

---

### Task 1: Registro de cofres (`lib/cofres.ts`)

**Files:**
- Create: `src/lib/cofres.ts`
- Test: `src/test/cofres.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/test/cofres.test.ts`:

```ts
// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { chaveDeCofre, listar, migrarDoLegado, migrarFiltroLegado, nomePadrao, normalizarCaminho, registrar, remover, renomear } from '../lib/cofres'

beforeEach(() => {
  localStorage.clear()
})

describe('normalização e chaves', () => {
  it('normalizarCaminho troca \\ por /', () => {
    expect(normalizarCaminho('C:\\Users\\x\\RPG')).toBe('C:/Users/x/RPG')
  })
  it('nomePadrao usa o último segmento', () => {
    expect(nomePadrao('C:\\Users\\x\\RPG')).toBe('RPG')
    expect(nomePadrao('C:/Users/x/RPG/')).toBe('RPG')
  })
  it('chaveDeCofre normaliza antes de compor', () => {
    expect(chaveDeCofre('grimorio.campanhaFiltro', 'C:\\x\\RPG')).toBe('grimorio.campanhaFiltro.C:/x/RPG')
  })
})

describe('registro', () => {
  it('registrar insere com nome padrão e ordena o mais recente primeiro', () => {
    registrar('C:/a/Alfa', 1000)
    registrar('C:/b/Beta', 2000)
    expect(listar().map((c) => c.nome)).toEqual(['Beta', 'Alfa'])
  })
  it('registrar o mesmo cofre atualiza o acesso sem duplicar', () => {
    registrar('C:/a/Alfa', 1000)
    registrar('C:/b/Beta', 2000)
    registrar('C:\\a\\Alfa', 3000)
    expect(listar()).toHaveLength(2)
    expect(listar()[0].caminho).toBe('C:/a/Alfa')
  })
  it('registrar preserva o rótulo já renomeado', () => {
    registrar('C:/a/Alfa', 1000)
    renomear('C:/a/Alfa', 'Mesa de Terça')
    registrar('C:/a/Alfa', 2000)
    expect(listar()[0].nome).toBe('Mesa de Terça')
  })
  it('remover tira da lista', () => {
    registrar('C:/a/Alfa', 1000)
    registrar('C:/b/Beta', 2000)
    expect(remover('C:/a/Alfa')).toHaveLength(1)
    expect(listar()[0].caminho).toBe('C:/b/Beta')
  })
  it('listar devolve [] quando o JSON está corrompido', () => {
    localStorage.setItem('grimorio.cofres', '{isso não é json')
    expect(listar()).toEqual([])
  })
  it('listar descarta entradas com formato inválido', () => {
    localStorage.setItem('grimorio.cofres', JSON.stringify([{ caminho: 'C:/a', nome: 'A', ultimoAcesso: 1 }, { lixo: true }]))
    expect(listar()).toHaveLength(1)
  })
})

describe('migrações', () => {
  it('migrarDoLegado semeia a partir de grimorio.vault e é idempotente', () => {
    localStorage.setItem('grimorio.vault', 'C:\\a\\Alfa')
    migrarDoLegado()
    expect(listar()[0].caminho).toBe('C:/a/Alfa')
    remover('C:/a/Alfa')
    migrarDoLegado()
    expect(listar()).toEqual([])
  })
  it('migrarDoLegado não faz nada sem cofre antigo', () => {
    migrarDoLegado()
    expect(listar()).toEqual([])
  })
  it('migrarFiltroLegado move o filtro global para a chave do cofre', () => {
    localStorage.setItem('grimorio.vault', 'C:\\a\\Alfa')
    localStorage.setItem('grimorio.campanhaFiltro', 'camp-1')
    migrarFiltroLegado()
    expect(localStorage.getItem('grimorio.campanhaFiltro')).toBeNull()
    expect(localStorage.getItem('grimorio.campanhaFiltro.C:/a/Alfa')).toBe('camp-1')
  })
  it('migrarFiltroLegado apaga o filtro global mesmo sem cofre antigo', () => {
    localStorage.setItem('grimorio.campanhaFiltro', 'camp-1')
    migrarFiltroLegado()
    expect(localStorage.getItem('grimorio.campanhaFiltro')).toBeNull()
  })
})
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `npm test -- src/test/cofres.test.ts`
Expected: FAIL — `Failed to resolve import "../lib/cofres"`

- [ ] **Step 3: Escrever a implementação**

Criar `src/lib/cofres.ts`:

```ts
/**
 * Registro dos cofres já abertos nesta máquina (localStorage). O caminho NORMALIZADO
 * (\ → /) é a identidade do cofre: serve de chave do registro e de prefixo das
 * configurações por-cofre, então 'C:\x' e 'C:/x' nunca viram dois cofres diferentes.
 */

const CHAVE_REGISTRO = 'grimorio.cofres'
const CHAVE_VAULT_LEGADO = 'grimorio.vault'
const CHAVE_FILTRO_LEGADO = 'grimorio.campanhaFiltro'

export interface CofreRegistrado {
  caminho: string
  nome: string
  ultimoAcesso: number
}

/** Identidade do cofre: sempre com '/', igual ao que o store guarda em vaultPath. */
export function normalizarCaminho(caminho: string): string {
  return caminho.replace(/\\/g, '/')
}

/** Rótulo inicial = último segmento do caminho ('C:/x/RPG' → 'RPG'). */
export function nomePadrao(caminho: string): string {
  const partes = normalizarCaminho(caminho).split('/').filter(Boolean)
  return partes[partes.length - 1] ?? caminho
}

/** Chave de configuração por cofre (ex.: 'grimorio.campanhaFiltro.C:/x/RPG'). */
export function chaveDeCofre(prefixo: string, caminho: string): string {
  return `${prefixo}.${normalizarCaminho(caminho)}`
}

/** Cofres registrados, mais recente primeiro. JSON inválido ou entrada torta → descartado. */
export function listar(): CofreRegistrado[] {
  try {
    const raw = localStorage.getItem(CHAVE_REGISTRO)
    if (!raw) return []
    const lista: unknown = JSON.parse(raw)
    if (!Array.isArray(lista)) return []
    return lista
      .filter((c): c is CofreRegistrado =>
        !!c && typeof (c as CofreRegistrado).caminho === 'string' &&
        typeof (c as CofreRegistrado).nome === 'string' &&
        typeof (c as CofreRegistrado).ultimoAcesso === 'number')
      .sort((a, b) => b.ultimoAcesso - a.ultimoAcesso)
  } catch {
    return []
  }
}

function gravar(lista: CofreRegistrado[]): CofreRegistrado[] {
  localStorage.setItem(CHAVE_REGISTRO, JSON.stringify(lista))
  return lista
}

/** Insere ou atualiza o acesso, preservando um rótulo já renomeado. `agora` injetável para teste. */
export function registrar(caminho: string, agora = Date.now()): CofreRegistrado[] {
  const norm = normalizarCaminho(caminho)
  const atual = listar()
  const anterior = atual.find((c) => normalizarCaminho(c.caminho) === norm)
  const resto = atual.filter((c) => normalizarCaminho(c.caminho) !== norm)
  return gravar([{ caminho: norm, nome: anterior?.nome ?? nomePadrao(norm), ultimoAcesso: agora }, ...resto])
}

export function renomear(caminho: string, nome: string): CofreRegistrado[] {
  const norm = normalizarCaminho(caminho)
  return gravar(listar().map((c) => (normalizarCaminho(c.caminho) === norm ? { ...c, nome } : c)))
}

/** Tira do registro. NUNCA toca no disco. */
export function remover(caminho: string): CofreRegistrado[] {
  const norm = normalizarCaminho(caminho)
  return gravar(listar().filter((c) => normalizarCaminho(c.caminho) !== norm))
}

/** Semeia o registro a partir da chave antiga de cofre único. Idempotente. */
export function migrarDoLegado(): void {
  if (localStorage.getItem(CHAVE_REGISTRO)) return
  const antigo = localStorage.getItem(CHAVE_VAULT_LEGADO)
  if (antigo) registrar(antigo)
}

/**
 * Move o filtro de campanha da chave global (compartilhada entre cofres, e portanto
 * capaz de aplicar um id de campanha que não existe no outro cofre) para a chave
 * por-cofre. Idempotente.
 */
export function migrarFiltroLegado(): void {
  const antigo = localStorage.getItem(CHAVE_FILTRO_LEGADO)
  if (!antigo) return
  const vault = localStorage.getItem(CHAVE_VAULT_LEGADO)
  if (vault) localStorage.setItem(chaveDeCofre(CHAVE_FILTRO_LEGADO, vault), antigo)
  localStorage.removeItem(CHAVE_FILTRO_LEGADO)
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `npm test -- src/test/cofres.test.ts`
Expected: PASS — 13 testes

- [ ] **Step 5: Commit**

```bash
git add src/lib/cofres.ts src/test/cofres.test.ts
git commit -m "feat(cofres): registro de cofres recentes e chaves de config por cofre"
```

---

### Task 2: Classificação de pasta (`lib/classificarPasta.ts`)

`VaultRepo.inicializar()` (`src/lib/vaultRepo.ts:130-133`) cria `campanhas/` e `canvases-soltos/` em qualquer diretório sem perguntar. Sem essa checagem, escolher a pasta errada planta um cofre vazio dentro dela em silêncio.

**Files:**
- Create: `src/lib/classificarPasta.ts`
- Test: `src/test/classificarPasta.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/test/classificarPasta.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { criarFakeFs } from './fakeFs'
import { classificarPasta } from '../lib/classificarPasta'

describe('classificarPasta', () => {
  it('reconhece cofre pela pasta campanhas', async () => {
    const fs = criarFakeFs()
    await fs.mkdirAll('C:/cofre/campanhas')
    expect(await classificarPasta('C:/cofre', fs)).toBe('cofre')
  })
  it('reconhece cofre por vinculos.json', async () => {
    const fs = criarFakeFs()
    await fs.writeTextAtomic('C:/cofre/vinculos.json', '{"vinculos":[]}')
    expect(await classificarPasta('C:/cofre', fs)).toBe('cofre')
  })
  it('pasta inexistente é vazia (vai ser criada)', async () => {
    const fs = criarFakeFs()
    expect(await classificarPasta('C:/nova', fs)).toBe('vazia')
  })
  it('pasta com outros arquivos e sem marcador é estranha', async () => {
    const fs = criarFakeFs()
    await fs.writeTextAtomic('C:/downloads/nota.txt', 'oi')
    expect(await classificarPasta('C:/downloads', fs)).toBe('estranha')
  })
  it('aceita caminho com barra invertida', async () => {
    const fs = criarFakeFs()
    await fs.mkdirAll('C:/cofre/canvases-soltos')
    expect(await classificarPasta('C:\\cofre', fs)).toBe('cofre')
  })
})
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `npm test -- src/test/classificarPasta.test.ts`
Expected: FAIL — `Failed to resolve import "../lib/classificarPasta"`

- [ ] **Step 3: Escrever a implementação**

Criar `src/lib/classificarPasta.ts`:

```ts
import type { FsBridge } from './fsBridge'

export type ClassePasta = 'cofre' | 'vazia' | 'estranha'

/** Presença de qualquer um destes = cofre do Grimório já inicializado. */
const MARCADORES = ['campanhas', 'canvases-soltos', 'vinculos.json']

/**
 * Classifica a pasta escolhida pelo usuário. Existe porque `VaultRepo.inicializar()`
 * cria a estrutura do cofre em QUALQUER diretório sem avisar — escolher a pasta errada
 * plantaria um cofre vazio dentro dela em silêncio.
 */
export async function classificarPasta(caminho: string, fs: FsBridge): Promise<ClassePasta> {
  const norm = caminho.replace(/\\/g, '/')
  let entradas: { name: string; isDir: boolean }[]
  try {
    entradas = await fs.listDir(norm)
  } catch {
    return 'vazia' // não existe ainda: será criada, é um cofre novo
  }
  const nomes = new Set(entradas.map((e) => e.name))
  if (MARCADORES.some((m) => nomes.has(m))) return 'cofre'
  return entradas.length === 0 ? 'vazia' : 'estranha'
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `npm test -- src/test/classificarPasta.test.ts`
Expected: PASS — 5 testes

- [ ] **Step 5: Commit**

```bash
git add src/lib/classificarPasta.ts src/test/classificarPasta.test.ts
git commit -m "feat(cofres): classifica pasta escolhida (cofre/vazia/estranha) antes de abrir"
```

---

### Task 3: Filtro de campanha por cofre

Hoje `grimorio.campanhaFiltro` é uma chave global guardando um **id de campanha**. Ids não existem no outro cofre — trocar de cofre com filtro ligado aplicaria um id inválido.

**Files:**
- Modify: `src/state/store.ts` (imports; `abrirCofre` linhas 168-187; `carregarVinculos` linhas 369-377; `setCampanhaFiltro` linhas 406-410)

- [ ] **Step 1: Importar o módulo de cofres**

Em `src/state/store.ts`, após a linha 8 (`import { aplicarPatchPersonagem, ... } from '../lib/personagemVersao'`), adicionar:

```ts
import { chaveDeCofre, normalizarCaminho, registrar as registrarCofre } from '../lib/cofres'
```

- [ ] **Step 2: Normalizar e registrar em `abrirCofre`**

Substituir o corpo do `try` de `abrirCofre` (linhas 171-180) por:

```ts
      const norm = normalizarCaminho(path)
      const repo = new VaultRepo(norm, tauriFs)
      await repo.inicializar()
      // guarda NORMALIZADO: o caminho é a identidade do cofre (registro + chaves por cofre)
      localStorage.setItem('grimorio.vault', norm)
      set({ vaultPath: norm, repo })
      registrarCofre(norm)
      await get().recarregarArvore()
      await get().carregarPersonagens()
      await get().carregarCenarios()
      await get().carregarVinculos()
```

- [ ] **Step 3: Ler o filtro da chave do cofre**

Substituir `carregarVinculos` (linhas 369-377) por:

```ts
  async carregarVinculos() {
    const { repo, tree, vaultPath } = get()
    if (!repo) return
    const vinculos = await repo.lerVinculos()
    // restaura o filtro salvo DESTE cofre; campanha apagada → volta a "Todas"
    const salvo = vaultPath ? localStorage.getItem(chaveDeCofre('grimorio.campanhaFiltro', vaultPath)) : null
    const valido = !!salvo && !!tree?.campanhas.some((c) => c.id === salvo)
    set({ vinculos, campanhaFiltro: valido ? salvo : null })
  },
```

- [ ] **Step 4: Gravar o filtro na chave do cofre**

Substituir `setCampanhaFiltro` (linhas 406-410) por:

```ts
  setCampanhaFiltro(id) {
    const { vaultPath } = get()
    if (vaultPath) {
      const chave = chaveDeCofre('grimorio.campanhaFiltro', vaultPath)
      if (id) localStorage.setItem(chave, id)
      else localStorage.removeItem(chave)
    }
    set({ campanhaFiltro: id })
  },
```

- [ ] **Step 5: Rodar a suíte inteira**

Run: `npm test`
Expected: PASS — nenhuma regressão (a suíte atual não depende da chave global)

- [ ] **Step 6: Commit**

```bash
git add src/state/store.ts
git commit -m "feat(cofres): filtro de campanha e caminho do cofre por cofre, não global"
```

---

### Task 4: `descarregarFilas` — a proteção contra gravar no cofre errado

Os timers de 800 ms (`store.ts:12,16,19,64,138`) **re-resolvem o caminho no disparo** (`store.ts:30-31,51-52`). Se um deles disparar depois da troca, grava o conteúdo do cofre antigo usando o `caminhoPorId` do cofre novo.

**Files:**
- Modify: `src/state/store.ts` (interface `AppState` ~linha 136; função nova antes de `useApp`)
- Test: `src/test/trocarCofre.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/test/trocarCofre.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useApp } from '../state/store'
import type { VaultRepo } from '../lib/vaultRepo'
import type { Personagem } from '../lib/types'

function pers(): Personagem {
  return {
    id: 'p1', nome: 'Bruce',
    versoes: [{ id: 'v1', nome: 'Bruce', retrato: null, resumo: 'humano', descricao: '', informacao: '', historia: '', extras: '', anotacoes: '', imagens: [] }],
    versaoAtivaId: 'v1', criadoEm: 'x', modificadoEm: 'y',
  }
}

/** Repo de mentira que só anota onde gravaram. */
function repoEspiao() {
  const gravacoes: { caminho: string; descricao: string }[] = []
  const repo = {
    async salvarPersonagem(caminho: string, p: Personagem) {
      gravacoes.push({ caminho, descricao: p.versoes[0].descricao })
    },
    async salvarCenario() {},
    async salvarVinculos() {},
  }
  return { repo: repo as unknown as VaultRepo, gravacoes }
}

beforeEach(() => {
  vi.useRealTimers()
  useApp.setState({
    repo: null, vaultPath: null, personagens: {}, caminhoPorId: {},
    cenarios: {}, caminhoCenarioPorId: {}, vinculos: [], tree: null, aberto: null,
  })
})

describe('descarregarFilas', () => {
  it('grava o pendente no caminho do cofre ATUAL', async () => {
    const { repo, gravacoes } = repoEspiao()
    useApp.setState({ repo, vaultPath: 'C:/cofreA', personagens: { p1: pers() }, caminhoPorId: { p1: 'personagens-soltos/bruce.json' } })

    useApp.getState().salvarPersonagemParcial('p1', { descricao: '<p>rascunho</p>' })
    await useApp.getState().descarregarFilas()

    expect(gravacoes).toEqual([{ caminho: 'personagens-soltos/bruce.json', descricao: '<p>rascunho</p>' }])
  })

  it('cancela o timer: nada é gravado de novo depois da descarga', async () => {
    const { repo, gravacoes } = repoEspiao()
    useApp.setState({ repo, vaultPath: 'C:/cofreA', personagens: { p1: pers() }, caminhoPorId: { p1: 'personagens-soltos/bruce.json' } })

    vi.useFakeTimers()
    useApp.getState().salvarPersonagemParcial('p1', { descricao: '<p>rascunho</p>' })
    await useApp.getState().descarregarFilas()
    expect(gravacoes).toHaveLength(1)

    // se o timer não tivesse sido cancelado, ele dispararia aqui
    await vi.advanceTimersByTimeAsync(2000)
    expect(gravacoes).toHaveLength(1)
    vi.useRealTimers()
  })

  it('sem repo não explode', async () => {
    await expect(useApp.getState().descarregarFilas()).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `npm test -- src/test/trocarCofre.test.ts`
Expected: FAIL — `useApp.getState().descarregarFilas is not a function`

- [ ] **Step 3: Declarar no `AppState`**

Em `src/state/store.ts`, dentro da interface `AppState`, logo antes de `definirCampanhas(...)` (linha 135), adicionar:

```ts
  /** Executa AGORA as gravações debounced pendentes e cancela os timers. */
  descarregarFilas(): Promise<void>
  /** Troca o cofre aberto sem reiniciar o app (descarrega filas, zera cache, reabre). */
  trocarCofre(caminho: string): Promise<void>
```

- [ ] **Step 4: Implementar a função**

Em `src/state/store.ts`, logo depois de `agendarSalvarVinculos` (após a linha 149) e antes de `export const useApp`, adicionar:

```ts
/**
 * Executa AGORA todo debounce pendente e limpa os timers. Existe por causa de
 * `agendarSalvarPersonagem`/`agendarSalvarCenario`, que re-resolvem o caminho no
 * disparo: um timer que sobrevive à troca de cofre gravaria o conteúdo do cofre
 * antigo no caminho do cofre novo.
 */
async function descarregarFilasPendentes(get: () => AppState): Promise<void> {
  const idsPersonagens = [...timersSalvarParcial.keys()]
  for (const t of timersSalvarParcial.values()) clearTimeout(t)
  timersSalvarParcial.clear()

  const idsCenarios = [...timersSalvarCenario.keys()]
  for (const t of timersSalvarCenario.values()) clearTimeout(t)
  timersSalvarCenario.clear()

  const tinhaVinculos = timerSalvarVinculos !== null
  if (timerSalvarVinculos) clearTimeout(timerSalvarVinculos)
  timerSalvarVinculos = null

  const { repo, personagens, caminhoPorId, cenarios, caminhoCenarioPorId, vinculos } = get()
  if (!repo) return

  for (const id of idsPersonagens) {
    const caminho = caminhoPorId[id]
    const p = personagens[id]
    if (caminho && p) await repo.salvarPersonagem(caminho, { ...p }).catch((e) => console.error('Falha ao salvar personagem:', e))
  }
  for (const id of idsCenarios) {
    const caminho = caminhoCenarioPorId[id]
    const c = cenarios[id]
    if (caminho && c) await repo.salvarCenario(caminho, { ...c }).catch((e) => console.error('Falha ao salvar cenário:', e))
  }
  if (tinhaVinculos) await repo.salvarVinculos(vinculos).catch((e) => console.error('Falha ao salvar vínculos:', e))
}
```

- [ ] **Step 5: Ligar no store**

Em `src/state/store.ts`, dentro do objeto do `create`, logo antes de `definirCampanhas` (linha 412), adicionar:

```ts
  async descarregarFilas() {
    await descarregarFilasPendentes(get)
  },

```

- [ ] **Step 6: Rodar o teste — 2 dos 3 passam**

Run: `npm test -- src/test/trocarCofre.test.ts`
Expected: os 3 testes de `descarregarFilas` PASSAM. (`trocarCofre` ainda não existe; nenhum teste o exercita nesta task.)

- [ ] **Step 7: Commit**

```bash
git add src/state/store.ts src/test/trocarCofre.test.ts
git commit -m "feat(cofres): descarregarFilas esvazia gravações debounced antes de trocar de cofre"
```

---

### Task 5: `trocarCofre`

**Files:**
- Modify: `src/state/store.ts`
- Test: `src/test/trocarCofre.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

No topo de `src/test/trocarCofre.test.ts`, trocar o import do store por:

```ts
import { estadoLimpoDeCofre, useApp } from '../state/store'
```

E acrescentar ao fim do arquivo:

```ts
describe('estadoLimpoDeCofre', () => {
  it('zera tudo que pertence ao cofre aberto', () => {
    const limpo = estadoLimpoDeCofre()
    expect(limpo).toEqual({
      tree: null,
      aberto: null,
      paginaAtivaPorCaderno: {},
      personagens: {},
      caminhoPorId: {},
      perfilAbertoId: null,
      cenarios: {},
      caminhoCenarioPorId: {},
      cenarioAbertoId: null,
      vinculos: [],
      campanhaFiltro: null,
      erroCofre: null,
    })
  })

  it('trocarCofre para o mesmo caminho é no-op', async () => {
    const { repo, gravacoes } = repoEspiao()
    useApp.setState({ repo, vaultPath: 'C:/cofreA', personagens: { p1: pers() }, caminhoPorId: { p1: 'x.json' } })
    await useApp.getState().trocarCofre('C:\\cofreA')
    expect(useApp.getState().personagens.p1).toBeDefined()
    expect(gravacoes).toEqual([])
  })
})
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `npm test -- src/test/trocarCofre.test.ts`
Expected: FAIL — `estadoLimpoDeCofre is not exported` e `trocarCofre is not a function`

- [ ] **Step 3: Implementar**

Em `src/state/store.ts`, logo depois de `descarregarFilasPendentes`, adicionar:

```ts
/**
 * Campos do state que pertencem ao cofre aberto. Ficam numa função só para que trocar
 * de cofre não deixe resíduo: id de campanha, id de personagem e caminho não têm
 * significado nenhum no cofre seguinte.
 */
export function estadoLimpoDeCofre() {
  return {
    tree: null,
    aberto: null,
    paginaAtivaPorCaderno: {},
    personagens: {},
    caminhoPorId: {},
    perfilAbertoId: null,
    cenarios: {},
    caminhoCenarioPorId: {},
    cenarioAbertoId: null,
    vinculos: [],
    campanhaFiltro: null,
    erroCofre: null,
  }
}
```

Sem `as const`: ele tornaria `vinculos` um `readonly []`, que não é atribuível a `Vinculo[]` no `set()`.

E dentro do objeto do `create`, logo depois de `descarregarFilas`, adicionar:

```ts
  async trocarCofre(caminho) {
    const norm = normalizarCaminho(caminho)
    if (norm === get().vaultPath) return
    // 1) fecha TUDO que tem debounce próprio. `descarregarFilas` só enxerga os
    //    timers de nível de módulo; PerfilModal (:87), CenarioModal, NotasEditor e
    //    CanvasView guardam o seu em `timer.current`, lendo repo/caminho de uma
    //    closure do React. Desmontá-los antes é o que faz esses timers gravarem
    //    no cofre certo. perfilAbertoId/cenarioAbertoId NÃO saem com `aberto`.
    set({ aberto: null, perfilAbertoId: null, cenarioAbertoId: null })
    // 2) cede um tick para o React processar os unmounts agendados acima
    await new Promise((r) => setTimeout(r, 0))
    // 3) descarrega o que ainda aponta pro cofre atual
    await get().descarregarFilas()
    // 4) zera o cache do cofre antigo
    set(estadoLimpoDeCofre())
    // 5) abre o novo
    try {
      await get().abrirCofre(norm)
    } catch (e) {
      // sem isto o app ficaria com vaultPath válido e tree null, ou seja, sidebar
      // presa em "Carregando…" (Sidebar.tsx:68). Zerar leva ao VaultPicker, que
      // mostra o erroCofre setado por abrirCofre (VaultPicker.tsx:23).
      set({ vaultPath: null, repo: null })
      throw e
    }
  },

```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `npm test -- src/test/trocarCofre.test.ts`
Expected: PASS — 5 testes

- [ ] **Step 5: Rodar a suíte inteira**

Run: `npm test`
Expected: PASS, tudo verde

- [ ] **Step 6: Commit**

```bash
git add src/state/store.ts src/test/trocarCofre.test.ts
git commit -m "feat(cofres): trocarCofre troca o cofre aberto sem reiniciar o app"
```

---

### Task 6: Modal de Opções (`components/Opcoes.tsx`)

Segue o padrão store-zustand + Host de `src/components/dialogos.tsx:21,47`.

**Files:**
- Create: `src/components/Opcoes.tsx`

- [ ] **Step 1: Criar o componente**

Criar `src/components/Opcoes.tsx`:

```tsx
import { create } from 'zustand'
import { useEffect } from 'react'
import { SeletorTema } from './SeletorTema'
import { OpcoesCofre } from './OpcoesCofre'
import { OpcoesIA } from './OpcoesIA'

export type AbaOpcoes = 'cofre' | 'nuvem' | 'aparencia' | 'ia'

interface OpcoesState {
  aberto: boolean
  aba: AbaOpcoes
  abrir(aba?: AbaOpcoes): void
  fechar(): void
  setAba(aba: AbaOpcoes): void
}

export const useOpcoes = create<OpcoesState>((set) => ({
  aberto: false,
  aba: 'cofre',
  abrir: (aba = 'cofre') => set({ aberto: true, aba }),
  fechar: () => set({ aberto: false }),
  setAba: (aba) => set({ aba }),
}))

const ABAS: { id: AbaOpcoes; rotulo: string }[] = [
  { id: 'cofre', rotulo: 'Cofre' },
  { id: 'nuvem', rotulo: 'Nuvem' },
  { id: 'aparencia', rotulo: 'Aparência' },
  { id: 'ia', rotulo: 'IA' },
]

/** Montado uma vez perto da raiz, como HostDialogos. */
export function HostOpcoes() {
  const aberto = useOpcoes((s) => s.aberto)
  const aba = useOpcoes((s) => s.aba)
  const setAba = useOpcoes((s) => s.setAba)
  const fechar = useOpcoes((s) => s.fechar)

  useEffect(() => {
    if (!aberto) return
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') fechar()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [aberto, fechar])

  if (!aberto) return null

  return (
    <div className="modal-overlay" onClick={fechar}>
      <div className="opcoes-modal" onClick={(e) => e.stopPropagation()}>
        <nav className="opcoes-abas">
          {ABAS.map((a) => (
            <button
              key={a.id}
              className={`opcoes-aba${aba === a.id ? ' ativa' : ''}`}
              onClick={() => setAba(a.id)}
            >
              {a.rotulo}
            </button>
          ))}
        </nav>
        <div className="opcoes-conteudo">
          <button className="btn-icon opcoes-fechar" title="Fechar" onClick={fechar}>✕</button>
          {aba === 'cofre' && <OpcoesCofre />}
          {aba === 'nuvem' && (
            <div className="opcoes-secao">
              <h3>Nuvem</h3>
              <p className="opcoes-vazio">Sincronização com o Google Drive chega em breve.</p>
            </div>
          )}
          {aba === 'aparencia' && (
            <div className="opcoes-secao">
              <h3>Tema</h3>
              <SeletorTema />
            </div>
          )}
          {aba === 'ia' && <OpcoesIA />}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit (fica quebrado até a Task 8 — commit junto)**

Não commitar ainda: `OpcoesCofre` e `OpcoesIA` não existem. Seguir para a Task 7.

---

### Task 7: Aba IA (`components/OpcoesIA.tsx`)

Hoje a chave do Gemini só pode ser trocada apagando `localStorage` — `garantirChaves` (`src/lib/chavesIA.ts:33-43`) só pergunta quando não há nenhuma.

**Files:**
- Create: `src/components/OpcoesIA.tsx`

- [ ] **Step 1: Criar o componente**

Criar `src/components/OpcoesIA.tsx`:

```tsx
import { useState } from 'react'
import { lerChaves, salvarChaves } from '../lib/chavesIA'
import { pedirTexto } from './dialogos'

/** Aba IA: mostra e troca as chaves do Gemini guardadas nesta máquina. */
export function OpcoesIA() {
  const [chaves, setChaves] = useState<string[]>(() => lerChaves())

  async function alterar() {
    // pedirTexto devolve null para vazio, então limpar tem botão próprio
    const raw = await pedirTexto(
      'Cole sua chave da API do Gemini (várias separadas por vírgula):',
      chaves.join(', '),
      'Salvar',
    )
    if (raw === null) return
    salvarChaves(raw)
    setChaves(lerChaves())
  }

  function limpar() {
    salvarChaves('')
    setChaves([])
  }

  return (
    <div className="opcoes-secao">
      <h3>Gemini</h3>
      <p className="opcoes-vazio">
        {chaves.length === 0
          ? 'Nenhuma chave salva. O Grimório pede uma na primeira vez que você usar a IA.'
          : `${chaves.length} ${chaves.length === 1 ? 'chave salva' : 'chaves salvas'} nesta máquina.`}
      </p>
      <button className="opcoes-acao" onClick={alterar}>Alterar chaves</button>
      {chaves.length > 0 && <button className="opcoes-acao" onClick={limpar}>Remover chaves salvas</button>}
    </div>
  )
}
```

- [ ] **Step 2: Seguir para a Task 8**

Ainda não compila sozinho (falta `OpcoesCofre`).

---

### Task 8: Aba Cofre (`components/OpcoesCofre.tsx`)

**Files:**
- Create: `src/components/OpcoesCofre.tsx`

- [ ] **Step 1: Criar o componente**

Criar `src/components/OpcoesCofre.tsx`:

```tsx
import { useState } from 'react'
import { ask, message, open } from '@tauri-apps/plugin-dialog'
import { useApp } from '../state/store'
import { useOpcoes } from './Opcoes'
import { pedirTexto } from './dialogos'
import { tauriFs } from '../lib/fsBridge'
import { classificarPasta } from '../lib/classificarPasta'
import { listar, normalizarCaminho, remover, renomear, type CofreRegistrado } from '../lib/cofres'

/** Aba Cofre: cofre atual, recentes e "abrir outro". */
export function OpcoesCofre() {
  const vaultPath = useApp((s) => s.vaultPath)
  const carregando = useApp((s) => s.carregando)
  const trocarCofre = useApp((s) => s.trocarCofre)
  const fechar = useOpcoes((s) => s.fechar)
  const [cofres, setCofres] = useState<CofreRegistrado[]>(() => listar())

  async function abrirRecente(caminho: string) {
    if (!(await tauriFs.exists(caminho))) {
      await message('Esta pasta não existe mais. Vou tirá-la da lista de recentes.', {
        title: 'Cofre não encontrado',
      })
      setCofres(remover(caminho))
      return
    }
    fechar()
    await trocarCofre(caminho).catch(() => {})
  }

  async function escolherOutro() {
    const dir = await open({ directory: true, title: 'Escolha a pasta do cofre' })
    if (typeof dir !== 'string') return
    const classe = await classificarPasta(dir, tauriFs)
    if (classe === 'estranha') {
      const ok = await ask(
        'Esta pasta não parece um cofre do Grimório e já tem outros arquivos. Criar um cofre novo aqui mesmo assim?',
        { title: 'Pasta não reconhecida', kind: 'warning' },
      )
      if (!ok) return
    }
    fechar()
    await trocarCofre(dir).catch(() => {})
  }

  async function renomearRotulo(c: CofreRegistrado) {
    const nome = await pedirTexto('Nome do cofre:', c.nome, 'Renomear')
    if (!nome) return
    setCofres(renomear(c.caminho, nome))
  }

  async function tirarDaLista(c: CofreRegistrado) {
    const ok = await ask(
      `Tirar "${c.nome}" da lista de recentes?\n\nNenhum arquivo é apagado — o cofre continua no disco.`,
      { title: 'Tirar da lista', kind: 'warning' },
    )
    if (!ok) return
    setCofres(remover(c.caminho))
  }

  return (
    <div className="opcoes-secao">
      <h3>Cofre atual</h3>
      <p className="opcoes-caminho">{vaultPath ?? '—'}</p>

      <h3>Cofres recentes</h3>
      {cofres.length === 0 && <p className="opcoes-vazio">Nenhum cofre registrado ainda.</p>}
      <ul className="opcoes-lista">
        {cofres.map((c) => {
          const atual = !!vaultPath && normalizarCaminho(c.caminho) === vaultPath
          return (
            <li key={c.caminho} className={`opcoes-cofre-item${atual ? ' atual' : ''}`}>
              <span className="opcoes-cofre-nome">{c.nome}{atual && ' (aberto)'}</span>
              <span className="opcoes-cofre-caminho">{c.caminho}</span>
              <span className="opcoes-cofre-acoes">
                {!atual && (
                  <button disabled={carregando} onClick={() => abrirRecente(c.caminho)}>Abrir</button>
                )}
                <button className="btn-icon" title="Renomear rótulo" onClick={() => renomearRotulo(c)}>✏️</button>
                {!atual && (
                  <button className="btn-icon" title="Tirar da lista" onClick={() => tirarDaLista(c)}>🗑️</button>
                )}
              </span>
            </li>
          )
        })}
      </ul>

      <button className="opcoes-acao" disabled={carregando} onClick={escolherOutro}>
        Abrir outro cofre…
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Verificar que os tipos compilam**

Run: `npx tsc --noEmit`
Expected: sem erro. (Se acusar `trocarCofre` inexistente em `AppState`, a Task 5 não foi concluída.)

- [ ] **Step 3: Commit**

```bash
git add src/components/Opcoes.tsx src/components/OpcoesCofre.tsx src/components/OpcoesIA.tsx
git commit -m "feat(opcoes): modal de Opções com abas Cofre, Nuvem, Aparência e IA"
```

---

### Task 9: Estilos

**Files:**
- Modify: `src/theme.css` (acrescentar ao fim)

- [ ] **Step 1: Acrescentar os estilos**

Adicionar ao fim de `src/theme.css`:

```css
/* ---------- Modal de Opções ---------- */
.opcoes-modal {
  display: flex;
  width: min(720px, 92vw);
  max-height: 80vh;
  background: var(--fundo-painel);
  border: 1px solid var(--borda);
  border-radius: 8px;
  overflow: hidden;
}
.opcoes-abas {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 12px 8px;
  min-width: 140px;
  background: var(--fundo);
  border-right: 1px solid var(--borda);
}
.opcoes-aba {
  padding: 8px 12px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--texto-fraco);
  text-align: left;
  cursor: pointer;
}
.opcoes-aba:hover { background: var(--fundo-elevado); color: var(--texto); }
.opcoes-aba.ativa { background: var(--fundo-elevado); color: var(--dourado); }
.opcoes-conteudo { position: relative; flex: 1; padding: 16px 20px; overflow-y: auto; }
.opcoes-fechar { position: absolute; top: 8px; right: 8px; }
.opcoes-secao h3 { margin: 0 0 6px; font-size: 0.95rem; color: var(--dourado-claro); }
.opcoes-secao h3 + h3 { margin-top: 20px; }
.opcoes-caminho { margin: 0 0 4px; font-size: 0.85rem; color: var(--texto-fraco); word-break: break-all; }
.opcoes-vazio { margin: 0 0 12px; font-size: 0.85rem; color: var(--texto-fraco); }
.opcoes-lista { display: flex; flex-direction: column; gap: 6px; margin: 0 0 12px; padding: 0; list-style: none; }
.opcoes-cofre-item {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 2px 8px;
  padding: 8px 10px;
  border: 1px solid var(--borda);
  border-radius: 6px;
}
.opcoes-cofre-item.atual { border-color: var(--dourado); }
.opcoes-cofre-nome { color: var(--texto); }
.opcoes-cofre-caminho { grid-column: 1; font-size: 0.78rem; color: var(--texto-fraco); word-break: break-all; }
.opcoes-cofre-acoes { grid-column: 2; grid-row: 1 / span 2; display: flex; align-items: center; gap: 4px; }
.opcoes-acao { margin-right: 8px; }
```

- [ ] **Step 2: Commit**

```bash
git add src/theme.css
git commit -m "style(opcoes): estilos do modal de Opções"
```

---

### Task 10: Ligar tudo (Sidebar + App)

**Files:**
- Modify: `src/components/Sidebar.tsx` (imports; header linhas 95-98)
- Modify: `src/App.tsx` (imports; `useEffect` linhas 30-33; hosts linhas 85-86)

- [ ] **Step 1: Botão ⚙️ na sidebar**

Em `src/components/Sidebar.tsx`, junto dos outros imports de componente, adicionar:

```ts
import { useOpcoes } from './Opcoes'
```

E substituir o bloco das linhas 95-98 por:

```tsx
        <span className="sidebar-header-acoes">
          <SeletorTema />
          <button className="btn-icon" title="Opções" onClick={() => useOpcoes.getState().abrir()}>⚙️</button>
          <button className="btn-icon" title="Recolher barra" onClick={onToggle}>‹</button>
        </span>
```

- [ ] **Step 2: Montar o Host e rodar as migrações no App**

Em `src/App.tsx`, adicionar aos imports:

```ts
import { HostOpcoes } from './components/Opcoes'
import { migrarDoLegado, migrarFiltroLegado } from './lib/cofres'
```

Substituir o `useEffect` das linhas 30-33 por:

```tsx
  useEffect(() => {
    migrarDoLegado()
    migrarFiltroLegado()
    const salvo = localStorage.getItem('grimorio.vault')
    if (!salvo) return
    abrirCofre(salvo).catch(() => {
      // falha DEPOIS de vaultPath setado (ex.: árvore ilegível) deixaria o layout
      // renderizando um cofre quebrado — voltar pro picker, que mostra erroCofre
      localStorage.removeItem('grimorio.vault')
      useApp.setState({ vaultPath: null, repo: null })
    })
  }, [abrirCofre])
```

E montar `<HostOpcoes />` **antes** de `<HostDialogos />`:

```tsx
      <HostOpcoes />
      {/* HostDialogos por último: todo modal chama pedirTexto, e .modal-overlay
          é z-index 1000 em todos — entre irmãos empatados, quem vem depois
          no DOM pinta por cima. Montado antes, o diálogo de texto aberto de
          dentro das Opções fica escondido atrás delas. */}
      <HostDialogos />
      <HostDialogoCampanhas />
```

- [ ] **Step 3: Verificar tipos e testes**

Run: `npx tsc --noEmit && npm test`
Expected: sem erro de tipo; suíte verde

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx src/components/Sidebar.tsx
git commit -m "feat(opcoes): botão de Opções na sidebar e migrações de cofre no boot"
```

---

### Task 11: Verificação manual

Sem harness de UI automatizado no projeto — este roteiro é a verificação real.

- [ ] **Step 1: Build**

Run: `npm run build`
Expected: `tsc` e `vite build` sem erro

- [ ] **Step 2: Subir o app**

Run: `npm run tauri dev`

- [ ] **Step 3: Percorrer o roteiro**

- [ ] ⚙️ aparece no header da sidebar e abre o modal
- [ ] as 4 abas trocam; `Esc`, clique fora e ✕ fecham
- [ ] aba Cofre mostra o caminho atual e ele aparece na lista marcado como "(aberto)"
- [ ] "Abrir outro cofre…" → escolher outra pasta de cofre → **sidebar recarrega com o outro conteúdo, sem reiniciar**
- [ ] voltar pelo item de recentes traz o cofre original
- [ ] **regressão crítica:** editar um personagem e, **antes de 800 ms**, trocar de cofre; reabrir o cofre original e confirmar que **a edição está lá** e que o cofre novo não ganhou arquivo estranho
- [ ] filtro de campanha selecionado no cofre A; trocar para B; B começa em "Todas"; voltar para A restaura a seleção de A
- [ ] escolher uma pasta qualquer com arquivos (ex.: `Downloads`) → aparece o aviso "não parece um cofre" → **cancelar não cria `campanhas/` lá dentro**
- [ ] renomear o rótulo de um recente persiste após fechar e reabrir o modal
- [ ] 🗑️ tira da lista e **não apaga nada do disco** (conferir a pasta)
- [ ] aba Aparência troca o tema; aba IA mostra a contagem de chaves e "Alterar chaves" funciona
- [ ] a IA continua respondendo depois de mexer na aba IA

- [ ] **Step 4: Commit final**

```bash
git add -A
git commit -m "feat(opcoes): modal de Opções + troca de cofre sem reiniciar"
```

---

## Verificação de cobertura do spec

| Requisito do spec | Task |
|---|---|
| Registro de cofres + migração do legado | 1 |
| Normalização do caminho como identidade | 1, 3 |
| Validação de pasta (cofre/vazia/estranha) | 2, 8 |
| Filtro de campanha por cofre | 3 |
| Descarga das filas antes de trocar | 4 |
| `trocarCofre` sem reiniciar | 5 |
| Modal com 4 abas + `Esc`/overlay/✕ | 6 |
| Aba Nuvem placeholder | 6 |
| Aba Aparência (SeletorTema) | 6 |
| Aba IA (chaves do Gemini) | 7 |
| Aba Cofre (atual, recentes, abrir outro, renomear, remover) | 8 |
| Recente com caminho sumido → avisa e tira da lista | 8 |
| Botões desabilitados enquanto `carregando` | 8 |
| Estilos | 9 |
| Botão ⚙️ + hosts + migrações no boot | 10 |
| Boot que falha volta pro VaultPicker | 10 |
| Roteiro de verificação manual | 11 |

**Fora deste plano, por decisão do spec:** prefixar `grimorio.split.<caminho>` por cofre (cosmético — só herda a posição do splitter entre cofres com a mesma estrutura).
