import { useEditor, useValue } from 'tldraw'

/**
 * Movimento de câmera curto e com desaceleração — a mesma faixa que o tldraw usa nos
 * próprios botões de zoom. Acima de ~300ms o clique começa a parecer travado.
 */
const ANIMACAO = { animation: { duration: 200 } } as const

/**
 * Controle de zoom do mapa (Task D da fatia 3): mostra o zoom atual em % e dá os
 * quatro comandos precisos — menos, mais, 100% e caber na tela.
 *
 * Monta no slot `components.NavigationPanel`, substituindo o painel nativo do tldraw
 * (minimap + menu de zoom em inglês, que ficaria redundante ao lado deste). Esse slot
 * vive em `.tlui-layout__bottom__main` — a MESMA faixa da `MapaToolbar`, com
 * `align-items: flex-end; justify-content: center` (node_modules/tldraw/tldraw.css:3007-3012)
 * —, então o controle nasce colado ao rodapé, à esquerda da toolbar, sem posicionamento
 * absoluto e sem disputa de z-index. Motivo de não usar o canto inferior direito que o
 * plano sugeria: aquele canto é do `PainelCamadas`, que vai de `top:8px` a `bottom:8px`
 * na coluna direita do `.mapa-wrap`.
 *
 * API verificada em node_modules/@tldraw/editor/src/lib/editor/Editor.ts:
 * `getZoomLevel()` (:2777, `@computed` — por isso o `useValue` reage a pan/zoom),
 * `zoomOut(point?, opts?)` (:3380), `zoomIn` (:3335), `resetZoom` (:3294) e
 * `zoomToFit` (:3271).
 */
export function ControleZoom() {
  const editor = useEditor()
  const porcentagem = useValue('mapa-zoom-atual', () => Math.round(editor.getZoomLevel() * 100), [editor])

  return (
    <div className="mapa-zoom">
      <button type="button" className="btn-icon" title="Diminuir zoom" onClick={() => editor.zoomOut(undefined, ANIMACAO)}>
        −
      </button>
      <button type="button" className="mapa-zoom-valor" title="Voltar para 100%" onClick={() => editor.resetZoom(undefined, ANIMACAO)}>
        {porcentagem}%
      </button>
      <button type="button" className="btn-icon" title="Aumentar zoom" onClick={() => editor.zoomIn(undefined, ANIMACAO)}>
        +
      </button>
      <button type="button" className="btn-icon" title="Caber na tela" onClick={() => editor.zoomToFit(ANIMACAO)}>
        ⛶
      </button>
    </div>
  )
}
