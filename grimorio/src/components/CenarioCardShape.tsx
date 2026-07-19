import { useEffect, useRef, useState } from 'react'
import {
  BaseBoxShapeUtil,
  HTMLContainer,
  T,
  createShapePropsMigrationIds,
  createShapePropsMigrationSequence,
  useEditor,
  type RecordProps,
  type TLShape,
} from 'tldraw'
import { convertFileSrc } from '@tauri-apps/api/core'
import { useApp } from '../state/store'
import { temConteudo } from '../lib/htmlTexto'
import { ajustarLargura, alturaMoldadaAImagem, colunasPaineisVisiveis, colunasTotais, escalaDoCartao } from '../lib/cartaoCanvas'
import { CARD_ALTURA_PADRAO, CARD_LARGURA_PADRAO } from './CharacterCardShape'
import { EditorInline } from './EditorInline'
import { ControlesFonte } from './ControlesFonte'
import { CardRetrato } from './CardRetrato'

declare module '@tldraw/tlschema' {
  interface TLGlobalShapePropsMap {
    'cenario-card': {
      w: number
      h: number
      cenarioId: string
      expandido: boolean
      infoExpandido: boolean
      infoAoLado: boolean
      eventosExpandido: boolean
      eventosAoLado: boolean
      itensExpandido: boolean
      itensAoLado: boolean
      fonteEscala: number
    }
  }
}

export type CenarioCardShapeType = TLShape<'cenario-card'>

const versoes = createShapePropsMigrationIds('cenario-card', {
  AdicionaSecoesEventosItens: 1,
  AdicionaFonteEscala: 2,
})

export class CenarioCardShapeUtil extends BaseBoxShapeUtil<CenarioCardShapeType> {
  static override type = 'cenario-card' as const
  static override props: RecordProps<CenarioCardShapeType> = {
    w: T.positiveNumber,
    h: T.positiveNumber,
    cenarioId: T.string,
    expandido: T.boolean,
    infoExpandido: T.boolean,
    infoAoLado: T.boolean,
    eventosExpandido: T.boolean,
    eventosAoLado: T.boolean,
    itensExpandido: T.boolean,
    itensAoLado: T.boolean,
    fonteEscala: T.positiveNumber,
  }

  // canvases salvos antes das seções Eventos/Itens e da escala de fonte não têm essas flags
  static override migrations = createShapePropsMigrationSequence({
    sequence: [
      {
        id: versoes.AdicionaSecoesEventosItens,
        up(props) {
          props.eventosExpandido = false
          props.eventosAoLado = false
          props.itensExpandido = false
          props.itensAoLado = false
        },
        down(props) {
          delete props.eventosExpandido
          delete props.eventosAoLado
          delete props.itensExpandido
          delete props.itensAoLado
        },
      },
      {
        id: versoes.AdicionaFonteEscala,
        up(props) {
          props.fonteEscala = 1
        },
        down(props) {
          delete props.fonteEscala
        },
      },
    ],
  })

  override getDefaultProps(): CenarioCardShapeType['props'] {
    return {
      w: CARD_LARGURA_PADRAO,
      h: CARD_ALTURA_PADRAO,
      cenarioId: '',
      expandido: false,
      infoExpandido: false,
      infoAoLado: false,
      eventosExpandido: false,
      eventosAoLado: false,
      itensExpandido: false,
      itensAoLado: false,
      fonteEscala: 1,
    }
  }

  override canEdit() {
    return false
  }

  // recolhido: trava o aspecto p/ o card seguir emoldurado à imagem ao redimensionar.
  // expandido: livre (os painéis de texto definem a altura).
  override isAspectRatioLocked(shape: CenarioCardShapeType) {
    return !shape.props.expandido
  }

  // duplo clique alterna o painel de descrição; o modal abre com espaço
  // com o card selecionado (handler no CanvasView) — mesmo gesto do personagem
  override onDoubleClick = (shape: CenarioCardShapeType) => {
    const expandir = !shape.props.expandido
    // painéis que aparecem/somem ao expandir = 1 (Descrição) + seções marcadas "ao lado".
    // largura relativa (não absoluta): preserva a escala que o usuário deu ao card.
    const delta = colunasPaineisVisiveis(true, contarAoLado(shape.props))
    return {
      id: shape.id,
      type: shape.type,
      props: { expandido: expandir, w: ajustarLargura(shape.props.w, expandir ? delta : -delta) },
    }
  }

  override component(shape: CenarioCardShapeType) {
    return <CartaoCenario shape={shape} />
  }

