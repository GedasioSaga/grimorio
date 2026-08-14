import { createContext, useContext, useEffect, useState } from 'react'
import { useEditor, useValue, type TLShapeId } from 'tldraw'
import { QUADRADO_PX, emQuadrados, parseQuadrados } from '../lib/quadrados'

/** Snapshot reativo da seleção que o painel precisa para se desenhar. */
export type SelecaoPropriedades =
  | { tipo: 'single'; id: TLShapeId; x: number; y: number; w: number; h: number }
  | { tipo: 'multi'; w: number; h: number }
  | null

/**
 * `components.InFrontOfTheCanvas` do `<Tldraw>` é uma constante de módulo (mesmo
 * motivo do `getShapeVisibilityRef` no MapaView: identidade instável ali recria o
 * editor inteiro), então não dá pra passar o `setSelecaoProp` de uma instância de
 * MapaView como prop direta pro `MapaOverlay`/`SelecaoPropriedadesBridge`. Um Context
 * resolve: o Provider é montado DENTRO do MapaView (escopo por instância), e o valor
 * chega à ponte não importa onde ela seja renderizada dentro da árvore do `<Tldraw>`.
 */
const SelecaoPropriedadesContext = createContext<(s: SelecaoPropriedades) => void>(() => {})
export const ProvedorSelecaoPropriedades = SelecaoPropriedadesContext.Provider

/**
 * Ponte para dentro da árvore do `<Tldraw>`: só ela usa `useEditor`/`useValue` (exige
 * o `EditorContext` que o `<Tldraw>` provê aos próprios filhos — por isso vive no
 * slot `InFrontOfTheCanvas`, igual `MedidasMapa`/`ReguasMapa`). Reporta a seleção pro
 * MapaView via Context, que guarda em `useState` e repassa como prop pro
 * `PainelPropriedades` — componente burro, sibling do `<Tldraw>`, MESMO padrão do
 * `PainelCamadas` (estado no MapaView, painel só apresenta). Sem essa ponte, o painel
 * teria que morar dentro do `<Tldraw>` e brigar de z-index/posição com o `PainelCamadas`,
 * que é um sibling fora dele.
 */
export function SelecaoPropriedadesBridge() {
  const editor = useEditor()
  const onChange = useContext(SelecaoPropriedadesContext)

  const selecao = useValue(
    'mapa-propriedades-selecao',
    (): SelecaoPropriedades => {
      const ids = editor.getSelectedShapeIds()
      if (ids.length === 0) return null
      if (ids.length > 1) {
        const bounds = editor.getSelectionPageBounds()
        if (!bounds) return null
        return { tipo: 'multi', w: bounds.w, h: bounds.h }
      }
      const id = ids[0]
      const bounds = editor.getShapePageBounds(id)
      if (!bounds) return null
      return { tipo: 'single', id, x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h }
    },
    [editor],
  )

  useEffect(() => onChange(selecao), [selecao, onChange])

  return null
}

/**
 * Painel de propriedades do Mapa (Task C, fatia 3): coluna direita do `.mapa-wrap`,
 * ACIMA do `PainelCamadas` — componente burro, só apresenta `selecao` e chama os
 * callbacks; quem lê/escreve no editor é o MapaView (via `SelecaoPropriedadesBridge`
 * + as funções `aoAplicar*`), mesmo padrão do `PainelCamadas`.
 *
 * Mover (X/Y): quem aplica (`MapaView`) usa `editor.updateShape({x,y})`, que espera
 * coordenadas do PARENT space, convertidas de page space com
 * `editor.getPointInParentSpace` — ver comentário completo no MapaView.
 * Redimensionar (L/A): `editor.resizeShape(id, scale, { scaleOrigin })` — idem.
 */
export function PainelPropriedades({
  selecao,
  aoAplicarX,
  aoAplicarY,
  aoAplicarL,
  aoAplicarA,
}: {
  selecao: SelecaoPropriedades
  aoAplicarX: (id: TLShapeId, quadrados: number) => void
  aoAplicarY: (id: TLShapeId, quadrados: number) => void
  aoAplicarL: (id: TLShapeId, quadrados: number) => void
  aoAplicarA: (id: TLShapeId, quadrados: number) => void
}) {
  const [colapsado, setColapsado] = useState(false)

  if (!selecao) return null

  if (colapsado) {
    return (
      <button
        type="button"
        className="painel-propriedades-reabrir"
        title="Mostrar propriedades"
        onClick={() => setColapsado(false)}
      >
        📐
      </button>
    )
  }

  return (
    <div className="painel-propriedades">
      <div className="painel-propriedades-cabecalho">
        <span>Propriedades</span>
        <button type="button" className="btn-icon" title="Esconder painel" onClick={() => setColapsado(true)}>»</button>
      </div>
      {selecao.tipo === 'multi' ? (
        <div className="painel-propriedades-multi">{medidaMulti(selecao.w, selecao.h)}</div>
      ) : (
        // key = id da forma: força remount ao trocar de seleção, descartando rascunho
        // de edição em andamento de uma forma que deixou de ser a selecionada.
        <div className="painel-propriedades-grade" key={selecao.id}>
          <CampoQuadrado label="X" valorPx={selecao.x} onAplicar={(q) => aoAplicarX(selecao.id, q)} />
          <CampoQuadrado label="Y" valorPx={selecao.y} onAplicar={(q) => aoAplicarY(selecao.id, q)} />
          <CampoQuadrado label="L" valorPx={selecao.w} onAplicar={(q) => aoAplicarL(selecao.id, q)} minimoPositivo />
          <CampoQuadrado label="A" valorPx={selecao.h} onAplicar={(q) => aoAplicarA(selecao.id, q)} minimoPositivo />
        </div>
      )}
    </div>
  )
}

function medidaMulti(wPx: number, hPx: number): string {
  return `${emQuadrados(wPx, QUADRADO_PX)}×${emQuadrados(hPx, QUADRADO_PX)}`
}

function CampoQuadrado({
  label,
  valorPx,
  onAplicar,
  minimoPositivo,
}: {
  label: string
  valorPx: number
  onAplicar: (quadrados: number) => void
  minimoPositivo?: boolean
}) {
  const [editando, setEditando] = useState(false)
  const [rascunho, setRascunho] = useState('')

  const exibido = editando ? rascunho : emQuadrados(valorPx, QUADRADO_PX)

  function aplicar() {
    setEditando(false)
    const numero = parseQuadrados(rascunho)
    if (numero === null) return // inválido: reverte pro valor atual sem aplicar
    if (minimoPositivo && numero <= 0) return
    onAplicar(numero)
  }

  return (
    <label className="painel-propriedades-campo">
      <span className="painel-propriedades-label">{label}</span>
      <input
        type="text"
        inputMode="decimal"
        className="painel-propriedades-input"
        value={exibido}
        onFocus={() => {
          setRascunho(emQuadrados(valorPx, QUADRADO_PX))
          setEditando(true)
        }}
        onChange={(e) => setRascunho(e.target.value)}
        onBlur={aplicar}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          if (e.key === 'Escape') setEditando(false)
        }}
      />
    </label>
  )
}
