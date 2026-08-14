import { useEditor, useValue } from 'tldraw'
import { QUADRADO_PX, passoDaRegua } from '../lib/quadrados'

/** Espessura das faixas de régua, em px de tela. */
const ESPESSURA_PX = 20

interface Tique {
  quadrado: number
  posTela: number
  rotulo: boolean
}

/**
 * Réguas graduadas em quadrados (topo + esquerda) do mapa, com botão de
 * liga/desliga da grade no canto onde elas se cruzam.
 *
 * Renderizado via `components.InFrontOfTheCanvas` (mesmo slot do
 * `MedidasMapa`, combinados em `MapaOverlay` no MapaView) — esse slot vive
 * em espaço de tela (`.tl-canvas__in-front`, `pointer-events: none` no
 * container; verificado em node_modules/@tldraw/editor/editor.css:317-322),
 * por isso as posições dos tiques usam `editor.pageToViewport(...)` e o
 * botão da grade precisa de `pointer-events: auto` explícito.
 */
export function ReguasMapa() {
  const editor = useEditor()

  const dados = useValue(
    'mapa-reguas',
    () => {
      const zoom = editor.getZoomLevel()
      const bounds = editor.getViewportPageBounds()
      const { tique, rotulo } = passoDaRegua(zoom)
      const isGridMode = editor.getInstanceState().isGridMode

      function tiquesDoEixo(min: number, max: number): Tique[] {
        const primeiro = Math.floor(min / QUADRADO_PX / tique) * tique
        const ultimo = Math.ceil(max / QUADRADO_PX / tique) * tique
        const lista: Tique[] = []
        for (let quadrado = primeiro; quadrado <= ultimo; quadrado += tique) {
          lista.push({ quadrado, posTela: 0, rotulo: quadrado % rotulo === 0 })
        }
        return lista
      }

      const tiquesX = tiquesDoEixo(bounds.minX, bounds.maxX).map((t) => ({
        ...t,
        posTela: editor.pageToViewport({ x: t.quadrado * QUADRADO_PX, y: 0 }).x,
      }))
      const tiquesY = tiquesDoEixo(bounds.minY, bounds.maxY).map((t) => ({
        ...t,
        posTela: editor.pageToViewport({ x: 0, y: t.quadrado * QUADRADO_PX }).y,
      }))

      return { tiquesX, tiquesY, isGridMode }
    },
    [editor],
  )

  return (
    <>
      <div className="mapa-regua mapa-regua-topo" style={{ height: ESPESSURA_PX, left: ESPESSURA_PX }}>
        {dados.tiquesX.map((t) => (
          <div
            key={t.quadrado}
            className={`mapa-regua-tique${t.rotulo ? ' com-rotulo' : ''}`}
            style={{ left: t.posTela }}
          >
            {t.rotulo && <span className="mapa-regua-rotulo">{t.quadrado}</span>}
          </div>
        ))}
      </div>
      <div className="mapa-regua mapa-regua-esquerda" style={{ width: ESPESSURA_PX, top: ESPESSURA_PX }}>
        {dados.tiquesY.map((t) => (
          <div
            key={t.quadrado}
            className={`mapa-regua-tique vertical${t.rotulo ? ' com-rotulo' : ''}`}
            style={{ top: t.posTela }}
          >
            {t.rotulo && <span className="mapa-regua-rotulo">{t.quadrado}</span>}
          </div>
        ))}
      </div>
      <button
        type="button"
        className="mapa-regua-canto"
        style={{ width: ESPESSURA_PX, height: ESPESSURA_PX }}
        title={dados.isGridMode ? 'Esconder grade' : 'Mostrar grade'}
        onClick={() => editor.updateInstanceState({ isGridMode: !dados.isGridMode })}
      >
        {dados.isGridMode ? '▦' : '▢'}
      </button>
    </>
  )
}
