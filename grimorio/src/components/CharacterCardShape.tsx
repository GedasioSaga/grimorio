import {
  BaseBoxShapeUtil,
  HTMLContainer,
  T,
  type RecordProps,
  type TLShape,
} from 'tldraw'
import { convertFileSrc } from '@tauri-apps/api/core'
import { useApp } from '../state/store'

// tldraw 4.x: shapes customizados entram no union TLShape via augmentation
// do TLGlobalShapePropsMap (declarado em @tldraw/tlschema).
declare module '@tldraw/tlschema' {
  interface TLGlobalShapePropsMap {
    'character-card': { w: number; h: number; personagemId: string }
  }
}

export type CharacterCardShapeType = TLShape<'character-card'>

export class CharacterCardShapeUtil extends BaseBoxShapeUtil<CharacterCardShapeType> {
  static override type = 'character-card' as const
  static override props: RecordProps<CharacterCardShapeType> = {
    w: T.positiveNumber,
    h: T.positiveNumber,
    personagemId: T.string,
  }

  override getDefaultProps(): CharacterCardShapeType['props'] {
    return { w: 220, h: 120, personagemId: '' }
  }

  override canEdit() {
    return false
  }

  override onDoubleClick = (shape: CharacterCardShapeType) => {
    useApp.getState().abrirPerfil(shape.props.personagemId)
  }

  override component(shape: CharacterCardShapeType) {
    return <CartaoPersonagem personagemId={shape.props.personagemId} />
  }

  override indicator(shape: CharacterCardShapeType) {
    return <rect width={shape.props.w} height={shape.props.h} rx={6} />
  }
}

function CartaoPersonagem({ personagemId }: { personagemId: string }) {
  const p = useApp((s) => s.personagens[personagemId])
  const vaultPath = useApp((s) => s.vaultPath)

  if (!p) {
    return (
      <HTMLContainer className="char-card char-card-removido" style={{ pointerEvents: 'all' }}>
        <div className="char-card-nome">Personagem removido</div>
      </HTMLContainer>
    )
  }

  const retratoSrc = p.retrato && vaultPath ? convertFileSrc(`${vaultPath}/${p.retrato}`) : null

  return (
    <HTMLContainer className="char-card" style={{ pointerEvents: 'all' }}>
      <div className="char-card-retrato">
        {retratoSrc ? (
          <img
            src={retratoSrc}
            alt={p.nome}
            onError={(e) => {
              ;(e.target as HTMLImageElement).style.display = 'none'
            }}
          />
        ) : (
          <span className="char-card-inicial">{p.nome.charAt(0).toUpperCase()}</span>
        )}
      </div>
      <div className="char-card-texto">
        <div className="char-card-nome">{p.nome}</div>
        <div className="char-card-resumo">{p.resumo}</div>
      </div>
    </HTMLContainer>
  )
}
