import { useEffect } from 'react'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'

/**
 * Editor de texto rico (StarterKit) com toolbar B/I/H2/H3/lista.
 *
 * Controlado por HTML: `value` manda no conteúdo e cada edição emite `onChange(html)`.
 * Os modais ainda passam `key` por aba para zerar o histórico de desfazer na troca, mas a
 * exibição não depende mais disso — ver o efeito de sincronização abaixo.
 */
export function EditorTexto({ value, onChange }: { value: string; onChange: (html: string) => void }) {
  const editor = useEditor({
    extensions: [StarterKit],
    content: value,
    onUpdate({ editor }) {
      onChange(editor.getHTML())
    },
  })

  /**
   * Adota o `value` quando ele muda POR FORA do editor.
   *
   * `useEditor` lê `content` só na montagem. Enquanto isso bastava, o texto que a IA gerava
   * só aparecia se a `key` do componente mudasse — e ela é a aba: "Melhorar" e "Versão longa"
   * escrevem na aba em que o usuário JÁ ESTÁ, então nada remontava e o texto novo ficava
   * invisível até sair da aba e voltar.
   *
   * A comparação com `getHTML()` é o que separa mudança externa de eco: enquanto o usuário
   * digita, o pai guarda o HTML que este editor acabou de emitir e o devolve em `value`.
   * Sem a guarda, cada tecla reescreveria o documento e jogaria o cursor para o começo.
   *
   * `emitUpdate: false` porque isto não é edição do usuário — emitir faria o modal agendar
   * uma gravação do texto que ele mesmo acabou de mandar.
   */
  useEffect(() => {
    if (!editor || value === editor.getHTML()) return
    editor.commands.setContent(value, { emitUpdate: false })
  }, [editor, value])

  // TipTap v3 não re-renderiza a cada transação; useEditorState observa o estado ativo da toolbar
  const ativo = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor.isActive('bold'),
      italic: editor.isActive('italic'),
      h2: editor.isActive('heading', { level: 2 }),
      h3: editor.isActive('heading', { level: 3 }),
      bulletList: editor.isActive('bulletList'),
      orderedList: editor.isActive('orderedList'),
    }),
  })

  if (!editor) return null

  return (
    <>
      <div className="perfil-toolbar">
        <button className={ativo.bold ? 'ativo' : ''} onClick={() => editor.chain().focus().toggleBold().run()}><b>B</b></button>
        <button className={ativo.italic ? 'ativo' : ''} onClick={() => editor.chain().focus().toggleItalic().run()}><i>I</i></button>
        <button className={ativo.h2 ? 'ativo' : ''} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>H2</button>
        <button className={ativo.h3 ? 'ativo' : ''} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>H3</button>
        <button className={ativo.bulletList ? 'ativo' : ''} onClick={() => editor.chain().focus().toggleBulletList().run()}>• Lista</button>
        <button className={ativo.orderedList ? 'ativo' : ''} onClick={() => editor.chain().focus().toggleOrderedList().run()}>1. Lista</button>
      </div>
      <EditorContent editor={editor} className="perfil-corpo" />
    </>
  )
}
