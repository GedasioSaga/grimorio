/**
 * Metade pura da sala em polígono — geometria sem tldraw, mesmo papel que `salaMapa.ts`
 * cumpre para a sala retangular (que também reaproveita `aparenciaDaSala`/`quebrarRotulo`
 * daquele arquivo: cor de estado e quebra de rótulo são as MESMAS regras nos dois formatos
 * de sala, só a geometria muda).
 */

export interface PontoPoligono {
  x: number
  y: number
}

/**
 * Vértices de nascença: um cômodo em L, a forma que a sala retangular sozinha não cobre
 * (compor com retângulos encostados deixa emenda visível — ver cabeçalho de
 * `SalaPoligonoMapaShape.tsx`). Coordenadas locais ao shape, em múltiplos de 20px — o
 * mesmo passo do grid do mapa — para nascer já alinhável a uma sala vizinha sem precisar
 * de ajuste fino.
 */
export const PONTOS_SALA_POLIGONO_PADRAO: PontoPoligono[] = [
  { x: 0, y: 0 },
  { x: 200, y: 0 },
  { x: 200, y: 100 },
  { x: 100, y: 100 },
  { x: 100, y: 180 },
  { x: 0, y: 180 },
]

/**
 * Menos de 3 vértices não é um polígono — é um ponto ou um segmento, e todo consumidor
 * daqui quebra de um jeito diferente com isso:
 *
 * - `new Polygon2d({ points: [] })` no `getGeometry` do shape LANÇA, e o erro sobe antes de
 *   qualquer desenho. Como `getGeometry` roda ao LER O DOCUMENTO, o mapa inteiro cai no
 *   `LimiteDeErro` — não é a peça que some, é a tela.
 * - `limitesDoPoligono` chama `Math.min()` sem argumento (devolve `Infinity`) e
 *   `centroDoPoligono` divide por zero: os dois viram `NaN` em atributo SVG, que o
 *   navegador descarta calado.
 *
 * Nenhum caminho da interface produz isso: a peça nasce com 6 vértices e `onHandleDrag` só
 * move os que existem. O que produz é o JSON de fora — planta escrita pela IA
 * (`gerarMapaIA.ts` monta `pontos` a partir do que o modelo devolveu) e arquivo editado à
 * mão. Por isso a defesa é em RUNTIME e não só no validador do schema: apertar o validador
 * faria o tldraw RECUSAR o documento, trocando "uma sala torta" por "o mapa não abre".
 *
 * Devolver a forma de nascença em vez de sumir com a peça é deliberado: o mestre vê um
 * cômodo em L onde esperava algo, entende que aquilo precisa de conserto e arrasta os
 * vértices. Uma peça invisível ele nunca acha.
 */
export function pontosSeguros(pontos: PontoPoligono[] | undefined | null): PontoPoligono[] {
  if (!Array.isArray(pontos) || pontos.length < 3) return PONTOS_SALA_POLIGONO_PADRAO
  if (pontos.some((p) => !p || !Number.isFinite(p.x) || !Number.isFinite(p.y))) {
    return PONTOS_SALA_POLIGONO_PADRAO
  }
  return pontos
}

/**
 * Retângulo de `w`×`h` como quatro vértices, em coordenadas locais a partir de (0,0).
 *
 * É o que "Converter seleção em ▸ Sala (polígono)" precisa: a forma velha do mapa antigo
 * é uma caixa, e a sala em polígono não tem w/h — tem vértices. Converter para os quatro
 * cantos preserva exatamente o espaço que a forma ocupava e deixa o mestre puxar um canto
 * depois para virar o L. Sem isto, quem já tinha o cômodo desenhado à mão só podia criar
 * uma sala nova e redesenhar tudo, enquanto a sala RETANGULAR aceitava conversão desde
 * sempre — a última desigualdade entre os dois formatos.
 *
 * Sentido horário, começando no canto superior-esquerdo: mesma ordem de
 * `PONTOS_SALA_POLIGONO_PADRAO`, então os índices dos handles (`vertice-0`…) significam a
 * mesma coisa nos dois caminhos de criação.
 */
export function pontosDeRetangulo(w: number, h: number): PontoPoligono[] {
  return [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ]
}

/**
 * Reencaixa uma lista de vértices numa caixa de `w`×`h`, preservando a silhueta.
 *
 * É o que a ferramenta de sala em polígono usa enquanto o usuário arrasta: o cômodo em L de
 * nascença é reescalado para o retângulo que está sendo desenhado, então o que aparece
 * debaixo do cursor durante o arrasto já é a peça final, não um retângulo que vira polígono
 * ao soltar.
 *
 * Caixa de origem degenerada (todos os vértices na mesma linha ou coluna) faria divisão por
 * zero e mandaria a peça inteira para `NaN`: nesse caso o eixo achatado é distribuído
 * uniformemente, o que devolve uma forma pobre mas desenhável — e desenhável é o requisito,
 * porque `NaN` num atributo SVG some da tela sem erro.
 */
export function escalarPontosPara(pontos: PontoPoligono[], w: number, h: number): PontoPoligono[] {
  const origem = limitesDoPoligono(pontos)
  const escalaX = origem.w === 0 ? 0 : w / origem.w
  const escalaY = origem.h === 0 ? 0 : h / origem.h
  return pontos.map((p, i) => ({
    x: origem.w === 0 ? (w * i) / Math.max(1, pontos.length - 1) : (p.x - origem.minX) * escalaX,
    y: origem.h === 0 ? (h * i) / Math.max(1, pontos.length - 1) : (p.y - origem.minY) * escalaY,
  }))
}

/** Centro geométrico (média dos vértices) — usado para posicionar o rótulo. Aproximação
 * de propósito (não é o centroide exato de área): para as formas em L/T comuns num mapa
 * de RPG, a média dos vértices já cai dentro do polígono, e a conta é bem mais simples. */
export function centroDoPoligono(pontos: PontoPoligono[]): PontoPoligono {
  const somaX = pontos.reduce((soma, p) => soma + p.x, 0)
  const somaY = pontos.reduce((soma, p) => soma + p.y, 0)
  return { x: somaX / pontos.length, y: somaY / pontos.length }
}

/** Caixa delimitadora dos vértices — usada para quebrar o rótulo na largura do polígono,
 * do mesmo jeito que a sala retangular quebra na sua própria largura. */
export function limitesDoPoligono(pontos: PontoPoligono[]) {
  const xs = pontos.map((p) => p.x)
  const ys = pontos.map((p) => p.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  return { minX, maxX, minY, maxY, w: maxX - minX, h: maxY - minY }
}
