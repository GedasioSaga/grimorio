# Imagem nas Notas — legenda, resize, presets, alinhamento (Fase 1) — Plano

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans para implementar tarefa a tarefa. Steps usam checkbox (`- [ ]`).

**Goal:** No editor de Notas, permitir redimensionar imagem (alças nos cantos, proporção travada), legenda inline opcional, presets 25/50/100% e alinhamento esq/centro/dir — tudo no node `ImagemCofre` já existente.

**Architecture:** Novos atributos `largura` (% da coluna), `align`, `legenda` no node `ImagemCofre`, serializados via `data-*` (round-trip HTML). NodeView React ganha alças de resize, mini-barra flutuante (presets+align) e campo de legenda, visíveis quando a imagem está selecionada. Largura pura calculada por helper testável.

**Tech Stack:** TipTap 3 (`@tiptap/extension-image`, `@tiptap/core`, `@tiptap/react`), React 19, Vitest 4 (+ jsdom por-arquivo), CSS em `theme.css`.

Spec: `docs/superpowers/specs/2026-07-14-imagem-legenda-resize-design.md`

---

## File Structure

- **Create** `grimorio/src/lib/imagem.ts` — `calcularLarguraPct` (lógica pura, sem DOM/React).
- **Create** `grimorio/src/test/imagemCofre.test.ts` — jsdom: round-trip HTML dos novos attrs, retrocompat, e `calcularLarguraPct`.
- **Modify** `grimorio/src/components/ImagemCofre.tsx` — atributos `largura`/`align`/`legenda` (parse/render) + NodeView (alças, mini-barra, legenda, seleção).
- **Modify** `grimorio/src/theme.css` — substituir regra `.nota-img img` e adicionar estilos de frame/alças/barra/legenda.

---

### Task 1: Helper puro `calcularLarguraPct`

**Files:**
- Create: `grimorio/src/lib/imagem.ts`
- Test: `grimorio/src/test/imagemCofre.test.ts` (bloco `calcularLarguraPct`)

- [ ] **Step 1: Escrever o teste que falha** (parte de `src/test/imagemCofre.test.ts`)

```ts
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { calcularLarguraPct } from '../lib/imagem'

describe('calcularLarguraPct', () => {
  it('converte px para % da coluna', () => {
    expect(calcularLarguraPct(400, 0, 800)).toBe(50)
  })
  it('arrastar pra fora aumenta a largura', () => {
    expect(calcularLarguraPct(400, 400, 800)).toBe(100)
  })
  it('trava no mínimo (10%)', () => {
    expect(calcularLarguraPct(400, -1000, 800)).toBe(10)
  })
  it('trava no teto (100%)', () => {
    expect(calcularLarguraPct(700, 400, 800)).toBe(100)
  })
  it('container inválido retorna 100', () => {
    expect(calcularLarguraPct(400, 0, 0)).toBe(100)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd grimorio && npx vitest run src/test/imagemCofre.test.ts`
Expected: FAIL — `Failed to resolve import '../lib/imagem'`.

- [ ] **Step 3: Implementar** `src/lib/imagem.ts`

```ts
/**
 * Nova largura da imagem em % da coluna, a partir da largura inicial (px),
 * do deslocamento do mouse (px, já com sinal do lado arrastado) e da largura
 * do container (px). Trava entre `minPct` e 100.
 */
export function calcularLarguraPct(
  inicialPx: number,
  deltaPx: number,
  containerPx: number,
  minPct = 10,
): number {
  if (containerPx <= 0) return 100
  const pct = ((inicialPx + deltaPx) / containerPx) * 100
  return Math.max(minPct, Math.min(100, Math.round(pct)))
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd grimorio && npx vitest run src/test/imagemCofre.test.ts`
Expected: PASS (bloco calcularLarguraPct).

- [ ] **Step 5: Commit**

```bash
git add grimorio/src/lib/imagem.ts grimorio/src/test/imagemCofre.test.ts
git commit -m "feat(notas): helper calcularLarguraPct (TDD)"
```

---

### Task 2: Atributos do node + round-trip HTML

**Files:**
- Modify: `grimorio/src/components/ImagemCofre.tsx` (addAttributes)
- Test: `grimorio/src/test/imagemCofre.test.ts` (bloco round-trip)

- [ ] **Step 1: Adicionar os testes de round-trip** (topo do arquivo de teste, junto ao bloco existente)

