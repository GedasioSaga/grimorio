import { create } from 'zustand'
import type { Cenario, ItemRef, PastaNode, Personagem, TipoEntidadeVinculo, VaultTree, Vinculo } from '../lib/types'
import { tauriFs } from '../lib/fsBridge'
import { VaultRepo } from '../lib/vaultRepo'
import { coletarCenarioRefs } from '../lib/cenarioArvore'
import { adicionarVinculo as adicionarVinculoPuro, removerVinculo as removerVinculoPuro, participacaoDe, TIPO_PARTICIPA } from '../lib/vinculos'

export type TipoAberto = 'sessao' | 'canvas' | 'escrita'

const SALVAR_PARCIAL_DEBOUNCE_MS = 800

// timers por personagem em nível de módulo: o debounce sobrevive ao unmount do
// card no canvas (tldraw desmonta shapes fora da viewport) sem perder a gravação
const timersSalvarParcial = new Map<string, ReturnType<typeof setTimeout>>()

// mesmo racional para cenários (cards no canvas desmontam fora da viewport)
const timersSalvarCenario = new Map<string, ReturnType<typeof setTimeout>>()

// um arquivo só (vinculos.json): um timer só
let timerSalvarVinculos: ReturnType<typeof setTimeout> | null = null

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
  /** cache de cenários do cofre: id -> Cenario */
  cenarios: Record<string, Cenario>
  /** id -> dir do cenário relativo ao cofre */
  caminhoCenarioPorId: Record<string, string>
  cenarioAbertoId: string | null
  /** relações tipadas entre entidades + participação em campanhas (vinculos.json único) */
  vinculos: Vinculo[]
  /** id da campanha selecionada no filtro da sidebar; null = "Todas" */
  campanhaFiltro: string | null
  carregando: boolean
  erroCofre: string | null

  abrirCofre(path: string): Promise<void>
  recarregarArvore(): Promise<void>
  abrirItem(tipo: TipoAberto, caminho: string, nome: string): void
  fecharItem(): void
  setPaginaAtiva(cadernoDir: string, slug: string | null): void
  carregarPersonagens(): Promise<void>
  /** Merge otimista no cache + gravação debounced (edição inline no card do canvas). */
  salvarPersonagemParcial(id: string, mudancas: Partial<Personagem>): void
  abrirPerfil(id: string): void
  fecharPerfil(): void
  carregarCenarios(): Promise<void>
  /** Merge otimista no cache + gravação debounced (modal e card do canvas). */
  salvarCenarioParcial(id: string, mudancas: Partial<Cenario>): void
  abrirCenario(id: string): void
  fecharCenario(): void
  carregarVinculos(): Promise<void>
  /** true quando adicionou; false quando já existia (dedupe por deId/paraId/tipo). */
  adicionarVinculo(v: Omit<Vinculo, 'id' | 'criadoEm'>): boolean
  removerVinculo(id: string): void
  alternarParticipacao(entidadeTipo: TipoEntidadeVinculo, entidadeId: string, campanhaId: string): void
  setCampanhaFiltro(id: string | null): void
}

const SALVAR_VINCULOS_DEBOUNCE_MS = 800

