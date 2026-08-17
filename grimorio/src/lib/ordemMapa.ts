/**
 * Ordem de empilhamento do mapa: qual peça fica sobre qual, independente da ordem em que
 * o usuário desenhou. Lib pura — sem tldraw, sem editor — só decide o RANKING (qual peça
 * pertence a qual altura, e onde uma peça nova entra no meio das que já existem). Quem
 * sabe transformar ranking em fractional index de verdade (`IndexKey`, `getIndexBetween`,
 * `getIndicesBetween`) é o chamador (`lib/montagemMapa.tsx`), que tem a API real do tldraw
 * à mão — mesma divisão de responsabilidade que `plantaMapaIA.ts`/`gerarMapaIA.ts` já usam.
 *
 * ## Duas chaves, nesta ordem: CAMADA por fora, BANDA por dentro
 *
 * A **camada** (`camadasMapa.ts`, `meta.camada`) é a chave EXTERNA: tudo que está numa
 * camada mais alta cobre tudo que está numa mais baixa, sem exceção — uma sala do "Térreo"
 * cobre uma porta do "Subsolo". É o que "camada superior" significa em Photoshop, Figma,
 * Krita e em qualquer editor gráfico, e é o comportamento que o usuário espera ao arrastar
 * uma camada para cima no painel.
 *
 * A **banda** é a chave INTERNA: DENTRO da mesma camada, o tipo da peça decide. Bandas, de
 * trás (mais embaixo) pra frente (mais em cima):
 * 1. `muralha` — contorno externo. Fica ANTES até da planta: cerca o conjunto por fora e
 *    não pode tampar sala nenhuma.
 * 2. `estrutura` — a planta em si: sala, sala-polígono, corredor, retângulo do mapa, e
 *    qualquer desenho genérico do tldraw sem identidade mais específica (parede da paleta é
 *    um `geo` estilizado; divisória é um `line` estilizado; rabisco é `draw`; imagem colada).
 *    Também onde cai o legado `linha-mapa` e qualquer tipo desconhecido (grupo do usuário,
 *    seta, frame…) — o palpite mais seguro pra algo sem identidade própria é o meio da
 *    pilha, não o topo nem o fundo absoluto.
 * 3. `abertura` — vãos NA planta: porta, escada, torre. Ficam sobre a estrutura porque são
 *    um recorte/marca nela, nunca embaixo (senão a parede as engoliria).
 * 4. `peca` — o que está POSTO em cima da planta: todo símbolo desenhado (item, móvel,
 *    marcador, armadilha, janela…).
 * 5. `rotulo` — texto solto: o elemento "Rótulo" da paleta, ou qualquer `text` nativo.
 * 6. `card` — ficha de personagem/cenário/item arrastada pro mapa: por cima do resto da
 *    própria camada, porque é uma referência clicável, não parte do desenho.
 *
 * ## Convenção da lista de camadas: índice 0 é o FUNDO
 *
 * `ordemCamadas` chega sempre do fundo pro topo — mesma ordem do array `CanvasDoc.camadas`
 * (ver `camadasMapa.ts`, que documenta a convenção e é quem a mantém). O painel é que
 * inverte na hora de desenhar, para o topo da lista ser a camada da frente.
 *
 * Chamador sem camada nenhuma (a bancada `amostra/CenaMapa.tsx`, e todo mapa salvo antes
 * das camadas existirem) passa `ordemCamadas` vazio: aí toda peça cai no índice 0 e o
 * ranking degenera exatamente no comportamento anterior, só por banda.
 */

export const BANDAS_MAPA = ['muralha', 'estrutura', 'abertura', 'peca', 'rotulo', 'card'] as const
export type BandaMapa = (typeof BANDAS_MAPA)[number]

const BANDA_POR_TIPO: Record<string, BandaMapa> = {
  'muralha-mapa': 'muralha',
  'sala-mapa': 'estrutura',
  'sala-poligono-mapa': 'estrutura',
  'corredor-mapa': 'estrutura',
  'retangulo-mapa': 'estrutura',
  'linha-mapa': 'estrutura', // legado
  geo: 'estrutura', // parede da paleta e retângulo/elipse genéricos
  draw: 'estrutura',
  line: 'estrutura', // divisória da paleta e linha genérica
  image: 'estrutura',
  'porta-mapa': 'abertura',
  'escada-mapa': 'abertura',
  'torre-mapa': 'abertura',
  'simbolo-mapa': 'peca',
  'item-mapa': 'peca',
  text: 'rotulo',
  'character-card': 'card',
  'cenario-card': 'card',
  'item-card': 'card',
}

/**
 * Banda de um tipo de shape do tldraw. Tipo desconhecido (grupo criado à mão, seta,
 * frame — qualquer coisa fora da lista acima) cai em "estrutura", o meio da pilha.
 */
export function bandaDoTipo(tipo: string): BandaMapa {
  return BANDA_POR_TIPO[tipo] ?? 'estrutura'
}

function rankDaBanda(banda: BandaMapa): number {
  return BANDAS_MAPA.indexOf(banda)
}

