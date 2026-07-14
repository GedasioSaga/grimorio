import { create } from 'zustand'
import type { ItemRef, PastaNode, Personagem, VaultTree } from '../lib/types'
import { tauriFs } from '../lib/fsBridge'
import { VaultRepo } from '../lib/vaultRepo'

export type TipoAberto = 'sessao' | 'canvas' | 'escrita'

export interface ItemAberto {
  tipo: TipoAberto
  /** sessao/canvas: caminho do .json do mapa. escrita: caminho da pasta do caderno (relativo ao cofre). */
  caminho: string
  nome: string
}

interface AppState {
  vaultPath: string | null
  repo: VaultRepo | null
  tree: VaultTree | null
  aberto: ItemAberto | null
  /** slug da página ativa por caderno (chave = dir do caderno relativo ao cofre) */
  paginaAtivaPorCaderno: Record<string, string | null>
  /** cache de personagens do cofre: id -> Personagem */
  personagens: Record<string, Personagem>
  /** id -> caminho relativo (para resolver referências) */
  caminhoPorId: Record<string, string>
  perfilAbertoId: string | null
  carregando: boolean
  erroCofre: string | null

  abrirCofre(path: string): Promise<void>
  recarregarArvore(): Promise<void>
  abrirItem(tipo: TipoAberto, caminho: string, nome: string): void
  fecharItem(): void
  setPaginaAtiva(cadernoDir: string, slug: string | null): void
  carregarPersonagens(): Promise<void>
  abrirPerfil(id: string): void
  fecharPerfil(): void
}

export const useApp = create<AppState>((set, get) => ({
  vaultPath: null,
  repo: null,
  tree: null,
  aberto: null,
  paginaAtivaPorCaderno: {},
  personagens: {},
  caminhoPorId: {},
  perfilAbertoId: null,
  carregando: false,
  erroCofre: null,

  async abrirCofre(path) {
    if (get().carregando) return
    set({ carregando: true, erroCofre: null })
    try {
      const norm = path.replace(/\\/g, '/')
      const repo = new VaultRepo(norm, tauriFs)
      await repo.inicializar()
      localStorage.setItem('grimorio.vault', path)
      set({ vaultPath: norm, repo })
      await get().recarregarArvore()
      await get().carregarPersonagens()
    } catch (e) {
      set({ erroCofre: `Não foi possível abrir o cofre: ${e}` })
      throw e
    } finally {
      set({ carregando: false })
    }
  },

  async recarregarArvore() {
    const { repo } = get()
    if (!repo) return
    set({ tree: await repo.montarArvore() })
  },

  abrirItem(tipo, caminho, nome) {
    set({ aberto: { tipo, caminho, nome } })
  },

  fecharItem() {
    set({ aberto: null })
  },

  setPaginaAtiva(cadernoDir, slug) {
    set((s) => ({ paginaAtivaPorCaderno: { ...s.paginaAtivaPorCaderno, [cadernoDir]: slug } }))
  },

  async carregarPersonagens() {
    const { repo, tree } = get()
    if (!repo || !tree) return
    // reúne refs de todas as campanhas + da área de personagens soltos (pastas aninhadas)
    const refs: ItemRef[] = []
    for (const camp of tree.campanhas) refs.push(...camp.personagens)
    const daPasta = (pasta: PastaNode) => {
      refs.push(...pasta.personagens)
      pasta.subpastas.forEach(daPasta)
    }
    daPasta(tree.personagensSoltos)

    const personagens: Record<string, Personagem> = {}
    const caminhoPorId: Record<string, string> = {}
    for (const ref of refs) {
      if (ref.erro) continue
      try {
        const p = await repo.lerPersonagem(ref.caminho)
        personagens[p.id] = p
        caminhoPorId[p.id] = ref.caminho
      } catch {
        // ignora corrompido; sidebar já marca erro
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
