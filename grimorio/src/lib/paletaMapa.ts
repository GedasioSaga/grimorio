/**
 * Paleta RPG de elementos de mapa (Parede, Porta, Janela, Escada).
 *
 * Mecânica (Parede/Porta/Janela): igual à toolbar (`MapaToolbar.tsx`) — clicar no
 * elemento pré-estila a PRÓXIMA forma via `editor.setStyleForNextShapes(style, valor)`
 * para cada estilo em `estilos`, e seleciona a ferramenta `geo` (`GeoShapeGeoStyle`
 * fica em `estilos.geo` — não, o campo `geo` aqui é só a forma tldraw, os estilos vão
 * em `estilos.color`/`fill`/`dash`/`size`, aplicados via `DefaultColorStyle` etc).
 *
 * Escada NÃO usa a mecânica de pré-estilo: não existe geo tldraw com listras/degraus
 * (`GeoShapeGeoStyle.values` verificado em
 * `node_modules/@tldraw/tlschema/src/shapes/TLGeoShape.ts:40-51` — cloud, rectangle,
 * ellipse, triangle, diamond, pentagon, hexagon, octagon, star, rhombus, rhombus-2,
 * oval, trapezoid, arrow-*, x-box, check-box, heart; nada de degraus). Por isso
 * `escada` não define `geo`/`estilos`: o botão da toolbar cria na hora um grupo de N
 * retângulos finos paralelos (degraus), via `editor.createShapes` + `editor.groupShapes`
 * (ambos verificados em `node_modules/@tldraw/editor/src/lib/editor/Editor.ts:7917`
 * e `:8250-8323`).
 *
 * Valores de estilo verificados contra o tlschema real (não inventados):
 * - cores: `node_modules/@tldraw/tlschema/src/styles/TLColorStyle.ts:23-37`
 *   (`defaultColorNames`) — 'white', 'orange' e 'light-blue' existem todos.
 * - fill: `node_modules/@tldraw/tlschema/src/styles/TLFillStyle.ts:39`
 *   — 'none' | 'semi' | 'solid' | 'pattern' | 'fill' | 'lined-fill'.
 * - dash: `node_modules/@tldraw/tlschema/src/styles/TLDashStyle.ts:38`
 *   — 'draw' | 'solid' | 'dashed' | 'dotted'.
 * - size: `node_modules/@tldraw/tlschema/src/styles/TLSizeStyle.ts:38`
 *   — 's' | 'm' | 'l' | 'xl'.
 *
 * Decisão de estilo da Parede: cor 'white' + fill 'solid' dá um retângulo
 * INTEIRAMENTE branco (sem contraste entre traço e miolo, já que os dois usam a
 * mesma cor no tldraw — ver `getColorValue`/`fill` em TLColorStyle.ts). No tema dark
 * do editor isso lê bem como bloco sólido claro (parede maciça), que é o padrão comum
 * de mapa de RPG (bloco cheio = parede). Optei por manter fill 'solid' em vez de
 * 'none' porque o pedido original descreve "parede branca cheia" como resultado
 * aceitável quando não há textura própria de "traço grosso vazado" no fill tldraw.
 */

import { ITENS_MAPA, type SimboloId } from './simbolosMapa'

export type PecaId =
  | 'sala' | 'parede' | 'porta' | 'janela' | 'escada'
  | 'secreta' | 'armadilha' | 'marcador' | 'rotulo'
  | 'mesa' | 'cama' | 'bau' | 'andar'
  // itens: o id da peça é o mesmo do símbolo, porque um item É o seu desenho
  | 'pocao' | 'erva' | 'chave' | 'documento' | 'moeda'
  | 'espada' | 'municao' | 'livro' | 'tocha' | 'comida'

export interface ElementoPaleta {
  id: PecaId
  rotulo: string
  glifo: string
  /**
   * Como a peça entra no mapa:
   * - `geo`: pré-estila a próxima forma (`setStyleForNextShapes`) e liga a ferramenta `geo`
   * - `texto`: idem, mas liga a ferramenta `text`
   * - `acao`: a toolbar cria a forma na hora — é o caso da escada (grupo de retângulos),
   *   da porta (shape próprio) e de todo símbolo desenhado (ver `simbolo` abaixo)
   */
  tipo: 'geo' | 'texto' | 'acao'
  estilos: Record<string, string>
  geo?: string
  /** peça desenhada: qual símbolo o `simbolo-mapa` deve desenhar (ver lib/simbolosMapa.ts) */
  simbolo?: SimboloId
  /** item largado pelo mapa — a gaveta agrupa esses numa seção separada das construções */
  item?: boolean
}

