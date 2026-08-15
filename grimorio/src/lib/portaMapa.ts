/**
 * Decisões puras da Porta e do Marcador numerado — sem tldraw, testáveis direto.
 *
 * A porta finge o vão cobrindo o trecho de parede com a MESMA cor do miolo da sala.
 * Quem descobre o que está embaixo é o `PortaShape` (via `editor.getShapesAtPoint`);
 * aqui mora só a regra de escolha.
 */

/** Cor de sala usada quando a porta não está sobre nenhuma sala. Bate com a peça `sala`. */
export const COR_SALA_PADRAO = 'green'

interface FormaSob {
  meta?: Record<string, unknown>
  props?: Record<string, unknown>
}

/**
 * Cor do buraco da porta: a da primeira SALA da lista.
 *
 * `editor.getShapesAtPoint` devolve as formas com a mais ao topo PRIMEIRO
 * (node_modules/@tldraw/editor/src/lib/editor/Editor.ts:5498) — por isso a varredura é
 * direta, e não de trás pra frente. Formas escondidas já vêm filtradas de lá, então uma
 * sala em camada oculta nunca tinge a porta.
 */
export function corDoVao(formasSob: FormaSob[], padrao: string = COR_SALA_PADRAO): string {
  for (const forma of formasSob) {
    if (forma.meta?.peca !== 'sala') continue
    const cor = forma.props?.color
    if (typeof cor === 'string' && cor.length > 0) return cor
  }
  return padrao
}

/**
 * Próximo número do marcador: maior existente + 1.
 *
 * Somar 1 ao MAIOR (em vez de contar quantos existem) é o que evita repetir número
 * depois de apagar um marcador do meio da sequência.
 */
export function proximoNumero(rotulos: string[]): number {
  let maior = 0
  for (const rotulo of rotulos) {
    const numero = Number.parseInt(rotulo.trim(), 10)
    if (Number.isFinite(numero) && numero > maior) maior = numero
  }
  return maior + 1
}
