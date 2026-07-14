import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'

/**
 * Editor de texto rico (StarterKit) com toolbar B/I/H2/H3/lista.
 * Controlado por HTML: `value` é o conteúdo inicial da montagem; cada edição
 * emite `onChange(html)`. Trocar de aba deve desmontar/remontar (use `key`)
 * para reinicializar o conteúdo a partir do campo certo.
 */
export function EditorTexto({ value, onChange }: { value: string; onChange: (html: string) => void }) {
  const editor = useEditor({
    extensions: [StarterKit],
    content: value,
    onUpdate({ editor }) {
      onChange(editor.getHTML())
    },
  })

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