  override indicator(shape: CenarioCardShapeType) {
    return <rect width={shape.props.w} height={shape.props.h} rx={6} />
  }
}

// nº de seções (fora Descrição) em coluna própria
function contarAoLado(props: CenarioCardShapeType['props']): number {
  return [props.infoAoLado, props.eventosAoLado, props.itensAoLado].filter(Boolean).length
}

type ChaveSecao = 'informacao' | 'eventos' | 'itens'

const SECOES: { chave: ChaveSecao; rotulo: string; semTexto: string }[] = [
  { chave: 'informacao', rotulo: 'Informações', semTexto: 'Sem informações' },
  { chave: 'eventos', rotulo: 'Eventos', semTexto: 'Sem eventos' },
  { chave: 'itens', rotulo: 'Itens', semTexto: 'Sem itens' },
]

// flags booleanas planas do shape (props do tldraw são planas, sem mapa aninhado)
type FlagBooleana =
  | 'infoExpandido' | 'infoAoLado'
  | 'eventosExpandido' | 'eventosAoLado'
  | 'itensExpandido' | 'itensAoLado'

const FLAGS: Record<ChaveSecao, { exp: FlagBooleana; lado: FlagBooleana }> = {
  informacao: { exp: 'infoExpandido', lado: 'infoAoLado' },
  eventos: { exp: 'eventosExpandido', lado: 'eventosAoLado' },
  itens: { exp: 'itensExpandido', lado: 'itensAoLado' },
}

