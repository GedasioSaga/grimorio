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
import { ajustarLargura, alturaMoldadaAImagem, colunasTotais, escalaDoCartao } from '../lib/cartaoCanvas'
import { EditorInline } from './EditorInline'
import { ControlesFonte } from './ControlesFonte'
import { CardRetrato } from './CardRetrato'
import { versaoAtivaPersonagem, versaoVizinhaPersonagem } from '../lib/personagemVersao'

export const CARD_LARGURA_PADRAO = 240
export const CARD_ALTURA_PADRAO = 320

// tldraw 4.x: shapes customizados entram no union TLShape via augmentation
// do TLGlobalShapePropsMap (declarado em @tldraw/tlschema).
declare module '@tldraw/tlschema' {
  interface TLGlobalShapePropsMap {
    'character-card': {
      w: number
      h: number
      personagemId: string
      expandido: boolean
      infoExpandido: boolean
      infoAoLado: boolean
      fonteEscala: number
    }
  }
}

export type CharacterCardShapeType = TLShape<'character-card'>

const versoes = createShapePropsMigrationIds('character-card', {
  AdicionaExpandido: 1,
  AdicionaInfoExpandido: 2,
  AdicionaInfoAoLado: 3,
  AdicionaFonteEscala: 4,
})

export class CharacterCardShapeUtil extends BaseBoxShapeUtil<CharacterCardShapeType> {
  static override type = 'character-card' as const
  static override props: RecordProps<CharacterCardShapeType> = {
    w: T.positiveNumber,
    h: T.positiveNumber,
    personagemId: T.string,
    expandido: T.boolean,
    infoExpandido: T.boolean,
    infoAoLado: T.boolean,
    fonteEscala: T.positiveNumber,
  }

