import { useEffect, useState } from 'react'
import Image from '@tiptap/extension-image'
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from '@tiptap/react'
import { convertFileSrc } from '@tauri-apps/api/core'
import { useApp } from '../state/store'
import { caminhoAbsolutoImagem } from '../lib/caminhos'

function ImagemView(props: ReactNodeViewProps) {
  const vaultPath = useApp((s) => s.vaultPath)
  const rel = (props.node.attrs.rel as string | null) ?? null
  const alt = (props.node.attrs.alt as string | null) ?? ''
  const src = rel && vaultPath ? convertFileSrc(caminhoAbsolutoImagem(vaultPath, rel)) : ''
  // arquivo referenciado pode não existir no cofre atual (cofre é portável entre PCs)
  const [erroImg, setErroImg] = useState(false)
  useEffect(() => {
    setErroImg(false)
  }, [src])
  return (
    <NodeViewWrapper as="div" className="nota-img">
      {src && !erroImg ? (
        <img
          src={src}
          draggable
          onDragStart={(e) => {
            if (rel) e.dataTransfer.setData('application/x-grimorio-imagem', rel)
          }}
          onError={() => setErroImg(true)}
          alt={alt}
        />
      ) : (
        <span className="nota-img-faltando">imagem não encontrada</span>
      )}
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
