import { create } from 'zustand'
import type { Personagem, VaultTree } from '../lib/types'
import { tauriFs } from '../lib/fsBridge'
import { VaultRepo } from '../lib/vaultRepo'

export interface ItemAberto {
  tipo: 'canvas' // sessões e canvases abrem igual; personagem abre em modal
  caminho: string
  nome: string
}

interface AppState {
  vaultPath: string | null
  repo: VaultRepo | null
  tree: VaultTree | null
  aberto: ItemAberto | null
  /** cache de personagens do cofre: id -> Personagem */
  personagens: Record<string, Personagem>
  /** id -> caminho relativo (para resolver referências) */
  caminhoPorId: Record<string, string>
  perfilAbertoId: string | null

  abrirCofre(path: string): Promise<void>
  recarregarArvore(): Promise<void>
  abrirItem(caminho: string, nome: string): void
  fecharItem(): void
  carregarPersonagens(): Promise<void>
  abrirPerfil(id: string): void
  fecharPerfil(): void
}

export const useApp = create<AppState>((set, get) => ({
  vaultPath: null,
  repo: null,
  tree: null,
  aberto: null,
  personagens: {},
  caminhoPorId: {},
  perfilAbertoId: null,

  async abrirCofre(path) {
    const repo = new VaultRepo(path.replace(/\\/g, '/'), tauriFs)
    await repo.inicializar()
    localStorage.setItem('grimorio.vault', path)
    set({ vaultPath: path.replace(/\\/g, '/'), repo })
    await get().recarregarArvore()
    await get().carregarPersonagens()
  },

  async recarregarArvore() {
    const { repo } = get()
    if (!repo) return
    set({ tree: await repo.montarArvore() })
  },

  abrirItem(caminho, nome) {
    set({ aberto: { tipo: 'canvas', caminho, nome } })
  },

  fecharItem() {
    set({ aberto: null })
  },

  async carregarPersonagens() {
    const { repo, tree } = get()
    if (!repo || !tree) return
    const personagens: Record<string, Personagem> = {}
    const caminhoPorId: Record<string, string> = {}
    for (const camp of tree.campanhas) {
      for (const ref of camp.personagens) {
        if (ref.erro) continue
        try {
          const p = await repo.lerPersonagem(ref.caminho)
          personagens[p.id] = p
          caminhoPorId[p.id] = ref.caminho
        } catch {
          // ignora corrompido; sidebar já marca erro
        }
      }
    }
    set({ personagens, caminhoPorId })
  },

  abrirPerfil(id) {
    set({ perfilAbertoId: id })
  },

  fecharPerfil() {
    set({ perfilAbertoId: null })
  },
}))