/**
 * Posição de uma camada na pilha (0 = fundo). Camada ausente, desconhecida ou órfã cai em
 * 0 — a MESMA regra de `camadaDoShape` em `camadasMapa.ts`, que devolve a primeira camada
 * nesses casos; as duas precisam concordar, senão a peça é desenhada numa camada e
 * empilhada como se estivesse noutra.
 */
export function indiceDaCamada(camadaId: string | undefined, ordemCamadas: readonly string[]): number {
  if (typeof camadaId !== 'string') return 0
  const i = ordemCamadas.indexOf(camadaId)
  return i === -1 ? 0 : i
}

export interface PecaEmpilhavel {
  banda: BandaMapa
  /** `meta.camada` do shape. Ausente/órfã = camada do fundo. */
  camada?: string
}

/**
 * Rank global de empilhamento, com a camada por fora e a banda por dentro. Quanto maior,
 * mais na frente. Multiplicar pelo número de bandas garante que NENHUMA diferença de banda
 * alcance a distância de uma camada — é o que faz "camada manda em tudo" ser verdade e não
 * só tendência.
 */
export function rankDeEmpilhamento(peca: PecaEmpilhavel, ordemCamadas: readonly string[]): number {
  return indiceDaCamada(peca.camada, ordemCamadas) * BANDAS_MAPA.length + rankDaBanda(peca.banda)
}

export interface IrmaoOrdenado extends PecaEmpilhavel {
  /** `IndexKey` do tldraw — string opaca aqui pra esta lib não depender de tldraw. */
  index: string
}

/**
 * Entre quais dois índices vizinhos uma forma NOVA deve nascer.
 *
 * `irmaosOrdenados` já vem ordenado do mais atrás pro mais na frente (mesma ordem que
 * `editor.getSortedChildIdsForParent` devolve). O resultado é sempre o TOPO do próprio
 * rank: acima de tudo de rank igual ou menor, abaixo da primeira coisa de rank maior — é o
 * que faz uma porta continuar acima de uma sala criada depois dela (mesma camada, banda
 * maior) e uma sala do Térreo continuar acima de uma porta do Subsolo (camada maior).
 *
 * `abaixo`/`acima` alimentam `getIndexBetween` do lado de fora (o chamador tem o `IndexKey`
 * de verdade); um dos dois (ou os dois) pode faltar — extremo da pilha.
 */
export function limitesParaNovaForma(
  irmaosOrdenados: readonly IrmaoOrdenado[],
  nova: PecaEmpilhavel,
  ordemCamadas: readonly string[] = [],
): { abaixo: string | undefined; acima: string | undefined } {
  const rankNova = rankDeEmpilhamento(nova, ordemCamadas)
  let abaixo: string | undefined
  let acima: string | undefined
  for (const irmao of irmaosOrdenados) {
    if (rankDeEmpilhamento(irmao, ordemCamadas) <= rankNova) {
      abaixo = irmao.index
    } else {
      acima = irmao.index
      break
    }
  }
  return { abaixo, acima }
}

export interface FormaParaOrdenar extends PecaEmpilhavel {
  id: string
  /** amostra dentro do quadro de legenda (`meta.decorativo`) — não é peça do mapa. */
  decorativo: boolean
}

/**
 * Ordem correta (ids) de um grupo de formas que compartilham o mesmo pai (mesma página, ou
 * dentro do mesmo grupo), já chegando ORDENADAS pelo `index` atual (de trás pra frente).
 * Usada para corrigir mapas antigos e para reaplicar a ordem depois que o usuário mexe nas
 * camadas (reordenar, mover peça de camada, excluir camada).
 *
 * Reordena SÓ por rank — dentro do MESMO rank (mesma camada E mesma banda), a ordem
 * relativa que já existe é preservada. É isso que faz o controle manual do usuário (trazer
 * à frente / mandar pra trás entre duas portas da mesma camada) sobreviver à correção.
 *
 * Grupo decorativo (a legenda inteira, cujas peças carregam `meta.decorativo`) sai
 * intocado — não é peça do mapa, é amostra dentro de um quadro fixo; reordenar ali
 * separaria os ícones dos textos sem ganho nenhum.
 */
export function ordenarPorEmpilhamento(
  formasOrdenadas: readonly FormaParaOrdenar[],
  ordemCamadas: readonly string[] = [],
): string[] {
  if (formasOrdenadas.some((f) => f.decorativo)) return formasOrdenadas.map((f) => f.id)
  return formasOrdenadas
    .map((f, posicaoAtual) => ({ id: f.id, posicaoAtual, rank: rankDeEmpilhamento(f, ordemCamadas) }))
    .sort((a, b) => a.rank - b.rank || a.posicaoAtual - b.posicaoAtual)
    .map((f) => f.id)
}

/** A normalização mexeria em algo? Compara a ordem correta com a atual, id a id. */
export function precisaReordenar(
  formasOrdenadas: readonly FormaParaOrdenar[],
  ordemCamadas: readonly string[] = [],
): boolean {
  const alvo = ordenarPorEmpilhamento(formasOrdenadas, ordemCamadas)
  return alvo.some((id, i) => id !== formasOrdenadas[i].id)
}
