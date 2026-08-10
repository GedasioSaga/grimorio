import { create } from 'zustand'

/**
 * Liga/desliga a miniatura do retrato nas listas laterais (itens, personagens, cenários).
 *
 * Store de módulo em vez de estado local: quatro linhas de rail diferentes leem isto,
 * e nenhuma tem um pai comum perto o bastante pra passar por prop sem atravessar
 * meia árvore. Mesmo motivo do seletor de tema.
 *
 * Preferência do dispositivo, não do cofre — mora no localStorage, junto de `grimorio.tema`.
 */
const CHAVE = 'grimorio.miniaturasRail'
const PADRAO = true

function salvo(): boolean {
  const s = localStorage.getItem(CHAVE)
  // ausente = nunca configurado: liga por padrão
  return s === null ? PADRAO : s === '1'
}

interface MiniaturasState {
  ligadas: boolean
  alternar(valor: boolean): void
}

export const useMiniaturas = create<MiniaturasState>((set) => ({
  ligadas: salvo(),
  alternar: (valor) => {
    localStorage.setItem(CHAVE, valor ? '1' : '0')
    set({ ligadas: valor })
  },
}))
