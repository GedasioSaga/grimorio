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
import { PAINEL_DESCRICAO_LARGURA, ajustarLargura } from '../lib/cartaoCanvas'
import { CARD_ALTURA_PADRAO, CARD_LARGURA_PADRAO } from './CharacterCardShape'
import { EditorInline } from './EditorInline'

declare module '@tldraw/tlschema' {
  interface TLGlobalShapePropsMap {
    'cenario-card': {
      w: number
      h: number
      cenarioId: string
      expandido: boolean
      infoExpandido: boolean
      infoAoLado: boolean
    }
  }
}

export type CenarioCardShapeType = TLShape<'cenario-card'>

export class CenarioCardShapeUtil extends BaseBoxShapeUtil<CenarioCardShapeType> {
  static override type = 'cenario-card' as const
  static override props: RecordProps<CenarioCardShapeType> = {
    w: T.positiveNumber,
    h: T.positiveNumber,
    cenarioId: T.string,
    expandido: T.boolean,
    infoExpandido: T.boolean,
    infoAoLado: T.boolean,
  }

  override getDefaultProps(): CenarioCardShapeType['props'] {
    return {
      w: CARD_LARGURA_PADRAO,
      h: CARD_ALTURA_PADRAO,
      cenarioId: '',
      expandido: false,
      infoExpandido: false,
      infoAoLado: false,
    }
  }

  override canEdit() {
    return false
  }

  // duplo clique alterna o painel de descrição; o modal abre com espaço
  // com o card selecionado (handler no CanvasView) — mesmo gesto do personagem
  override onDoubleClick = (shape: CenarioCardShapeType) => {
    const expandir = !shape.props.expandido
    const paineis = shape.props.infoAoLado ? 2 : 1
    return {
      id: shape.id,
      type: shape.type,
      props: { expandido: expandir, w: ajustarLargura(shape.props.w, expandir ? paineis : -paineis) },
    }
  }

  override component(shape: CenarioCardShapeType) {
    return <CartaoCenario shape={shape} />
  }

  override indicator(shape: CenarioCardShapeType) {
    return <rect width={shape.props.w} height={shape.props.h} rx={6} />
  }
}

function CartaoCenario({ shape }: { shape: CenarioCardShapeType }) {
  const { cenarioId, expandido, infoExpandido, infoAoLado } = shape.props
  const c = useApp((s) => s.cenarios[cenarioId])
  const vaultPath = useApp((s) => s.vaultPath)
  const salvarParcial = useApp((s) => s.salvarCenarioParcial)
  const tldrawEditor = useEditor()

  const [editando, setEditando] = useState<'descricao' | 'informacao' | null>(null)

  const retratoSrc = c?.retrato && vaultPath ? convertFileSrc(`${vaultPath}/${c.retrato}`) : null

  const [erroImg, setErroImg] = useState(false)
  useEffect(() => {
    setErroImg(false)
  }, [retratoSrc])

  // rolar dentro dos painéis não pode virar zoom/pan do canvas (mesmo racional do personagem)
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

  if (!c) {
    return (
      <HTMLContainer className="char-card char-card-removido" style={{ pointerEvents: 'all' }}>
        <div className="char-card-nome">Cenário removido</div>
      </HTMLContainer>
    )
  }

  const secaoInformacoes = (
    <div className="char-card-secao">
      <div className="char-card-secao-header">
        <button
          className="char-card-info-toggle"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() =>
            tldrawEditor.updateShape<CenarioCardShapeType>({
              id: shape.id,
              type: 'cenario-card',
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
              tldrawEditor.updateShape<CenarioCardShapeType>({
                id: shape.id,
                type: 'cenario-card',
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
                tldrawEditor.updateShape<CenarioCardShapeType>({
                  id: shape.id,
                  type: 'cenario-card',
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
              value={c.informacao}
              onChange={(html) => salvarParcial(cenarioId, { informacao: html })}
              onBlur={() => setEditando(null)}
            />
          </div>
        ) : temConteudo(c.informacao) ? (
          <div className="char-card-descricao" dangerouslySetInnerHTML={{ __html: c.informacao }} />
        ) : (
          <div className="char-card-sem-descricao">Sem informações</div>
        ))}
    </div>
  )

  return (
    <HTMLContainer className="char-card" style={{ pointerEvents: 'all' }}>
      <div className="char-card-principal">
        <div className="char-card-retrato">
          {retratoSrc && !erroImg ? (
            <img src={retratoSrc} alt={c.nome} draggable={false} onError={() => setErroImg(true)} />
          ) : (
            <span className="char-card-inicial">🗺</span>
          )}
        </div>
        <div className="char-card-texto">
          <div className="char-card-nome">{c.nome}</div>
          {c.resumo ? <div className="char-card-resumo">{c.resumo}</div> : null}
        </div>
      </div>
      {expandido && (
        <>
          <div ref={painelRef} className="char-card-painel" style={{ width: PAINEL_DESCRICAO_LARGURA }}>
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
                <div className="char-card-editor" onPointerDown={(e) => e.stopPropagation()}>
                  <EditorInline
                    value={c.descricao}
                    onChange={(html) => salvarParcial(cenarioId, { descricao: html })}
                    onBlur={() => setEditando(null)}
                  />
                </div>
              ) : temConteudo(c.descricao) ? (
                <div className="char-card-descricao" dangerouslySetInnerHTML={{ __html: c.descricao }} />
              ) : (
                <div className="char-card-sem-descricao">Sem descrição</div>
              )}
            </div>
            {!infoAoLado && secaoInformacoes}
          </div>
          {infoAoLado && (
            <div ref={painelInfoRef} className="char-card-painel" style={{ width: PAINEL_DESCRICAO_LARGURA }}>
              {secaoInformacoes}
            </div>
          )}
        </>
      )}
    </HTMLContainer>
  )
}
