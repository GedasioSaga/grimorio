import { useEffect, useRef, useState } from 'react'
import {
  BaseBoxShapeUtil,
  HTMLContainer,
  T,
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
    'item-card': {
      w: number
      h: number
      itemId: string
      expandido: boolean
      infoExpandido: boolean
      infoAoLado: boolean
      efeitoExpandido: boolean
      efeitoAoLado: boolean
      fonteEscala: number
    }
  }
}

export type ItemCardShapeType = TLShape<'item-card'>

// Sem migrações: o shape nasce com todas as props. Personagem e cenário têm
// sequência de migração porque ganharam props depois de canvases já salvos.
export class ItemCardShapeUtil extends BaseBoxShapeUtil<ItemCardShapeType> {
  static override type = 'item-card' as const
  static override props: RecordProps<ItemCardShapeType> = {
    w: T.positiveNumber,
    h: T.positiveNumber,
    itemId: T.string,
    expandido: T.boolean,
    infoExpandido: T.boolean,
    infoAoLado: T.boolean,
    efeitoExpandido: T.boolean,
    efeitoAoLado: T.boolean,
    fonteEscala: T.positiveNumber,
  }

  override getDefaultProps(): ItemCardShapeType['props'] {
    return {
      w: CARD_LARGURA_PADRAO,
      h: CARD_ALTURA_PADRAO,
      itemId: '',
      expandido: false,
      infoExpandido: false,
      infoAoLado: false,
      efeitoExpandido: false,
      efeitoAoLado: false,
      fonteEscala: 1,
    }
  }

  override canEdit() {
    return false
  }

  // recolhido: trava o aspecto p/ o card seguir emoldurado à imagem ao redimensionar.
  // expandido: livre (os painéis de texto definem a altura).
  override isAspectRatioLocked(shape: ItemCardShapeType) {
    return !shape.props.expandido
  }

  // duplo clique alterna os painéis; a ficha completa abre com espaço
  // com o card selecionado (handler no CanvasView) — mesmo gesto das outras entidades
  override onDoubleClick = (shape: ItemCardShapeType) => {
    const expandir = !shape.props.expandido
    const delta = colunasPaineisVisiveis(true, contarAoLado(shape.props))
    return {
      id: shape.id,
      type: shape.type,
      props: { expandido: expandir, w: ajustarLargura(shape.props.w, expandir ? delta : -delta) },
    }
  }

  override component(shape: ItemCardShapeType) {
    return <CartaoItem shape={shape} />
  }

  override indicator(shape: ItemCardShapeType) {
    return <rect width={shape.props.w} height={shape.props.h} rx={6} />
  }
}

// nº de seções (fora Descrição) em coluna própria
function contarAoLado(props: ItemCardShapeType['props']): number {
  return [props.infoAoLado, props.efeitoAoLado].filter(Boolean).length
}

type ChaveSecao = 'informacao' | 'efeito'

const SECOES: { chave: ChaveSecao; rotulo: string; semTexto: string }[] = [
  { chave: 'informacao', rotulo: 'Informações', semTexto: 'Sem informações' },
  { chave: 'efeito', rotulo: 'Efeito', semTexto: 'Sem efeito' },
]

// flags booleanas planas do shape (props do tldraw são planas, sem mapa aninhado)
type FlagBooleana = 'infoExpandido' | 'infoAoLado' | 'efeitoExpandido' | 'efeitoAoLado'

const FLAGS: Record<ChaveSecao, { exp: FlagBooleana; lado: FlagBooleana }> = {
  informacao: { exp: 'infoExpandido', lado: 'infoAoLado' },
  efeito: { exp: 'efeitoExpandido', lado: 'efeitoAoLado' },
}

function CartaoItem({ shape }: { shape: ItemCardShapeType }) {
  const { itemId, expandido, fonteEscala } = shape.props
  const item = useApp((s) => s.itens[itemId])
  const vaultPath = useApp((s) => s.vaultPath)
  const salvarParcial = useApp((s) => s.salvarItemParcial)
  const editor = useEditor()

  // escala uniforme: largura por coluna vs base → multiplica toda fonte (--card-fe),
  // então imagem e texto crescem juntos ao redimensionar o card
  const cols = colunasTotais(expandido, contarAoLado(shape.props))
  const cardFe = escalaDoCartao(shape.props.w, cols) * fonteEscala

  const [editando, setEditando] = useState<'descricao' | ChaveSecao | null>(null)

  const retratoSrc = item?.retrato && vaultPath ? convertFileSrc(`${vaultPath}/${item.retrato}`) : null

  // guard de scroll: rolar dentro de um painel não vira zoom/pan do canvas
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
      const atual = editor.getShape(shape.id) as ItemCardShapeType | undefined
      if (!atual || atual.props.expandido) return
      if (atual.props.w !== CARD_LARGURA_PADRAO || atual.props.h !== CARD_ALTURA_PADRAO) return
      const novaH = alturaMoldadaAImagem(atual.props.w, img.naturalWidth / img.naturalHeight)
      if (novaH !== atual.props.h) {
        editor.updateShape<ItemCardShapeType>({ id: shape.id, type: 'item-card', props: { h: novaH } })
      }
    }
    img.src = retratoSrc
    return () => {
      cancelado = true
    }
  }, [retratoSrc, shape.id, editor])

  if (!item) {
    return (
      <HTMLContainer className="char-card char-card-removido" style={{ pointerEvents: 'all' }}>
        <div className="char-card-nome">Item removido</div>
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

  // uma seção (Informações / Efeito): header com toggles + conteúdo/editor
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
              editor.updateShape<ItemCardShapeType>({
                id: shape.id,
                type: 'item-card',
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
                editor.updateShape<ItemCardShapeType>({
                  id: shape.id,
                  type: 'item-card',
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
                  editor.updateShape<ItemCardShapeType>({
                    id: shape.id,
                    type: 'item-card',
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
            item[chave],
            editando === chave,
            (h) => salvarParcial(itemId, { [chave]: h }),
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
            alt={item.nome}
            fallback={<span className="char-card-inicial">💎</span>}
          />
          <div className="char-card-texto">
            <div className="char-card-nome">{item.nome}</div>
            {item.resumo ? <div className="char-card-resumo">{item.resumo}</div> : null}
            <ControlesFonte
              escala={fonteEscala}
              onEscala={(v) =>
                editor.updateShape<ItemCardShapeType>({
                  id: shape.id,
                  type: 'item-card',
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
                  item.descricao,
                  editando === 'descricao',
                  (h) => salvarParcial(itemId, { descricao: h }),
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