```ts
import { generateJSON, generateHTML } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { ImagemCofre } from '../components/ImagemCofre'

const extensions = [StarterKit, ImagemCofre]
const roundTrip = (html: string) => generateHTML(generateJSON(html, extensions), extensions)

describe('ImagemCofre round-trip HTML', () => {
  it('preserva data-largura, data-align e data-legenda', () => {
    const out = roundTrip(
      '<img data-rel="imagens-notas/ab12.png" data-largura="50" data-align="center" data-legenda="Mapa da cidade">',
    )
    expect(out).toContain('data-rel="imagens-notas/ab12.png"')
    expect(out).toContain('data-largura="50"')
    expect(out).toContain('data-align="center"')
    expect(out).toContain('data-legenda="Mapa da cidade"')
  })
  it('imagem antiga sem novos attrs continua válida (retrocompat)', () => {
    const out = roundTrip('<img data-rel="imagens-notas/old.png">')
    expect(out).toContain('data-rel="imagens-notas/old.png"')
    expect(out).not.toContain('data-largura')
    expect(out).not.toContain('data-align')
    expect(out).not.toContain('data-legenda')
  })
  it('nunca serializa src', () => {
    expect(roundTrip('<img data-rel="imagens-notas/ab12.png">')).not.toContain('src=')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd grimorio && npx vitest run src/test/imagemCofre.test.ts`
Expected: FAIL — round-trip não contém `data-largura`/`data-align`/`data-legenda` (atributos ainda não existem).

- [ ] **Step 3: Adicionar atributos em `ImagemCofre.tsx`** — substituir o `addAttributes()` atual por:

```ts
  addAttributes() {
    return {
      // mantém alt/title/width/height do Image base (todos portáveis)
      ...this.parent?.(),
      rel: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-rel'),
        renderHTML: (attrs: { rel?: string | null }) => (attrs.rel ? { 'data-rel': attrs.rel } : {}),
      },
      largura: {
        default: null,
        parseHTML: (el: HTMLElement) => {
          const v = el.getAttribute('data-largura')
          return v ? Number(v) : null
        },
        renderHTML: (attrs: { largura?: number | null }) =>
          attrs.largura != null ? { 'data-largura': String(attrs.largura) } : {},
      },
      align: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-align'),
        renderHTML: (attrs: { align?: string | null }) =>
          attrs.align ? { 'data-align': attrs.align } : {},
      },
      legenda: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-legenda'),
        renderHTML: (attrs: { legenda?: string | null }) =>
          attrs.legenda ? { 'data-legenda': attrs.legenda } : {},
      },
      // neutraliza `src`: precisa vir DEPOIS do spread para sobrescrever o do Image
      // base e nunca serializar o caminho absoluto da máquina no HTML salvo.
      src: { default: null, renderHTML: () => ({}) },
    }
  },
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd grimorio && npx vitest run src/test/imagemCofre.test.ts`
Expected: PASS (round-trip + retrocompat + calcularLarguraPct).

- [ ] **Step 5: Commit**

```bash
git add grimorio/src/components/ImagemCofre.tsx grimorio/src/test/imagemCofre.test.ts
git commit -m "feat(notas): atributos largura/align/legenda na imagem com round-trip HTML (TDD)"
```

---

### Task 3: NodeView — resize, mini-barra, legenda, seleção

**Files:**
- Modify: `grimorio/src/components/ImagemCofre.tsx` (imports + componente `ImagemView`)

Sem teste unitário (UI de drag/seleção): validado por `tsc` (build) + verificação manual na Task 5.

- [ ] **Step 1: Trocar os imports do topo** de `ImagemCofre.tsx`:

```ts
import { useEffect, useRef, useState } from 'react'
import Image from '@tiptap/extension-image'
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from '@tiptap/react'
import { convertFileSrc } from '@tauri-apps/api/core'
import { useApp } from '../state/store'
import { caminhoAbsolutoImagem } from '../lib/caminhos'
import { calcularLarguraPct } from '../lib/imagem'
```

- [ ] **Step 2: Substituir a função `ImagemView` inteira** por:

