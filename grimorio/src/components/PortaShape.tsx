import {
  BaseBoxShapeUtil,
  SVGContainer,
  T,
  createShapePropsMigrationIds,
  createShapePropsMigrationSequence,
  type RecordProps,
  type TLShape,
  type TLShapePartial,
} from 'tldraw'
// estado e cor da porta vivem na lib pura, como os da sala — ver o cabeçalho de portaMapa.ts
import { PORTA_ESPESSURA_PADRAO, PORTA_LARGURA_PADRAO } from '../lib/portaMapa'
import { desenharPorta } from '../lib/desenhoPorta'
import { atenderDuploClique } from '../lib/duploCliqueMapa'
import { ancoraParaPorta, poseDaAncora } from '../lib/ancoraPortaEditor'

declare module '@tldraw/tlschema' {
  interface TLGlobalShapePropsMap {
    'porta-mapa': {
      w: number
      h: number
      /** 'livre' | 'trancada' | 'atencao' */
      estado: string
    }
  }
}

export type PortaShapeType = TLShape<'porta-mapa'>

/**
 * Porta do mapa: uma BARRA COLORIDA atravessada na parede, e a cor diz se você passa.
 *
 * A primeira versão desenhava vão + jambas + arco de abertura, a convenção de planta
 * arquitetônica. Estava tecnicamente correta e errada de propósito: as referências do
 * usuário são mapas de JOGO, onde a porta não descreve a construção, informa o estado —
 * azul passa, vermelho está trancada. Trocar a convenção também eliminou a parte mais
 * frágil do código anterior, que copiava a cor da sala embaixo para fingir o buraco.
 *
 * Sem `onBeforeCreate`/`onTranslateEnd`: a cor agora vem do estado, não do que está
 * embaixo, então a porta não depende mais de onde foi solta.
 */
/**
 * A porta trocou `props.cor` por `props.estado` (`ac39c40`) sem migração nenhuma, e o
 * validador de objeto do tldraw reprova nos DOIS sentidos: falta `estado` e sobra `cor`.
 * Resultado numa porta gravada no formato velho: `loadSnapshot` estoura, `useDocumentoTldraw`
 * cai no catch e o MAPA INTEIRO abre como "arquivo com erro" — não é a porta que se perde,
 * é o documento.
 */
const versoes = createShapePropsMigrationIds('porta-mapa', {
  CorViraEstado: 1,
})

export class PortaShapeUtil extends BaseBoxShapeUtil<PortaShapeType> {
  static override type = 'porta-mapa' as const

  static override props: RecordProps<PortaShapeType> = {
    w: T.positiveNumber,
    h: T.positiveNumber,
    estado: T.string,
  }

  static override migrations = createShapePropsMigrationSequence({
    sequence: [
      {
        /**
         * Os dois guards existem por causa de uma armadilha desta migração ser a PRIMEIRA
         * da porta: documento salvo antes de existir sequência nenhuma não tem entrada em
         * `sequences`, então TODA porta já gravada — inclusive as de hoje, com `estado`
         * certo — conta como versão 0 e passa por aqui. Um `props.estado = 'livre'` cego
         * destrancaria todas as portas de todos os mapas do cofre, de uma vez, no primeiro
         * abrir. O `undefined` limita o degrau a quem de fato não tem o campo.
         *
         * A `cor` velha não vira estado: ela era um hex copiado da sala embaixo (o truque
         * que a versão de vão+jambas usava para fingir o buraco na parede), não uma escolha
         * de trancada/livre. Não há informação ali para preservar — 'livre' é o mesmo
         * padrão de `getDefaultProps`, e o mestre corrige no painel quando reparar.
         */
        id: versoes.CorViraEstado,
        up(props) {
          delete props.cor
          if (props.estado === undefined) props.estado = 'livre'
        },
        down(props) {
          delete props.estado
        },
      },
    ],
  })