function CartaoCenario({ shape }: { shape: CenarioCardShapeType }) {
  const { cenarioId, expandido, fonteEscala } = shape.props
  const c = useApp((s) => s.cenarios[cenarioId])
  const vaultPath = useApp((s) => s.vaultPath)
  const salvarParcial = useApp((s) => s.salvarCenarioParcial)
  const editor = useEditor()

  // escala uniforme: largura por coluna vs base → multiplica toda fonte (--card-fe),
  // então imagem e texto crescem juntos ao redimensionar o card
  const cols = colunasTotais(expandido, contarAoLado(shape.props))
  const cardFe = escalaDoCartao(shape.props.w, cols) * fonteEscala

  const [editando, setEditando] = useState<'descricao' | ChaveSecao | null>(null)

  const retratoSrc = c?.retrato && vaultPath ? convertFileSrc(`${vaultPath}/${c.retrato}`) : null

  // guard de scroll: rolar dentro de um painel não vira zoom/pan do canvas.
  // Um listener no card cobre todos os painéis (o nº deles é dinâmico agora).
  const cardRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = cardRef.current
    if (!el) return
    const aoRolar = (e: WheelEvent) => {
      const alvo = e.target as HTMLElement | null
      if (alvo?.closest('.char-card-painel')) e.stopPropagation()
    }
    el.addEventListener('wheel', aoRolar, { passive: true })
    return () => el.removeEventListener('wheel', aoRolar)
  }, [])

  // emoldura à imagem uma vez, só em cards no tamanho padrão (nunca redimensionados)
  useEffect(() => {
    if (!retratoSrc) return
    let cancelado = false
    const img = new Image()
    img.onload = () => {
      if (cancelado || img.naturalWidth <= 0 || img.naturalHeight <= 0) return
      const atual = editor.getShape(shape.id) as CenarioCardShapeType | undefined
      if (!atual || atual.props.expandido) return
      if (atual.props.w !== CARD_LARGURA_PADRAO || atual.props.h !== CARD_ALTURA_PADRAO) return
      const novaH = alturaMoldadaAImagem(atual.props.w, img.naturalWidth / img.naturalHeight)
      if (novaH !== atual.props.h) {
        editor.updateShape<CenarioCardShapeType>({ id: shape.id, type: 'cenario-card', props: { h: novaH } })
      }
    }
    img.src = retratoSrc
    return () => {
      cancelado = true
    }
  }, [retratoSrc, shape.id, editor])

  if (!c) {
    return (
      <HTMLContainer className="char-card char-card-removido" style={{ pointerEvents: 'all' }}>
        <div className="char-card-nome">Cenário removido</div>
      </HTMLContainer>
    )
  }

  // conteúdo de uma caixa (Descrição ou seção): editor inline, HTML salvo, ou vazio.
  // Função de render (NÃO componente): devolve a árvore JSX direto, então digitar
  // no editor inline não remonta/perde foco a cada render do card.
  const renderConteudo = (
    html: string,
    estaEditando: boolean,
    onChange: (h: string) => void,
    semTexto: string,
  ) =>
    estaEditando ? (
      <div className="char-card-editor" onPointerDown={(e) => e.stopPropagation()}>
        <EditorInline value={html} onChange={onChange} onBlur={() => setEditando(null)} />
      </div>
    ) : temConteudo(html) ? (
      <div className="char-card-descricao" dangerouslySetInnerHTML={{ __html: html }} />
    ) : (
      <div className="char-card-sem-descricao">{semTexto}</div>
    )

  // uma seção (Informações / Eventos / Itens): header com toggles + conteúdo/editor.
  const renderSecao = (chave: ChaveSecao, rotulo: string, semTexto: string) => {
    const expSec = shape.props[FLAGS[chave].exp]
    const aoLado = shape.props[FLAGS[chave].lado]
    return (
      <div className="char-card-secao" key={chave}>
        <div className="char-card-secao-header">
          <button
            className="char-card-info-toggle"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() =>
              editor.updateShape<CenarioCardShapeType>({
                id: shape.id,
                type: 'cenario-card',
                props: { [FLAGS[chave].exp]: !expSec },
              })
            }
          >
            {expSec ? '▾' : '▸'} {rotulo}
          </button>
          <span className="char-card-secao-acoes">
            <button
              className="char-card-btn-editar"
              title={aoLado ? 'Mover para baixo' : 'Mover para a direita'}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() =>
                editor.updateShape<CenarioCardShapeType>({
                  id: shape.id,
                  type: 'cenario-card',
                  props: { [FLAGS[chave].lado]: !aoLado, w: ajustarLargura(shape.props.w, aoLado ? -1 : 1) },
                })
              }
            >
              {aoLado ? '↓' : '→'}
            </button>
            <button
              className="char-card-btn-editar"
              title="Editar aqui mesmo"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => {
                if (!expSec) {
                  editor.updateShape<CenarioCardShapeType>({
                    id: shape.id,
                    type: 'cenario-card',
                    props: { [FLAGS[chave].exp]: true },
                  })
                }
                setEditando(chave)
              }}
            >
              ✎
            </button>
          </span>
        </div>
        {expSec &&
          renderConteudo(
            c[chave],
            editando === chave,
            (h) => salvarParcial(cenarioId, { [chave]: h }),
            semTexto,
          )}
      </div>
    )
  }

  const empilhadas = SECOES.filter((s) => !shape.props[FLAGS[s.chave].lado])
  const aoLado = SECOES.filter((s) => shape.props[FLAGS[s.chave].lado])

  return (
    <HTMLContainer className="char-card" style={{ pointerEvents: 'all', ['--card-fe' as any]: cardFe }}>
      {/* HTMLContainer não encaminha ref (não usa forwardRef); wrapper com
          display:contents pega o listener de wheel sem alterar o layout flex. */}
      <div ref={cardRef} style={{ display: 'contents' }}>
        <div className="char-card-principal">
          <CardRetrato
            src={retratoSrc}
            alt={c.nome}
            fallback={<span className="char-card-inicial">🗺</span>}
          />
          <div className="char-card-texto">
            <div className="char-card-nome">{c.nome}</div>
            {c.resumo ? <div className="char-card-resumo">{c.resumo}</div> : null}
            <ControlesFonte
              escala={fonteEscala}
              onEscala={(v) =>
                editor.updateShape<CenarioCardShapeType>({
                  id: shape.id,
                  type: 'cenario-card',
                  props: { fonteEscala: v },
                })
              }
            />
          </div>
        </div>
        {expandido && (
          <>
            <div className="char-card-painel">
              <div className="char-card-secao">
                <div className="char-card-secao-header">
                  <span className="char-card-secao-titulo">Descrição</span>
                  <button
                    className="char-card-btn-editar"
                    title="Editar descrição aqui mesmo"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => setEditando(editando === 'descricao' ? null : 'descricao')}
                  >
                    ✎
                  </button>
                </div>
                {renderConteudo(
                  c.descricao,
                  editando === 'descricao',
                  (h) => salvarParcial(cenarioId, { descricao: h }),
                  'Sem descrição',
                )}
              </div>
              {empilhadas.map((s) => renderSecao(s.chave, s.rotulo, s.semTexto))}
            </div>
            {aoLado.map((s) => (
              <div key={s.chave} className="char-card-painel">
                {renderSecao(s.chave, s.rotulo, s.semTexto)}
              </div>
            ))}
          </>
        )}
      </div>
    </HTMLContainer>
  )
}