```tsx
type Align = 'left' | 'center' | 'right'
const PRESETS = [25, 50, 100] as const
const ALINHAMENTOS: { valor: Align; rotulo: string }[] = [
  { valor: 'left', rotulo: '⬅' },
  { valor: 'center', rotulo: '⬍' },
  { valor: 'right', rotulo: '➡' },
]

function ImagemView(props: ReactNodeViewProps) {
  const vaultPath = useApp((s) => s.vaultPath)
  const rel = (props.node.attrs.rel as string | null) ?? null
  const alt = (props.node.attrs.alt as string | null) ?? ''
  const legenda = (props.node.attrs.legenda as string | null) ?? ''
  const largura = (props.node.attrs.largura as number | null) ?? null
  const align = (props.node.attrs.align as Align | null) ?? 'left'
  const src = rel && vaultPath ? convertFileSrc(caminhoAbsolutoImagem(vaultPath, rel)) : ''
  const [erroImg, setErroImg] = useState(false)
  const frameRef = useRef<HTMLDivElement>(null)
  const atualizar = props.updateAttributes as (attrs: Record<string, unknown>) => void

  useEffect(() => {
    setErroImg(false)
  }, [src])

  function selecionar() {
    const pos = typeof props.getPos === 'function' ? props.getPos() : null
    if (pos != null) props.editor.commands.setNodeSelection(pos)
  }

  function iniciarResize(e: React.MouseEvent, lado: 'esq' | 'dir') {
    e.preventDefault()
    e.stopPropagation()
    const frame = frameRef.current
    if (!frame) return
    const container = frame.parentElement
    const containerPx = (container ?? frame).getBoundingClientRect().width
    const inicialPx = frame.getBoundingClientRect().width
    const startX = e.clientX
    const dir = lado === 'dir' ? 1 : -1
    const onMove = (ev: MouseEvent) => {
      const pct = calcularLarguraPct(inicialPx, (ev.clientX - startX) * dir, containerPx)
      frame.style.width = pct + '%'
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      const pct = Math.round(parseFloat(frame.style.width))
      if (!Number.isNaN(pct)) atualizar({ largura: pct })
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  const estiloFrame = largura != null ? { width: largura + '%' } : undefined

  return (
    <NodeViewWrapper as="div" className="nota-img" data-align={align}>
      <div className="nota-img-frame" ref={frameRef} style={estiloFrame}>
        {src && !erroImg ? (
          <img
            src={src}
            draggable
            onClick={selecionar}
            onDragStart={(e) => {
              if (rel) e.dataTransfer.setData('application/x-grimorio-imagem', rel)
            }}
            onError={() => setErroImg(true)}
            alt={alt}
          />
        ) : (
          <span className="nota-img-faltando">imagem não encontrada</span>
        )}

        {props.selected && src && !erroImg && (
          <>
            <div className="nota-img-barra" contentEditable={false} onMouseDown={(e) => e.preventDefault()}>
              {PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  className={largura === p ? 'ativo' : ''}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => atualizar({ largura: p })}
                >
                  {p}%
                </button>
              ))}
              <span className="sep" />
              {ALINHAMENTOS.map((a) => (
                <button
                  key={a.valor}
                  type="button"
                  className={align === a.valor ? 'ativo' : ''}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => atualizar({ align: a.valor })}
                >
                  {a.rotulo}
                </button>
              ))}
            </div>
            <span className="nota-img-alca canto-no" onMouseDown={(e) => iniciarResize(e, 'esq')} />
            <span className="nota-img-alca canto-ne" onMouseDown={(e) => iniciarResize(e, 'dir')} />
            <span className="nota-img-alca canto-so" onMouseDown={(e) => iniciarResize(e, 'esq')} />
            <span className="nota-img-alca canto-se" onMouseDown={(e) => iniciarResize(e, 'dir')} />
          </>
        )}

        {props.selected ? (
          <textarea
            className="nota-legenda-input"
            value={legenda}
            placeholder="escreva uma legenda…"
            rows={1}
            onMouseDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            onChange={(e) => atualizar({ legenda: e.target.value ? e.target.value : null })}
            onInput={(e) => {
              const t = e.currentTarget
              t.style.height = 'auto'
              t.style.height = t.scrollHeight + 'px'
            }}
          />
        ) : legenda ? (
          <figcaption className="nota-legenda">{legenda}</figcaption>
        ) : null}
      </div>
    </NodeViewWrapper>
  )
}
```

- [ ] **Step 3: Verificar tipos/build**

Run: `cd grimorio && npx tsc --noEmit`
Expected: sem erros. (Se `updateAttributes`/`getPos` reclamarem de tipo, o cast `atualizar` e o guard `typeof props.getPos === 'function'` já cobrem.)

- [ ] **Step 4: Rodar testes (garantir que nada quebrou)**

Run: `cd grimorio && npx vitest run`
Expected: PASS em tudo.

- [ ] **Step 5: Commit**

```bash
git add grimorio/src/components/ImagemCofre.tsx
git commit -m "feat(notas): NodeView de imagem com resize por alcas, presets, alinhamento e legenda"
```

---

### Task 4: CSS

**Files:**
- Modify: `grimorio/src/theme.css`

