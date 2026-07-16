# Assistente IA (Gemini) — Implementation Plan

> **STATUS: IMPLEMENTADO** (Tasks 1-5 entregues e revisadas). Após os reviews, o
> código em `grimorio/src/` recebeu fixes que NÃO estão refletidos nos blocos de
> código abaixo (round-robin com reserva síncrona de índice, guardas `montadoRef`,
> `frasesDeVinculosNoEscopo`, `mimeDaImagem` em `lib/bin.ts`, `campanhaDeEntidade`,
> menu ✨ com fechar-ao-clicar-fora). **A fonte de verdade é `src/`, não este plano.**
> Este documento é um snapshot histórico do plano original.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chat de assistente de mestre (Gemini) no workspace da sessão, com contexto automático da campanha (cenários, personagens, vínculos, notas) e análise de imagem; ações ✨ com preview nos modais de personagem/cenário.

**Architecture:** Cliente REST puro (`fetch`, sem SDK) com round-robin das chaves do `.env` (expostas via `envPrefix` do Vite — `.env` intocado); montagem de contexto e normalizações em libs puras testadas; chat persistido por sessão no cofre via VaultRepo (`naFila`); UI como coluna fixa recolhível no Workspace + menu ✨ nos modais com preview antes de inserir.

**Tech Stack:** Tauri v2, React 19, zustand, vitest. API: Gemini `v1beta generateContent` (verificada), modelo do `.env` (`gemini-3.1-flash-lite`).

**Spec:** `docs/superpowers/specs/2026-07-15-assistente-ia-design.md`

---

## Contexto verificado (ler antes de começar)

- `.env` (em `grimorio/`): `GEMINI_API_KEYS` (6 chaves separadas por vírgula) e `GEMINI_MODEL=gemini-3.1-flash-lite`. **NUNCA modifique, logue ou commite o `.env` / valores das chaves.**
- `vite.config.ts`: `defineConfig(async () => ({ plugins, clearScreen, server }))` — `envPrefix` entra nesse objeto.
- `src/vite-env.d.ts`: só a reference do vite/client — tipos das novas vars entram aqui.
- `src/lib/caminhos.ts:2` — `dirNotasDoMapa(caminhoMapa)`; no `App.tsx`, `cadernoDirRel` JÁ é `dirNotasDoMapa(aberto.caminho)`.
- `src/lib/htmlTexto.ts` — `temConteudo` (padrão regex do projeto; `htmlParaTexto` entra aqui).
- `src/lib/notebookRepo.ts:89` — `lerPagina(slug): Promise<Pagina>` (campo `corpo` = HTML).
- `src/lib/vinculos.ts` — `campanhasDe`, `idsDaCampanha`, `Vinculo`.
- `src/lib/filtroCampanha.ts` — `filtrarArvoreCenarios(raiz, ids)` (herança de subárvore).
- `src/state/store.ts` — caches `personagens`, `cenarios`, `vinculos`, `tree`, `paginaAtivaPorCaderno`; `repo` (VaultRepo).
- `src/components/Workspace.tsx` — split notas/mapa com `EstadoSplit` em `localStorage` (`lerSplit`/`salvarSplit`); `repo = useMemo(() => new NotebookRepo(cadernoDirAbs, tauriFs))`; `slugAtivo`; `painelMapa` tem `ws-cabecalho`.
- `src/components/CanvasView.tsx` — `onMount(editor)` com cleanup (registro do editor ativo entra lá).
- `src/lib/vaultRepo.ts` — padrão `naFila(caminho, op)` para toda escrita; `lerVinculos` como modelo de leitura tolerante.
- `src/lib/bin.ts` — `uint8ParaBase64` já existe (conferir export; usado p/ converter retrato em base64).
- Modais: `PerfilModal.tsx` (`perfil-header` com retrato/títulos/fechar; `agendarSalvar(mudancas)`), `CenarioModal.tsx` (idem).
- Suíte hoje: **179 passed**; erro "unhandled" pré-existente em `imagemViewRepro.test.tsx` (jsdom) é ignorável. Rodar de `grimorio/`: `npm run test -- <nome>`, `npm run build`.

---

# FASE 1 — Cliente e contexto (libs puras)

## Task 1: envPrefix + tipos + cliente Gemini

**Files:**
- Modify: `vite.config.ts`, `src/vite-env.d.ts`
- Create: `src/lib/gemini.ts`
- Test: `src/test/gemini.test.ts`

- [ ] **Step 1: Expor as vars do `.env` (sem tocar no `.env`)**

Em `vite.config.ts`, dentro do objeto retornado (após `plugins`):

```ts
  // expõe GEMINI_API_KEYS/GEMINI_MODEL do .env ao app (sem renomear as vars)
  envPrefix: ['VITE_', 'GEMINI_'],
```

Em `src/vite-env.d.ts`, adicionar após a reference:

```ts
interface ImportMetaEnv {
  readonly GEMINI_API_KEYS?: string
  readonly GEMINI_MODEL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
```

- [ ] **Step 2: Write the failing test**

`src/test/gemini.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { extrairTexto, montarBody, parsearChaves } from '../lib/gemini'

describe('parsearChaves', () => {
  it('separa por vírgula e apara espaços', () => {
    expect(parsearChaves(' k1 , k2,k3 ')).toEqual(['k1', 'k2', 'k3'])
  })
  it('vazio/undefined → []', () => {
    expect(parsearChaves(undefined)).toEqual([])
    expect(parsearChaves(' , ,')).toEqual([])
  })
})

describe('montarBody', () => {
  it('mapeia papel→role e injeta system_instruction', () => {
    const body = montarBody('persona', [
      { papel: 'user', texto: 'oi' },
      { papel: 'model', texto: 'olá' },
      { papel: 'user', texto: 'analise' },
    ])
    expect(body.system_instruction.parts[0].text).toBe('persona')
    expect(body.contents.map((c) => c.role)).toEqual(['user', 'model', 'user'])
    expect(body.contents[0].parts).toEqual([{ text: 'oi' }])
  })
  it('anexa imagens só na ÚLTIMA mensagem user', () => {
    const img = { mimeType: 'image/png', base64: 'AAA' }
    const body = montarBody('p', [
      { papel: 'user', texto: 'a' },
      { papel: 'user', texto: 'b' },
    ], [img])
    expect(body.contents[0].parts).toEqual([{ text: 'a' }])
    expect(body.contents[1].parts).toEqual([
      { text: 'b' },
      { inline_data: { mime_type: 'image/png', data: 'AAA' } },
    ])
  })
})

describe('extrairTexto', () => {
  it('junta parts de texto do primeiro candidato', () => {
    const resp = { candidates: [{ content: { parts: [{ text: 'olá ' }, { text: 'mestre' }] } }] }
    expect(extrairTexto(resp)).toBe('olá mestre')
  })
  it('resposta vazia/malformada → string vazia', () => {
    expect(extrairTexto({})).toBe('')
    expect(extrairTexto(null)).toBe('')
    expect(extrairTexto({ candidates: [] })).toBe('')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test -- gemini.test`
