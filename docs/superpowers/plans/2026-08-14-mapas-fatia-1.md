# Mapas — Fatia 1: tipo Mapa ponta a ponta

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Novo tipo de documento "Mapa" no Grimório: seção na sidebar, arquivo em `mapas-soltos/`, editor tldraw com grade + snap + tema escuro + drops de entidade + export.

**Architecture:** Reuso do motor tldraw do CanvasView. O ciclo de vida do documento (carregar snapshot, autosave 1s, releitura pós-sync, save final) e os drops de entidade são extraídos de `CanvasView.tsx` para módulos compartilhados; `MapaView.tsx` consome os mesmos módulos com toolbar própria e grade ligada. Persistência e sync não mudam: mapa é um `.json` com `{id, nome, documento, …}` que a política de conflito já trata como entidade.

**Tech Stack:** React + TypeScript + zustand + tldraw v3 + Tauri. Testes: vitest (+ jsdom onde precisar).

**Spec:** `docs/superpowers/specs/2026-08-14-mapas-design.md`

**Regras do repo que valem para TODO task:** comentários e nomes em pt-BR no estilo dos arquivos vizinhos; rodar `npx vitest run` e `npx tsc --noEmit` antes de cada commit; nunca `--no-verify`.

---

### Task 1: Árvore do cofre conhece `mapas-soltos`

**Files:**
- Modify: `src/lib/types.ts` (interface `VaultTree`, ~linha 205)
- Modify: `src/lib/vaultRepo.ts` (`inicializar()` ~linha 167; `montarArvore()` ~linha 628)
- Test: `src/test/vaultRepo.test.ts` (acrescentar ao describe de montarArvore existente)

- [ ] **Step 1: Write the failing test**

Em `src/test/vaultRepo.test.ts`, junto dos testes de `montarArvore` (seguir o padrão de setup do arquivo — `criarFakeFs` + `new VaultRepo(RAIZ, fs)` + `inicializar()`):

```ts
it('lista mapas de mapas-soltos na árvore', async () => {
  await repo.criarCanvasDoc('mapas-soltos', 'Castelo L1')
  const tree = await repo.montarArvore()
  expect(tree.mapasSoltos.map((m) => m.nome)).toEqual(['Castelo L1'])
})

it('cofre sem pasta mapas-soltos devolve lista vazia, não erro', async () => {
  // cofre antigo, criado antes do tipo Mapa existir
  await fs.removePath(`${RAIZ}/mapas-soltos`)
  const tree = await repo.montarArvore()
  expect(tree.mapasSoltos).toEqual([])
})
```

