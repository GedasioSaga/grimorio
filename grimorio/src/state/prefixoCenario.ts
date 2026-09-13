import { create } from 'zustand'

/**
 * Liga/desliga o corte do prefixo do pai no nome dos sub-cenários da árvore lateral
 * (ver `nomeCenarioExibido`).
 *
 * Store de módulo pelo mesmo motivo de `miniaturas`: quem lê é a linha recursiva da
 * árvore, e quem escreve é a aba Aparência — não há pai comum perto pra passar prop.
 *
 * Preferência do dispositivo, não do cofre — mora no localStorage, junto de `grimorio.tema`.
 */
const CHAVE = 'grimorio.prefixoCenarioRail'
const PADRAO = true

function salvo(): boolean {
  const s = localStorage.getItem(CHAVE)
  // ausente = nunca configurado: liga por padrão
  return s === null ? PADRAO : s === '1'
}

interface PrefixoCenarioState {
  /** true = esconde o prefixo do pai na árvore; false = nome completo em toda linha */
  ocultar: boolean
  alternar(valor: boolean): void
}

export const usePrefixoCenario = create<PrefixoCenarioState>((set) => ({
  ocultar: salvo(),
  alternar: (valor) => {
    localStorage.setItem(CHAVE, valor ? '1' : '0')
    set({ ocultar: valor })
  },
}))