Expected: FAIL — `Cannot find module '../lib/gemini'`.

- [ ] **Step 4: Implement `src/lib/gemini.ts`**

```ts
/**
 * Cliente do Gemini (REST v1beta, sem SDK). Chaves em GEMINI_API_KEYS
 * (round-robin; 429/503 tenta a próxima). As chaves NUNCA aparecem em
 * logs ou mensagens de erro.
 */
const URL_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'
const MODELO_PADRAO = 'gemini-3.1-flash-lite'

export interface MensagemIA {
  papel: 'user' | 'model'
  texto: string
}

export interface ImagemIA {
  mimeType: string
  base64: string
}

interface ParteIA {
  text?: string
  inline_data?: { mime_type: string; data: string }
}

export interface BodyGemini {
  system_instruction: { parts: { text: string }[] }
  contents: { role: 'user' | 'model'; parts: ParteIA[] }[]
}

/** "k1, k2,k3" → ['k1','k2','k3'] (vazios fora). */
export function parsearChaves(raw: string | undefined): string[] {
  return (raw ?? '').split(',').map((s) => s.trim()).filter(Boolean)
}

/** Monta o body do generateContent; imagens entram nas parts da ÚLTIMA mensagem user. */
export function montarBody(
  system: string,
  historico: MensagemIA[],
  imagens: ImagemIA[] = [],
): BodyGemini {
  const ultimaUser = historico.map((m) => m.papel).lastIndexOf('user')
  const contents = historico.map((m, i) => {
    const parts: ParteIA[] = [{ text: m.texto }]
    if (i === ultimaUser) {
      for (const img of imagens) parts.push({ inline_data: { mime_type: img.mimeType, data: img.base64 } })
    }
    return { role: m.papel, parts }
  })
  return { system_instruction: { parts: [{ text: system }] }, contents }
}

/** Texto do primeiro candidato ('' se vazio/bloqueado/malformado). */
export function extrairTexto(resp: unknown): string {
  const parts = (resp as { candidates?: { content?: { parts?: { text?: string }[] } }[] })
    ?.candidates?.[0]?.content?.parts
  if (!Array.isArray(parts)) return ''
  return parts.map((p) => p?.text ?? '').join('').trim()
}

// round-robin em nível de módulo: cada chamada começa numa chave diferente
let indiceChave = 0

export async function gerarConteudo(opts: {
  system: string
  historico: MensagemIA[]
  imagens?: ImagemIA[]
}): Promise<string> {
  const chaves = parsearChaves(import.meta.env.GEMINI_API_KEYS)
  if (chaves.length === 0) {
    throw new Error('IA não configurada (defina GEMINI_API_KEYS no .env).')
  }
  const modelo = import.meta.env.GEMINI_MODEL || MODELO_PADRAO
  const body = JSON.stringify(montarBody(opts.system, opts.historico, opts.imagens ?? []))

  let ultimoStatus = 0
  for (let tentativa = 0; tentativa < chaves.length; tentativa++) {
    const chave = chaves[indiceChave % chaves.length]
    indiceChave++
    const resp = await fetch(`${URL_BASE}/${modelo}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': chave },
      body,
    })
    if (resp.status === 429 || resp.status === 503) {
      ultimoStatus = resp.status
      continue // rate limit/indisponível: tenta a próxima chave
    }
    if (!resp.ok) throw new Error(`IA indisponível: HTTP ${resp.status}`)
    const texto = extrairTexto(await resp.json())
    if (!texto) throw new Error('A IA não retornou conteúdo.')
    return texto
  }
  throw new Error(`IA ocupada (limite de uso, HTTP ${ultimoStatus}); tente em instantes.`)
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test -- gemini.test`
Expected: PASS (7 testes).

- [ ] **Step 6: Build + commit**

Run: `npm run build` (limpo).

```bash
git add vite.config.ts src/vite-env.d.ts src/lib/gemini.ts src/test/gemini.test.ts
git commit -m "feat(ia): config env e cliente Gemini com round-robin"
```

## Task 2: Contexto da campanha (puro)

**Files:**
- Modify: `src/lib/htmlTexto.ts`
- Create: `src/lib/contextoIA.ts`
- Test: `src/test/contextoIA.test.ts`

- [ ] **Step 1: Write the failing test**

`src/test/contextoIA.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  acharCampanhaDaSessao,
  achatarCenarios,
  frasesDeVinculosNoEscopo,
  montarContextoCampanha,
} from '../lib/contextoIA'
import { htmlParaTexto } from '../lib/htmlTexto'
import type { PastaCenarioNode, VaultTree, Vinculo } from '../lib/types'

describe('htmlParaTexto', () => {
  it('converte parágrafos/br em quebras e remove tags', () => {
    expect(htmlParaTexto('<p>Oi <b>mestre</b></p><p>linha 2</p>')).toBe('Oi mestre\nlinha 2')
  })
  it('vazio/null → ""', () => {
    expect(htmlParaTexto(null)).toBe('')
    expect(htmlParaTexto('<p></p>')).toBe('')
  })
})

describe('acharCampanhaDaSessao', () => {
  const tree = {
    campanhas: [{ id: 'c1', slug: 'rpg', nome: 'RPG', sessoes: [], personagens: [], canvases: [], escritas: [] }],
  } as unknown as VaultTree
  it('acha pelo slug do caminho', () => {
    expect(acharCampanhaDaSessao(tree, 'campanhas/rpg/sessoes/01.json')?.id).toBe('c1')
  })
  it('caminho fora de campanha → null', () => {
    expect(acharCampanhaDaSessao(tree, 'canvases-soltos/x.json')).toBeNull()
  })
})

describe('frasesDeVinculos', () => {
  const nomes: Record<string, string> = { a: 'Alice', b: 'Bob' }
  const nomeDe = (id: string) => nomes[id] ?? null
  const v = (p: Partial<Vinculo>): Vinculo => ({
    id: 'v1', deTipo: 'personagem', deId: 'a', paraTipo: 'personagem', paraId: 'b',
    tipo: 'conhece', notas: '', criadoEm: '', ...p,
  })
  it('monta frases e inclui notas', () => {
    expect(frasesDeVinculos([v({}), v({ id: 'v2', tipo: 'teme', notas: 'desde a guerra' })], nomeDe))
      .toEqual(['Alice conhece Bob', 'Alice teme Bob (desde a guerra)'])
  })
  it('ignora participação em campanha e órfãos', () => {
    expect(frasesDeVinculos([
      v({ paraTipo: 'campanha', paraId: 'c1', tipo: 'participa' }),
      v({ id: 'v2', paraId: 'zzz' }),
    ], nomeDe)).toEqual([])
  })
})

