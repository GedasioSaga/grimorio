// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'

vi.mock('@tauri-apps/api/core', () => ({ convertFileSrc: (p: string) => 'asset://' + p }))
vi.mock('../state/store', () => ({
  useApp: Object.assign((sel: (s: { vaultPath: string }) => unknown) => sel({ vaultPath: 'C:/Cofre' }), {
    getState: () => ({ vaultPath: 'C:/Cofre' }),
  }),
}))

import { ImagemCofre } from '../components/ImagemCofre'

let editorRef: Editor | null = null
function Harness() {
  const editor = useEditor({
    extensions: [StarterKit, ImagemCofre],
    content: '<img data-rel="imagens-notas/x.png">',
  })
  editorRef = editor
  return editor ? <EditorContent editor={editor} /> : null
}

const tick = () => new Promise((r) => setTimeout(r, 0))
let container: HTMLDivElement
let root: Root

async function montar() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => { root.render(<Harness />) })
  await act(async () => { await tick() })
}
async function selecionarImagem() {
  await act(async () => { editorRef!.commands.setNodeSelection(0) })
  await act(async () => { await tick() })
}
const mouse = (el: Element, type: string) =>
  el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }))

beforeEach(montar)
afterEach(() => { root.unmount(); container.remove(); editorRef = null })

describe('repro EditorContent: interacao no NodeView', () => {
  it('preset 50% via mousedown+mouseup+click real atualiza largura', async () => {
    await selecionarImagem()
    const btn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === '50%')
    console.log('[repro] botoes:', JSON.stringify(Array.from(container.querySelectorAll('button')).map((b) => b.textContent)))
    expect(btn, 'botao 50% deve existir').toBeTruthy()
    await act(async () => { mouse(btn!, 'mousedown'); mouse(btn!, 'mouseup'); mouse(btn!, 'click') })
    await act(async () => { await tick() })
    console.log('[repro] html apos preset:', editorRef!.getHTML())
    expect(editorRef!.getHTML()).toContain('data-largura="50"')
  })

  it('legenda: digitar atualiza data-legenda', async () => {
    await selecionarImagem()
    const ta = container.querySelector('textarea') as HTMLTextAreaElement | null
    console.log('[repro] tem textarea?', !!ta)
    expect(ta, 'textarea de legenda deve existir').toBeTruthy()
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')!.set!
      setter.call(ta, 'Minha legenda')
      ta!.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => { await tick() })
    console.log('[repro] html apos legenda:', editorRef!.getHTML())
    expect(editorRef!.getHTML()).toContain('data-legenda="Minha legenda"')
  })

  it('clicar na imagem seleciona (mostra barra)', async () => {
    const img = container.querySelector('.nota-img img') as HTMLImageElement | null
    console.log('[repro] tem img?', !!img, 'nota-img html:', container.querySelector('.nota-img')?.outerHTML?.slice(0, 200))
    expect(img, 'img deve existir').toBeTruthy()
    await act(async () => { mouse(img!, 'mousedown'); mouse(img!, 'mouseup'); mouse(img!, 'click') })
    await act(async () => { await tick() })
    const temBarra = !!container.querySelector('.nota-img-barra')
    console.log('[repro] barra apos click na img?', temBarra)
    expect(temBarra, 'barra deve aparecer ao clicar na imagem').toBe(true)
  })
})