  getDefaultProps(): PortaShapeType['props'] {
    return { w: PORTA_LARGURA_PADRAO, h: PORTA_ESPESSURA_PADRAO, estado: 'livre' }
  }

  /**
   * A porta GRUDA na parede mais próxima enquanto é arrastada, e assume o ângulo dela.
   *
   * Antes era um retângulo colorido pousado por cima da planta: o mestre arrastava até perto,
   * girava à mão para acertar o eixo numa parede vertical, e ajustava o encosto. Três gestos
   * por porta — numa planta de doze cômodos com quinze portas, quarenta e cinco gestos que só
   * existem porque a peça não sabe onde mora.
   *
   * O encaixe acontece no `onTranslate` (durante o arrasto) e não só no fim, para o mestre
   * VER a porta saltar para a parede antes de soltar: encaixe que só aparece depois do gesto
   * parece que a peça pulou sozinha.
   *
   * `Alt` segura a ancoragem: com ele pressionado a porta fica solta e livre, para os casos
   * que a convenção não cobre (porta no meio de um salão, marcação de passagem secreta). Sem
   * escape, um encaixe automático vira camisa de força.
   *
   * O vínculo em si é gravado no `onTranslateEnd` — durante o arrasto só a POSE muda. Gravar
   * `meta` a cada frame encheria o histórico e faria o autosave escrever no cofre a cada
   * pixel de movimento.
   */
  override onTranslate(_inicial: PortaShapeType, atual: PortaShapeType) {
    if (this.editor.inputs.getAltKey()) return
    const ancora = ancoraParaPorta(this.editor, atual)
    if (!ancora) return
    const pose = poseDaAncora(this.editor, atual, ancora)
    if (!pose) return
    return { id: atual.id, type: atual.type, ...pose }
  }

  /**
   * Fim do arrasto: grava (ou apaga) o vínculo em `meta.ancora`.
   *
   * Soltar a porta longe de qualquer parede LIMPA o vínculo — sem isso, uma porta arrastada
   * para longe continuaria "pertencendo" à parede antiga e voltaria para lá no primeiro
   * redimensionamento do cômodo, parecendo teleporte.
   */
  override onTranslateEnd(_inicial: PortaShapeType, atual: PortaShapeType) {
    /**
     * Desancorar grava `ancora: null` em vez de OMITIR a chave.
     *
     * `updateShape` funde o `meta` com o que já existe (shallow merge), então mandar um
     * objeto sem a chave não apaga nada — a ancoragem antiga sobrevive à fusão e a porta
     * continua "pertencendo" à parede de onde acabou de sair. Medido por teste: soltar a
     * porta longe mantinha o vínculo. `null` é a única forma de dizer "não tem".
     */
    const solta = {
      id: atual.id,
      type: atual.type,
      meta: { ...atual.meta, ancora: null },
    } as TLShapePartial<PortaShapeType>

    if (this.editor.inputs.getAltKey()) return solta

    const ancora = ancoraParaPorta(this.editor, atual)
    if (!ancora) return solta

    const pose = poseDaAncora(this.editor, atual, ancora)
    return {
      id: atual.id,
      type: atual.type,
      ...(pose ?? {}),
      meta: {
        ...atual.meta,
        ancora: { hospedeiroId: ancora.hospedeiroId, indiceAresta: ancora.indiceAresta, t: ancora.t },
      },
    } as TLShapePartial<PortaShapeType>
  }

  /** Ver `atenderDuploClique`: sem isto, todo duplo clique nesta peça larga um texto vazio no mapa. */
  override onDoubleClick = atenderDuploClique

  component(shape: PortaShapeType) {
    const { w, h, estado } = shape.props
    return <SVGContainer>{desenharPorta({ w, h, estado })}</SVGContainer>
  }

  indicator(shape: PortaShapeType) {
    return <rect width={shape.props.w} height={shape.props.h} />
  }
}
