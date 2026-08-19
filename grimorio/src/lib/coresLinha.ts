import { CONTORNO_SALA, CORES_SALA, aparenciaDaSala } from './salaMapa'
import { ehTipoSala } from './tiposSala'

/**
 * Cor da divisória (linha nativa do tldraw, tipo `line`) — pedido do usuário: paleta
 * fechada do Grimório MAIS um seletor livre atrás de "personalizada".
 *
 * Por que a cor não mora em `props.color` do shape nativo: a paleta de cor do tldraw
 * (`DefaultColorStyle`) é uma lista FECHADA de 13 nomes (`node_modules/@tldraw/tlschema/
 * src/styles/TLColorStyle.ts:23-37`) validada em runtime por `T.literalEnum(...)`
 * (`StyleProp.ts:119`) — passar um hex ali é rejeitado pelo schema do store antes mesmo
 * de chegar à tela. A cor da divisória vive em `shape.meta.corPersonalizada` (string
 * hex), lida por `LinhaMapaColoridaShapeUtil` — ver o porquê completo lá. `meta` não é
 * validado por um schema fixo neste app (já é assim para `meta.camada`/`meta.peca`/
 * `meta.decorativo`), então aceita qualquer hex sem precisar de migração de shape.
 *
 * Paleta reaproveitada de `CORES_SALA` ("nos moldes de", como pedido) em vez de duplicar
 * um array quase idêntico — mesmo tom médio, mesma fonte única de verdade. `PADRAO` é o
 * cinza-azulado que a divisória sempre teve (`CONTORNO_SALA`, casado com o contorno da
 * sala) e não está em `CORES_SALA`, por isso entra à parte como a primeira opção — é o
 * que uma divisória nova continua ganhando ao nascer.
 */
export const COR_LINHA_PADRAO = CONTORNO_SALA

export const CORES_LINHA: Array<{ id: string; nome: string; valor: string }> = [
  { id: 'padrao', nome: 'Padrão', valor: COR_LINHA_PADRAO },
  ...CORES_SALA,
]

/**
 * Forma mínima que o conta-gotas precisa enxergar — sem depender de tipos do tldraw.
 * `props`/`meta` ficam como `unknown`: `TLShape` é uma união de ~13 tipos com `props`
 * concretos e SEM índice de string (ex. `TLArrowShapeProps`), então nenhum deles bate
 * estruturalmente com `Record<string, unknown>` — quem chama sempre tem um `TLShape` de
 * verdade, e o cast aqui dentro é seguro porque só lemos chaves com `typeof` guardado.
 */
export interface FormaParaConferirCor {
  type: string
  props?: unknown
  meta?: unknown
}

/**
 * Conta-gotas: cor de uma peça já desenhada, para reaplicar numa divisória.
 *
 * Só sabe ler peças com cor PRÓPRIA e determinística (a cor final que a peça mostra na
 * tela, não um nome de estilo do tldraw a resolver contra tema): sala (cor escolhida à
 * mão, ou a cor do estado atual) e outra divisória/linha (`corPersonalizada`, ou o
 * padrão se ainda não foi trocada). Porta, símbolo, muralha e torre desenham com um
 * traço fixo do app (não é uma escolha do usuário) e ficam de fora — devolver uma cor
 * "inventada" para eles enganaria o usuário fazendo parecer que aquele traço é
 * configurável. `null` significa "essa peça não tem cor para copiar".
 */
export function corDeForma(forma: FormaParaConferirCor): string | null {
  const props = (forma.props ?? {}) as Record<string, unknown>
  const meta = (forma.meta ?? {}) as Record<string, unknown>

  // os DOIS formatos de sala: mesma prop `cor`, mesma cor de estado — pingar cor de um
  // cômodo em L tem que funcionar igual a pingar de um retangular (ver `tiposSala.ts`).
  if (ehTipoSala(forma.type)) {
    const cor = props.cor
    if (typeof cor === 'string' && cor) return cor
    const estado = typeof props.estado === 'string' ? props.estado : 'sem-info'
    return aparenciaDaSala(estado).preenchimento
  }

  if (forma.type === 'line') {
    const cor = meta.corPersonalizada
    return typeof cor === 'string' && cor ? cor : COR_LINHA_PADRAO
  }

  if (forma.type === 'retangulo-mapa') {
    const cor = props.cor
    return typeof cor === 'string' && cor ? cor : COR_LINHA_PADRAO
  }

  return null
}
