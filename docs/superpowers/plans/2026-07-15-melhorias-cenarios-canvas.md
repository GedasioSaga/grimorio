# Melhorias Cenários no Canvas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar 4 melhorias aos cards de cenário/personagem no canvas tldraw: setas automáticas por hierarquia, copiar imagem com Ctrl+C, seções Eventos/Itens no card, e escala de fonte por card.

**Architecture:** Lógica pura em `src/lib/*` (testável com vitest, sem tldraw); I/O do canvas (criar shapes/setas, clipboard) nos componentes. Props novas nos shapes tldraw entram com `createShapePropsMigrationSequence` para não quebrar canvas já salvos. CSS var por card controla a fonte.

**Tech Stack:** Tauri v2, React 19, tldraw 4.5, zustand, TipTap, vitest.

---

## Contexto de arquivos existentes (ler antes de começar)

- `src/lib/types.ts` — `Cenario` já tem `eventos` e `itens` (HTML); `CenarioNode.filhos` dá a hierarquia.
- `src/lib/cenarioArvore.ts` — `encontrarCenarioNode`, `coletarCenarioRefs`, `contarDescendentes`.
- `src/lib/cartaoCanvas.ts` — `PAINEL_DESCRICAO_LARGURA = 240`, `ajustarLargura`.
- `src/components/CharacterCardShape.tsx` — `CARD_LARGURA_PADRAO = 240`, `CARD_ALTURA_PADRAO = 320`; já usa `createShapePropsMigrationSequence` (padrão a copiar).
- `src/components/CenarioCardShape.tsx` — card de cenário; hoje só Descrição + Informações; **sem** migrations.
- `src/components/CanvasView.tsx` — `onDropCapture` cria os cards; `onMount` tem handler de teclado em fase capture (espaço).
- `src/theme.css` — regras `.char-card*` (fontes em px fixo, ~linhas 109-163).
- `src/components/EditorInline.tsx` — editor inline: props `value`, `onChange(html)`, `onBlur`.
- `src/lib/htmlTexto.ts` — `temConteudo(html)`.

Rodar toda a suíte no fim de cada feature: `npm run test` e `npm run build`.

---

# FEATURE 5 — Escala de fonte por card (A− / A+)

## Task 1: Helper puro de escala de fonte

**Files:**
- Create: `src/lib/escalaFonte.ts`
- Test: `src/test/escalaFonte.test.ts`

- [ ] **Step 1: Write the failing test**

`src/test/escalaFonte.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { FONTE_MIN, FONTE_MAX, proximaEscala } from '../lib/escalaFonte'

describe('proximaEscala', () => {
  it('aumenta em passo de 0.1', () => {
    expect(proximaEscala(1, 0.1)).toBe(1.1)
  })
  it('diminui em passo de 0.1', () => {
    expect(proximaEscala(1, -0.1)).toBe(0.9)
  })
  it('trava no mínimo', () => {
    expect(proximaEscala(FONTE_MIN, -0.1)).toBe(FONTE_MIN)
  })
  it('trava no máximo', () => {
    expect(proximaEscala(FONTE_MAX, 0.1)).toBe(FONTE_MAX)
  })
  it('arredonda para 1 casa (sem erro de ponto flutuante)', () => {
    expect(proximaEscala(1.1, 0.1)).toBe(1.2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- escalaFonte`
Expected: FAIL — `Cannot find module '../lib/escalaFonte'`.

- [ ] **Step 3: Write minimal implementation**

`src/lib/escalaFonte.ts`:
```typescript
/** Escala de fonte por card no canvas (multiplicador aplicado via CSS var --card-fe). */
export const FONTE_MIN = 0.8
export const FONTE_MAX = 2.0
export const FONTE_PASSO = 0.1

/** Próxima escala aplicando `delta`, arredondada a 1 casa e presa em [MIN, MAX]. */
export function proximaEscala(atual: number, delta: number): number {
  const bruto = Math.round((atual + delta) * 10) / 10
  return Math.min(FONTE_MAX, Math.max(FONTE_MIN, bruto))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- escalaFonte`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/escalaFonte.ts src/test/escalaFonte.test.ts
git commit -m "feat(canvas): helper puro de escala de fonte dos cards"
```

## Task 2: Componente ControlesFonte

**Files:**
- Create: `src/components/ControlesFonte.tsx`

- [ ] **Step 1: Implement component**

`src/components/ControlesFonte.tsx`:
```tsx
import { FONTE_PASSO, proximaEscala } from '../lib/escalaFonte'

/**
 * Botões A− / A+ para ajustar a escala de fonte de um card no canvas.
 * `onPointerDown` parado: clicar nos botões não arrasta o shape.
 */
