// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { ParagrafoFinal } from '../components/paragrafoFinal'

function editorCom(html: string) {
  return new Editor({ extensions: [StarterKit, ParagrafoFinal], content: html })
}
const tick = () => new Promise((r) => setTimeout(r, 0))

describe('ParagrafoFinal', () => {
  it('adiciona parágrafo vazio no load quando o doc termina em bloco não-textual (hr)', async () => {
    const e = editorCom('<p>oi</p><hr>')
    await tick()
    expect(e.getHTML().endsWith('<p></p>')).toBe(true)
    e.destroy()
  })

  it('não adiciona parágrafo extra quando já termina em parágrafo', async () => {
    const e = editorCom('<p>oi</p>')
    await tick()
    const qtd = (e.getHTML().match(/<p>/g) || []).length
    expect(qtd).toBe(1)
    e.destroy()
  })
})
