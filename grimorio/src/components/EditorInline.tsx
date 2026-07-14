import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'

/**
 * Editor de texto enxuto para edição inline (sem toolbar — negrito/itálico via
 * Ctrl+B/I e listas via atalhos markdown do StarterKit). `value` é o conteúdo
 * da montagem; cada edição emite `onChange(html)`; `onBlur` sinaliza o fim da
 * edição (quem monta decide fechar).
 */
export function EditorInline({
  value,
  onChange,
  onBlur,
}: {
  value: string
  onChange: (html: string) => void
  onBlur: () => void
}) {
  const editor = useEditor({
    extensions: [StarterKit],
    content: value,
    autofocus: 'end',
    onUpdate({ editor }) {
      onChange(editor.getHTML())
    },
    onBlur() {
      onBlur()
    },
  })

  if (!editor) return null

  return <EditorContent editor={editor} className="editor-inline" />
}