function agendarSalvarVinculos(get: () => AppState) {
  if (timerSalvarVinculos) clearTimeout(timerSalvarVinculos)
  timerSalvarVinculos = setTimeout(() => {
    timerSalvarVinculos = null
    const { repo, vinculos } = get()
    if (!repo) return
    // fire-and-forget: VaultRepo serializa escritas por caminho
    repo.salvarVinculos(vinculos).catch((e) => console.error('Falha ao salvar vínculos:', e))
  }, SALVAR_VINCULOS_DEBOUNCE_MS)
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
  cenarios: {},
  caminhoCenarioPorId: {},
  cenarioAbertoId: null,
  vinculos: [],
  campanhaFiltro: null,
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
      await get().carregarCenarios()
      await get().carregarVinculos()
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

  salvarPersonagemParcial(id, mudancas) {
    const atual = get().personagens[id]
    if (!atual) return
    set((s) => ({
      personagens: { ...s.personagens, [id]: { ...s.personagens[id], ...mudancas } },
    }))
    const pendente = timersSalvarParcial.get(id)
    if (pendente) clearTimeout(pendente)
    timersSalvarParcial.set(
      id,
      setTimeout(() => {
        timersSalvarParcial.delete(id)
        const { repo, caminhoPorId, personagens } = get()
        const caminho = caminhoPorId[id]
        const p = personagens[id]
        if (!repo || !caminho || !p) return
        // fire-and-forget: VaultRepo serializa escritas por caminho
        repo.salvarPersonagem(caminho, { ...p }).catch((e) => {
          console.error('Falha ao salvar personagem (edição no card):', e)
        })
      }, SALVAR_PARCIAL_DEBOUNCE_MS),
    )
  },

  abrirPerfil(id) {
    set({ perfilAbertoId: id })
  },

  fecharPerfil() {
    set({ perfilAbertoId: null })
  },

  async carregarCenarios() {
    const { repo, tree } = get()
    if (!repo || !tree) return
    const cenarios: Record<string, Cenario> = {}
    const caminhoCenarioPorId: Record<string, string> = {}
    for (const ref of coletarCenarioRefs(tree.cenarios)) {
      // id vazio = cenario.json sem id (normalização geraria id novo a cada load)
      if (ref.erro || !ref.id) continue
      try {
        const c = await repo.lerCenario(ref.caminho)
        cenarios[c.id] = c
        caminhoCenarioPorId[c.id] = ref.caminho
      } catch {
        // ignora corrompido; sidebar já marca erro
      }
    }
    set({ cenarios, caminhoCenarioPorId })
  },

  salvarCenarioParcial(id, mudancas) {
    const atual = get().cenarios[id]
    if (!atual) return
    set((s) => ({
      cenarios: { ...s.cenarios, [id]: { ...s.cenarios[id], ...mudancas } },
    }))
    const pendente = timersSalvarCenario.get(id)
    if (pendente) clearTimeout(pendente)
    timersSalvarCenario.set(
      id,
      setTimeout(() => {
        timersSalvarCenario.delete(id)
        // caminho re-resolvido no disparo: após mover/excluir não grava no lugar antigo
        const { repo, caminhoCenarioPorId, cenarios } = get()
        const caminho = caminhoCenarioPorId[id]
        const c = cenarios[id]
        if (!repo || !caminho || !c) return
        // fire-and-forget: VaultRepo serializa escritas por caminho
        repo.salvarCenario(caminho, { ...c }).catch((e) => {
          console.error('Falha ao salvar cenário:', e)
        })
      }, SALVAR_PARCIAL_DEBOUNCE_MS),
    )
  },

  abrirCenario(id) {
    set({ cenarioAbertoId: id })
  },

  fecharCenario() {
    set({ cenarioAbertoId: null })
  },

  async carregarVinculos() {
    const { repo, tree } = get()
    if (!repo) return
    const vinculos = await repo.lerVinculos()
    // restaura o filtro salvo; campanha apagada → volta a "Todas"
    const salvo = localStorage.getItem('grimorio.campanhaFiltro')
    const valido = !!salvo && !!tree?.campanhas.some((c) => c.id === salvo)
    set({ vinculos, campanhaFiltro: valido ? salvo : null })
  },

  adicionarVinculo(v) {
    const completo: Vinculo = { ...v, id: crypto.randomUUID(), criadoEm: new Date().toISOString() }
    const nova = adicionarVinculoPuro(get().vinculos, completo)
    if (nova === get().vinculos) return false // dedupe: nada mudou
    set({ vinculos: nova })
    agendarSalvarVinculos(get)
    return true
  },

  removerVinculo(id) {
    set({ vinculos: removerVinculoPuro(get().vinculos, id) })
    agendarSalvarVinculos(get)
  },

  alternarParticipacao(entidadeTipo, entidadeId, campanhaId) {
    const atual = participacaoDe(get().vinculos, entidadeId, campanhaId)
    if (atual) {
      get().removerVinculo(atual.id)
    } else {
      get().adicionarVinculo({
        deTipo: entidadeTipo, deId: entidadeId,
        paraTipo: 'campanha', paraId: campanhaId,
        tipo: TIPO_PARTICIPA, notas: '',
      })
    }
  },

  setCampanhaFiltro(id) {
    if (id) localStorage.setItem('grimorio.campanhaFiltro', id)
    else localStorage.removeItem('grimorio.campanhaFiltro')
    set({ campanhaFiltro: id })
  },
}))