- [ ] **Step 1: Substituir a linha 227** (`​.nota-img img { ... }`) por todo o bloco abaixo:

```css
.nota-img { position: relative; display: flex; flex-direction: column; margin: 10px 0; }
.nota-img[data-align="left"] { align-items: flex-start; }
.nota-img[data-align="center"] { align-items: center; }
.nota-img[data-align="right"] { align-items: flex-end; }
.nota-img-frame { position: relative; display: inline-block; max-width: 100%; line-height: 0; }
.nota-img-frame img { display: block; width: 100%; height: auto; border-radius: 4px; border: 1px solid var(--borda); cursor: grab; }
.ProseMirror-selectednode .nota-img-frame img { outline: 2px solid var(--dourado); }
.nota-img-alca { position: absolute; width: 12px; height: 12px; background: var(--dourado); border: 1px solid var(--fundo); border-radius: 2px; z-index: 2; }
.canto-no { top: -6px; left: -6px; cursor: nwse-resize; }
.canto-ne { top: -6px; right: -6px; cursor: nesw-resize; }
.canto-so { bottom: -6px; left: -6px; cursor: nesw-resize; }
.canto-se { bottom: -6px; right: -6px; cursor: nwse-resize; }
.nota-img-barra { position: absolute; top: -34px; left: 50%; transform: translateX(-50%); display: flex; gap: 2px; align-items: center; padding: 3px 5px; background: var(--fundo-elevado); border: 1px solid var(--borda); border-radius: 6px; z-index: 3; white-space: nowrap; }
.nota-img-barra button { font-size: 11px; padding: 2px 6px; line-height: 1.2; }
.nota-img-barra button.ativo { border-color: var(--dourado); color: var(--dourado-claro); }
.nota-img-barra .sep { width: 1px; height: 16px; background: var(--borda); margin: 0 3px; }
.nota-legenda, .nota-legenda-input { margin-top: 6px; width: 100%; text-align: center; color: var(--texto-fraco); font-size: 13px; font-style: italic; box-sizing: border-box; }
.nota-legenda-input { background: transparent; border: none; resize: none; outline: none; font-family: inherit; overflow: hidden; padding: 0; }
.nota-legenda-input::placeholder { color: var(--texto-fraco); opacity: 0.6; }
```

- [ ] **Step 2: Build**

Run: `cd grimorio && npx vitest run && npx tsc --noEmit`
Expected: PASS / sem erros.

- [ ] **Step 3: Commit**

```bash
git add grimorio/src/theme.css
git commit -m "style(notas): estilos de resize/alinhamento/legenda da imagem"
```

---

### Task 5: Verificação manual (no app)

- [ ] **Step 1:** `cd grimorio && npm run tauri dev`
- [ ] **Step 2:** Abrir uma Nota, inserir imagem (botão 🖼 ou Ctrl+V).
- [ ] **Step 3:** Clicar na imagem → aparecem alças, mini-barra e campo de legenda.
- [ ] **Step 4:** Arrastar canto → redimensiona sem distorcer; presets 25/50/100 mudam largura; esq/centro/dir movem a imagem na coluna.
- [ ] **Step 5:** Digitar legenda; clicar fora → some se vazia, permanece se tiver texto.
- [ ] **Step 6:** Verificar que arrastar o corpo da imagem pro canvas ainda funciona.
- [ ] **Step 7:** Fechar e reabrir a nota → largura/align/legenda persistem.

---

## Self-Review

**Spec coverage:** resize cantos+proporção (Task 3, `iniciarResize` só muda largura, altura auto) ✓; legenda inline opcional (Task 3, textarea/figcaption) ✓; presets 25/50/100 (Task 3) ✓; alinhamento (Task 3) ✓; largura em % + round-trip data-* (Task 2) ✓; retrocompat (Task 2 teste) ✓; testes vitest+jsdom (Tasks 1-2) ✓; verificação manual (Task 5) ✓; não-escopo colunas/legenda-rica/PerfilModal — não tocados ✓.

**Placeholder scan:** sem TBD/TODO; todo código presente.

**Type consistency:** `calcularLarguraPct(inicialPx, deltaPx, containerPx, minPct?)` idêntico em Task 1 e uso em Task 3; `atualizar` cast usado uniformemente; attrs `largura:number|null`, `align:string|null`, `legenda:string|null` consistentes entre addAttributes (Task 2) e leitura no NodeView (Task 3); classes CSS (`nota-img-frame`, `nota-img-alca`, `canto-*`, `nota-img-barra`, `nota-legenda*`) batem entre Task 3 e Task 4.
