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
    content: '<img data-rel="imagens-notas/x.png"><p>texto ao lado da imagem</p>',
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
function botao(txt: string) {
  return Array.from(container.querySelectorAll('button')).find((b) => b.textContent === txt)
}

beforeEach(montar)
afterEach(() => { root.unmount(); container.remove(); editorRef = null })

describe('fluxo de texto ao lado da imagem', () => {
  it('imagem nova nasce centralizada (data-align=center), sem float por padrão', () => {
    const wrapper = container.querySelector('.nota-img')
    expect(wrapper?.getAttribute('data-align')).toBe('center')
  })

  it('botão ⬅ marca a imagem como flutuante à esquerda e persiste no HTML salvo', async () => {
    await selecionarImagem()
    const btn = botao('⬅')
    expect(btn, 'botão ⬅ deve existir').toBeTruthy()
    await act(async () => { mouse(btn!, 'mousedown'); mouse(btn!, 'click') })
    await act(async () => { await tick() })
    expect(container.querySelector('.nota-img')?.getAttribute('data-align')).toBe('left')
    expect(editorRef!.getHTML()).toContain('data-align="left"')
  })

  it('largura (preset) é aplicada no wrapper .nota-img, não no frame (float precisa de largura definida)', async () => {
    await selecionarImagem()
    const btn = botao('50%')
    expect(btn, 'botão 50% deve existir').toBeTruthy()
    await act(async () => { mouse(btn!, 'mousedown'); mouse(btn!, 'click') })
    await act(async () => { await tick() })
    const wrapper = container.querySelector('.nota-img') as HTMLElement
    const frame = container.querySelector('.nota-img-frame') as HTMLElement
    expect(wrapper.style.width).toBe('50%')
    expect(frame.style.width).toBe('')
  })
})
