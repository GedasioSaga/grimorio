import {
  createShapeId,
  DefaultColorStyle,
  DefaultDashStyle,
  DefaultFillStyle,
  DefaultSizeStyle,
  GeoShapeGeoStyle,
  useEditor,
  useValue,
  type StyleProp,
} from 'tldraw'
import { DEGRAUS_ESCADA, ELEMENTOS_PALETA, type ElementoPaleta } from '../lib/paletaMapa'

/** Style props do tldraw indexados pelo mesmo nome usado em `ElementoPaleta.estilos`. */
const STYLE_PROPS_POR_NOME: Record<string, StyleProp<string>> = {
  color: DefaultColorStyle,
  fill: DefaultFillStyle,
  dash: DefaultDashStyle,
  size: DefaultSizeStyle,
}

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
 *
 * ## Paleta RPG (Parede, Porta, Janela, Escada)
 *
 * Parede/Porta/Janela usam o MESMO mecanismo geo acima: `editor.run(() => {
 * setStyleForNextShapes(cada style do elemento); setCurrentTool('geo') })`.
 *
 * Botão ativo da paleta (simplificação documentada, pedida na task): só compara
 * `toolId === 'geo' && corAtual === elemento.estilos.color`. Não compara fill/dash/
 * size também porque cor já é suficiente para diferenciar os 3 elementos entre si
 * na UX (nenhum dois usa a mesma cor) e porque comparar todos os styles com
 * `useValue` seria 1 hook por style — desnecessário para o que a task pede.
 *
 * Escada é um botão de AÇÃO, não de ferramenta: ela cria na hora um grupo de
 * `DEGRAUS_ESCADA` retângulos finos e paralelos centrados na viewport, via
 * `editor.createShapes` + `editor.groupShapes` (verificado em
 * `node_modules/@tldraw/editor/src/lib/editor/Editor.ts:7917` e `:8250-8323` —
 * decisão documentada em `src/lib/paletaMapa.ts`). `groupShapes` só agrupa quando a
 * ferramenta corrente é `select` (`Editor.ts:8287-8288` — "Only group when the
 * select tool is active"), por isso o `run` troca para `select` antes de agrupar.
 */
export function MapaToolbar() {
  const editor = useEditor()

  const toolId = useValue('mapa-toolbar-tool-atual', () => editor.getCurrentToolId(), [editor])
  const geoAtual = useValue(
    'mapa-toolbar-geo-atual',
    () => editor.getStyleForNextShape(GeoShapeGeoStyle),
    [editor],
  )
  const corAtual = useValue(
    'mapa-toolbar-cor-atual',
    () => editor.getStyleForNextShape(DefaultColorStyle),
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

  function aplicarElementoPaleta(elemento: ElementoPaleta) {
    if (elemento.id === 'escada') {
      criarEscada()
      return
    }
    editor.run(() => {
      for (const [nomeStyle, valor] of Object.entries(elemento.estilos)) {
        const style = STYLE_PROPS_POR_NOME[nomeStyle]
        if (style) editor.setStyleForNextShapes(style, valor)
      }
      editor.setCurrentTool('geo')
    })
  }

  function criarEscada() {
    const largura = 120
    const altura = 14
    const espaco = 20
    const alturaTotal = DEGRAUS_ESCADA * altura + (DEGRAUS_ESCADA - 1) * espaco
    const centro = editor.getViewportPageBounds().center
    const xInicial = centro.x - largura / 2
    const yInicial = centro.y - alturaTotal / 2

    const ids = Array.from({ length: DEGRAUS_ESCADA }, () => createShapeId())

    editor.run(() => {
      editor.createShapes(
        ids.map((id, i) => ({
          id,
          type: 'geo',
          x: xInicial,
          y: yInicial + i * (altura + espaco),
          props: {
            geo: 'rectangle',
            w: largura,
            h: altura,
            color: 'black',
            fill: 'solid',
            dash: 'solid',
            size: 's',
          },
        })),
      )
      editor.setCurrentTool('select')
      editor.groupShapes(ids)
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
      <div className="mapa-toolbar-divisor" aria-hidden="true" />
      {ELEMENTOS_PALETA.map((elemento) => (
        <button
          key={elemento.id}
          type="button"
          className={`btn-icon${toolId === 'geo' && corAtual === elemento.estilos.color ? ' ativo' : ''}`}
          title={elemento.rotulo}
          onClick={() => aplicarElementoPaleta(elemento)}
        >
          {elemento.glifo}
        </button>
      ))}
    </div>
  )
}
