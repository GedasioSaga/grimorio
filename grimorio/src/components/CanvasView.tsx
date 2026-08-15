import { useRef, useState } from 'react'
import { Tldraw, defaultShapeUtils, type Editor } from 'tldraw'
import 'tldraw/tldraw.css'
import { useApp } from '../state/store'
import { CharacterCardShapeUtil } from './CharacterCardShape'
import { CenarioCardShapeUtil } from './CenarioCardShape'
import { ItemCardShapeUtil } from './ItemCardShape'
import { PortaShapeUtil } from './PortaShape'
import { SimboloMapaShapeUtil } from './SimboloMapaShape'
import { SalaMapaShapeUtil } from './SalaMapaShape'
import { LinhaMapaShapeUtil } from './LinhaMapaShape'
import { registrarEditor, desregistrarEditor } from '../lib/canvasAtivo'
import { useDocumentoTldraw } from './canvasDoc'
import { criarHandlersDeDrop } from './dropsDeEntidade'
import { exportarCanvas } from './exportarCanvas'
import { registrarAtalhos } from './atalhosCanvas'

// Constantes em nível de módulo: arrays recriados a cada render remontam o editor.
// `shapeUtilsCustom` vai na prop `shapeUtils` do <Tldraw> (que soma aos defaults);
// o store precisa do schema completo (defaults + customizados).
// PortaShapeUtil entra aqui mesmo sendo peça de MAPA: o clipboard do tldraw é comum às
// duas telas, e colar uma porta num canvas sem o tipo registrado faz `getShapeUtil`
// lançar (Editor.ts:1050-1054). Registrar é uma linha; o erro seria na cara do usuário.
const shapeUtilsCustom = [CharacterCardShapeUtil, CenarioCardShapeUtil, ItemCardShapeUtil, PortaShapeUtil, SimboloMapaShapeUtil, SalaMapaShapeUtil, LinhaMapaShapeUtil]
const shapeUtilsDoStore = [...defaultShapeUtils, ...shapeUtilsCustom]

export function CanvasView({ caminho, nome }: { caminho: string; nome: string }) {
  const repo = useApp((s) => s.repo)
  const vaultPath = useApp((s) => s.vaultPath)
  const { store, erro, salvandoErro } = useDocumentoTldraw(caminho, shapeUtilsDoStore)
  const [copiaOk, setCopiaOk] = useState(false)
  const [copiaErro, setCopiaErro] = useState<string | null>(null)
  const editorRef = useRef<Editor | null>(null)
  const { aoArrastarSobre, aoSoltar } = criarHandlersDeDrop(editorRef, vaultPath)

  async function exportar(formato: 'png' | 'svg') {
    const editor = editorRef.current
    if (!editor || !repo) return
    await exportarCanvas(editor, repo, nome, formato)
  }

  if (erro) {
    return (
      <div className="canvas-erro">
        Não foi possível abrir "{nome}": arquivo com erro.
        <br />
        <code>{erro}</code>
      </div>
    )
  }
  if (!store) return <div className="canvas-carregando">Carregando…</div>

  return (
    <div className="canvas-wrap" onDragOverCapture={aoArrastarSobre} onDropCapture={aoSoltar}>
      <div className="canvas-toolbar">
        <span className="canvas-titulo">{nome}</span>
        <button onClick={() => void exportar('png')}>Exportar PNG</button>
        <button onClick={() => void exportar('svg')}>Exportar SVG</button>
      </div>
      <Tldraw
        store={store}
        shapeUtils={shapeUtilsCustom}
        onMount={(editor) => {
          registrarEditor(editor)
          editorRef.current = editor
          editor.user.updateUserPreferences({ colorScheme: 'dark' })
          const cancelarAtalhos = registrarAtalhos(editor, {
            aoCopiar() {
              setCopiaOk(true)
              setTimeout(() => setCopiaOk(false), 1500)
            },
            aoFalharCopia(erro) {
              setCopiaErro(erro)
              setTimeout(() => setCopiaErro(null), 4000)
            },
          })
          return () => {
            desregistrarEditor(editor)
            cancelarAtalhos()
          }
        }}
      />
      <div className="canvas-banners">
        {salvandoErro && (
          <div className="canvas-salvar-erro">Falha ao salvar: {salvandoErro}</div>
        )}
        {copiaOk && <div className="canvas-copia-ok">Imagem copiada</div>}
        {copiaErro && <div className="canvas-salvar-erro">Falha ao copiar: {copiaErro}</div>}
      </div>
    </div>
  )
}
