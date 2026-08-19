import {
  BaseBoxShapeUtil,
  SVGContainer,
  T,
  createShapePropsMigrationIds,
  createShapePropsMigrationSequence,
  useEditor,
  useValue,
  type RecordProps,
  type TLShape,
} from 'tldraw'
import { vaosDoContorno } from '../lib/ancoraPortaEditor'
import { useApp } from '../state/store'
import { desenharCorpoSala } from '../lib/desenhoSala'
import { ESPESSURA_CONTORNO_SALA, FONTE_ROTULO_PADRAO } from '../lib/salaMapa'
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
      /** espessura do contorno em px — ver ESPESSURAS_SALA em lib/salaMapa.ts */
      espessura: number
      /** corpo do nome do cômodo em px — ver TAMANHOS_ROTULO */
      rotuloTamanho: number
      /** 'topo' | 'centro' | 'base' — onde o nome fica dentro da sala */
      rotuloAncora: string
      /** nome escrito de baixo para cima, para cômodo estreito e alto */
      rotuloVertical: boolean
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
  AdicionaEspessura: 2,
  AdicionaCor: 3,
  AdicionaEstiloRotulo: 4,
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
    espessura: T.positiveNumber,
    rotuloTamanho: T.positiveNumber,
    rotuloAncora: T.string,
    rotuloVertical: T.boolean,
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
      {
        // sala salva antes da espessura configurável sobe com o valor que ela SEMPRE
        // desenhou (`ESPESSURA_CONTORNO_SALA`), não com o primeiro item da lista: mapa
        // antigo tem que reabrir pixel-idêntico, senão a migração vira uma edição em massa
        // que ninguém pediu e que o autosave grava no cofre.
        id: versoes.AdicionaEspessura,
        up(props) {
          props.espessura = ESPESSURA_CONTORNO_SALA
        },
        down(props) {
          delete props.espessura
        },
      },
      {
        /**
         * `cor` entrou em `da137af` SEM migração — a sala nasceu (`65f67c2`) só com
         * `w`/`h`/`estado`/`rotulo`. Mapa salvo nessa janela migra "com sucesso" e depois
         * MORRE na validação: `props.cor: Expected string, got undefined`. Quem paga não é
         * a sala, é o documento inteiro — `useDocumentoTldraw` cai no catch e o mapa abre
         * como "arquivo com erro".
         *
         * Este degrau é o número 3 mesmo tendo vindo antes dos outros dois na história.
         * Não há o que renumerar: documento sem a chave de sequência roda TODOS os degraus,
         * e é exatamente esse o arquivo em risco. Numerar por ordem histórica exigiria
         * reescrever as versões já gravadas nos mapas de hoje, que é o estrago maior.
         *
         * O guard `=== undefined` faz o degrau ser idempotente: documento na versão 2 (já
         * com `cor` escolhida pelo mestre) também passa por aqui ao subir para a 3, e um
         * `props.cor = ''` cego apagaria a cor de toda sala pintada à mão do cofre.
         */
        id: versoes.AdicionaCor,
        up(props) {
          if (props.cor === undefined) props.cor = ''
        },
        down(props) {
          delete props.cor
        },
      },
      {
        /**
         * Tamanho, posição e orientação do nome entram num degrau SÓ: são uma decisão de
         * apresentação do rótulo, sempre escolhidas juntas no painel, e três degraus
         * separados só multiplicariam a chance de um mapa parar no meio da escada.
         *
         * Os valores de subida são exatamente o que a sala SEMPRE desenhou — corpo 12,
         * ancorada no topo, horizontal. Mapa antigo reabre idêntico; nada de migração que
         * reposiciona o nome de todo cômodo do cofre sem ninguém pedir.
         */
        id: versoes.AdicionaEstiloRotulo,
        up(props) {
          if (props.rotuloTamanho === undefined) props.rotuloTamanho = FONTE_ROTULO_PADRAO
          if (props.rotuloAncora === undefined) props.rotuloAncora = 'topo'
          if (props.rotuloVertical === undefined) props.rotuloVertical = false
        },
        down(props) {
          delete props.rotuloTamanho
          delete props.rotuloAncora
          delete props.rotuloVertical
        },
      },
    ],
  })

  getDefaultProps(): SalaMapaShapeType['props'] {
    // padrão é 'sem-info', não 'pendente': a IA marcava tudo como pendente e o mapa
    // inteiro saía vermelho de cara — metade da queixa "horrível" do usuário era isso.
    // 'sem-info' nasce neutro; o mestre promove pra vermelho/azul quando de fato sabe.
    return {
      w: SALA_LARGURA_PADRAO,
      h: SALA_ALTURA_PADRAO,
      estado: 'sem-info',
      rotulo: '',
      cor: '',
      cenarioId: '',
      espessura: ESPESSURA_CONTORNO_SALA,
      rotuloTamanho: FONTE_ROTULO_PADRAO,
      rotuloAncora: 'topo',
      rotuloVertical: false,
    }
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
  const { w, h, estado, rotulo, cor, cenarioId, espessura, rotuloTamanho, rotuloAncora, rotuloVertical } =
    shape.props
  // nome do cenário vinculado (se existir) é o bastante pro resolvedor puro decidir
  // vinculado/quebrado/sem-vínculo
  /**
   * Vãos do contorno: os das portas ancoradas MAIS os das peças de massa encostadas.
   *
   * Lido aqui, e não passado por prop, porque a relação é da PORTA para a sala: a sala não
   * guarda lista de portas (isso duplicaria o vínculo em dois lugares e os dois divergiriam
   * na primeira vez que uma porta fosse apagada). `useValue` reage a criar, mover e apagar
   * porta, então o vão aparece e some sozinho.
   */
  const editor = useEditor()
  const vaos = useValue('sala-vaos-contorno', () => vaosDoContorno(editor, shape.id), [editor, shape.id])

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

  return (
    <SVGContainer>
      {desenharCorpoSala({
        w,
        h,
        estado,
        rotulo,
        cor,
        vinculo,
        espessura,
        estiloRotulo: { tamanho: rotuloTamanho, ancora: rotuloAncora, vertical: rotuloVertical },
        vaos,
      })}
    </SVGContainer>
  )
}