export function ControlesFonte({
  escala,
  onEscala,
}: {
  escala: number
  onEscala: (proxima: number) => void
}) {
  return (
    <span className="card-fonte-ctrl" onPointerDown={(e) => e.stopPropagation()}>
      <button title="Diminuir fonte" onClick={() => onEscala(proximaEscala(escala, -FONTE_PASSO))}>
        A−
      </button>
      <button title="Aumentar fonte" onClick={() => onEscala(proximaEscala(escala, FONTE_PASSO))}>
        A+
      </button>
    </span>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ControlesFonte.tsx
git commit -m "feat(canvas): componente ControlesFonte (A-/A+)"
```

## Task 3: CSS — var --card-fe nas fontes dos cards

**Files:**
- Modify: `src/theme.css` (regras `.char-card*`, ~linhas 109-163)

- [ ] **Step 1: Reescrever font-sizes para usar a var**

Em `src/theme.css`, trocar cada `font-size` fixo dos cards por `calc(<base>px * var(--card-fe, 1))`. Aplicar exatamente nestas regras:

```css
.char-card-inicial { font-family: var(--serif); font-size: calc(40px * var(--card-fe, 1)); color: var(--dourado-claro); }
.char-card-nome { font-family: var(--serif); font-size: calc(16px * var(--card-fe, 1)); color: var(--dourado-claro); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.char-card-resumo { font-size: calc(12px * var(--card-fe, 1)); color: var(--texto-fraco); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.char-card-secao-titulo { font-family: var(--serif); font-size: calc(13px * var(--card-fe, 1)); color: var(--dourado-claro); }
.char-card-info-toggle { border: none; background: transparent; padding: 0; font-family: var(--serif); font-size: calc(13px * var(--card-fe, 1)); color: var(--dourado-claro); cursor: pointer; }
.char-card-sem-descricao { font-size: calc(13px * var(--card-fe, 1)); color: var(--texto-fraco); font-style: italic; }
.char-card-descricao { font-size: calc(14px * var(--card-fe, 1)); color: var(--texto); line-height: 1.45; }
.char-card-descricao h2, .char-card-descricao h3 { font-family: var(--serif); font-size: calc(15px * var(--card-fe, 1)); color: var(--dourado-claro); margin: 5px 0 3px; }
.char-card-editor .tiptap { outline: none; font-size: calc(14px * var(--card-fe, 1)); color: var(--texto); line-height: 1.45; min-height: 40px; }
.char-card-editor .tiptap h2, .char-card-editor .tiptap h3 { font-family: var(--serif); font-size: calc(15px * var(--card-fe, 1)); color: var(--dourado-claro); margin: 5px 0 3px; }
```

Manter o `font-size: 40px` do container `.char-card-retrato` (é fallback do emoji/inicial; a `.char-card-inicial` interna já escala).

- [ ] **Step 2: Adicionar estilo dos botões A−/A+**

Adicionar ao fim do bloco de cartão (após `.char-card-editor` …):
```css
.card-fonte-ctrl { display: inline-flex; gap: 4px; margin-top: 6px; }
.card-fonte-ctrl button {
  border: 1px solid var(--borda); background: var(--fundo); color: var(--texto-fraco);
  border-radius: 4px; font-family: var(--serif); font-size: 11px; line-height: 1;
  padding: 2px 6px; cursor: pointer;
}
.card-fonte-ctrl button:hover { color: var(--dourado-claro); border-color: var(--dourado); }
```

- [ ] **Step 3: Commit**

```bash
git add src/theme.css
git commit -m "feat(canvas): fonte dos cards escala via var --card-fe"
```

## Task 4: CharacterCardShape — prop fonteEscala + controles

**Files:**
- Modify: `src/components/CharacterCardShape.tsx`

- [ ] **Step 1: Adicionar a prop ao schema e ao TLGlobalShapePropsMap**

No `declare module '@tldraw/tlschema'` (bloco `'character-card'`), adicionar a linha `fonteEscala: number` ao objeto de props. No `static override props`, adicionar `fonteEscala: T.positiveNumber,`. No `getDefaultProps`, adicionar `fonteEscala: 1,`.

- [ ] **Step 2: Adicionar migration**

Em `createShapePropsMigrationIds('character-card', { ... })` adicionar `AdicionaFonteEscala: 4`. No array `sequence`, adicionar ao fim:
```typescript
{
  id: versoes.AdicionaFonteEscala,
  up(props) {
    props.fonteEscala = 1
  },
  down(props) {
    delete props.fonteEscala
  },
},
```

- [ ] **Step 3: Aplicar a var e renderizar os controles**

Importar no topo: `import { ControlesFonte } from './ControlesFonte'`.

Desestruturar `fonteEscala` de `shape.props` na função `CartaoPersonagem`:
```tsx
const { personagemId, expandido, infoExpandido, infoAoLado, fonteEscala } = shape.props
```

No `HTMLContainer` raiz, aplicar a CSS var no `style`:
```tsx
<HTMLContainer className="char-card" style={{ pointerEvents: 'all', ['--card-fe' as any]: fonteEscala }}>
```

Dentro de `.char-card-texto`, após o bloco de nome/resumo, adicionar os controles:
```tsx
<div className="char-card-texto">
  <div className="char-card-nome">{p.nome}</div>
  {p.resumo ? <div className="char-card-resumo">{p.resumo}</div> : null}
  <ControlesFonte
    escala={fonteEscala}
    onEscala={(v) =>
      tldrawEditor.updateShape<CharacterCardShapeType>({
        id: shape.id,
        type: 'character-card',
        props: { fonteEscala: v },
      })
    }
  />
</div>
```

- [ ] **Step 4: Verificar build**

Run: `npm run build`
Expected: sem erros de tipo (a prop entra no union via TLGlobalShapePropsMap).

- [ ] **Step 5: Teste manual**

Run: `npm run dev`. Dropar um personagem no canvas → clicar A+/A− → fonte do card muda; recarregar o canvas → escala persiste.

- [ ] **Step 6: Commit**

```bash
git add src/components/CharacterCardShape.tsx
git commit -m "feat(canvas): escala de fonte no card de personagem"
```

---

# FEATURE 3 — Seções Eventos e Itens no card de cenário

Reescreve o render de painéis de `CenarioCardShape` para uma lista de seções e troca o cálculo incremental de largura por recomputo a partir do nº de colunas. Adiciona também `fonteEscala` (mesmo padrão da F5) já que o arquivo é reescrito aqui.

## Task 5: Helper puro de largura por colunas

**Files:**
- Modify: `src/lib/cartaoCanvas.ts`
- Test: `src/test/cartaoCanvas.test.ts` (já existe — adicionar casos)

- [ ] **Step 1: Write the failing test**

Adicionar em `src/test/cartaoCanvas.test.ts`:
```typescript
import { larguraDoCartao } from '../lib/cartaoCanvas'

describe('larguraDoCartao', () => {
  it('base sem colunas de painel', () => {
    expect(larguraDoCartao(240, 0)).toBe(240)
  })
  it('uma coluna soma um painel', () => {
    expect(larguraDoCartao(240, 1)).toBe(240 + 240)
  })
  it('três colunas somam três painéis', () => {
    expect(larguraDoCartao(240, 3)).toBe(240 + 3 * 240)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- cartaoCanvas`
Expected: FAIL — `larguraDoCartao is not a function`.

- [ ] **Step 3: Implement**

Adicionar em `src/lib/cartaoCanvas.ts`:
```typescript
/**
 * Largura do card a partir do nº de colunas de painel visíveis.
 * `base` = largura da coluna principal (imagem+nome). Cada coluna de painel
 * adiciona PAINEL_DESCRICAO_LARGURA.
 */
export function larguraDoCartao(base: number, colunasPaineis: number): number {
  return base + colunasPaineis * PAINEL_DESCRICAO_LARGURA
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- cartaoCanvas`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cartaoCanvas.ts src/test/cartaoCanvas.test.ts
git commit -m "feat(canvas): larguraDoCartao por nº de colunas"
```

## Task 6: CenarioCardShape — props novas + migrations

**Files:**
- Modify: `src/components/CenarioCardShape.tsx`

- [ ] **Step 1: Ampliar o schema de props**

Trocar o bloco `declare module '@tldraw/tlschema'` para incluir as flags de seção e a escala:
```typescript
declare module '@tldraw/tlschema' {
  interface TLGlobalShapePropsMap {
    'cenario-card': {
      w: number
      h: number
      cenarioId: string
      expandido: boolean
      infoExpandido: boolean
      infoAoLado: boolean
      eventosExpandido: boolean
      eventosAoLado: boolean
      itensExpandido: boolean
      itensAoLado: boolean
      fonteEscala: number
    }
  }
}
```

Atualizar `static override props`:
```typescript
static override props: RecordProps<CenarioCardShapeType> = {
  w: T.positiveNumber,
  h: T.positiveNumber,
  cenarioId: T.string,
  expandido: T.boolean,
  infoExpandido: T.boolean,
  infoAoLado: T.boolean,
  eventosExpandido: T.boolean,
  eventosAoLado: T.boolean,
  itensExpandido: T.boolean,
  itensAoLado: T.boolean,
  fonteEscala: T.positiveNumber,
}
```

Atualizar `getDefaultProps`:
```typescript
override getDefaultProps(): CenarioCardShapeType['props'] {
  return {
    w: CARD_LARGURA_PADRAO,
    h: CARD_ALTURA_PADRAO,
    cenarioId: '',
    expandido: false,
    infoExpandido: false,
    infoAoLado: false,
    eventosExpandido: false,
    eventosAoLado: false,
    itensExpandido: false,
    itensAoLado: false,
    fonteEscala: 1,
  }
}
```

- [ ] **Step 2: Adicionar migrations (o arquivo hoje não tem)**

Adicionar aos imports do tldraw: `createShapePropsMigrationIds`, `createShapePropsMigrationSequence`.

Acima da classe, adicionar:
```typescript
const versoes = createShapePropsMigrationIds('cenario-card', {
  AdicionaSecoesEventosItens: 1,
  AdicionaFonteEscala: 2,
})
```

Dentro da classe (após `static override props`), adicionar:
```typescript
static override migrations = createShapePropsMigrationSequence({
  sequence: [
    {
      id: versoes.AdicionaSecoesEventosItens,
      up(props) {
        props.eventosExpandido = false
        props.eventosAoLado = false
        props.itensExpandido = false
        props.itensAoLado = false
      },
      down(props) {
        delete props.eventosExpandido
        delete props.eventosAoLado
        delete props.itensExpandido
        delete props.itensAoLado
      },
    },
    {
      id: versoes.AdicionaFonteEscala,
      up(props) {
        props.fonteEscala = 1
      },
      down(props) {
        delete props.fonteEscala
      },
    },
  ],
})
```

- [ ] **Step 3: Verificar build (ainda sem usar as props no render)**

Run: `npm run build`
Expected: pode acusar que o render não usa as novas flags — ok, o render é reescrito na Task 7. Se `noUnusedLocals` reclamar de `versoes`/imports, seguir direto para a Task 7 antes de comitar (as duas tasks formam um commit lógico). **Não comitar ainda** — comitar junto com a Task 7.

## Task 7: CenarioCardShape — render de 4 seções + largura + fonte

**Files:**
- Modify: `src/components/CenarioCardShape.tsx`

- [ ] **Step 1: Substituir o corpo de `CartaoCenario` pela versão com seções**

Importar no topo: `import { PAINEL_DESCRICAO_LARGURA, larguraDoCartao } from '../lib/cartaoCanvas'` (trocar o import atual de `ajustarLargura`), e `import { ControlesFonte } from './ControlesFonte'`.

Substituir a classe `onDoubleClick` e a função `CartaoCenario` inteiras por:

```tsx
// nº de seções (fora Descrição) em coluna própria
function contarAoLado(props: CenarioCardShapeType['props']): number {
  return [props.infoAoLado, props.eventosAoLado, props.itensAoLado].filter(Boolean).length
}

// largura do card conforme expandido + colunas ao lado (1 coluna base + N ao lado)
function larguraCenario(props: CenarioCardShapeType['props'], expandido: boolean): number {
  return expandido ? larguraDoCartao(CARD_LARGURA_PADRAO, 1 + contarAoLado(props)) : CARD_LARGURA_PADRAO
}
```

Em `CenarioCardShapeUtil`, trocar `onDoubleClick`:
```tsx
override onDoubleClick = (shape: CenarioCardShapeType) => {
  const expandir = !shape.props.expandido
  return {
    id: shape.id,
    type: shape.type,
    props: { expandido: expandir, w: larguraCenario(shape.props, expandir) },
  }
}
```

- [ ] **Step 2: Nova `CartaoCenario` com componente de seção genérico**

Substituir a função `CartaoCenario` por:
```tsx
type ChaveSecao = 'informacao' | 'eventos' | 'itens'

const SECOES: { chave: ChaveSecao; rotulo: string; semTexto: string }[] = [
  { chave: 'informacao', rotulo: 'Informações', semTexto: 'Sem informações' },
  { chave: 'eventos', rotulo: 'Eventos', semTexto: 'Sem eventos' },
  { chave: 'itens', rotulo: 'Itens', semTexto: 'Sem itens' },
]

// nomes das flags planas por seção (props do tldraw são planas, sem mapa aninhado)
const FLAGS: Record<ChaveSecao, { exp: keyof CenarioCardShapeType['props']; lado: keyof CenarioCardShapeType['props'] }> = {
  informacao: { exp: 'infoExpandido', lado: 'infoAoLado' },
  eventos: { exp: 'eventosExpandido', lado: 'eventosAoLado' },
  itens: { exp: 'itensExpandido', lado: 'itensAoLado' },
}

function CartaoCenario({ shape }: { shape: CenarioCardShapeType }) {
  const { cenarioId, expandido, fonteEscala } = shape.props
  const c = useApp((s) => s.cenarios[cenarioId])
  const vaultPath = useApp((s) => s.vaultPath)
  const salvarParcial = useApp((s) => s.salvarCenarioParcial)
  const editor = useEditor()

  const [editando, setEditando] = useState<'descricao' | ChaveSecao | null>(null)

  const retratoSrc = c?.retrato && vaultPath ? convertFileSrc(`${vaultPath}/${c.retrato}`) : null
  const [erroImg, setErroImg] = useState(false)
  useEffect(() => {
    setErroImg(false)
  }, [retratoSrc])

  // guard de scroll: rolar dentro de um painel não vira zoom/pan do canvas.
  // Um listener no card cobre todos os painéis (o nº deles é dinâmico agora).
  const cardRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = cardRef.current
    if (!el) return
    const aoRolar = (e: WheelEvent) => {
      const alvo = e.target as HTMLElement | null
      if (alvo?.closest('.char-card-painel')) e.stopPropagation()
    }
    el.addEventListener('wheel', aoRolar, { passive: true })
    return () => el.removeEventListener('wheel', aoRolar)
  }, [])

  if (!c) {
    return (
      <HTMLContainer className="char-card char-card-removido" style={{ pointerEvents: 'all' }}>
        <div className="char-card-nome">Cenário removido</div>
      </HTMLContainer>
    )
  }

  // uma seção (Informações / Eventos / Itens): header com toggles + conteúdo/editor.
  // Função de render (NÃO componente): devolve a árvore JSX direto, então digitar
  // no editor inline não remonta/perde foco a cada render do card.
  const renderSecao = (chave: ChaveSecao, rotulo: string, semTexto: string) => {
    const expSec = shape.props[FLAGS[chave].exp] as boolean
    const aoLado = shape.props[FLAGS[chave].lado] as boolean
    const html = c![chave]
    return (
      <div className="char-card-secao" key={chave}>
        <div className="char-card-secao-header">
          <button
            className="char-card-info-toggle"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() =>
              editor.updateShape<CenarioCardShapeType>({
                id: shape.id,
                type: 'cenario-card',
                props: { [FLAGS[chave].exp]: !expSec },
              })
            }
          >
            {expSec ? '▾' : '▸'} {rotulo}
          </button>
          <span className="char-card-secao-acoes">
            <button
              className="char-card-btn-editar"
              title={aoLado ? 'Mover para baixo' : 'Mover para a direita'}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => {
                const props = { ...shape.props, [FLAGS[chave].lado]: !aoLado }
                editor.updateShape<CenarioCardShapeType>({
                  id: shape.id,
                  type: 'cenario-card',
                  props: { [FLAGS[chave].lado]: !aoLado, w: larguraCenario(props, expandido) },
                })
              }}
            >
              {aoLado ? '↓' : '→'}
            </button>
            <button
              className="char-card-btn-editar"
              title="Editar aqui mesmo"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => {
                if (!expSec) {
                  editor.updateShape<CenarioCardShapeType>({
                    id: shape.id,
                    type: 'cenario-card',
                    props: { [FLAGS[chave].exp]: true },
                  })
                }
                setEditando(chave)
              }}
            >
              ✎
            </button>
          </span>
        </div>
        {expSec &&
          (editando === chave ? (
            <div className="char-card-editor" onPointerDown={(e) => e.stopPropagation()}>
              <EditorInline
                value={html}
                onChange={(h) => salvarParcial(cenarioId, { [chave]: h })}
                onBlur={() => setEditando(null)}
              />
            </div>
          ) : temConteudo(html) ? (
            <div className="char-card-descricao" dangerouslySetInnerHTML={{ __html: html }} />
          ) : (
            <div className="char-card-sem-descricao">{semTexto}</div>
          ))}
      </div>
    )
  }

  const empilhadas = SECOES.filter((s) => !(shape.props[FLAGS[s.chave].lado] as boolean))
  const aoLado = SECOES.filter((s) => shape.props[FLAGS[s.chave].lado] as boolean)

  return (
    <HTMLContainer ref={cardRef} className="char-card" style={{ pointerEvents: 'all', ['--card-fe' as any]: fonteEscala }}>
      <div className="char-card-principal">
        <div className="char-card-retrato">
          {retratoSrc && !erroImg ? (
            <img src={retratoSrc} alt={c.nome} draggable={false} onError={() => setErroImg(true)} />
          ) : (
            <span className="char-card-inicial">🗺</span>
          )}
        </div>
        <div className="char-card-texto">
          <div className="char-card-nome">{c.nome}</div>
          {c.resumo ? <div className="char-card-resumo">{c.resumo}</div> : null}
          <ControlesFonte
            escala={fonteEscala}
            onEscala={(v) =>
              editor.updateShape<CenarioCardShapeType>({
                id: shape.id,
                type: 'cenario-card',
                props: { fonteEscala: v },
              })
            }
          />
        </div>
      </div>
      {expandido && (
        <>
          <div className="char-card-painel" style={{ width: PAINEL_DESCRICAO_LARGURA }}>
            <div className="char-card-secao">
              <div className="char-card-secao-header">
                <span className="char-card-secao-titulo">Descrição</span>
                <button
                  className="char-card-btn-editar"
                  title="Editar descrição aqui mesmo"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => setEditando(editando === 'descricao' ? null : 'descricao')}
                >
                  ✎
                </button>
              </div>
              {editando === 'descricao' ? (
                <div className="char-card-editor" onPointerDown={(e) => e.stopPropagation()}>
                  <EditorInline
                    value={c.descricao}
                    onChange={(h) => salvarParcial(cenarioId, { descricao: h })}
                    onBlur={() => setEditando(null)}
                  />
                </div>
              ) : temConteudo(c.descricao) ? (
                <div className="char-card-descricao" dangerouslySetInnerHTML={{ __html: c.descricao }} />
              ) : (
                <div className="char-card-sem-descricao">Sem descrição</div>
              )}
            </div>
            {empilhadas.map((s) => renderSecao(s.chave, s.rotulo, s.semTexto))}
          </div>
          {aoLado.map((s) => (
            <div key={s.chave} className="char-card-painel" style={{ width: PAINEL_DESCRICAO_LARGURA }}>
              {renderSecao(s.chave, s.rotulo, s.semTexto)}
            </div>
          ))}
        </>
      )}
    </HTMLContainer>
  )
}
```

Observação: o guard de scroll de wheel (`cardRef` + listener) e o `ref={cardRef}` no `HTMLContainer` raiz já estão incluídos no bloco acima. Os `useRef`/`useEffect` de wheel por painel do código antigo devem ser removidos (substituídos pelo listener único).

- [ ] **Step 3: Verificar build**

Run: `npm run build`
Expected: sem erros. Se houver "unused import" de `ajustarLargura`, remover o import.

- [ ] **Step 4: Teste manual**

Run: `npm run dev`. Dropar um cenário → duplo clique expande → aparecem Descrição, Informações, Eventos, Itens. Alternar `→`/`↓` de Eventos/Itens: vira coluna própria / volta pra baixo, e o card alarga/estreita. Editar Eventos inline salva. A+/A− muda a fonte.

- [ ] **Step 5: Commit (junto com Task 6)**

```bash
git add src/components/CenarioCardShape.tsx
git commit -m "feat(cenarios): seções Eventos/Itens e escala de fonte no card do canvas"
```

# FEATURE 2 — Ctrl+C copia a imagem do card

## Task 8: Helper puro de armar imagem

**Files:**
- Create: `src/lib/imagemArmada.ts`
- Test: `src/test/imagemArmada.test.ts`

- [ ] **Step 1: Write the failing test**

`src/test/imagemArmada.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { armarImagem, imagemArmadaSrc, assinarImagemArmada } from '../lib/imagemArmada'

describe('imagemArmada', () => {
  beforeEach(() => armarImagem(null))

  it('guarda o src armado', () => {
    armarImagem('a.png')
    expect(imagemArmadaSrc()).toBe('a.png')
  })
  it('desarma com null', () => {
    armarImagem('a.png')
    armarImagem(null)
    expect(imagemArmadaSrc()).toBeNull()
  })
  it('notifica assinantes na mudança', () => {
    let n = 0
    const desassinar = assinarImagemArmada(() => { n += 1 })
    armarImagem('a.png')
    armarImagem(null)
    desassinar()
    armarImagem('b.png')
    expect(n).toBe(2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- imagemArmada`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Implement**

`src/lib/imagemArmada.ts`:
```typescript
/**
 * Rastreia qual imagem de card está "armada" para copiar (Ctrl+C). Estado de
 * módulo (sobrevive a remount de shapes que o tldraw desmonta fora da viewport).
 */
let srcArmado: string | null = null
const ouvintes = new Set<() => void>()

export function armarImagem(src: string | null): void {
  if (srcArmado === src) return
  srcArmado = src
  ouvintes.forEach((f) => f())
}

export function imagemArmadaSrc(): string | null {
  return srcArmado
}

export function assinarImagemArmada(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte)
  return () => ouvintes.delete(ouvinte)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- imagemArmada`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/imagemArmada.ts src/test/imagemArmada.test.ts
git commit -m "feat(canvas): tracker de imagem armada para copiar"
```

## Task 9: Helper de cópia para o clipboard

**Files:**
- Create: `src/lib/copiarImagem.ts`

- [ ] **Step 1: Implement (I/O; sem teste unitário — depende de canvas/clipboard do browser)**

`src/lib/copiarImagem.ts`:
```typescript
/**
 * Copia a imagem em `src` para o clipboard do SO como PNG.
 * Passa por Blob + createImageBitmap para evitar canvas "tainted" (o bitmap
 * vem de um Blob, sem origem de rede). Converte qualquer formato para PNG,
 * exigência do clipboard do browser.
 */
export async function copiarImagemParaClipboard(src: string): Promise<void> {
  const resp = await fetch(src)
  const blob = await resp.blob()
  const bitmap = await createImageBitmap(blob)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('sem contexto 2d')
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()
  const png = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob falhou'))), 'image/png'),
  )
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })])
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/copiarImagem.ts
git commit -m "feat(canvas): copiar imagem para o clipboard como PNG"
```

## Task 10: CardRetrato — retrato compartilhado + armar no clique

**Files:**
- Create: `src/components/CardRetrato.tsx`
- Modify: `src/components/CenarioCardShape.tsx`, `src/components/CharacterCardShape.tsx`

- [ ] **Step 1: Criar o componente**

`src/components/CardRetrato.tsx`:
```tsx
import { useEffect, useState, type ReactNode } from 'react'
import { armarImagem, imagemArmadaSrc, assinarImagemArmada } from '../lib/imagemArmada'

/**
 * Retrato do card (imagem ou fallback). Clicar na imagem a "arma" para Ctrl+C.
 * Compartilhado por cenário e personagem.
 */
export function CardRetrato({
  src,
  alt,
  fallback,
}: {
  src: string | null
  alt: string
  fallback: ReactNode
}) {
  const [erroImg, setErroImg] = useState(false)
  useEffect(() => {
    setErroImg(false)
  }, [src])

  // reflete se ESTA imagem é a armada (para o anel de seleção)
  const [armado, setArmado] = useState(false)
  useEffect(() => {
    const atualizar = () => setArmado(!!src && imagemArmadaSrc() === src)
    atualizar()
    return assinarImagemArmada(atualizar)
  }, [src])

  const mostrarImg = src && !erroImg
  return (
    <div className={`char-card-retrato${armado ? ' char-card-retrato--armado' : ''}`}>
      {mostrarImg ? (
        <img
          src={src}
          alt={alt}
          draggable={false}
          onError={() => setErroImg(true)}
          onClick={(e) => {
            e.stopPropagation()
            armarImagem(src)
          }}
        />
      ) : (
        fallback
      )}
    </div>
  )
}
```

- [ ] **Step 2: Usar no CharacterCardShape**

Em `CharacterCardShape.tsx`, importar `import { CardRetrato } from './CardRetrato'` e substituir o bloco:
```tsx
<div className="char-card-retrato">
  {retratoSrc && !erroImg ? (
    <img src={retratoSrc} alt={p.nome} draggable={false} onError={() => setErroImg(true)} />
  ) : (
    <span className="char-card-inicial">{p.nome.charAt(0).toUpperCase()}</span>
  )}
</div>
```
por:
```tsx
<CardRetrato
  src={retratoSrc}
  alt={p.nome}
  fallback={<span className="char-card-inicial">{p.nome.charAt(0).toUpperCase()}</span>}
/>
```
Remover o estado local `erroImg` e seu `useEffect` de reset (agora vivem no CardRetrato).

- [ ] **Step 3: Usar no CenarioCardShape**

Análogo: importar `CardRetrato` e trocar o bloco `.char-card-retrato` por:
```tsx
<CardRetrato
  src={retratoSrc}
  alt={c.nome}
  fallback={<span className="char-card-inicial">🗺</span>}
/>
```
Remover o `erroImg`/`useEffect` local de reset do CenarioCardShape.

- [ ] **Step 4: CSS do anel de armado**

Em `src/theme.css`, adicionar:
```css
.char-card-retrato--armado { outline: 2px solid var(--dourado-claro); outline-offset: -2px; }
```

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: sem erros; `erroImg` não referenciado sobra em nenhum dos dois cards.

- [ ] **Step 6: Commit**

```bash
git add src/components/CardRetrato.tsx src/components/CharacterCardShape.tsx src/components/CenarioCardShape.tsx src/theme.css
git commit -m "feat(canvas): CardRetrato compartilhado e armar imagem no clique"
```

## Task 11: Ctrl+C no canvas copia a imagem armada

**Files:**
- Modify: `src/components/CanvasView.tsx`

- [ ] **Step 1: Importar helpers**

No topo:
```tsx
import { armarImagem, imagemArmadaSrc } from '../lib/imagemArmada'
import { copiarImagemParaClipboard } from '../lib/copiarImagem'
```

- [ ] **Step 2: Estender o handler de teclado do onMount**

Dentro de `onMount`, no handler `aoTeclar` (fase capture), adicionar no início — antes do bloco do espaço:
```tsx
// Ctrl/Cmd+C com uma imagem de card armada: copia a imagem (não o shape)
if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C')) {
  const src = imagemArmadaSrc()
  if (src) {
    e.preventDefault()
    e.stopPropagation()
    copiarImagemParaClipboard(src).catch((err) =>
      console.error('Falha ao copiar imagem:', err),
    )
  }
  return
}
```

- [ ] **Step 3: Desarmar ao clicar fora da imagem**

Ainda no `onMount`, após registrar o `keydown`, adicionar um `pointerdown` em fase capture no container que desarma quando o alvo não é uma imagem de retrato:
```tsx
const aoApontar = (e: PointerEvent) => {
  const alvo = e.target as HTMLElement | null
  if (!alvo?.closest('.char-card-retrato img')) armarImagem(null)
}
container.addEventListener('pointerdown', aoApontar, { capture: true })
```
E no cleanup retornado, remover também esse listener:
```tsx
return () => {
  container.removeEventListener('keydown', aoTeclar, { capture: true })
  container.removeEventListener('pointerdown', aoApontar, { capture: true })
}
```

- [ ] **Step 4: Build + teste manual**

Run: `npm run build` (sem erros).
Run: `npm run dev`. Clicar na imagem de um card (aparece o anel) → Ctrl+C → colar em app externo (ex.: Paint/Word/chat) → imagem colada. Clicar em outro ponto do canvas → anel some (desarmado).

- [ ] **Step 5: Commit**

```bash
git add src/components/CanvasView.tsx
git commit -m "feat(canvas): Ctrl+C copia a imagem do card armada"
```

---

# FEATURE 1 — Setas automáticas por hierarquia (pai→filho)

## Task 12: pai do cenário na árvore

**Files:**
- Modify: `src/lib/cenarioArvore.ts`
- Test: `src/test/cenarioArvore.test.ts` (já existe — adicionar casos)

- [ ] **Step 1: Write the failing test**

Adicionar em `src/test/cenarioArvore.test.ts` (usar o mesmo helper de montagem de árvore já existente no arquivo; se não houver, montar um `PastaCenarioNode` inline como abaixo):
```typescript
import { paiDoCenario } from '../lib/cenarioArvore'
import type { PastaCenarioNode } from '../lib/types'

function no(id: string, filhos: any[] = []) {
  return { id, slug: id, nome: id, caminho: id, filhos }
}
const arvore: PastaCenarioNode = {
  slug: 'raiz', nome: 'raiz', caminho: 'cenarios', subpastas: [],
  cenarios: [no('a', [no('b', [no('c')])]), no('d')],
}

describe('paiDoCenario', () => {
  it('acha o pai de um filho', () => {
    expect(paiDoCenario(arvore, 'b')).toBe('a')
  })
  it('acha o pai de um neto', () => {
    expect(paiDoCenario(arvore, 'c')).toBe('b')
  })
  it('retorna null para raiz', () => {
    expect(paiDoCenario(arvore, 'a')).toBeNull()
  })
  it('retorna null para id inexistente', () => {
    expect(paiDoCenario(arvore, 'zzz')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- cenarioArvore`
Expected: FAIL — `paiDoCenario is not a function`.

- [ ] **Step 3: Implement**

Adicionar em `src/lib/cenarioArvore.ts`:
```typescript
/** Id do pai de um cenário na árvore, ou null se for raiz / não existir. */
export function paiDoCenario(raiz: PastaCenarioNode, id: string): string | null {
  let resultado: string | null = null
  const visitar = (nos: CenarioNode[]): boolean => {
    for (const n of nos) {
      if (n.filhos.some((f) => f.id === id)) {
        resultado = n.id
        return true
      }
      if (visitar(n.filhos)) return true
    }
    return false
  }
  const nasPastas = (p: PastaCenarioNode): boolean => {
    if (visitar(p.cenarios)) return true
    for (const sub of p.subpastas) if (nasPastas(sub)) return true
    return false
  }
  nasPastas(raiz)
  return resultado
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- cenarioArvore`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cenarioArvore.ts src/test/cenarioArvore.test.ts
git commit -m "feat(cenarios): paiDoCenario na árvore"
```

## Task 13: pares a ligar (lógica pura)

**Files:**
- Create: `src/lib/ligacaoCenario.ts`
- Test: `src/test/ligacaoCenario.test.ts`

- [ ] **Step 1: Write the failing test**

`src/test/ligacaoCenario.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { paresParaLigar } from '../lib/ligacaoCenario'
import type { PastaCenarioNode } from '../lib/types'

function no(id: string, filhos: any[] = []) {
  return { id, slug: id, nome: id, caminho: id, filhos }
}
const arvore: PastaCenarioNode = {
  slug: 'raiz', nome: 'raiz', caminho: 'cenarios', subpastas: [],
  cenarios: [no('a', [no('b', [no('c')]), no('d')])],
}

describe('paresParaLigar', () => {
  it('cenário do meio liga ao pai e aos filhos', () => {
    expect(paresParaLigar(arvore, 'b')).toEqual([
      { paiId: 'a', filhoId: 'b' },
      { paiId: 'b', filhoId: 'c' },
    ])
  })
  it('raiz liga só aos filhos', () => {
    expect(paresParaLigar(arvore, 'a')).toEqual([
      { paiId: 'a', filhoId: 'b' },
      { paiId: 'a', filhoId: 'd' },
    ])
  })
  it('folha liga só ao pai', () => {
    expect(paresParaLigar(arvore, 'c')).toEqual([{ paiId: 'b', filhoId: 'c' }])
  })
  it('id inexistente não gera pares', () => {
    expect(paresParaLigar(arvore, 'zzz')).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- ligacaoCenario`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Implement**

`src/lib/ligacaoCenario.ts`:
```typescript
import type { PastaCenarioNode } from './types'
import { encontrarCenarioNode, paiDoCenario } from './cenarioArvore'

/** Par de ligação pai→filho no canvas. */
export interface ParLigacao {
  paiId: string
  filhoId: string
}

/**
 * Pares pai→filho que envolvem `cenarioId`: o vínculo com o pai (se houver) e
 * um vínculo por filho direto. Usado ao dropar um cenário para religar aos
 * cards já presentes no canvas.
 */
export function paresParaLigar(raiz: PastaCenarioNode, cenarioId: string): ParLigacao[] {
  const pares: ParLigacao[] = []
  const pai = paiDoCenario(raiz, cenarioId)
  if (pai) pares.push({ paiId: pai, filhoId: cenarioId })
  const node = encontrarCenarioNode(raiz, cenarioId)
  if (node) for (const f of node.filhos) pares.push({ paiId: cenarioId, filhoId: f.id })
  return pares
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- ligacaoCenario`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ligacaoCenario.ts src/test/ligacaoCenario.test.ts
git commit -m "feat(cenarios): paresParaLigar (hierarquia -> setas)"
```

## Task 14: criar as setas no drop

**Files:**
- Modify: `src/components/CanvasView.tsx`

- [ ] **Step 1: Importar**

No topo:
```tsx
import { paresParaLigar } from '../lib/ligacaoCenario'
import type { TLShapeId } from 'tldraw'
```

- [ ] **Step 2: Adicionar as funções de I/O (nível de módulo, acima de `CanvasView`)**

```tsx
/** True se já existe uma seta ligando os shapes `a` e `b` (qualquer direção). */
function existeSetaEntre(editor: Editor, a: TLShapeId, b: TLShapeId): boolean {
  for (const bind of editor.getBindingsToShape(a, 'arrow')) {
    const bindsDoArrow = editor.getBindingsFromShape(bind.fromId, 'arrow')
    if (bindsDoArrow.some((x) => x.toId === b)) return true
  }
  return false
}

/** Cria uma seta pai→filho com bindings (segue os cards ao mover). */
function criarSetaHierarquia(editor: Editor, paiShape: TLShapeId, filhoShape: TLShapeId) {
  const arrowId = createShapeId()
  editor.createShape({ id: arrowId, type: 'arrow', x: 0, y: 0 })
  editor.createBindings([
    {
      type: 'arrow',
      fromId: arrowId,
      toId: paiShape,
      props: { terminal: 'start', normalizedAnchor: { x: 0.5, y: 0.5 }, isPrecise: false, isExact: false, snap: 'none' },
    },
    {
      type: 'arrow',
      fromId: arrowId,
      toId: filhoShape,
      props: { terminal: 'end', normalizedAnchor: { x: 0.5, y: 0.5 }, isPrecise: false, isExact: false, snap: 'none' },
    },
  ])
}

/** Liga o cenário recém-dropado aos cards de pai/filhos já presentes no canvas. */
function ligarCenarioNoCanvas(editor: Editor, raiz: PastaCenarioNode, cenarioId: string) {
  const cardsPorCenario = new Map<string, TLShapeId[]>()
  for (const s of editor.getCurrentPageShapes()) {
    if (s.type !== 'cenario-card') continue
    const cid = (s as CenarioCardShapeType).props.cenarioId
    const lista = cardsPorCenario.get(cid) ?? []
    lista.push(s.id)
    cardsPorCenario.set(cid, lista)
  }
  for (const { paiId, filhoId } of paresParaLigar(raiz, cenarioId)) {
    for (const ps of cardsPorCenario.get(paiId) ?? []) {
      for (const fs of cardsPorCenario.get(filhoId) ?? []) {
        if (!existeSetaEntre(editor, ps, fs)) criarSetaHierarquia(editor, ps, fs)
      }
    }
  }
}
```

Adicionar `PastaCenarioNode` ao import de tipos: `import type { PastaCenarioNode } from '../lib/types'` (verificar se já não está importado via outro caminho).

- [ ] **Step 3: Chamar após criar o card de cenário no drop**

No `onDropCapture`, no ramo `if (cenarioId) { ... }`, logo após `editorAtual.createShape({... type: 'cenario-card' ...})`, adicionar:
```tsx
const raiz = useApp.getState().tree?.cenarios
if (raiz) ligarCenarioNoCanvas(editorAtual, raiz, cenarioId)
```

- [ ] **Step 4: Build + teste manual**

Run: `npm run build` (sem erros).
Run: `npm run dev`.
- Montar na sidebar uma hierarquia (ex.: Oxonia > Distrito > Rua > Casa).
- Dropar Oxonia, depois Distrito → seta Oxonia→Distrito aparece e segue ao arrastar.
- Dropar Casa por último → liga ao pai (Rua) se presente.
- Apagar uma seta (selecionar + Delete) e dropar o mesmo filho de novo → religa (não duplica se a seta ainda existir).
- Desenhar seta manual com a ferramenta de seta do tldraw → funciona (nativo).

- [ ] **Step 5: Commit**

```bash
git add src/components/CanvasView.tsx
git commit -m "feat(cenarios): setas automáticas por hierarquia ao dropar no canvas"
```

---

## Verificação final

- [ ] `npm run test` — toda a suíte passa (novos: escalaFonte, cartaoCanvas, imagemArmada, cenarioArvore, ligacaoCenario).
- [ ] `npm run build` — tsc sem erros.
- [ ] `npm run dev` — smoke test das 4 features (F1 setas, F2 Ctrl+C, F3 seções, F5 A±).
- [ ] Reabrir um canvas salvo antes das mudanças → migrations aplicam defaults, nada quebra.

## Notas de risco

- **F2 clipboard/fetch:** depende do asset protocol do Tauri (`scope: ["**"]`, já habilitado) permitir `fetch` do `convertFileSrc(...)`. Se `fetch` falhar no WebView, trocar o início de `copiarImagemParaClipboard` por leitura de bytes via `fsBridge`/repo montando o Blob (o resto do pipeline não muda). `navigator.clipboard.write` exige contexto seguro — WebView2 atende.
- **F1 múltiplos cards do mesmo cenário:** liga a todos; raro e sem efeito colateral grave.
- **F3 largura:** `larguraCenario` recalcula sempre a partir das flags atuais; não acumula erro como o `ajustarLargura` incremental.
