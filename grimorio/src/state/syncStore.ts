import { create } from 'zustand'
import { estadoInicialSync, type EstadoSync } from '../lib/sync/sincronizador'

/**
 * O retrato do sync que a interface assina — badge ☁️ e aba Nuvem.
 *
 * Store separado do `useApp` de propósito: o estado do sync muda a cada poucos segundos e não tem
 * relação nenhuma com o conteúdo do cofre. Junto, todo componente inscrito no store principal
 * re-renderizaria a cada tique de sincronização.
 *
 * Sem ações: o sincronizador é a única coisa que escreve aqui, e escreve por `publicarSync`.
 */
export const useSync = create<EstadoSync>(() => estadoInicialSync())

/** A porta `publicar` do sincronizador. `setState` faz merge raso, que é exatamente o contrato. */
export function publicarSync(parcial: Partial<EstadoSync>): void {
  useSync.setState(parcial)
}

/** Zera o retrato ao trocar de cofre: manifesto, falhas e freio são todos por-cofre. */
export function limparSync(): void {
  useSync.setState(estadoInicialSync(), true)
}
