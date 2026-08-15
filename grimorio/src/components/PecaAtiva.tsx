import { createContext, useContext } from 'react'
import type { PecaId } from '../lib/paletaMapa'

/**
 * Qual peça da paleta está escolhida agora.
 *
 * Vai da toolbar (dentro do `<Tldraw>`) para o `MapaView` (fora), que carimba
 * `meta.peca` na forma no momento da criação. Mesmo motivo do Context em
 * PainelPropriedades.tsx: `components` do `<Tldraw>` é constante de módulo, então não dá
 * para passar callback de instância por prop.
 */
const PecaAtivaContext = createContext<(peca: PecaId | null) => void>(() => {})

export const ProvedorPecaAtiva = PecaAtivaContext.Provider

export function useDefinirPecaAtiva() {
  return useContext(PecaAtivaContext)
}
