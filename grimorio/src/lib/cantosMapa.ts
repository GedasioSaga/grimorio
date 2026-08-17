/**
 * Canto das peças de desenho do mapa: `reto` ou `arredondado`. Lib pura — sem tldraw, sem
 * React — só traduz a escolha em atributos de SVG.
 *
 * Pedido do usuário: "quero poder fazer linhas e retângulos, e escolher se fica arredondado
 * ou reto". As duas peças compartilham a MESMA escolha e o mesmo vocabulário, por isso ela
 * mora aqui e não dentro de cada shape — o retângulo aplica no `rx`/`ry` do `<rect>`, a
 * linha aplica no `stroke-linecap`/`stroke-linejoin` do traço. É a mesma decisão visual
 * ("essa peça tem quina ou não"), então é o mesmo controle na barra.
 *
 * A linha nativa do tldraw sempre desenhou com ponta redonda (o `PathBuilder` não passa
 * `stroke-linecap`, e o default do SVG só vira `round` porque a folha do tldraw manda) —
 * era o que aparecia na captura do usuário: um traço de ponta bolha, sem opção de quina.
 */

export const CANTOS_MAPA = ['reto', 'arredondado'] as const
export type CantoMapa = (typeof CANTOS_MAPA)[number]

/**
 * Canto de nascença. `arredondado` porque é EXATAMENTE o que a linha do tldraw já fazia
 * antes desta opção existir: quem nunca tocar no controle não vê nada mudar no mapa dele.
 */
export const CANTO_PADRAO: CantoMapa = 'arredondado'

/** Raio do canto arredondado, em px de página. */
export const RAIO_CANTO_ARREDONDADO = 12

/** Rótulo e ícone de cada opção, para a barra e o painel de propriedades falarem igual. */
export const OPCOES_CANTO: ReadonlyArray<{ id: CantoMapa; rotulo: string; icone: string }> = [
  { id: 'reto', rotulo: 'Reto', icone: '⌐' },
  { id: 'arredondado', rotulo: 'Arredondado', icone: '◜' },
]

export function ehCantoMapa(valor: unknown): valor is CantoMapa {
  return typeof valor === 'string' && (CANTOS_MAPA as readonly string[]).includes(valor)
}

/** Canto guardado em `meta.cantos` (linha nativa, que não pode ganhar prop nova — ver `LinhaMapaColoridaShapeUtil`). */
export function cantoDeMeta(meta: unknown): CantoMapa {
  const valor = typeof meta === 'object' && meta !== null ? (meta as Record<string, unknown>).cantos : undefined
  return ehCantoMapa(valor) ? valor : CANTO_PADRAO
}

/** Forma mínima para perguntar o canto de uma peça, sem depender de tipos do tldraw. */
export interface PecaComCanto {
  type: string
  props?: unknown
  meta?: unknown
}

/** Só estas duas peças têm canto: a linha do mapa e o retângulo do mapa. */
export function aceitaCanto(tipo: string): boolean {
  return tipo === 'line' || tipo === 'retangulo-mapa'
}

/**
 * Canto de uma peça já desenhada, ou `null` quando ela não tem esse conceito.
 *
 * Os dois lugares diferentes não são escolha: `line` é tipo NATIVO do tldraw e não aceita
 * prop nova (o schema do store recusa — ver `LinhaMapaColoridaShapeUtil`), então guarda em
 * `meta`; o retângulo é peça própria e guarda em `props`, como qualquer peça do mapa.
 */
export function cantoDaPeca(peca: PecaComCanto): CantoMapa | null {
  if (peca.type === 'line') return cantoDeMeta(peca.meta)
  if (peca.type === 'retangulo-mapa') {
    const valor = (peca.props as Record<string, unknown> | undefined)?.cantos
    return ehCantoMapa(valor) ? valor : CANTO_PADRAO
  }
  return null
}

/**
 * Atributos de traço para a LINHA. `butt`+`miter` dão a quina seca; `round`+`round` dão a
 * ponta bolha de sempre. Vão como atributo literal no SVG, e não por CSS, porque a
 * exportação PNG/SVG re-renderiza os shapes por um caminho que não carrega o CSS da página
 * (mesmo motivo já documentado em `LinhaMapaColoridaShapeUtil`).
 */
export function tracadoDoCanto(canto: CantoMapa): { strokeLinecap: 'butt' | 'round'; strokeLinejoin: 'miter' | 'round' } {
  return canto === 'reto'
    ? { strokeLinecap: 'butt', strokeLinejoin: 'miter' }
    : { strokeLinecap: 'round', strokeLinejoin: 'round' }
}

/**
 * Raio do canto para o RETÂNGULO, já limitado à metade do lado menor: sem esse limite, um
 * retângulo de 10px de altura com raio 12 vira uma cápsula deformada (o SVG aceita `rx`
 * maior que a metade e simplesmente satura, mas o traço fica com aparência de erro).
 */
export function raioDoCanto(canto: CantoMapa, largura: number, altura: number): number {
  if (canto === 'reto') return 0
  return Math.max(0, Math.min(RAIO_CANTO_ARREDONDADO, largura / 2, altura / 2))
}
