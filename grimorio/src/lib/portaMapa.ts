/**
 * Numeração dos marcadores do mapa.
 *
 * Este arquivo já teve a lógica de "cor do vão da porta", que copiava a cor da sala
 * embaixo para fingir um buraco na parede. Ela saiu junto com aquele desenho: a porta
 * agora é uma barra colorida pelo próprio ESTADO (livre, trancada), como nas referências
 * do usuário — ver PortaShape.tsx.
 */

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
