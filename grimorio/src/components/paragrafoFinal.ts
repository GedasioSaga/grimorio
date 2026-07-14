import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { EditorState, Transaction } from '@tiptap/pm/state'

/**
 * Garante um parágrafo vazio no fim do documento quando o último bloco não
 * aceita cursor de texto (imagem, linha horizontal, lista, citação). Sem isso
 * uma imagem no fim da página não deixa clicar/escrever abaixo dela nem rolar
 * além dela — o usuário fica "preso" e precisa digitar pra criar a linha.
 */
function transacaoParagrafoFinal(estado: EditorState): Transaction | null {
  const ultimo = estado.doc.lastChild
  if (ultimo && ultimo.isTextblock) return null
  const paragrafo = estado.schema.nodes.paragraph
  if (!paragrafo) return null
  return estado.tr.insert(estado.doc.content.size, paragrafo.create())
}

export const ParagrafoFinal = Extension.create({
  name: 'paragrafoFinal',
  // appendTransaction cobre edições; o load inicial do conteúdo não passa por ele.
  onCreate() {
    const tr = transacaoParagrafoFinal(this.editor.state)
    if (tr) this.editor.view.dispatch(tr)
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('paragrafoFinal'),
        appendTransaction: (_transacoes, _anterior, estado) => transacaoParagrafoFinal(estado),
      }),
    ]
  },
})
