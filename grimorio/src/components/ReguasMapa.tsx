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
 * Réguas graduadas em quadrados (topo + esquerda) do mapa. O liga/desliga da
 * grade mora na `MapaToolbar` (fix da revisão — ver JSDoc do canto abaixo).
 *
 * Renderizado via `components.InFrontOfTheCanvas` (mesmo slot do
 * `MedidasMapa`, combinados em `MapaOverlay` no MapaView) — esse slot vive
 * em espaço de tela (`.tl-canvas__in-front`, `pointer-events: none` no
 * container; verificado em node_modules/@tldraw/editor/editor.css:317-322),
 * por isso as posições dos tiques usam `editor.pageToViewport(...)`.
 */
export function ReguasMapa() {
  const editor = useEditor()

  const dados = useValue(
    'mapa-reguas',
    () => {
      const zoom = editor.getZoomLevel()
      const bounds = editor.getViewportPageBounds()
      const { tique, rotulo } = passoDaRegua(zoom)

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

      return { tiquesX, tiquesY }
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
            // a barra começa em screen-x = ESPESSURA_PX (`left: ESPESSURA_PX` acima), e
            // `left` aqui é relativo à PRÓPRIA barra (ancestral posicionado mais próximo)
            // — sem subtrair o offset, todo tique nasce ESPESSURA_PX à direita da posição
            // real (fix da revisão: tiques ~20px desalinhados da grade).
            style={{ left: t.posTela - ESPESSURA_PX }}
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
            style={{ top: t.posTela - ESPESSURA_PX }}
          >
            {t.rotulo && <span className="mapa-regua-rotulo">{t.quadrado}</span>}
          </div>
        ))}
      </div>
      {/* canto de interseção das réguas: só preenchimento passivo agora — o botão de
          liga/desliga da grade mudou pra MapaToolbar.tsx (fix da revisão: aqui ele ficava
          atrás do MainMenu nativo do tldraw, `.tlui-menu-zone` em top:0/left:0 com
          z-index maior que o da régua). */}
      <div className="mapa-regua-canto" style={{ width: ESPESSURA_PX, height: ESPESSURA_PX }} aria-hidden="true" />
    </>
  )
}