describe('achatarCenarios', () => {
  const raiz = {
    slug: 'cenarios', nome: 'Cenários', caminho: 'cenarios', subpastas: [{
      slug: 'p', nome: 'p', caminho: 'cenarios/p', subpastas: [],
      cenarios: [{ id: 'x', slug: 'x', nome: 'X', caminho: 'x', filhos: [] }],
    }],
    cenarios: [{
      id: 'a', slug: 'a', nome: 'Oxonia', caminho: 'a',
      filhos: [{ id: 'b', slug: 'b', nome: 'Distrito', caminho: 'b', filhos: [] }],
    }],
  } as unknown as PastaCenarioNode
  it('achata com nível e resolve resumo', () => {
    const resumoDe = (id: string) => (id === 'a' ? 'cidade' : '')
    expect(achatarCenarios(raiz, resumoDe)).toEqual([
      { nome: 'Oxonia', resumo: 'cidade', nivel: 0 },
      { nome: 'Distrito', resumo: '', nivel: 1 },
      { nome: 'X', resumo: '', nivel: 0 },
    ])
  })
})

describe('montarContextoCampanha', () => {
  it('monta seções e indenta cenários', () => {
    const ctx = montarContextoCampanha({
      nomeCampanha: 'RPG',
      personagens: [{ nome: 'Alice', resumo: 'maga' }],
      cenarios: [{ nome: 'Oxonia', resumo: 'cidade', nivel: 0 }, { nome: 'Distrito', resumo: '', nivel: 1 }],
      vinculos: ['Alice conhece Bob'],
      notas: 'a sessão começa à noite',
    })
    expect(ctx).toContain('## Campanha\nRPG')
    expect(ctx).toContain('- Alice — maga')
    expect(ctx).toContain('- Oxonia — cidade\n  - Distrito')
    expect(ctx).toContain('## Vínculos\n- Alice conhece Bob')
    expect(ctx).toContain('## Notas da sessão\na sessão começa à noite')
  })
  it('omite seções vazias', () => {
    const ctx = montarContextoCampanha({ nomeCampanha: '', personagens: [], cenarios: [], vinculos: [], notas: '' })
    expect(ctx).toBe('')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- contextoIA`
Expected: FAIL — módulos não encontrados.

- [ ] **Step 3: Implement**

Adicionar em `src/lib/htmlTexto.ts`:

```ts
/** HTML do TipTap → texto plano (parágrafos e <br> viram quebras de linha). */
export function htmlParaTexto(html: string | null | undefined): string {
  if (!html) return ''
  return html
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
```

Criar `src/lib/contextoIA.ts`:

```ts
import type { CampanhaNode, CenarioNode, PastaCenarioNode, VaultTree, Vinculo } from './types'

export interface EntidadeCtx {
  nome: string
  resumo: string
}

export interface CenarioCtx extends EntidadeCtx {
  nivel: number
}

/** Campanha dona de uma sessão (slug em campanhas/<slug>/sessoes/...), ou null. */
export function acharCampanhaDaSessao(tree: VaultTree, caminhoSessao: string): CampanhaNode | null {
  const m = caminhoSessao.match(/^campanhas\/([^/]+)\//)
  if (!m) return null
  return tree.campanhas.find((c) => c.slug === m[1]) ?? null
}

/** Frases legíveis dos vínculos ("Alice conhece Bob (nota)"); participação e órfãos fora. */
export function frasesDeVinculos(vinculos: Vinculo[], nomeDe: (id: string) => string | null): string[] {
  const out: string[] = []
  for (const v of vinculos) {
    if (v.paraTipo === 'campanha') continue
    const de = nomeDe(v.deId)
    const para = nomeDe(v.paraId)
    if (!de || !para) continue
    out.push(v.notas ? `${de} ${v.tipo} ${para} (${v.notas})` : `${de} ${v.tipo} ${para}`)
  }
  return out
}

/** Achata a árvore (já filtrada) em linhas com nível de indentação. */
export function achatarCenarios(raiz: PastaCenarioNode, resumoDe: (id: string) => string): CenarioCtx[] {
  const out: CenarioCtx[] = []
  const dosNos = (nos: CenarioNode[], nivel: number) => {
    for (const n of nos) {
      out.push({ nome: n.nome, resumo: resumoDe(n.id), nivel })
      dosNos(n.filhos, nivel + 1)
    }
  }
  dosNos(raiz.cenarios, 0)
  for (const p of raiz.subpastas) out.push(...achatarCenarios(p, resumoDe))
  return out
}

/** Contexto compacto enviado à IA; seções vazias são omitidas. */
export function montarContextoCampanha(d: {
  nomeCampanha: string
  personagens: EntidadeCtx[]
  cenarios: CenarioCtx[]
  vinculos: string[]
  notas: string
}): string {
  const secoes: string[] = []
  if (d.nomeCampanha) secoes.push(`## Campanha\n${d.nomeCampanha}`)
  if (d.personagens.length > 0) {
    secoes.push(`## Personagens\n${d.personagens
      .map((p) => (p.resumo ? `- ${p.nome} — ${p.resumo}` : `- ${p.nome}`)).join('\n')}`)
  }
  if (d.cenarios.length > 0) {
    secoes.push(`## Cenários\n${d.cenarios
      .map((c) => `${'  '.repeat(c.nivel)}- ${c.nome}${c.resumo ? ` — ${c.resumo}` : ''}`).join('\n')}`)
  }
  if (d.vinculos.length > 0) secoes.push(`## Vínculos\n${d.vinculos.map((v) => `- ${v}`).join('\n')}`)
  if (d.notas) secoes.push(`## Notas da sessão\n${d.notas}`)
  return secoes.join('\n\n')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- contextoIA`
Expected: PASS (9 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/htmlTexto.ts src/lib/contextoIA.ts src/test/contextoIA.test.ts
git commit -m "feat(ia): contexto da campanha para a IA"
```

## Task 3: Persistência do chat + editor ativo

**Files:**
- Create: `src/lib/chatIA.ts`, `src/lib/canvasAtivo.ts`
- Modify: `src/lib/vaultRepo.ts`, `src/components/CanvasView.tsx`
- Test: `src/test/chatIA.test.ts`

- [ ] **Step 1: Write the failing test**

`src/test/chatIA.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { JANELA_HISTORICO, normalizarChat } from '../lib/chatIA'

describe('normalizarChat', () => {
  it('aceita formato { mensagens: [...] }', () => {
    const raw = { mensagens: [{ papel: 'user', texto: 'oi', em: '2026-01-01' }] }
    expect(normalizarChat(raw)).toEqual([{ papel: 'user', texto: 'oi', em: '2026-01-01' }])
  })
  it('descarta entradas inválidas e repara "em" ausente', () => {
    const raw = { mensagens: [{ papel: 'model', texto: 'olá' }, { papel: 'x', texto: 'não' }, null, { texto: 'sem papel' }] }
    expect(normalizarChat(raw)).toEqual([{ papel: 'model', texto: 'olá', em: '' }])
  })
  it('lixo → []', () => {
    expect(normalizarChat(null)).toEqual([])
    expect(normalizarChat('oi')).toEqual([])
  })
  it('janela de histórico é 20', () => {
    expect(JANELA_HISTORICO).toBe(20)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- chatIA`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Implement `src/lib/chatIA.ts`**

```ts
/** Tipos e normalização do chat de IA salvo por sessão (chat-ia.json). */

export interface MensagemChat {
  papel: 'user' | 'model'
  texto: string
  em: string // ISO-8601 ('' em registros antigos)
}

/** Quantas mensagens do fim do histórico vão ao modelo (tier gratuito: janela curta). */
export const JANELA_HISTORICO = 20

/** Persona do assistente (system instruction). */
export const SYSTEM_MESTRE = [
  'Você é um assistente de mestre de RPG, em português do Brasil.',
  'Você recebe o contexto da campanha (personagens, cenários, vínculos, notas da sessão).',
  'Seja criativo em sugestões (reviravoltas, descrições de cena, ganchos), mas NUNCA contradiga fatos do contexto.',
  'O mestre está no meio da sessão: respostas curtas e diretas por padrão; detalhe só quando pedirem.',
].join(' ')

export function normalizarChat(raw: unknown): MensagemChat[] {
  const lista = (raw as { mensagens?: unknown })?.mensagens
  if (!Array.isArray(lista)) return []
  const out: MensagemChat[] = []
  for (const x of lista) {
    const m = x as Partial<MensagemChat> | null
    if (!m) continue
    if (m.papel !== 'user' && m.papel !== 'model') continue
    if (typeof m.texto !== 'string' || !m.texto) continue
    out.push({ papel: m.papel, texto: m.texto, em: typeof m.em === 'string' ? m.em : '' })
  }
  return out
}
```

- [ ] **Step 4: Repo — ler/salvar chat**

Em `src/lib/vaultRepo.ts` (junto de `lerVinculos`/`salvarVinculos`, mesmo padrão), com import `normalizarChat`/`MensagemChat` de `./chatIA`:

```ts
/** Lê o chat de IA de uma sessão (dirNotas/chat-ia.json); ausente/corrompido → []. */
async lerChatIA(dirNotas: string): Promise<MensagemChat[]> {
  try {
    return normalizarChat(JSON.parse(await this.fs.readText(this.abs(`${dirNotas}/chat-ia.json`))))
  } catch {
    return []
  }
}

async salvarChatIA(dirNotas: string, mensagens: MensagemChat[]): Promise<void> {
  const caminho = `${dirNotas}/chat-ia.json`
  return this.naFila(caminho, async () => {
    await this.fs.mkdirAll(this.abs(dirNotas))
    await this.fs.writeTextAtomic(this.abs(caminho), JSON.stringify({ mensagens }, null, 2))
  })
}
```

(Confirmar nomes reais `mkdirAll`/`writeTextAtomic`/`naFila` no arquivo — espelhar os vizinhos.)

- [ ] **Step 5: Editor ativo do canvas**

`src/lib/canvasAtivo.ts`:

```ts
import type { Editor } from 'tldraw'

/**
 * Registro do editor tldraw da view aberta (singleton de módulo): o ChatIA
 * consulta o card selecionado sem acoplar o Workspace ao CanvasView.
 */
let atual: Editor | null = null

export function registrarEditor(e: Editor): void {
  atual = e
}

/** Desregistra só se ainda for o mesmo (troca de view registra o novo antes do cleanup do velho). */
export function desregistrarEditor(e: Editor): void {
  if (atual === e) atual = null
}

export function editorAtivo(): Editor | null {
  return atual
}
```

Em `CanvasView.tsx`, no `onMount` (início) adicionar `registrarEditor(editor)` e no cleanup retornado `desregistrarEditor(editor)` (import de `../lib/canvasAtivo`).

- [ ] **Step 6: Test + build + commit**

Run: `npm run test -- chatIA` (PASS, 4 testes) e `npm run build` (limpo).

```bash
git add src/lib/chatIA.ts src/lib/canvasAtivo.ts src/lib/vaultRepo.ts src/components/CanvasView.tsx src/test/chatIA.test.ts
git commit -m "feat(ia): persistencia do chat no cofre e registro do editor ativo"
```

---

# FASE 2 — Chat na sessão

## Task 4: ChatIA + Workspace + App

**Files:**
- Create: `src/components/ChatIA.tsx`
- Modify: `src/components/Workspace.tsx`, `src/App.tsx`, `src/theme.css`

- [ ] **Step 1: Criar `src/components/ChatIA.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react'
import { convertFileSrc } from '@tauri-apps/api/core'
import { useApp } from '../state/store'
import type { NotebookRepo } from '../lib/notebookRepo'
import type { CenarioCardShapeType } from './CenarioCardShape'
import type { CharacterCardShapeType } from './CharacterCardShape'
import { JANELA_HISTORICO, SYSTEM_MESTRE, type MensagemChat } from '../lib/chatIA'
import { gerarConteudo, type ImagemIA } from '../lib/gemini'
import {
  acharCampanhaDaSessao,
  achatarCenarios,
  frasesDeVinculosNoEscopo,
  montarContextoCampanha,
} from '../lib/contextoIA'
import { filtrarArvoreCenarios } from '../lib/filtroCampanha'
import { idsDaCampanha } from '../lib/vinculos'
import { htmlParaTexto } from '../lib/htmlTexto'
import { editorAtivo } from '../lib/canvasAtivo'

const SALVAR_CHAT_DEBOUNCE_MS = 800

interface Anexo {
  nome: string
  blocoTexto: string
  imagem: ImagemIA | null
}

/** Blob → base64 puro (sem prefixo data:). */
function blobParaBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '')
    r.onerror = () => reject(new Error('falha ao ler imagem'))
    r.readAsDataURL(blob)
  })
}

function mimeDaExtensaoImg(rel: string): string {
  const ext = (rel.split('.').pop() ?? 'png').toLowerCase()
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'gif') return 'image/gif'
  return 'image/png'
}

/** Painel de chat com o assistente de mestre (Gemini) — só em sessões. */
export function ChatIA({
  caminhoSessao,
  cadernoDirRel,
  repoNotas,
}: {
  caminhoSessao: string
  cadernoDirRel: string
  repoNotas: NotebookRepo
}) {
  const repo = useApp((s) => s.repo)
  const vaultPath = useApp((s) => s.vaultPath)
  const slugAtivo = useApp((s) => s.paginaAtivaPorCaderno[cadernoDirRel] ?? null)

  const [mensagens, setMensagens] = useState<MensagemChat[]>([])
  const [texto, setTexto] = useState('')
  const [pensando, setPensando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [anexo, setAnexo] = useState<Anexo | null>(null)
  const timerSalvar = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fimRef = useRef<HTMLDivElement | null>(null)

  // carrega o histórico salvo da sessão
  useEffect(() => {
    let ativo = true
    if (!repo) return
    repo.lerChatIA(cadernoDirRel).then((m) => {
      if (ativo) {
        setMensagens(m)
        mensagensRef.current = m
      }
    }).catch(() => {})
    return () => {
      ativo = false
    }
  }, [repo, cadernoDirRel])

  // autoscroll para a última mensagem
  useEffect(() => {
    fimRef.current?.scrollIntoView({ block: 'end' })
  }, [mensagens, pensando])

  // salva com debounce; ref espelho permite o flush no unmount (padrão dos modais)
  const mensagensRef = useRef<MensagemChat[]>([])
  function agendarSalvar(novas: MensagemChat[]) {
    setMensagens(novas)
    mensagensRef.current = novas
    if (timerSalvar.current) clearTimeout(timerSalvar.current)
    timerSalvar.current = setTimeout(() => {
      timerSalvar.current = null
      repo?.salvarChatIA(cadernoDirRel, novas).catch((e) => console.error('Falha ao salvar chat:', e))
    }, SALVAR_CHAT_DEBOUNCE_MS)
  }
  useEffect(() => () => {
    // desmontou com gravação pendente: cancela o debounce e grava já (fire-and-forget)
    if (timerSalvar.current) {
      clearTimeout(timerSalvar.current)
      timerSalvar.current = null
      const { repo: r } = useApp.getState()
      r?.salvarChatIA(cadernoDirRel, mensagensRef.current)
        .catch((e) => console.error('Falha no save final do chat:', e))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Monta o contexto da campanha desta sessão (participantes + notas ativas). */
  async function montarContexto(): Promise<string> {
    const { tree, personagens, cenarios, vinculos, caminhoPorId } = useApp.getState()
    if (!tree) return ''
    const camp = acharCampanhaDaSessao(tree, caminhoSessao)
    const ids = camp?.id ? idsDaCampanha(vinculos, camp.id) : new Set<string>()

    // personagens: participantes (vínculo) + os da pasta da campanha (match por CAMINHO)
    const caminhosDaCampanha = new Set((camp?.personagens ?? []).map((ref) => ref.caminho))
    const doElenco = new Map<string, { nome: string; resumo: string }>()
    for (const p of Object.values(personagens)) {
      const daCampanha = caminhosDaCampanha.has(caminhoPorId[p.id] ?? '')
      if (ids.has(p.id) || daCampanha) doElenco.set(p.id, { nome: p.nome, resumo: p.resumo })
    }

    const arvoreCen = ids.size > 0 ? filtrarArvoreCenarios(tree.cenarios, ids) : { ...tree.cenarios, cenarios: [], subpastas: [] }
    const linhasCen = achatarCenarios(arvoreCen, (id) => cenarios[id]?.resumo ?? '')

    const nomeDe = (id: string) => personagens[id]?.nome ?? cenarios[id]?.nome ?? null
    // vínculos só entre entidades EM contexto (participantes + pasta da campanha) — sem vazar de outras campanhas
    const idsCtx = new Set<string>([...ids, ...doElenco.keys()])
    const frases = frasesDeVinculosNoEscopo(vinculos, idsCtx, nomeDe)

    let notas = ''
    if (slugAtivo) {
      try {
        notas = htmlParaTexto((await repoNotas.lerPagina(slugAtivo)).corpo)
      } catch {
        // página ilegível: segue sem notas
      }
    }

    return montarContextoCampanha({
      nomeCampanha: camp?.nome ?? '',
      personagens: [...doElenco.values()],
      cenarios: linhasCen,
      vinculos: frases,
      notas,
    })
  }

  /** Anexa o card selecionado no canvas (retrato + dados em texto). */
  async function anexarCardSelecionado() {
    const editor = editorAtivo()
    const shape = editor?.getOnlySelectedShape()
    if (!shape) {
      setErro('Selecione um card no canvas primeiro.')
      return
    }
    const { personagens, cenarios } = useApp.getState()
    let nome = ''
    let bloco = ''
    let retratoRel: string | null = null
    if (shape.type === 'character-card') {
      const p = personagens[(shape as CharacterCardShapeType).props.personagemId]
      if (!p) return
      nome = p.nome
      retratoRel = p.retrato
      bloco = `Card anexado — Personagem: ${p.nome}\nResumo: ${p.resumo}\nDescrição: ${htmlParaTexto(p.descricao)}`
    } else if (shape.type === 'cenario-card') {
      const c = cenarios[(shape as CenarioCardShapeType).props.cenarioId]
      if (!c) return
      nome = c.nome
      retratoRel = c.retrato
      bloco = `Card anexado — Cenário: ${c.nome}\nResumo: ${c.resumo}\nDescrição: ${htmlParaTexto(c.descricao)}`
    } else {
      setErro('Selecione um card de personagem ou cenário.')
      return
    }
    let imagem: ImagemIA | null = null
    if (retratoRel && vaultPath) {
      try {
        const blob = await (await fetch(convertFileSrc(`${vaultPath}/${retratoRel}`))).blob()
        imagem = { mimeType: mimeDaExtensaoImg(retratoRel), base64: await blobParaBase64(blob) }
      } catch {
        // sem imagem: só o texto (o chip avisa)
      }
    }
    setErro(null)
    setAnexo({ nome: imagem ? nome : `${nome} (sem imagem)`, blocoTexto: bloco, imagem })
  }

  async function enviar() {
    const pergunta = texto.trim()
    if (!pergunta || pensando) return
    setErro(null)
    setTexto('')
    const agora = new Date().toISOString()
    const textoUser = anexo ? `${anexo.blocoTexto}\n\n${pergunta}` : pergunta
    const novas: MensagemChat[] = [...mensagens, { papel: 'user', texto: textoUser, em: agora }]
    agendarSalvar(novas)
    setPensando(true)
    try {
      const contexto = await montarContexto()
      const system = contexto ? `${SYSTEM_MESTRE}\n\n# Contexto da campanha\n${contexto}` : SYSTEM_MESTRE
      const janela = novas.slice(-JANELA_HISTORICO).map((m) => ({ papel: m.papel, texto: m.texto }))
      const resposta = await gerarConteudo({
        system,
        historico: janela,
        imagens: anexo?.imagem ? [anexo.imagem] : [],
      })
      agendarSalvar([...novas, { papel: 'model', texto: resposta, em: new Date().toISOString() }])
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setAnexo(null)
      setPensando(false)
    }
  }

  function limpar() {
    if (!confirm('Limpar a conversa desta sessão?')) return
    agendarSalvar([])
  }

  return (
    <div className="chat-ia">
      <div className="chat-ia-mensagens">
        {mensagens.length === 0 && !pensando && (
          <div className="chat-ia-vazio">
            Pergunte sobre a campanha, peça descrições de cena, reviravoltas…
          </div>
        )}
        {mensagens.map((m, i) => (
          <div key={i} className={`chat-msg chat-msg-${m.papel}`}>
            {m.texto}
          </div>
        ))}
        {pensando && <div className="chat-msg chat-msg-model chat-ia-pensando">pensando…</div>}
        <div ref={fimRef} />
      </div>
      {erro && <div className="chat-ia-erro">{erro}</div>}
      {anexo && (
        <div className="chat-ia-anexo">
          📎 {anexo.nome}
          <button className="btn-icon" title="Remover anexo" onClick={() => setAnexo(null)}>✕</button>
        </div>
      )}
      <div className="chat-ia-entrada">
        <textarea
          placeholder="Pergunte ao assistente… (Enter envia)"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void enviar()
            }
          }}
        />
        <div className="chat-ia-acoes">
          <button title="Anexar card selecionado no canvas" onClick={() => void anexarCardSelecionado()}>📎 card</button>
          <button title="Limpar conversa" onClick={limpar}>🗑</button>
          <button disabled={pensando || !texto.trim()} onClick={() => void enviar()}>Enviar</button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Workspace — prop `comChatIA`, botão ✨ e coluna**

Em `Workspace.tsx`:
- Import: `import { ChatIA } from './ChatIA'`.
- `EstadoSplit` ganha `chatAberto: boolean`; `lerSplit` lê `chatAberto: o.chatAberto === true` (default `false`); o `padrao` ganha `chatAberto: false`.
- Props: adicionar `comChatIA = false` (`comChatIA?: boolean`).
- No `painelMapa`, dentro do `ws-cabecalho`, adicionar ao lado do botão de recolher (antes dele):

```tsx
{comChatIA && !mapaRecolhido && (
  <button
    className="btn-icon"
    title={split.chatAberto ? 'Fechar assistente IA' : 'Abrir assistente IA'}
    onClick={() => setSplit((s) => ({ ...s, chatAberto: !s.chatAberto }))}
  >
    ✨ IA
  </button>
)}
```

- No retorno do componente, adicionar a coluna do chat como ÚLTIMO filho do `.workspace` (fora do par notas/mapa, largura fixa — não participa do split proporcional):

```tsx
{comChatIA && split.chatAberto && mapa && (
  <div className="ws-chat">
    <div className="ws-cabecalho">
      <span className="ws-titulo">Assistente IA</span>
      <button className="btn-icon" title="Fechar" onClick={() => setSplit((s) => ({ ...s, chatAberto: false }))}>✕</button>
    </div>
    <ChatIA caminhoSessao={mapa.caminho} cadernoDirRel={cadernoDirRel} repoNotas={repo} />
  </div>
)}
```

- [ ] **Step 3: App.tsx — habilitar só na sessão**

No ramo `aberto?.tipo === 'sessao'`, adicionar a prop `comChatIA` ao `<Workspace ...>`.

- [ ] **Step 4: CSS**

Em `theme.css` (após o bloco do workspace existente):

```css
/* ---- chat IA ---- */
.ws-chat {
  flex: 0 0 360px; min-width: 0; display: flex; flex-direction: column;
  border-left: 1px solid var(--borda); background: var(--fundo-painel);
}
.chat-ia { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.chat-ia-mensagens { flex: 1; min-height: 0; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
.chat-ia-vazio { color: var(--texto-fraco); font-size: 13px; font-style: italic; padding: 8px; }
.chat-msg { border-radius: 8px; padding: 8px 10px; font-size: 13px; line-height: 1.5; white-space: pre-wrap; max-width: 95%; }
.chat-msg-user { align-self: flex-end; background: var(--fundo-elevado); border: 1px solid var(--dourado); }
.chat-msg-model { align-self: flex-start; background: var(--fundo); border: 1px solid var(--borda); }
.chat-ia-pensando { color: var(--texto-fraco); font-style: italic; }
.chat-ia-erro { color: var(--erro); font-size: 12px; padding: 4px 12px; }
.chat-ia-anexo {
  display: flex; align-items: center; gap: 6px; margin: 0 12px;
  font-size: 12px; color: var(--dourado-claro);
  border: 1px dashed var(--dourado); border-radius: 6px; padding: 4px 8px;
}
.chat-ia-entrada { padding: 10px 12px; border-top: 1px solid var(--borda); display: flex; flex-direction: column; gap: 6px; }
.chat-ia-entrada textarea {
  background: var(--fundo); border: 1px solid var(--borda); border-radius: 6px;
  color: var(--texto); padding: 8px 10px; font-size: 13px; font-family: var(--sans);
  resize: vertical; min-height: 56px;
}
.chat-ia-acoes { display: flex; gap: 6px; justify-content: flex-end; }
```

- [ ] **Step 5: Build + suíte + teste manual**

Run: `npm run build` (limpo) e `npm run test` (baseline mantido).
`npm run dev`: abrir uma sessão → botão ✨ IA no cabeçalho do mapa → painel abre; enviar pergunta → resposta chega (spinner enquanto gera); selecionar um card no canvas → 📎 card → chip aparece → pergunta sobre a imagem funciona; fechar/reabrir a sessão → histórico permanece; 🗑 limpa com confirm.

- [ ] **Step 6: Commit**

```bash
git add src/components/ChatIA.tsx src/components/Workspace.tsx src/App.tsx src/theme.css
git commit -m "feat(ia): painel de chat IA na sessao"
```

---

# FASE 3 — Ações ✨ nos modais

## Task 5: textoParaHtml + AcoesIA + integração nos modais

**Files:**
- Modify: `src/lib/htmlTexto.ts`
- Create: `src/components/AcoesIA.tsx`
- Modify: `src/components/PerfilModal.tsx`, `src/components/CenarioModal.tsx`, `src/theme.css`
- Test: `src/test/htmlTexto.test.ts` (criar se não existir; se existir, adicionar describe)

- [ ] **Step 1: Write the failing test**

Em `src/test/htmlTexto.test.ts` (novo arquivo ou append):

```ts
import { describe, it, expect } from 'vitest'
import { textoParaHtml } from '../lib/htmlTexto'

describe('textoParaHtml', () => {
  it('parágrafos por linha, escapando HTML', () => {
    expect(textoParaHtml('linha 1\n\nlinha <2> & fim')).toBe('<p>linha 1</p><p>linha &lt;2&gt; &amp; fim</p>')
  })
  it('vazio → ""', () => {
    expect(textoParaHtml('  \n ')).toBe('')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- htmlTexto`
Expected: FAIL — `textoParaHtml` não exportado.

- [ ] **Step 3: Implement em `htmlTexto.ts`**

```ts
/** Texto plano da IA → HTML simples (um <p> por linha não-vazia; conteúdo escapado). */
export function textoParaHtml(texto: string): string {
  return texto
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => `<p>${l.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`)
    .join('')
}
```

Run: `npm run test -- htmlTexto` → PASS.

- [ ] **Step 4: Criar `src/components/AcoesIA.tsx`**

```tsx
import { useState } from 'react'
import { convertFileSrc } from '@tauri-apps/api/core'
import { useApp } from '../state/store'
import { gerarConteudo, type ImagemIA } from '../lib/gemini'
import { SYSTEM_MESTRE } from '../lib/chatIA'
import {
  achatarCenarios,
  frasesDeVinculosNoEscopo,
  montarContextoCampanha,
} from '../lib/contextoIA'
import { filtrarArvoreCenarios } from '../lib/filtroCampanha'
import { campanhasDe, idsDaCampanha } from '../lib/vinculos'
import { htmlParaTexto, textoParaHtml } from '../lib/htmlTexto'
import { uint8ParaBase64 } from '../lib/bin'

export interface AcaoIA {
  rotulo: string
  /** Prompt específico da ação (a entidade e o contexto entram automaticamente). */
  prompt: string
  /** Aba que recebe o texto ao Inserir. */
  abaDestino: string
  /** Nome amigável da aba no botão Inserir. */
  rotuloDestino?: string
  /** Anexa o retrato da entidade (análise de imagem). */
  comImagem?: boolean
}

function mimeDaExtensaoImg(rel: string): string {
  const ext = (rel.split('.').pop() ?? 'png').toLowerCase()
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'gif') return 'image/gif'
  return 'image/png'
}

/**
 * Menu ✨ dos modais: roda uma ação de IA sobre a entidade e mostra PREVIEW;
 * nada é gravado sem clicar Inserir (que faz append via onInserir).
 */
export function AcoesIA({
  entidadeTipo,
  entidadeId,
  acoes,
  onInserir,
}: {
  entidadeTipo: 'personagem' | 'cenario'
  entidadeId: string
  acoes: AcaoIA[]
  onInserir: (aba: string, html: string) => void
}) {
  const [menuAberto, setMenuAberto] = useState(false)
  const [rodando, setRodando] = useState(false)
  const [preview, setPreview] = useState<{ acao: AcaoIA; texto: string } | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  /** Contexto: primeira campanha em que a entidade participa (ou só a entidade). */
  function montarContexto(): string {
    const { tree, personagens, cenarios, vinculos } = useApp.getState()
    const campId = campanhasDe(vinculos, entidadeId)[0] ?? null
    const camp = campId && tree ? tree.campanhas.find((c) => c.id === campId) ?? null : null
    if (!camp || !tree) return ''
    const ids = idsDaCampanha(vinculos, camp.id)
    const parts = Object.values(personagens)
      .filter((p) => ids.has(p.id))
      .map((p) => ({ nome: p.nome, resumo: p.resumo }))
    const linhasCen = achatarCenarios(
      filtrarArvoreCenarios(tree.cenarios, ids),
      (id) => cenarios[id]?.resumo ?? '',
    )
    const nomeDe = (id: string) => personagens[id]?.nome ?? cenarios[id]?.nome ?? null
    return montarContextoCampanha({
      nomeCampanha: camp.nome,
      personagens: parts,
      cenarios: linhasCen,
      vinculos: frasesDeVinculosNoEscopo(vinculos, ids, nomeDe), // só vínculos entre participantes desta campanha
      notas: '',
    })
  }

  async function rodar(acao: AcaoIA) {
    setMenuAberto(false)
    setErro(null)
    setRodando(true)
    try {
      const { personagens, cenarios, vaultPath } = useApp.getState()
      const ent = entidadeTipo === 'personagem' ? personagens[entidadeId] : cenarios[entidadeId]
      if (!ent) return
      const dados = `# Entidade\nNome: ${ent.nome}\nResumo: ${ent.resumo}\nDescrição atual: ${htmlParaTexto(ent.descricao)}`
      const contexto = montarContexto()
      const system = contexto ? `${SYSTEM_MESTRE}\n\n# Contexto da campanha\n${contexto}` : SYSTEM_MESTRE

      const imagens: ImagemIA[] = []
      if (acao.comImagem) {
        if (!ent.retrato || !vaultPath) throw new Error('Esta entidade não tem imagem.')
        const resp = await fetch(convertFileSrc(`${vaultPath}/${ent.retrato}`))
        if (!resp.ok) throw new Error(`fetch falhou: ${resp.status}`)
        const blob = await resp.blob()
        imagens.push({ mimeType: mimeDaExtensaoImg(ent.retrato), base64: uint8ParaBase64(new Uint8Array(await blob.arrayBuffer())) })
      }

      const texto = await gerarConteudo({
        system,
        historico: [{ papel: 'user', texto: `${dados}\n\n${acao.prompt}` }],
        imagens,
      })
      setPreview({ acao, texto })
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setRodando(false)
    }
  }

  return (
    <div className="acoes-ia">
      <button
        className="btn-icon"
        title="Ações de IA"
        disabled={rodando}
        onClick={() => setMenuAberto((v) => !v)}
      >
        {rodando ? '…' : '✨'}
      </button>
      {menuAberto && (
        <div className="acoes-ia-menu">
          {acoes.map((a) => (
            <button key={a.rotulo} onClick={() => void rodar(a)}>{a.rotulo}</button>
          ))}
        </div>
      )}
      {erro && <div className="acoes-ia-erro">{erro}</div>}
      {preview && (
        <div className="acoes-ia-overlay" onClick={() => setPreview(null)}>
          <div className="acoes-ia-preview" onClick={(e) => e.stopPropagation()}>
            <div className="acoes-ia-preview-titulo">{preview.acao.rotulo}</div>
            <div className="acoes-ia-preview-texto">{preview.texto}</div>
            <div className="acoes-ia-preview-acoes">
              <button onClick={() => setPreview(null)}>Descartar</button>
              <button
                className="acoes-ia-inserir"
                onClick={() => {
                  onInserir(preview.acao.abaDestino, textoParaHtml(preview.texto))
                  setPreview(null)
                }}
              >
                Inserir em {preview.acao.rotuloDestino ?? preview.acao.abaDestino}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```


- [ ] **Step 5: Integrar no PerfilModal**

Em `PerfilModal.tsx`:
- Import: `import { AcoesIA, type AcaoIA } from './AcoesIA'` e `import { temConteudo } from '../lib/htmlTexto'` se ainda não houver (checar).
- Constante em nível de módulo:

```tsx
const ACOES_IA_PERSONAGEM: AcaoIA[] = [
  {
    rotulo: 'Gerar/melhorar descrição',
    prompt: 'Escreva (ou melhore) a descrição deste personagem em 2-3 parágrafos evocativos, coerentes com o contexto.',
    abaDestino: 'descricao',
    rotuloDestino: 'Descrição',
  },
  {
    rotulo: 'Sugerir segredos e ganchos',
    prompt: 'Sugira 3 segredos ou ganchos de aventura envolvendo este personagem, em lista curta.',
    abaDestino: 'anotacoes',
    rotuloDestino: 'Anotações',
  },
]
```

- No header (`perfil-header`), antes do botão fechar:

```tsx
<AcoesIA
  entidadeTipo="personagem"
  entidadeId={personagemId}
  acoes={ACOES_IA_PERSONAGEM}
  onInserir={(aba, html) => {
    const atual = useApp.getState().personagens[personagemId]
    const base = atual ? (atual[aba as 'descricao' | 'anotacoes'] ?? '') : ''
    agendarSalvar({ [aba]: base + html } as Partial<Personagem>)
    setAba(aba as Aba)
  }}
/>
```

- [ ] **Step 6: Integrar no CenarioModal**

Análogo, com:

```tsx
const ACOES_IA_CENARIO: AcaoIA[] = [
  {
    rotulo: 'Gerar/melhorar descrição',
    prompt: 'Escreva (ou melhore) a descrição deste cenário em 2-3 parágrafos evocativos, coerentes com o contexto.',
    abaDestino: 'descricao',
    rotuloDestino: 'Descrição',
  },
  {
    rotulo: 'Sugerir eventos',
    prompt: 'Sugira 3 eventos que podem acontecer neste cenário (lista curta, um por linha, com gatilho e consequência).',
    abaDestino: 'eventos',
    rotuloDestino: 'Eventos',
  },
  {
    rotulo: 'Analisar imagem',
    prompt: 'Analise a imagem deste cenário: descreva o que se vê e sugira 3 pontos de interesse para os jogadores explorarem.',
    abaDestino: 'anotacoes',
    rotuloDestino: 'Anotações',
    comImagem: true,
  },
]
```

E `onInserir` igual (cast `aba as 'descricao' | 'eventos' | 'anotacoes'`, cache `cenarios`, `agendarSalvar` do CenarioModal, `setAba`).

- [ ] **Step 7: CSS**

```css
/* ---- ações IA (modais) ---- */
.acoes-ia { position: relative; }
.acoes-ia-menu {
  position: absolute; top: 100%; right: 0; z-index: 20; min-width: 220px;
  background: var(--fundo-painel); border: 1px solid var(--dourado); border-radius: 6px;
  display: flex; flex-direction: column; overflow: hidden;
}
.acoes-ia-menu button { border: none; border-radius: 0; text-align: left; padding: 8px 12px; background: transparent; }
.acoes-ia-menu button:hover { background: var(--fundo-elevado); color: var(--dourado-claro); }
.acoes-ia-erro { position: absolute; top: 100%; right: 0; z-index: 20; color: var(--erro); font-size: 12px; background: var(--fundo-painel); border: 1px solid var(--erro); border-radius: 6px; padding: 6px 10px; max-width: 280px; }
.acoes-ia-overlay {
  position: fixed; inset: 0; background: rgba(0, 0, 0, 0.6);
  display: flex; align-items: center; justify-content: center; z-index: 1100;
}
.acoes-ia-preview {
  width: min(560px, 90vw); max-height: 70vh; overflow: hidden;
  background: var(--fundo-painel); border: 1px solid var(--dourado); border-radius: 8px;
  display: flex; flex-direction: column;
}
.acoes-ia-preview-titulo { font-family: var(--serif); color: var(--dourado-claro); padding: 14px 16px 8px; }
.acoes-ia-preview-texto { flex: 1; overflow-y: auto; padding: 0 16px 12px; font-size: 13px; line-height: 1.55; white-space: pre-wrap; }
.acoes-ia-preview-acoes { display: flex; justify-content: flex-end; gap: 8px; padding: 10px 16px; border-top: 1px solid var(--borda); }
.acoes-ia-inserir { border-color: var(--dourado); color: var(--dourado-claro); }
```

- [ ] **Step 8: Build + suíte + teste manual**

Run: `npm run build` e `npm run test` (verdes).
`npm run dev`: abrir personagem → ✨ → "Sugerir segredos e ganchos" → preview → Inserir → texto entra em Anotações e a aba abre. Cenário com imagem → "Analisar imagem" funciona; sem imagem → erro amigável.

- [ ] **Step 9: Commit**

```bash
git add src/lib/htmlTexto.ts src/components/AcoesIA.tsx src/components/PerfilModal.tsx src/components/CenarioModal.tsx src/theme.css src/test/htmlTexto.test.ts
git commit -m "feat(ia): acoes IA nos modais com preview"
```

---

## Verificação final

- [ ] `npm run test` — suíte inteira verde (novos: gemini, contextoIA, chatIA, htmlTexto).
- [ ] `npm run build` — tsc limpo.
- [ ] Manual: chat na sessão (contexto correto — pergunte "quem participa desta campanha?"), anexar card com e sem imagem, erro amigável com chave inválida, ações ✨ nos dois modais com preview/inserir, histórico persiste.
- [ ] `git log` — nenhum commit contém `.env` ou valores de chave.

## Notas de risco

- **Chaves**: expostas ao bundle via envPrefix — aceitável (app desktop pessoal, tier gratuito); nunca logar. `.env` já está fora do git.
- **CORS/fetch no WebView2**: chamada direta à API do Google a partir do webview Tauri (CSP `null` no tauri.conf). Se o WebView bloquear, fallback: rota via plugin HTTP do Tauri — reportar antes de implementar (BLOCKED).
- **`import.meta.env` em teste**: vitest não define `GEMINI_API_KEYS` — os testes cobrem só os helpers puros; `gerarConteudo` não roda em teste.
- **Flush do chat no unmount**: perda máxima = última mensagem em <800ms ao fechar (mesmo trade-off aceito nos outros debounces do app).
