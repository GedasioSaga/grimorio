/**
 * Porta do mapa: estados, cores e numeração dos marcadores. Sem nada de tldraw aqui, do
 * mesmo jeito que `salaMapa.ts` é a metade pura da sala — `PortaShape.tsx` desenha.
 *
 * Este arquivo já teve a lógica de "cor do vão da porta", que copiava a cor da sala
 * embaixo para fingir um buraco na parede. Ela saiu junto com aquele desenho: a porta
 * agora é uma barra colorida pelo próprio ESTADO (livre, trancada), como nas referências
 * do usuário.
 *
 * O estado e as cores moravam dentro do `PortaShape.tsx` e vieram para cá porque quem
 * precisa VALIDAR um estado de porta não deveria ter de importar tldraw junto: a planta
 * gerada por IA (`plantaMapaIA.ts`) chegou a duplicar a lista de estados só para não
 * arrastar o editor para dentro de um módulo puro. Duas listas com os mesmos valores é
 * como uma delas ganha um estado novo e a outra rejeita ele em silêncio.
 */

/** Vão padrão: uma barra curta e fina, atravessada na parede. */
export const PORTA_LARGURA_PADRAO = 28
export const PORTA_ESPESSURA_PADRAO = 8

export type EstadoPorta = 'livre' | 'trancada' | 'atencao'

export interface AparenciaPorta {
  rotulo: string
  cor: string
}

/**
 * Cores tiradas das referências do usuário (mapas do Resident Evil 2): azul é passagem
 * livre, vermelho é trancada. O terceiro estado cobre a porta que precisa de item ou
 * ação — nas referências ela aparece destacada em tom quente.
 */
const APARENCIAS: Record<EstadoPorta, AparenciaPorta> = {
  livre: { rotulo: 'Livre', cor: '#3a6ea5' },
  trancada: { rotulo: 'Trancada', cor: '#b03a3a' },
  atencao: { rotulo: 'Precisa de algo', cor: '#c9922e' },
}

export const ESTADOS_PORTA: EstadoPorta[] = ['livre', 'trancada', 'atencao']

export function aparenciaDaPorta(estado: string): AparenciaPorta & { estado: EstadoPorta } {
  const chave = (ESTADOS_PORTA as string[]).includes(estado) ? (estado as EstadoPorta) : 'livre'
  return { estado: chave, ...APARENCIAS[chave] }
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
