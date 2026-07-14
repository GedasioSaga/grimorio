import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import Image from '@tiptap/extension-image'
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from '@tiptap/react'
import { convertFileSrc } from '@tauri-apps/api/core'
import { useApp } from '../state/store'
import { caminhoAbsolutoImagem } from '../lib/caminhos'
import { calcularLarguraPct } from '../lib/imagem'

type Align = 'left' | 'center' | 'right'
const PRESETS = [25, 50, 100] as const
const ALINHAMENTOS: { valor: Align; rotulo: string; titulo: string }[] = [
  { valor: 'left', rotulo: '⬅', titulo: 'Imagem à esquerda, texto flui à direita' },
  { valor: 'center', rotulo: '⬛', titulo: 'Centralizada, texto acima e abaixo' },
  { valor: 'right', rotulo: '➡', titulo: 'Imagem à direita, texto flui à esquerda' },
]

function ImagemView(props: ReactNodeViewProps) {
  const vaultPath = useApp((s) => s.vaultPath)
  const rel = (props.node.attrs.rel as string | null) ?? null
  const alt = (props.node.attrs.alt as string | null) ?? ''
  const legenda = (props.node.attrs.legenda as string | null) ?? ''
  const largura = (props.node.attrs.largura as number | null) ?? null
  const align = (props.node.attrs.align as Align | null) ?? 'center'
  const src = rel && vaultPath ? convertFileSrc(caminhoAbsolutoImagem(vaultPath, rel)) : ''
  // [DEBUG-TEMP] diagnóstico da Fase 1 — remover após confirmar
  console.debug('[imagem] render', { selected: props.selected, largura, align, legenda, attrs: props.node.attrs })
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
    const wrapper = frame?.parentElement
    if (!frame || !wrapper) return
    // referência = largura da coluna de texto (raiz do ProseMirror), estável mesmo
    // quando a imagem flutua — o pai imediato passa a ter a largura da própria imagem.
    const containerPx = props.editor.view.dom.clientWidth
    const inicialPx = frame.getBoundingClientRect().width
    const startX = e.clientX
    const dir = lado === 'dir' ? 1 : -1
    const onMove = (ev: MouseEvent) => {
      const pct = calcularLarguraPct(inicialPx, (ev.clientX - startX) * dir, containerPx)
      wrapper.style.width = pct + '%'
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      const pct = Math.round(parseFloat(wrapper.style.width))
      if (!Number.isNaN(pct)) atualizar({ largura: pct })
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  // largura vive no wrapper (.nota-img): float precisa de largura definida na coluna,
  // senão o `%` do frame resolve contra um pai encolhido e quebra o layout.
  const estiloWrapper = largura != null ? { width: largura + '%' } : undefined

  return (
    <NodeViewWrapper as="div" className="nota-img" data-align={align} style={estiloWrapper}>
      <div className="nota-img-frame" ref={frameRef}>
        {src && !erroImg ? (
          <img
            src={src}
            draggable
            // seleciona no mousedown: como a imagem é `draggable`, um clique com
            // micro-movimento vira dragstart e o onClick nunca dispara — aí a
            // barra/alças/legenda não apareciam ("às vezes clico e não abre").
            onMouseDown={selecionar}
            onClick={selecionar}
            onDragStart={(e) => {
              if (rel) e.dataTransfer.setData('application/x-grimorio-imagem', rel)
              console.log('[DND-TEMP] dragstart rel=', rel, 'types=', Array.from(e.dataTransfer.types)) // [DEBUG-TEMP] remover
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
                  onClick={() => { console.debug('[imagem] preset', p); atualizar({ largura: p }) }}
                >
                  {p}%
                </button>
              ))}
              <span className="sep" />
              {ALINHAMENTOS.map((a) => (
                <button
                  key={a.valor}
                  type="button"
                  title={a.titulo}
                  className={align === a.valor ? 'ativo' : ''}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { console.debug('[imagem] align', a.valor); atualizar({ align: a.valor }) }}
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
      </div>

      {/* legenda FORA do frame: assim o frame (contexto das alças) delimita só a
          imagem e as alças de baixo ficam na base da imagem, não abaixo da legenda. */}
      {props.selected ? (
        <textarea
          className="nota-legenda-input"
          value={legenda}
          placeholder="escreva uma legenda…"
          rows={1}
          onMouseDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          onChange={(e) => { console.debug('[imagem] legenda', e.target.value); atualizar({ legenda: e.target.value ? e.target.value : null }) }}
          onInput={(e) => {
            const t = e.currentTarget
            t.style.height = 'auto'
            t.style.height = t.scrollHeight + 'px'
          }}
        />
      ) : legenda ? (
        <figcaption className="nota-legenda">{legenda}</figcaption>
      ) : null}
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