export const ELEMENTOS_PALETA: ElementoPaleta[] = [
  {
    // sala virou shape próprio (SalaMapaShape): as cores de estado das referências
    // não existem na paleta do tldraw e ela carrega o próprio nome dentro
    id: 'sala',
    rotulo: 'Sala',
    glifo: '⬛',
    tipo: 'acao',
    estilos: {},
  },
  {
    id: 'parede',
    rotulo: 'Parede',
    glifo: '▤',
    tipo: 'geo',
    geo: 'rectangle',
    estilos: { color: 'white', fill: 'solid', dash: 'solid', size: 'm' },
  },
  {
    // porta virou shape próprio nesta leva (vão + jambas + arco): ver PortaShape.tsx
    id: 'porta',
    rotulo: 'Porta',
    glifo: '🚪',
    tipo: 'acao',
    estilos: {},
  },
  {
    id: 'janela',
    rotulo: 'Janela',
    glifo: '▤',
    tipo: 'acao',
    simbolo: 'janela',
    estilos: {},
  },
  {
    id: 'escada',
    rotulo: 'Escada',
    glifo: '≡',
    tipo: 'acao',
    estilos: {},
  },
  {
    id: 'mesa',
    rotulo: 'Mesa',
    glifo: '▬',
    tipo: 'acao',
    simbolo: 'mesa',
    estilos: {},
  },
  {
    id: 'cama',
    rotulo: 'Cama',
    glifo: '▯',
    tipo: 'acao',
    simbolo: 'cama',
    estilos: {},
  },
  {
    id: 'bau',
    rotulo: 'Baú',
    glifo: '▭',
    tipo: 'acao',
    simbolo: 'bau',
    estilos: {},
  },
  {
    id: 'secreta',
    rotulo: 'Passagem secreta',
    glifo: 'Ⓢ',
    tipo: 'acao',
    simbolo: 'secreta',
    estilos: {},
  },
  {
    id: 'armadilha',
    rotulo: 'Armadilha',
    glifo: '◆',
    tipo: 'acao',
    simbolo: 'armadilha',
    estilos: {},
  },
  {
    // círculo cheio com número, amarrando o ponto do mapa à anotação escrita
    id: 'marcador',
    rotulo: 'Marcador numerado',
    glifo: '①',
    tipo: 'acao',
    simbolo: 'marcador',
    estilos: {},
  },
  {
    id: 'rotulo',
    rotulo: 'Rótulo',
    glifo: 'A',
    tipo: 'texto',
    estilos: { color: 'white', size: 's' },
  },
  {
    id: 'andar',
    rotulo: 'Rótulo de andar',
    glifo: 'ⁿF',
    tipo: 'acao',
    simbolo: 'andar',
    estilos: {},
  },
  // itens largados pelo mapa. Entram no catálogo a partir de `ITENS_MAPA` para não
  // repetir nome e ícone em dois lugares — o desenho continua sendo a fonte da verdade.
  ...ITENS_MAPA.map(
    (item): ElementoPaleta => ({
      id: item.id as PecaId,
      rotulo: item.rotulo,
      glifo: item.glifo,
      tipo: 'acao',
      simbolo: item.id,
      estilos: {},
      item: true,
    }),
  ),
]

/** Quantidade de degraus criados pelo botão "Escada" (ver MapaToolbar.tsx). */
export const DEGRAUS_ESCADA = 5

/** O que o carimbo de identidade precisa enxergar de uma forma recém-criada. */
interface FormaCriada {
  type: string
  meta?: Record<string, unknown>
  props?: Record<string, unknown>
}

/**
 * Qual peça da paleta uma forma recém-criada É — deduzido da PRÓPRIA forma.
 *
 * A primeira versão disto guardava "a última peça clicada na gaveta" num ref e carimbava
 * esse valor em tudo que nascia. Bug achado na revisão: o ref nunca era esquecido, então
 * depois de clicar em "Sala" qualquer forma criada em seguida — retângulo genérico, linha,
 * card de personagem arrastado pra dentro do mapa — nascia marcada como sala. E isso não
 * era só sujeira de metadado: `corDoVao` (portaMapa.ts) escolhe a cor do vão da porta
 * procurando formas marcadas como sala, então um retângulo qualquer marcado errado passava
 * a tingir a porta ao lado.
 *
 * Deduzir da forma elimina a classe do problema: não há estado para esquecer de limpar, e
 * o resultado sempre corresponde ao que está desenhado na tela. O efeito colateral é
 * assumido: um retângulo desenhado à mão com exatamente os estilos de sala CONTA como
 * sala — o que é coerente, porque para o leitor do mapa ele é uma sala.
 */
export function pecaDaFormaCriada(
  forma: FormaCriada,
  elementos: ElementoPaleta[] = ELEMENTOS_PALETA,
): PecaId | null {
  // amostra dentro do quadro de legenda não é peça do mapa. Sem esta guarda, a
  // miniatura de "Sala" na legenda contava como sala de verdade (achado de revisão):
  // aparecia na contagem de peças presentes e podia ser lida por quem procura salas.
  if (forma.meta?.decorativo === true) return null

  // quem cria a forma por código (marcador) já carimba; essa decisão vence a dedução
  const jaCarimbada = forma.meta?.peca
  if (typeof jaCarimbada === 'string') return jaCarimbada as PecaId

  // shapes próprios: o tipo já diz o que a peça é, sem comparar estilo
  if (forma.type === 'porta-mapa') return 'porta'
  if (forma.type === 'sala-mapa') return 'sala'

  // símbolos desenhados carregam o próprio nome na prop `simbolo`
  if (forma.type === 'simbolo-mapa') {
    const simbolo = forma.props?.simbolo
    if (typeof simbolo !== 'string') return null
    return elementos.find((e) => e.simbolo === simbolo)?.id ?? null
  }

  const tipoAlvo: ElementoPaleta['tipo'] | null =
    forma.type === 'geo' ? 'geo' : forma.type === 'text' ? 'texto' : null
  if (!tipoAlvo) return null

  const props = forma.props ?? {}
  const achada = elementos.find((elemento) => {
    if (elemento.tipo !== tipoAlvo) return false
    if (elemento.geo && props.geo !== elemento.geo) return false
    return Object.entries(elemento.estilos).every(([nome, valor]) => props[nome] === valor)
  })
  return achada?.id ?? null
}
