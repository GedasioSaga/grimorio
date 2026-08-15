/** Escala de fonte por card no canvas (multiplicador aplicado via CSS var --card-fe). */
export const FONTE_MIN = 0.8
export const FONTE_MAX = 2.0
export const FONTE_PASSO = 0.1

/** Próxima escala aplicando `delta`, arredondada a 1 casa e presa em [MIN, MAX]. */
export function proximaEscala(atual: number, delta: number): number {
  const bruto = Math.round((atual + delta) * 10) / 10
  return Math.min(FONTE_MAX, Math.max(FONTE_MIN, bruto))
}

/**
 * Escala EXTRA dos controles do card (A− A+ ↓ → ✎), aplicada por cima de `--card-fe`.
 *
 * O tamanho que o olho vê é `px × cardFe × zoom` — conteúdo de shape do tldraw vive em espaço
 * de página, e a câmera multiplica tudo. `--card-fe` sozinho corrige só um dos três fatores:
 * num card encolhido à mão (`escalaDoCartao(100, 1) = 0.417`) com a câmera afastada, um botão
 * de 12px chega à tela com 3px. Era o caso que o usuário relatou — botão que ele não enxerga.
 *
 * A correção é screen-space, o mesmo princípio das alças de redimensionar do tldraw: sobe a
 * escala até o controle alcançar um piso de tamanho na tela. Com TETO, e não sem limite, porque
 * contra-escalar 1/zoom puro é pior que o defeito: em zoom 0.2 o botão ficaria maior que o card
 * inteiro. Acima do teto o card já é ilegível por completo — quem não lê a descrição não está
 * tentando clicar no A−.
 *
 * `PASSO` quantiza o resultado: sem ele, cada quadro de um zoom com a roda do mouse mudaria a
 * variável CSS e remontaria todo card visível. A quantização é para CIMA — arredondar para o
 * passo mais próximo derrubaria o resultado abaixo do piso, e um piso que arredonda para baixo
 * não é piso.
 */
export const CONTROLE_BASE_PX = 12
export const CONTROLE_PISO_PX = 14
export const CONTROLE_TETO = 2.2
const PASSO = 20

export function escalaDosControles(cardFe: number, zoom: number): number {
  const naTela = CONTROLE_BASE_PX * cardFe * zoom
  // zoom/escala inválidos (0, NaN, negativo) só apareceriam com o editor em estado inconsistente;
  // devolver 1 mantém o card exatamente como era antes desta função existir.
  if (!Number.isFinite(naTela) || naTela <= 0) return 1
  const bruto = Math.max(1, CONTROLE_PISO_PX / naTela)
  return Math.min(CONTROLE_TETO, Math.ceil(bruto * PASSO) / PASSO)
}