  // canvases salvos antes do painel de descrição não têm `expandido`/`infoExpandido`
  static override migrations = createShapePropsMigrationSequence({
    sequence: [
      {
        id: versoes.AdicionaExpandido,
        up(props) {
          props.expandido = false
        },
        down(props) {
          delete props.expandido
        },
      },
      {
        id: versoes.AdicionaInfoExpandido,
        up(props) {
          props.infoExpandido = false
        },
        down(props) {
          delete props.infoExpandido
        },
      },
      {
        id: versoes.AdicionaInfoAoLado,
        up(props) {
          props.infoAoLado = false
        },
        down(props) {
          delete props.infoAoLado
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

  override getDefaultProps(): CharacterCardShapeType['props'] {
    return {
      w: CARD_LARGURA_PADRAO,
      h: CARD_ALTURA_PADRAO,
      personagemId: '',
      expandido: false,
      infoExpandido: false,
      infoAoLado: false,
      fonteEscala: 1,
    }
  }

  override canEdit() {
    return false
  }

  // recolhido: trava o aspecto p/ o card seguir emoldurado à imagem ao redimensionar.
  // expandido: livre (os painéis de texto definem a altura).
  override isAspectRatioLocked(shape: CharacterCardShapeType) {
    return !shape.props.expandido
  }

  // duplo clique alterna o painel de descrição; o cartão completo abre com
  // espaço com o card selecionado (handler no CanvasView)
  override onDoubleClick = (shape: CharacterCardShapeType) => {
    const expandir = !shape.props.expandido
    // informações ao lado ocupam uma segunda coluna: abre/fecha 2 painéis de largura
    const paineis = shape.props.infoAoLado ? 2 : 1
    return {
      id: shape.id,
      type: shape.type,
      props: { expandido: expandir, w: ajustarLargura(shape.props.w, expandir ? paineis : -paineis) },
    }
  }

  override component(shape: CharacterCardShapeType) {
    return <CartaoPersonagem shape={shape} />
  }

  override indicator(shape: CharacterCardShapeType) {
    return <rect width={shape.props.w} height={shape.props.h} rx={6} />
  }
}

function CartaoPersonagem({ shape }: { shape: CharacterCardShapeType }) {
  const { personagemId, expandido, infoExpandido, infoAoLado, fonteEscala } = shape.props
  const p = useApp((s) => s.personagens[personagemId])
  const vaultPath = useApp((s) => s.vaultPath)
  const salvarParcial = useApp((s) => s.salvarPersonagemParcial)
  const definirVersaoAtivaPersonagem = useApp((s) => s.definirVersaoAtivaPersonagem)
  const tldrawEditor = useEditor()

  // escala uniforme: largura por coluna vs base → multiplica toda fonte (--card-fe),
  // então imagem e texto crescem juntos ao redimensionar o card
  const cols = colunasTotais(expandido, infoAoLado ? 1 : 0)
  const cardFe = escalaDoCartao(shape.props.w, cols) * fonteEscala

  // qual caixa do painel está em edição inline (transitório; não persiste)
  const [editando, setEditando] = useState<'descricao' | 'informacao' | null>(null)

  const retratoRel = p ? versaoAtivaPersonagem(p).retrato : null
  const retratoSrc = retratoRel && vaultPath ? convertFileSrc(`${vaultPath}/${retratoRel}`) : null

  // trocar de forma fecha edição inline aberta: o EditorInline (Tiptap) não
  // ressincroniza `value` após montar, então continuar digitando gravaria na forma anterior.
  useEffect(() => {
    setEditando(null)
  }, [p?.versaoAtivaId])

  // rolar dentro dos painéis não pode virar zoom/pan do canvas: listener nativo
  // no próprio elemento dispara antes do listener do tldraw e corta a propagação
  const painelRef = useRef<HTMLDivElement | null>(null)
  const painelInfoRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const els = [painelRef.current, painelInfoRef.current].filter(
      (el): el is HTMLDivElement => el !== null,
    )
    if (els.length === 0) return
    const aoRolar = (e: WheelEvent) => e.stopPropagation()
    els.forEach((el) => el.addEventListener('wheel', aoRolar, { passive: true }))
    return () => els.forEach((el) => el.removeEventListener('wheel', aoRolar))
  }, [expandido, infoAoLado])

  // emoldura à imagem uma vez, só em cards no tamanho padrão (nunca redimensionados)
  useEffect(() => {
    if (!retratoSrc) return
    let cancelado = false
    const img = new Image()
    img.onload = () => {
      if (cancelado || img.naturalWidth <= 0 || img.naturalHeight <= 0) return
      const atual = tldrawEditor.getShape(shape.id) as CharacterCardShapeType | undefined
      if (!atual || atual.props.expandido) return
      if (atual.props.w !== CARD_LARGURA_PADRAO || atual.props.h !== CARD_ALTURA_PADRAO) return
      const novaH = alturaMoldadaAImagem(atual.props.w, img.naturalWidth / img.naturalHeight)
      if (novaH !== atual.props.h) {
        tldrawEditor.updateShape<CharacterCardShapeType>({ id: shape.id, type: 'character-card', props: { h: novaH } })
      }
    }
    img.src = retratoSrc
    return () => {
      cancelado = true
    }
  }, [retratoSrc, shape.id, tldrawEditor])

  if (!p) {
    return (
      <HTMLContainer className="char-card char-card-removido" style={{ pointerEvents: 'all' }}>
        <div className="char-card-nome">Personagem removido</div>
      </HTMLContainer>
    )
  }

  const va = versaoAtivaPersonagem(p)

  // usada nos dois layouts: abaixo da Descrição (mesma coluna) ou em coluna própria à direita
  const secaoInformacoes = (
    <div className="char-card-secao">
      <div className="char-card-secao-header">
        <button
          className="char-card-info-toggle"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() =>
            tldrawEditor.updateShape<CharacterCardShapeType>({
              id: shape.id,
              type: 'character-card',
              props: { infoExpandido: !infoExpandido },
            })
          }
        >
          {infoExpandido ? '▾' : '▸'} Informações
        </button>
        <span className="char-card-secao-acoes">
          <button
            className="char-card-btn-editar"
            title={infoAoLado ? 'Mover para baixo da Descrição' : 'Mover para a direita da Descrição'}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() =>
              tldrawEditor.updateShape<CharacterCardShapeType>({
                id: shape.id,
                type: 'character-card',
                props: { infoAoLado: !infoAoLado, w: ajustarLargura(shape.props.w, infoAoLado ? -1 : 1) },
              })
            }
          >
            {infoAoLado ? '↓' : '→'}
          </button>
          <button
            className="char-card-btn-editar"
            title="Editar informações aqui mesmo"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => {
              if (!infoExpandido) {
                tldrawEditor.updateShape<CharacterCardShapeType>({
                  id: shape.id,
                  type: 'character-card',
                  props: { infoExpandido: true },
                })
              }
              setEditando('informacao')
            }}
          >
            ✎
          </button>
        </span>
      </div>
      {infoExpandido &&
        (editando === 'informacao' ? (
          <div className="char-card-editor" onPointerDown={(e) => e.stopPropagation()}>
            <EditorInline
              value={va.informacao}
              onChange={(html) => salvarParcial(personagemId, { informacao: html })}
              onBlur={() => setEditando(null)}
            />
          </div>
        ) : temConteudo(va.informacao) ? (
          <div className="char-card-descricao" dangerouslySetInnerHTML={{ __html: va.informacao }} />
        ) : (
          <div className="char-card-sem-descricao">Sem informações</div>
        ))}
    </div>
  )

