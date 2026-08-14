import { GeoShapeGeoStyle, useEditor, useValue } from 'tldraw'

/**
 * Toolbar própria do mapa, substituindo a do tldraw (slot `components.Toolbar`).
 *
 * Mecanismo verificado em `node_modules/tldraw/src/lib/ui/hooks/useTools.tsx`
 * (é o que a toolbar padrão do tldraw faz por trás de cada botão):
 * - trocar de ferramenta: `editor.setCurrentTool(id)`.
 * - retângulo/elipse são o mesmo tool `geo`; o que muda é o estilo aplicado à
 *   PRÓXIMA forma, setado com `editor.setStyleForNextShapes(GeoShapeGeoStyle, 'rectangle' | 'ellipse')`
 *   antes de `setCurrentTool('geo')` — os dois num `editor.run(...)` para não
 *   gerar dois passos de histórico/reatividade separados (mesmo padrão do useTools).
 *
 * Botão ativo: `editor.getCurrentToolId()` cobre a maioria; para retângulo/elipse
 * é preciso também comparar `editor.getStyleForNextShape(GeoShapeGeoStyle)`
 * (`Editor.ts` — `getStyleForNextShape`), senão os dois acendem juntos sempre
 * que a ferramenta corrente é `geo`. Ambos lidos via `useValue` para reagir a
 * mudança de ferramenta/estilo feita também pelo teclado (atalhos nativos:
 * este componente não intercepta teclado, só espelha o estado do editor).
 *
 * `.tlui-layout__bottom__main` (onde este slot é montado) já é
 * `display:flex; justify-content:center` e o ancestral `.tlui-layout` é
 * `pointer-events:none` — por isso só precisamos de `pointer-events:auto`
 * aqui, sem `position:absolute` manual (ver TldrawUi.tsx / tldraw.css).
 */
export function MapaToolbar() {
  const editor = useEditor()

  const toolId = useValue('mapa-toolbar-tool-atual', () => editor.getCurrentToolId(), [editor])
  const geoAtual = useValue(
    'mapa-toolbar-geo-atual',
    () => editor.getStyleForNextShape(GeoShapeGeoStyle),
    [editor],
  )

  function selecionarFerramenta(id: string) {
    editor.setCurrentTool(id)
  }

  function selecionarGeo(geo: 'rectangle' | 'ellipse') {
    editor.run(() => {
      editor.setStyleForNextShapes(GeoShapeGeoStyle, geo)
      editor.setCurrentTool('geo')
    })
  }

  const botoes: Array<{ titulo: string; icone: string; ativo: boolean; aoClicar: () => void }> = [
    { titulo: 'Selecionar', icone: '↖', ativo: toolId === 'select', aoClicar: () => selecionarFerramenta('select') },
    { titulo: 'Mão', icone: '✋', ativo: toolId === 'hand', aoClicar: () => selecionarFerramenta('hand') },
    { titulo: 'Caneta', icone: '✏️', ativo: toolId === 'draw', aoClicar: () => selecionarFerramenta('draw') },
    {
      titulo: 'Retângulo',
      icone: '▭',
      ativo: toolId === 'geo' && geoAtual === 'rectangle',
      aoClicar: () => selecionarGeo('rectangle'),
    },
    {
      titulo: 'Elipse',
      icone: '◯',
      ativo: toolId === 'geo' && geoAtual === 'ellipse',
      aoClicar: () => selecionarGeo('ellipse'),
    },
    { titulo: 'Linha', icone: '／', ativo: toolId === 'line', aoClicar: () => selecionarFerramenta('line') },
    { titulo: 'Texto', icone: 'T', ativo: toolId === 'text', aoClicar: () => selecionarFerramenta('text') },
    { titulo: 'Borracha', icone: '⌫', ativo: toolId === 'eraser', aoClicar: () => selecionarFerramenta('eraser') },
  ]

  return (
    <div className="mapa-toolbar">
      {botoes.map((b) => (
        <button
          key={b.titulo}
          type="button"
          className={`btn-icon${b.ativo ? ' ativo' : ''}`}
          title={b.titulo}
          onClick={b.aoClicar}
        >
          {b.icone}
        </button>
      ))}
    </div>
  )
}