(Se `fs.removePath` do fake não remover diretório, usar o helper que os testes vizinhos de pasta ausente usam — há teste equivalente para `canvases-soltos`/`itens`; copiar o mecanismo dali.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/vaultRepo.test.ts`
Expected: FAIL — `mapasSoltos` não existe em `VaultTree` (erro de tipo/`undefined`).

- [ ] **Step 3: Implement**

`src/lib/types.ts`, em `VaultTree`:

```ts
export interface VaultTree {
  campanhas: CampanhaNode[]
  canvasesSoltos: ItemRef[]
  /** mapas da seção "Mapas" (caminho = "mapas-soltos"); lista plana na v1 */
  mapasSoltos: ItemRef[]
  // … demais campos inalterados
}
```

`src/lib/vaultRepo.ts`:

```ts
async inicializar(): Promise<void> {
  await this.fs.mkdirAll(this.abs('campanhas'))
  await this.fs.mkdirAll(this.abs('canvases-soltos'))
  await this.fs.mkdirAll(this.abs('mapas-soltos'))
}
```

e no retorno de `montarArvore()`:

```ts
return {
  campanhas,
  canvasesSoltos: await this.listarItens('canvases-soltos'),
  mapasSoltos: await this.listarItens('mapas-soltos'),
  personagensSoltos: await this.montarArvorePastas('personagens-soltos'),
  cenarios: await this.montarArvoreCenarios(),
  itens: await this.montarArvoreItens(),
}
```

(`listarItens` já devolve `[]` para diretório ausente — conferir; se propagar erro, tratar igual aos vizinhos.)

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/test/vaultRepo.test.ts` → PASS.
Run: `npx tsc --noEmit` → vai APONTAR os lugares que constroem `VaultTree` sem `mapasSoltos` (testes com árvore fake, etc.). Corrigir cada um adicionando `mapasSoltos: []`.
Run: `npx vitest run` → PASS (926+ testes).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(mapas): árvore do cofre lista mapas-soltos"
```

---

### Task 2: `TipoAberto` ganha `'mapa'`

**Files:**
- Modify: `src/state/store.ts:11`

- [ ] **Step 1: Implement (mudança de tipo — sem teste de runtime possível)**

```ts
export type TipoAberto = 'sessao' | 'canvas' | 'escrita' | 'mapa'
```

`DocumentoAberto.caminho` para mapa = caminho do `.json` (igual canvas). Nada mais muda: `abrirDocumento`/`fecharDocumento` já são genéricos.

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit` → sem erros. Run: `npx vitest run` → PASS.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat(mapas): TipoAberto aceita 'mapa'"
```

---

### Task 3: Extrair de CanvasView o que o MapaView reusa (refactor puro)

**Files:**
- Create: `src/components/canvasDoc.ts` — ciclo de vida do documento tldraw
- Create: `src/components/dropsDeEntidade.tsx` — drops de entidade/imagem + helpers de seta
- Create: `src/components/exportarCanvas.ts` — export PNG/SVG
- Modify: `src/components/CanvasView.tsx` — passa a consumir os três

Comportamento NÃO muda. Critério de aceite: `npx vitest run` e `npx tsc --noEmit` limpos ao final, sem alterar nenhum teste existente.

- [ ] **Step 1: Criar `src/components/canvasDoc.ts`**

Mover para cá, de `CanvasView.tsx`, SEM alterar lógica:
- `criarAssetStore(vaultPath, repo)` (linhas ~80-94)
- `criarStoreCanvas(vaultPath, repo)` (~97-102)
- a constante `AUTOSAVE_DEBOUNCE_MS`

E criar o hook que encapsula os três efeitos do CanvasView (carregar ~355-373, autosave ~376-431, releitura pós-sync — o efeito de `recargasDoDisco`):

```ts
import { useEffect, useRef, useState } from 'react'
import { createTLStore, getSnapshot, loadSnapshot, type TLAnyShapeUtilConstructor, type TLEditorSnapshot, type TLStore } from 'tldraw'
import { useApp } from '../state/store'
import type { VaultRepo } from '../lib/vaultRepo'

/**
 * Ciclo de vida de um documento tldraw persistido no cofre (canvas, sessão, mapa):
 * carrega o snapshot, autosalva com debounce, salva pendência no unmount e relê o
 * arquivo quando o sync escreve no cofre (`recargasDoDisco`). Extraído do CanvasView
 * para o MapaView reusar sem duplicar a parte que interage com sync/persistência.
 *
 * `shapeUtils` entra por parâmetro porque cada view registra os seus (o mapa terá os
 * da paleta RPG na fatia 2); a identidade do array precisa ser estável no chamador.
 */
export function useDocumentoTldraw(caminho: string, shapeUtils: TLAnyShapeUtilConstructor[]) {
  const repo = useApp((s) => s.repo)
  const vaultPath = useApp((s) => s.vaultPath)
  const recargasDoDisco = useApp((s) => s.recargasDoDisco)
  const [store, setStore] = useState<TLStore | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [salvandoErro, setSalvandoErro] = useState<string | null>(null)
  const timerAutosaveRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const recargasVistasRef = useRef(recargasDoDisco)

  // …efeito de carga, efeito de autosave e efeito de releitura movidos do CanvasView,
  // trocando `criarStoreCanvas(vaultPath, repo)` por uma versão que recebe shapeUtils…

  return { store, erro, salvandoErro }
}
```

Os corpos dos efeitos são MOVIDOS tal e qual do CanvasView (inclusive comentários), com uma única generalização: `criarStoreCanvas` ganha o parâmetro `shapeUtils` em vez do array fixo. O CanvasView passa `shapeUtilsDoStore` (o array atual, que continua definido nele, pois os card-shapes são dele e do mapa).

- [ ] **Step 2: Criar `src/components/dropsDeEntidade.tsx`**

Mover de `CanvasView.tsx`, sem alterar lógica: `MIME_PERSONAGEM`, `MIME_IMAGEM`, `DROPS_DE_ENTIDADE`, `medirImagem`, `soltarImagemNoMapa`, `ANCORA_SETA`, `existeSetaEntre`, `criarSeta`, `cardsPorEntidade`, `ligarCenarioNoCanvas`, `ligarRelacoesNoCanvas`. Exportar um par de handlers prontos:

```ts
/** Handlers de drag/drop para superfícies tldraw que aceitam entidades e imagens do cofre. */
export function criarHandlersDeDrop(
  editorRef: React.RefObject<Editor | null>,
  vaultPath: string | null,
): { aoArrastarSobre(e: React.DragEvent): void; aoSoltar(e: React.DragEvent): void }
```

com os corpos atuais de `onDragOverCapture`/`onDropCapture` do CanvasView.

- [ ] **Step 3: Criar `src/components/exportarCanvas.ts`**

Mover a função `exportar` (~415-442) generalizada:

```ts
export async function exportarCanvas(
  editor: Editor,
  repo: VaultRepo,
  nome: string,
  formato: 'png' | 'svg',
): Promise<void>
```

- [ ] **Step 4: CanvasView consome os módulos**

`CanvasView.tsx` importa tudo dos módulos novos e apaga as cópias locais. O componente mantém: shapeUtils dos cards, `transformarImagemEmEntidade`, atalhos de teclado, toolbar/banners.

- [ ] **Step 5: Verify**

Run: `npx vitest run` → PASS (nenhum teste alterado). `npx tsc --noEmit` → limpo.
Abrir o app (`npm run tauri dev`) e conferir manualmente: canvas existente abre, desenha, autosalva, exporta PNG. (Se ambiente não permitir app, declarar no PR/resumo que este passo ficou pendente de verificação manual.)

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "refactor(canvas): extrai ciclo de vida, drops e export para módulos compartilhados"
```

---

### Task 4: `MapaView`

**Files:**
- Create: `src/components/MapaView.tsx`
- Modify: `src/theme.css` (classes `.mapa-*`, seguir convenção das `.canvas-*`)

- [ ] **Step 1: Implementar o componente**

```tsx
import { useRef } from 'react'
import { Tldraw, defaultShapeUtils, type Editor } from 'tldraw'
import 'tldraw/tldraw.css'
import { useApp } from '../state/store'
import { useDocumentoTldraw } from './canvasDoc'
import { criarHandlersDeDrop } from './dropsDeEntidade'
import { exportarCanvas } from './exportarCanvas'
import { CharacterCardShapeUtil } from './CharacterCardShape'
import { CenarioCardShapeUtil } from './CenarioCardShape'
import { ItemCardShapeUtil } from './ItemCardShape'
import { registrarEditor, desregistrarEditor } from '../lib/canvasAtivo'

/** Lado do quadrado da grade, em px de página. 1 quadrado = 1 célula de mapa de mesa. */
export const QUADRADO_PX = 32

// mesmos card-shapes do canvas: mapa aceita drop de personagem/cenário/item
const shapeUtilsCustom = [CharacterCardShapeUtil, CenarioCardShapeUtil, ItemCardShapeUtil]
const shapeUtilsDoStore = [...defaultShapeUtils, ...shapeUtilsCustom]

export function MapaView({ caminho, nome }: { caminho: string; nome: string }) {
  const repo = useApp((s) => s.repo)
  const vaultPath = useApp((s) => s.vaultPath)
  const editorRef = useRef<Editor | null>(null)
  const { store, erro, salvandoErro } = useDocumentoTldraw(caminho, shapeUtilsDoStore)
  const drops = criarHandlersDeDrop(editorRef, vaultPath)

  if (erro) return <div className="canvas-erro">Não foi possível abrir "{nome}".<br /><code>{erro}</code></div>
  if (!store) return <div className="canvas-carregando">Carregando…</div>

  return (
    <div className="mapa-wrap" onDragOverCapture={drops.aoArrastarSobre} onDropCapture={drops.aoSoltar}>
      <div className="canvas-toolbar">
        <span className="canvas-titulo">🗺 {nome}</span>
        <button onClick={() => { const e = editorRef.current; if (e && repo) void exportarCanvas(e, repo, nome, 'png') }}>Exportar PNG</button>
        <button onClick={() => { const e = editorRef.current; if (e && repo) void exportarCanvas(e, repo, nome, 'svg') }}>Exportar SVG</button>
      </div>
      <Tldraw
        store={store}
        shapeUtils={shapeUtilsCustom}
        onMount={(editor) => {
          registrarEditor(editor)
          editorRef.current = editor
          editor.user.updateUserPreferences({ colorScheme: 'dark' })
          // grade ligada por padrão: é a régua do mapa (1 quadrado = QUADRADO_PX)
          editor.updateInstanceState({ isGridMode: true })
          editor.updateDocumentSettings({ gridSize: QUADRADO_PX })
          return () => desregistrarEditor(editor)
        }}
      />
      {salvandoErro && <div className="canvas-banners"><div className="canvas-salvar-erro">Falha ao salvar: {salvandoErro}</div></div>}
    </div>
  )
}
```

Notas ao implementador:
- Se `updateDocumentSettings` não existir com esse nome na versão instalada do tldraw, consultar `npx ctx7@latest docs /tldraw/tldraw "set document gridSize"` e usar o equivalente. NÃO chutar.
- Toolbar do tldraw fica a padrão nesta fatia (formas, caneta, texto, borracha já vêm nela). A toolbar enxuta de mapa entra na fatia 2 junto com a paleta RPG — evita construir toolbar duas vezes.
- `.mapa-wrap` copia o layout de `.canvas-wrap` no `theme.css`.

- [ ] **Step 2: Verify**

`npx tsc --noEmit` limpo. `npx vitest run` → PASS.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat(mapas): MapaView com grade, snap, tema escuro, drops e export"
```

---

### Task 5: Sidebar — seção "Mapas"

**Files:**
- Modify: `src/components/Sidebar.tsx` (seção nova após "Canvases soltos", ~linha 158; função `novoMapaSolto` junto de `novoCanvasSolto` ~63; ícone em `ItemLinha` ~300)

- [ ] **Step 1: Implementar**

Em `Sidebar.tsx`:

```tsx
async function novoMapaSolto() {
  const nome = await pedirTexto('Nome do mapa:')
  if (!nome || !repo) return
  await comAvisoDeErro(async () => {
    const ref = await repo.criarCanvasDoc('mapas-soltos', nome)
    await associarNaCriacao('canvas', ref.id, nome)
    await recarregar()
  })
}
```

(Mapa participa de campanha como documento, igual canvas — `'canvas'` é o `TipoEntidadeVinculo` correto; não criar tipo de vínculo novo.)

Filtro por campanha, espelhando as linhas 101-102:

```tsx
const mapasVisiveis = idsFiltro ? filtrarCanvasesSoltos(tree.mapasSoltos, idsFiltro) : tree.mapasSoltos
const ocultosMapas = tree.mapasSoltos.length - mapasVisiveis.length
```

Seção, logo após "Canvases soltos" (mesma estrutura JSX das linhas 139-158, trocando: título "Mapas", `title="Novo mapa"`, `onClick={novoMapaSolto}`, itens de `mapasVisiveis`, `tipoAbertura="mapa"`, mensagem de ocultos "mapa oculto/mapas ocultos").

Em `ItemLinha` (linha ~300), ícone para mapa:

```tsx
<span className="item-nome">{tipo === 'personagem' ? '👤 ' : tipoAbertura === 'escrita' ? '✍ ' : tipoAbertura === 'mapa' ? '🗺 ' : '▦ '}{item.nome}{item.erro ? ' ⚠' : ''}</span>
```

`ItemLinha` já cobre abrir (`abrirDocumento('mapa', …)` via `tipoAbertura`), renomear (`repo.renomearItem`) e excluir (`repo.excluirItemComNotas`) sem mudança.

- [ ] **Step 2: Verify**

`npx tsc --noEmit` limpo. `npx vitest run` → PASS.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat(mapas): seção Mapas na sidebar (criar, abrir, renomear, excluir, filtro)"
```

---

### Task 6: Rota no App

**Files:**
- Modify: `src/App.tsx` (~linha 106, junto das rotas de canvas/sessão/escrita)

- [ ] **Step 1: Implementar**

Mapa abre SEM Workspace (sem painel de notas — desenho + cards, conforme spec):

```tsx
{!grafoAberto && aberto?.tipo === 'mapa' && (
  <MapaView key={aberto.caminho} caminho={aberto.caminho} nome={aberto.nome} />
)}
```

com `import { MapaView } from './components/MapaView'`.

- [ ] **Step 2: Verify + testes**

`npx tsc --noEmit` limpo. `npx vitest run` → PASS.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat(mapas): rota do documento tipo mapa no App"
```

---

### Task 7: Verificação manual no app + fechamento

- [ ] **Step 1: Rodar o app** (`npm run tauri dev`) e executar o roteiro:

1. Sidebar mostra seção "Mapas" com "+" → criar "Castelo L1" → aparece na lista com 🗺
2. Abrir → editor escuro com grade visível; desenhar retângulo → encosta na grade (snap)
3. Fechar (clicar em outro doc) e reabrir → desenho persistiu
4. Arrastar um cenário da sidebar pro mapa → vira card
5. Ctrl+A/Ctrl+C num canvas antigo → Ctrl+V no mapa → conteúdo cola
6. Exportar PNG → arquivo salvo abre
7. Renomear e excluir um mapa de teste pela sidebar
8. Com Drive pareado: esperar um ciclo de sync → `mapas-soltos/*.json` aparece no painel Nuvem sem conflito

- [ ] **Step 2: Reportar** o resultado item a item (o que passou, o que não deu para verificar) — regra 13 do CLAUDE.md: não fingir que funciona.

- [ ] **Step 3: Commit final da fatia** (se sobrou ajuste) e avisar que a Fatia 2 (paleta RPG + medidas) ganha plano próprio a partir do que existir aqui.

---

## Self-review do plano (executado na escrita)

- **Cobertura da spec (fatia 1):** seção sidebar ✓ (Task 5), arquivo `mapas-soltos` ✓ (Task 1), tipo/rota ✓ (Tasks 2, 6), editor grade/snap/tema/drops/export ✓ (Tasks 3, 4), verificação ✓ (Task 7). Paleta/medidas/camadas/réguas = fatias 2-3, fora deste plano por decisão registrada na spec.
- **Sem placeholders:** os dois pontos de API incerta do tldraw têm instrução explícita de consulta ctx7, não "ajustar depois".
- **Consistência de nomes:** `useDocumentoTldraw`, `criarHandlersDeDrop`, `exportarCanvas`, `QUADRADO_PX`, `mapasSoltos` — usados de forma idêntica entre tasks.
