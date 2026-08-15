import { BaseBoxShapeUtil, SVGContainer, T, type RecordProps, type TLShape } from 'tldraw'
import { useApp } from '../state/store'
import { COR_PINO_ITEM_GENERICO, desenharGlifoItemGenerico, desenharPinoItem } from '../lib/desenhoSimbolo'
import { PINO_ITEM_ALTURA, PINO_ITEM_LARGURA } from '../lib/simbolosMapa'

declare module '@tldraw/tlschema' {
  interface TLGlobalShapePropsMap {
    'item-mapa': {
      w: number
      h: number
      /** id do Item (ficha do cofre) que este pino representa */
      itemId: string
    }
  }
}

export type ItemMapaShapeType = TLShape<'item-mapa'>

// Mesma constante de tamanho que os itens DECORATIVOS do catálogo usam
// (`PINO_ITEM_LARGURA`/`PINO_ITEM_ALTURA` em `simbolosMapa.ts`), não uma cópia — as duas
// famílias de item precisam nascer do mesmo tamanho para lerem como uma coisa só no mapa,
// e duas constantes com o mesmo valor por acidente é como uma delas muda sozinha um dia.
export const ITEM_MAPA_LARGURA_PADRAO = PINO_ITEM_LARGURA
export const ITEM_MAPA_ALTURA_PADRAO = PINO_ITEM_ALTURA

/**
 * Miniatura de um Item DE VERDADE (ficha do cofre) solto no mapa — pino pequeno, não o
 * card grande. Pedido do usuário: *"talvez quando eu puxer um item ficasse só a
 * miniatura, claro isso só na parte de mapa, o canvas continuaria normal"*.
 *
 * Por que um shape NOVO em vez de acrescentar `itemId`/uma flag "miniatura" ao
 * `item-card` que já existe: `item-card` já está em mapas e canvases salvos SEM essa
 * prop. Acrescentar prop a um shape EXISTENTE exige migração (ver `SalaMapaShape.tsx`,
 * `AdicionaCenarioId`, e o teste `migracaoSalaCenarioId.test.ts` que prova que o tldraw
 * migra em vez de recusar o documento) — sem ela, todo `item-card` já salvo vira
 * documento inválido no primeiro carregamento após a mudança. Um shape novo não corre
 * esse risco: documentos antigos simplesmente não têm nenhum `item-mapa` ainda, e o
 * `ItemCardShapeUtil.getDefaultProps` (comentário "Sem migrações: o shape nasce com
 * todas as props") confirma que essa é a mesma lógica que o próprio `item-card` já usa
 * para NÃO precisar de migração quando nasceu.
 *
 * O desenho reaproveita a família de pino dos itens decorativos (`desenharPinoItem` em
 * `lib/desenhoSimbolo.tsx`), com cor e glifo próprios (`COR_PINO_ITEM_GENERICO` /
 * `desenharGlifoItemGenerico`) — um Item de verdade pode ser qualquer coisa, então não
 * finge pertencer a nenhuma categoria do catálogo (poção, chave…).
 *
 * Duplo clique abre a ficha do Item — mesmo gesto que `SalaMapaShape` usa para abrir o
 * Cenário vinculado (`onDoubleClick` + `abrirCenario`), para o mapa ter uma convenção só.
 */
export class ItemMapaShapeUtil extends BaseBoxShapeUtil<ItemMapaShapeType> {
  static override type = 'item-mapa' as const

  static override props: RecordProps<ItemMapaShapeType> = {
    w: T.positiveNumber,
    h: T.positiveNumber,
    itemId: T.string,
  }

  getDefaultProps(): ItemMapaShapeType['props'] {
    return { w: ITEM_MAPA_LARGURA_PADRAO, h: ITEM_MAPA_ALTURA_PADRAO, itemId: '' }
  }

  override onDoubleClick = (shape: ItemMapaShapeType) => {
    const { itemId } = shape.props
    if (itemId && useApp.getState().itens[itemId]) useApp.getState().abrirItem(itemId)
    // sempre devolve algo, mesmo sem ficha pra abrir — mesmo motivo do `SalaMapaShape`:
    // handler sem retorno cai no double-click nativo do SelectTool, que cria um shape de
    // texto vazio no ponto (ver o JSDoc de `SalaMapaShapeUtil.onDoubleClick`).
    return { id: shape.id, type: shape.type }
  }

  component(shape: ItemMapaShapeType) {
    const { w, h } = shape.props
    return <SVGContainer>{desenharPinoItem(w, h, COR_PINO_ITEM_GENERICO, desenharGlifoItemGenerico(w))}</SVGContainer>
  }

  indicator(shape: ItemMapaShapeType) {
    return <rect width={shape.props.w} height={shape.props.h} />
  }
}
