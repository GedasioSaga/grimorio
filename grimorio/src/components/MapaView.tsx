import { useRef } from 'react'
import { Tldraw, defaultShapeUtils, type Editor, type TLComponents } from 'tldraw'
import 'tldraw/tldraw.css'
import { useApp } from '../state/store'
import { useDocumentoTldraw } from './canvasDoc'
import { criarHandlersDeDrop } from './dropsDeEntidade'
import { exportarCanvas } from './exportarCanvas'
import { CharacterCardShapeUtil } from './CharacterCardShape'
import { CenarioCardShapeUtil } from './CenarioCardShape'
import { ItemCardShapeUtil } from './ItemCardShape'
import { MedidasMapa } from './MedidasMapa'
import { MapaToolbar } from './MapaToolbar'
import { registrarEditor, desregistrarEditor } from '../lib/canvasAtivo'
import { QUADRADO_PX } from '../lib/quadrados'

// mesmos card-shapes do canvas: mapa aceita drop de personagem/cenário/item
const shapeUtilsCustom = [CharacterCardShapeUtil, CenarioCardShapeUtil, ItemCardShapeUtil]
const shapeUtilsDoStore = [...defaultShapeUtils, ...shapeUtilsCustom]

// constante de módulo: não recriar o objeto de components a cada render
const componentsMapa: TLComponents = { InFrontOfTheCanvas: MedidasMapa, Toolbar: MapaToolbar }

export function MapaView({ caminho, nome }: { caminho: string; nome: string }) {
  const repo = useApp((s) => s.repo)
  const vaultPath = useApp((s) => s.vaultPath)
  const editorRef = useRef<Editor | null>(null)
  const { store, erro, salvandoErro } = useDocumentoTldraw(caminho, shapeUtilsDoStore)
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
    <div className="mapa-wrap" onDragOverCapture={aoArrastarSobre} onDropCapture={aoSoltar}>
      <div className="canvas-toolbar">
        <span className="canvas-titulo">🗺 {nome}</span>
        <button onClick={() => void exportar('png')}>Exportar PNG</button>
        <button onClick={() => void exportar('svg')}>Exportar SVG</button>
      </div>
      <Tldraw
        store={store}
        shapeUtils={shapeUtilsCustom}
        components={componentsMapa}
        onMount={(editor) => {
          registrarEditor(editor)
          editorRef.current = editor
          editor.user.updateUserPreferences({ colorScheme: 'dark' })
          // grade ligada por padrão: é a régua do mapa (1 quadrado = QUADRADO_PX)
          editor.updateInstanceState({ isGridMode: true })
          editor.updateDocumentSettings({ gridSize: QUADRADO_PX })
          return () => desregistrarEditor(editor)
        }}
      />
      <div className="canvas-banners">
        {salvandoErro && <div className="canvas-salvar-erro">Falha ao salvar: {salvandoErro}</div>}
      </div>
    </div>
  )
}
