import { useEditor, useValue } from 'tldraw'
import { distanciaEntreCaixas, medidaDeCaixa, emQuadrados } from '../lib/quadrados'
import { QUADRADO_PX } from './MapaView'

/**
 * Overlay do mapa: mostra o tamanho da seleção em quadrados da grade e,
 * quando há exatamente 2 formas selecionadas, a distância entre elas.
 *
 * Renderizado via `components.InFrontOfTheCanvas` do tldraw — esse slot
 * fica em `.tl-canvas__in-front` (posição absoluta, `inset: 0`, FORA do
 * `tl-html-layer` que recebe o transform de câmera). Ou seja, o overlay
 * vive em espaço de tela/viewport, não em espaço de página: por isso a
 * posição do chip usa `editor.pageToViewport(...)`, não as coordenadas de
 * página cruas.
 */
export function MedidasMapa() {
  const editor = useEditor()

  const medida = useValue(
    'mapa-medida-selecao',
    () => {
      const bounds = editor.getSelectionPageBounds()
      if (!bounds) return null
      const ids = editor.getSelectedShapeIds()
      const texto = medidaDeCaixa(bounds.w, bounds.h, QUADRADO_PX)
      const pontoTela = editor.pageToViewport({ x: bounds.maxX, y: bounds.maxY })

      let distancia: { texto: string; pontoTela: { x: number; y: number } } | null = null
      if (ids.length === 2) {
        const a = editor.getShapePageBounds(ids[0])
        const b = editor.getShapePageBounds(ids[1])
        if (a && b) {
          const px = distanciaEntreCaixas(a, b)
          const meio = {
            x: (Math.max(a.maxX, b.maxX) + Math.min(a.minX, b.minX)) / 2,
            y: (Math.max(a.maxY, b.maxY) + Math.min(a.minY, b.minY)) / 2,
          }
          distancia = {
            texto: `⇄ ${emQuadrados(px, QUADRADO_PX)}`,
            pontoTela: editor.pageToViewport(meio),
          }
        }
      }

      return { texto, pontoTela, distancia }
    },
    [editor],
  )

  if (!medida) return null

  return (
    <>
      <div
        className="mapa-medida"
        style={{ left: medida.pontoTela.x + 6, top: medida.pontoTela.y + 6 }}
      >
        {medida.texto}
      </div>
      {medida.distancia && (
        <div
          className="mapa-medida"
          style={{ left: medida.distancia.pontoTela.x, top: medida.distancia.pontoTela.y }}
        >
          {medida.distancia.texto}
        </div>
      )}
    </>
  )
}
