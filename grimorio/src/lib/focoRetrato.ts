import type { FocoRetrato } from './types'

/**
 * Ponto focal do retrato no círculo do perfil.
 *
 * O círculo usa `object-fit: cover`: a imagem é escalada até cobrir o quadro e a sobra fica
 * num eixo só. `object-position: x% y%` desliza a imagem dentro dessa sobra — 0% encosta no
 * começo, 100% no fim. A janela de enquadrar espelha isso mostrando a imagem inteira com um
 * quadrado de seleção por cima: a posição do quadrado dentro da sobra É a porcentagem.
 */

export const FOCO_CENTRO: FocoRetrato = { x: 50, y: 50 }

export const PRESETS_FOCO = {
  topo: { x: 50, y: 0 },
  centro: FOCO_CENTRO,
  base: { x: 50, y: 100 },
} as const satisfies Record<string, FocoRetrato>

function prender(n: number): number {
  return Math.min(100, Math.max(0, n))
}

function ehPorcentagem(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 100
}

/** Aceita só `{x, y}` numéricos em 0–100. Qualquer outra coisa vira undefined (= centro). */
export function normalizarFoco(raw: unknown): FocoRetrato | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const { x, y } = raw as Record<string, unknown>
  if (!ehPorcentagem(x) || !ehPorcentagem(y)) return undefined
  return { x, y }
}

/** Valor de `object-position`. Sem foco, centro — o mesmo desenho de sempre. */
export function posicaoCss(foco: FocoRetrato | undefined): string {
  const f = foco ?? FOCO_CENTRO
  return `${f.x}% ${f.y}%`
}

/**
 * Mesmo enquadramento, escrito como o SVG entende.
 *
 * `<image>` não tem `object-position`: o que existe é `preserveAspectRatio`, que só aceita
 * NOVE alinhamentos discretos (Min/Mid/Max em cada eixo). Então o foco contínuo de 0–100% é
 * arredondado para o terço mais próximo — 0 vira Min, 50 vira Mid, 100 vira Max, que são
 * exatamente os presets da janela de enquadrar.
 *
 * A perda é real e aceita: num nó de 52px do grafo, a diferença entre 60% e 66% não aparece.
 * O que importa é o retrato que foi enquadrado no topo não sair cortado no meio da testa.
 *
 * `slice` é o equivalente de `object-fit: cover` — cobre o quadro e corta a sobra, em vez de
 * espremer a imagem.
 */
export function alinhamentoSvg(foco: FocoRetrato | undefined): string {
  const f = foco ?? FOCO_CENTRO
  const terco = (n: number, min: string, mid: string, max: string) =>
    n < 100 / 3 ? min : n > 200 / 3 ? max : mid
  return `${terco(f.x, 'xMin', 'xMid', 'xMax')}${terco(f.y, 'YMin', 'YMid', 'YMax')} slice`
}

/**
 * Canto do quadrado de seleção (px do preview) → foco em %.
 * Eixo sem sobra devolve 50: `x / 0` daria NaN, e `object-position: NaN%` é regra inválida —
 * o navegador descarta em silêncio e o enquadramento inteiro para de valer, sem erro nenhum.
 */
export function focoDeCanto(
  largura: number, altura: number, lado: number, x: number, y: number,
): FocoRetrato {
  const sobraX = largura - lado
  const sobraY = altura - lado
  return {
    x: sobraX > 0 ? prender((x / sobraX) * 100) : 50,
    y: sobraY > 0 ? prender((y / sobraY) * 100) : 50,
  }
}

/** Foco → canto do quadrado de seleção (px do preview). Inverso de `focoDeCanto`. */
export function cantoDoFoco(
  largura: number, altura: number, lado: number, foco: FocoRetrato | undefined,
): { x: number; y: number } {
  const f = foco ?? FOCO_CENTRO
  return {
    x: Math.max(0, largura - lado) * (f.x / 100),
    y: Math.max(0, altura - lado) * (f.y / 100),
  }
}
