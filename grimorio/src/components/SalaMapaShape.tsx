import { BaseBoxShapeUtil, SVGContainer, T, createShapePropsMigrationIds, createShapePropsMigrationSequence, type RecordProps, type TLShape } from 'tldraw'
import { useApp } from '../state/store'
import { desenharCorpoSala } from '../lib/desenhoSala'
import { resolverVinculoSala } from '../lib/vinculoSalaCenario'

declare module '@tldraw/tlschema' {
  interface TLGlobalShapePropsMap {
    'sala-mapa': {
      w: number
      h: number
      /** 'pendente' | 'limpa' | 'sem-info' — ver lib/salaMapa.ts */
      estado: string
      /** nome do cômodo, escrito dentro da própria sala */
      rotulo: string
      /** cor escolhida à mão; vazio significa "usar a cor do estado" */
      cor: string
      /** id do Cenário (ficha) que esta sala abre; vazio = sem vínculo */
      cenarioId: string
    }
  }
}

export type SalaMapaShapeType = TLShape<'sala-mapa'>

export const SALA_LARGURA_PADRAO = 160
export const SALA_ALTURA_PADRAO = 112

/**
 * Sala do mapa: retângulo preenchido com a cor do ESTADO e o nome do cômodo escrito
 * dentro dela.
 *
 * O nome mora na sala em vez de ser um texto solto por cima porque é assim nas
 * referências — e porque texto solto desalinha na primeira vez que a sala é movida ou
 * redimensionada. Quebra em várias linhas quando a sala é estreita ("Sala do Depósito
 * Seguro"), com a conta em `quebrarRotulo` (lib pura, testada).
 *
 * A cor sai de `aparenciaDaSala`, também pura: vermelho é pendência, azul é limpo,
 * escuro é sem informação. Trocar o estado é o gesto mais repetido no uso real, então
 * ele fica no painel de propriedades, a um clique.
 */
// mapas salvos antes do vínculo sala↔cenário não têm `cenarioId` — sem a migração o
// tldraw recusa o documento inteiro ao validar contra o schema novo (mesmo padrão de
// CharacterCardShape.tsx / CenarioCardShape.tsx).
const versoes = createShapePropsMigrationIds('sala-mapa', {
  AdicionaCenarioId: 1,
})

export class SalaMapaShapeUtil extends BaseBoxShapeUtil<SalaMapaShapeType> {
  static override type = 'sala-mapa' as const

  static override props: RecordProps<SalaMapaShapeType> = {
    w: T.positiveNumber,
    h: T.positiveNumber,
    estado: T.string,
    rotulo: T.string,
    cor: T.string,
    cenarioId: T.string,
  }

  static override migrations = createShapePropsMigrationSequence({
    sequence: [
      {
        id: versoes.AdicionaCenarioId,
        up(props) {
          props.cenarioId = ''
        },
        down(props) {
          delete props.cenarioId
        },
      },
    ],
  })

  getDefaultProps(): SalaMapaShapeType['props'] {
    // padrão é 'sem-info', não 'pendente': a IA marcava tudo como pendente e o mapa
    // inteiro saía vermelho de cara — metade da queixa "horrível" do usuário era isso.
    // 'sem-info' nasce neutro; o mestre promove pra vermelho/azul quando de fato sabe.
    return { w: SALA_LARGURA_PADRAO, h: SALA_ALTURA_PADRAO, estado: 'sem-info', rotulo: '', cor: '', cenarioId: '' }
  }

  /**
   * Duplo clique abre a ficha do Cenário vinculado. Escolhido em vez de clique único
   * porque clique único já é seleção/início de arrasto no tldraw — usar esse gesto para
   * abrir a ficha tornaria impossível mover a sala sem abrir a ficha de goela abaixo.
   * Duplo clique também não tinha nenhum uso anterior nesta forma (ela não é editável
   * inline; o nome do cômodo se edita pelo painel de propriedades), então não colide com
   * nada.
   *
   * Vínculo quebrado (cenário excluído): duplo clique não faz nada — não há o que abrir,
   * e o usuário já vê o aviso na própria sala (badge ⚠).
   */
  override onDoubleClick = (shape: SalaMapaShapeType) => {
    const { cenarioId } = shape.props
    if (cenarioId && useApp.getState().cenarios[cenarioId]) useApp.getState().abrirCenario(cenarioId)
    /**
     * SEMPRE devolve uma mudança, mesmo sem vínculo nenhum para abrir.
     *
     * O `Idle` do SelectTool só considera o handler atendido quando ele retorna algo truthy
     * (`node_modules/tldraw/src/lib/tools/SelectTool/childStates/Idle.ts:312-336`): sem retorno,
     * ele segue para `handleDoubleClickOnCanvas`, que CRIA um shape de texto no ponto e entra em
     * edição — o comentário no código deles diz isso com todas as letras. Como a sala não é
     * editável (`canEdit` default é false), todo duplo clique numa sala sujava o mapa com um
     * texto vazio. Isso já acontecia antes deste vínculo existir, porque não havia handler
     * nenhum; agora o handler existe e fecha os dois casos de uma vez.
     *
     * O retorno é um parcial sem prop alguma: `updateShapes` não acha diferença e nada muda de
     * verdade. O valor serve só de "eu tratei isto".
     */
    return { id: shape.id, type: shape.type }
  }

  component(shape: SalaMapaShapeType) {
    return <CorpoSala shape={shape} />
  }

  indicator(shape: SalaMapaShapeType) {
    return <rect width={shape.props.w} height={shape.props.h} />
  }
}

function CorpoSala({ shape }: { shape: SalaMapaShapeType }) {
  const { w, h, estado, rotulo, cor, cenarioId } = shape.props
  // nome do cenário vinculado (se existir) é o bastante pro resolvedor puro decidir
  // vinculado/quebrado/sem-vínculo
  const nomeCenario = useApp((s) => (cenarioId ? s.cenarios[cenarioId]?.nome : undefined))
  // `carregando` separa "cenário sumiu" de "ainda não li os cenários" — as duas chegam como
  // chave ausente, e confundi-las faria toda sala ligada piscar o aviso de quebrado ao abrir
  // o cofre. O porquê inteiro está em `resolverVinculoSala`.
  const carregando = useApp((s) => s.carregando)
  const vinculo = resolverVinculoSala(
    cenarioId,
    nomeCenario !== undefined ? { [cenarioId]: nomeCenario } : {},
    !carregando,
  )

  return <SVGContainer>{desenharCorpoSala({ w, h, estado, rotulo, cor, vinculo })}</SVGContainer>
}