  return (
    <HTMLContainer className="char-card" style={{ pointerEvents: 'all', ['--card-fe' as any]: cardFe }}>
      <div className="char-card-principal">
        <CardRetrato
          src={retratoSrc}
          alt={va.nome}
          fallback={<span className="char-card-inicial">{va.nome.charAt(0).toUpperCase()}</span>}
        />
        <div className="char-card-texto">
          <div className="char-card-nome">{va.nome}</div>
          {va.resumo ? <div className="char-card-resumo">{va.resumo}</div> : null}
          <ControlesFonte
            escala={fonteEscala}
            onEscala={(v) =>
              tldrawEditor.updateShape<CharacterCardShapeType>({
                id: shape.id,
                type: 'character-card',
                props: { fonteEscala: v },
              })
            }
          />
          {p.versoes.length >= 2 && (
            <span className="card-versao-ctrl" onPointerDown={(e) => e.stopPropagation()}>
              <button title="Forma anterior" onClick={() => definirVersaoAtivaPersonagem(personagemId, versaoVizinhaPersonagem(p, -1))}>‹</button>
              <span className="card-versao-nome">{va.nome}</span>
              <button title="Próxima forma" onClick={() => definirVersaoAtivaPersonagem(personagemId, versaoVizinhaPersonagem(p, 1))}>›</button>
            </span>
          )}
        </div>
      </div>
      {expandido && (
        <>
          <div ref={painelRef} className="char-card-painel">
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
              {editando === 'descricao' ? (
                // pointerdown parado: seleção de texto/duplo clique não vira drag/toggle do shape
                <div className="char-card-editor" onPointerDown={(e) => e.stopPropagation()}>
                  <EditorInline
                    value={va.descricao}
                    onChange={(html) => salvarParcial(personagemId, { descricao: html })}
                    onBlur={() => setEditando(null)}
                  />
                </div>
              ) : temConteudo(va.descricao) ? (
                // HTML do próprio TipTap (schema seguro, conteúdo local) — sem fonte externa
                <div className="char-card-descricao" dangerouslySetInnerHTML={{ __html: va.descricao }} />
              ) : (
                <div className="char-card-sem-descricao">Sem descrição</div>
              )}
            </div>
            {!infoAoLado && secaoInformacoes}
          </div>
          {infoAoLado && (
            <div ref={painelInfoRef} className="char-card-painel">
              {secaoInformacoes}
            </div>
          )}
        </>
      )}
    </HTMLContainer>
  )
}
