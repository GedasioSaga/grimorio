import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import Image from '@tiptap/extension-image'
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from '@tiptap/react'
import { convertFileSrc } from '@tauri-apps/api/core'
import { useApp } from '../state/store'
import { caminhoAbsolutoImagem } from '../lib/caminhos'
import { calcularLarguraPct } from '../lib/imagem'

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
  // arquivo referenciado pode não existir no cofre atual (cofre é portável entre PCs)
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

  function iniciarResize(e: ReactMouseEvent, lado: 'esq' | 'dir') {
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

/**
 * Imagem de página: guarda só `data-rel` (caminho relativo ao cofre) no HTML salvo,
 * nunca o caminho absoluto da máquina (portável entre PCs). O src exibível é
 * calculado em tempo de render a partir do vaultPath atual.
 */
export const ImagemCofre = Image.extend({
  name: 'image',
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
  // HTML salvo é `<img data-rel="...">` sem `src`; o parseHTML padrão do Image exige
  // `img[src]` e não casaria — casamos por `data-rel` para o round-trip da página.
  parseHTML() {
    return [{ tag: 'img[data-rel]' }]
  },
  // desabilita o atalho markdown `![alt](url)` do Image base: criaria um node sem `rel`
  // (renderiza quebrado e some ao reabrir, pois parseHTML só casa `img[data-rel]`).
  // Imagens deste node entram só via insertContent com `rel`, vindas do cofre.
  addInputRules() {
    return []
  },
  addNodeView() {
    return ReactNodeViewRenderer(ImagemView)
  },
})
