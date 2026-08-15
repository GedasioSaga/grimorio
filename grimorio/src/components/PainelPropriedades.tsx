import { createContext, useContext, useEffect, useState } from 'react'
import { useEditor, useValue, type TLShapeId } from 'tldraw'
import { QUADRADO_PX, emQuadrados, parseQuadrados } from '../lib/quadrados'
import { ESTADOS_SALA, aparenciaDaSala } from '../lib/salaMapa'
import { ESTADOS_PORTA, aparenciaDaPorta } from './PortaShape'

/** Snapshot reativo da seleção que o painel precisa para se desenhar. */
export type SelecaoPropriedades =
  | {
      tipo: 'single'
      id: TLShapeId
      x: number
      y: number
      w: number
      h: number
      /** tipo do shape tldraw ('sala-mapa', 'porta-mapa', 'geo'…) */
      tipoShape: string
      /** estado atual, quando a peça tem estado (sala e porta) */
      estado?: string
      /** nome do cômodo, quando a peça é sala */
      rotuloSala?: string
    }
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
      const forma = editor.getShape(id)
      const props = (forma?.props ?? {}) as Record<string, unknown>
      return {
        tipo: 'single',
        id,
        x: bounds.x,
        y: bounds.y,
        w: bounds.w,
        h: bounds.h,
        tipoShape: forma?.type ?? '',
        estado: typeof props.estado === 'string' ? props.estado : undefined,
        rotuloSala: typeof props.rotulo === 'string' ? props.rotulo : undefined,
      }
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
  aoTrocarEstado,
  aoRenomearSala,
}: {
  selecao: SelecaoPropriedades
  aoAplicarX: (id: TLShapeId, quadrados: number) => void
  aoAplicarY: (id: TLShapeId, quadrados: number) => void
  aoAplicarL: (id: TLShapeId, quadrados: number) => void
  aoAplicarA: (id: TLShapeId, quadrados: number) => void
  aoTrocarEstado: (id: TLShapeId, estado: string) => void
  aoRenomearSala: (id: TLShapeId, nome: string) => void
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
        <div key={selecao.id}>
          {selecao.tipoShape === 'sala-mapa' && (
            <CampoNome
              valor={selecao.rotuloSala ?? ''}
              onAplicar={(nome) => aoRenomearSala(selecao.id, nome)}
            />
          )}
          {estadosDaPeca(selecao.tipoShape).length > 0 && (
            <SeletorEstado
              opcoes={estadosDaPeca(selecao.tipoShape)}
              atual={selecao.estado}
              onEscolher={(estado) => aoTrocarEstado(selecao.id, estado)}
            />
          )}
          <div className="painel-propriedades-grade">
          <CampoQuadrado label="X" valorPx={selecao.x} onAplicar={(q) => aoAplicarX(selecao.id, q)} />
          <CampoQuadrado label="Y" valorPx={selecao.y} onAplicar={(q) => aoAplicarY(selecao.id, q)} />
          <CampoQuadrado label="L" valorPx={selecao.w} onAplicar={(q) => aoAplicarL(selecao.id, q)} minimoPositivo />
          <CampoQuadrado label="A" valorPx={selecao.h} onAplicar={(q) => aoAplicarA(selecao.id, q)} minimoPositivo />
          </div>
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

/**
 * Estados que a peça selecionada aceita. Peça sem estado (parede, símbolo, forma comum)
 * devolve lista vazia e o seletor nem aparece — o painel só mostra o que faz sentido
 * para o que está selecionado.
 */
function estadosDaPeca(tipoShape: string): Array<{ id: string; rotulo: string; cor: string }> {
  if (tipoShape === 'sala-mapa') {
    return ESTADOS_SALA.map((estado) => {
      const a = aparenciaDaSala(estado)
      return { id: estado, rotulo: a.rotulo, cor: a.preenchimento }
    })
  }
  if (tipoShape === 'porta-mapa') {
    return ESTADOS_PORTA.map((estado) => {
      const a = aparenciaDaPorta(estado)
      return { id: estado, rotulo: a.rotulo, cor: a.cor }
    })
  }
  return []
}

/**
 * Seletor de estado: cada opção mostra a PRÓPRIA COR, porque no mapa é a cor que carrega
 * o significado — ler "Já limpei" e ver o azul ao lado ensina a legenda sem texto extra.
 */
function SeletorEstado({
  opcoes,
  atual,
  onEscolher,
}: {
  opcoes: Array<{ id: string; rotulo: string; cor: string }>
  atual: string | undefined
  onEscolher: (estado: string) => void
}) {
  return (
    <div className="painel-estado">
      <span className="painel-propriedades-label">Estado</span>
      <div className="painel-estado-opcoes">
        {opcoes.map((opcao) => (
          <button
            key={opcao.id}
            type="button"
            className={`painel-estado-opcao${atual === opcao.id ? ' ativo' : ''}`}
            title={opcao.rotulo}
            onClick={() => onEscolher(opcao.id)}
          >
            <span className="painel-estado-cor" style={{ background: opcao.cor }} />
            {opcao.rotulo}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Nome do cômodo, escrito dentro da própria sala. Aplica no blur/Enter, igual X/Y/L/A. */
function CampoNome({ valor, onAplicar }: { valor: string; onAplicar: (nome: string) => void }) {
  const [rascunho, setRascunho] = useState(valor)

  return (
    <label className="painel-propriedades-campo painel-nome">
      <span className="painel-propriedades-label">Nome do cômodo</span>
      <input
        type="text"
        className="painel-propriedades-input"
        value={rascunho}
        onChange={(e) => setRascunho(e.target.value)}
        onBlur={() => onAplicar(rascunho)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          if (e.key === 'Escape') setRascunho(valor)
        }}
      />
    </label>
  )
}
