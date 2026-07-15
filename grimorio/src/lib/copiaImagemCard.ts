import type { Cenario, Personagem } from './types'

/** Forma mínima de shape inspecionada aqui (evita depender do tipo do tldraw). */
export interface ShapeMinimo {
  type: string
  props: Record<string, unknown>
}

/**
 * Caminho relativo do retrato do card selecionado, para copiar a imagem com Ctrl+C.
 * Retorna null quando o shape não é um card, o registro não existe, ou não tem retrato —
 * nesses casos o Ctrl+C nativo do tldraw segue seu curso.
 */
export function relRetratoDoCard(
  shape: ShapeMinimo | null,
  personagens: Record<string, Pick<Personagem, 'retrato'>>,
  cenarios: Record<string, Pick<Cenario, 'retrato'>>,
): string | null {
  if (!shape) return null
  if (shape.type === 'character-card') {
    return personagens[shape.props.personagemId as string]?.retrato ?? null
  }
  if (shape.type === 'cenario-card') {
    return cenarios[shape.props.cenarioId as string]?.retrato ?? null
  }
  return null
}
