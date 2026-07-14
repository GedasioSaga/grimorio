import Image from '@tiptap/extension-image'
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from '@tiptap/react'
import { convertFileSrc } from '@tauri-apps/api/core'
import { useApp } from '../state/store'
import { caminhoAbsolutoImagem } from '../lib/caminhos'

function ImagemView(props: ReactNodeViewProps) {
  const vaultPath = useApp((s) => s.vaultPath)
  const rel = (props.node.attrs.rel as string | null) ?? null
  const src = rel && vaultPath ? convertFileSrc(caminhoAbsolutoImagem(vaultPath, rel)) : ''
  return (
    <NodeViewWrapper as="span" className="nota-img">
      <img
        src={src}
        draggable
        onDragStart={(e) => {
          if (rel) e.dataTransfer.setData('application/x-grimorio-imagem', rel)
        }}
        alt=""
      />
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
  addNodeView() {
    return ReactNodeViewRenderer(ImagemView)
  },
})
