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

export interface ElementoPaleta {
  id: 'parede' | 'porta' | 'janela' | 'escada'
  rotulo: string
  glifo: string
  /** estilos tldraw a aplicar nas próximas formas (chave = nome do style, valor = valor válido) */
  estilos: Record<string, string>
  geo?: string
}

export const ELEMENTOS_PALETA: ElementoPaleta[] = [
  {
    id: 'parede',
    rotulo: 'Parede',
    glifo: '▤',
    geo: 'rectangle',
    estilos: { color: 'white', fill: 'solid', dash: 'solid', size: 'm' },
  },
  {
    id: 'porta',
    rotulo: 'Porta',
    glifo: '🚪',
    geo: 'rectangle',
    estilos: { color: 'orange', fill: 'solid', dash: 'solid', size: 's' },
  },
  {
    id: 'janela',
    rotulo: 'Janela',
    glifo: '▭',
    geo: 'rectangle',
    estilos: { color: 'light-blue', fill: 'none', dash: 'solid', size: 's' },
  },
  {
    id: 'escada',
    rotulo: 'Escada',
    glifo: '≡',
    estilos: {},
  },
]

/** Quantidade de degraus criados pelo botão "Escada" (ver MapaToolbar.tsx). */
export const DEGRAUS_ESCADA = 5
