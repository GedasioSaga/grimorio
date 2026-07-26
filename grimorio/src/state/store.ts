import { create } from 'zustand'
import type { Cenario, ItemRef, PastaNode, Personagem, TipoEntidadeVinculo, VaultTree, VersaoCenario, VersaoPersonagem, Vinculo } from '../lib/types'
import { tauriFs } from '../lib/fsBridge'
import { VaultRepo } from '../lib/vaultRepo'
import { coletarCenarioRefs } from '../lib/cenarioArvore'
import { adicionarVinculo as adicionarVinculoPuro, removerVinculo as removerVinculoPuro, campanhasDe, participacaoDe, TIPO_PARTICIPA } from '../lib/vinculos'
import { aplicarPatchCenario, versaoAtiva, type PatchCenario } from '../lib/cenarioVersao'
import { aplicarPatchPersonagem, versaoAtivaPersonagem, comNomeEspelho, type PatchPersonagem } from '../lib/personagemVersao'
import { CHAVE_FILTRO, chaveDeCofre, normalizarCaminho, registrar as registrarCofre } from '../lib/cofres'

export type TipoAberto = 'sessao' | 'canvas' | 'escrita'

const SALVAR_PARCIAL_DEBOUNCE_MS = 800

// timers por personagem em nível de módulo: o debounce sobrevive ao unmount do
// card no canvas (tldraw desmonta shapes fora da viewport) sem perder a gravação
const timersSalvarParcial = new Map<string, ReturnType<typeof setTimeout>>()

// mesmo racional para cenários (cards no canvas desmontam fora da viewport)
const timersSalvarCenario = new Map<string, ReturnType<typeof setTimeout>>()

/** Agenda a persistência debounced do cenário `id` (reusada por edições e ações de versão). */
function agendarSalvarCenario(get: () => AppState, id: string) {
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
}

/** Agenda a persistência debounced do personagem `id` (reusada por edições e ações de versão). */
function agendarSalvarPersonagem(get: () => AppState, id: string) {
  const pendente = timersSalvarParcial.get(id)
  if (pendente) clearTimeout(pendente)
  timersSalvarParcial.set(
    id,
    setTimeout(() => {
      timersSalvarParcial.delete(id)
      // caminho re-resolvido no disparo: após mover/excluir não grava no lugar antigo
      const { repo, caminhoPorId, personagens } = get()
      const caminho = caminhoPorId[id]
      const p = personagens[id]
      if (!repo || !caminho || !p) return
      // fire-and-forget: VaultRepo serializa escritas por caminho
      repo.salvarPersonagem(caminho, { ...p }).catch((e) => {
        console.error('Falha ao salvar personagem:', e)
      })
    }, SALVAR_PARCIAL_DEBOUNCE_MS),
  )
}

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
  salvarPersonagemParcial(id: string, mudancas: PatchPersonagem): void
  /** Torna `versaoId` a versão ativa/visível do personagem (ignora id inexistente). */
  definirVersaoAtivaPersonagem(id: string, versaoId: string): void
  /** Cria uma versão clonando a ativa; a nova vira ativa. */
  adicionarVersaoPersonagem(id: string, nome: string): void
  renomearVersaoPersonagem(id: string, versaoId: string, nome: string): void
  /** Renomeia a FORMA ativa do personagem e persiste na hora (usado pelo rename da sidebar). */
  renomearPersonagemAtivo(id: string, nome: string): Promise<void>
  /** Remove a versão (nunca a última); se remover a ativa, recua pra primeira. */
  removerVersaoPersonagem(id: string, versaoId: string): void
  abrirPerfil(id: string): void
  fecharPerfil(): void
  carregarCenarios(): Promise<void>
  /** Merge otimista no cache + gravação debounced (modal e card do canvas). */
  salvarCenarioParcial(id: string, mudancas: PatchCenario): void
  /** Torna `versaoId` a versão ativa/visível do cenário (ignora id inexistente). */
  definirVersaoAtiva(id: string, versaoId: string): void
  /** Cria uma versão clonando a ativa; a nova vira ativa. */
  adicionarVersao(id: string, nome: string): void
  renomearVersao(id: string, versaoId: string, nome: string): void
  /** Remove a versão (nunca a última); se remover a ativa, recua pra primeira. */
  removerVersao(id: string, versaoId: string): void
  abrirCenario(id: string): void
  fecharCenario(): void
  carregarVinculos(): Promise<void>
  /** true quando adicionou; false quando já existia (dedupe por deId/paraId/tipo). */
  adicionarVinculo(v: Omit<Vinculo, 'id' | 'criadoEm'>): boolean
  removerVinculo(id: string): void
  alternarParticipacao(entidadeTipo: TipoEntidadeVinculo, entidadeId: string, campanhaId: string): void
  setCampanhaFiltro(id: string | null): void
  /** Ajusta os vínculos 'participa' da entidade para bater EXATAMENTE com a lista (add os novos, remove os que saíram). */
  definirCampanhas(entidadeTipo: TipoEntidadeVinculo, entidadeId: string, campanhaIds: string[]): void
  /** Executa AGORA as gravações debounced pendentes e cancela os timers. Devolve os caminhos que falharam. */
  descarregarFilas(): Promise<string[]>
  /** Troca o cofre aberto sem reiniciar o app. `confirmarFalhas` decide se segue quando a descarga falha. */
  trocarCofre(caminho: string, confirmarFalhas?: (falhas: string[]) => Promise<boolean>): Promise<void>
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

/**
 * Executa AGORA todo debounce pendente e limpa os timers. Existe por causa de
 * `agendarSalvarPersonagem`/`agendarSalvarCenario`, que re-resolvem o caminho no
 * disparo: um timer que sobrevive à troca de cofre gravaria o conteúdo do cofre
 * antigo no caminho do cofre novo.
 *
 * Devolve os caminhos que FALHARAM. Aqui a falha não pode ser engolida como no
 * fire-and-forget dos agendadores (lá a próxima edição reagenda): quem chama
 * descarta o cache logo depois, então gravação perdida é perda definitiva.
 */
async function descarregarFilasPendentes(get: () => AppState): Promise<string[]> {
  const idsPersonagens = [...timersSalvarParcial.keys()]
  for (const t of timersSalvarParcial.values()) clearTimeout(t)
  timersSalvarParcial.clear()

  const idsCenarios = [...timersSalvarCenario.keys()]
  for (const t of timersSalvarCenario.values()) clearTimeout(t)
  timersSalvarCenario.clear()

  const tinhaVinculos = timerSalvarVinculos !== null
  if (timerSalvarVinculos) clearTimeout(timerSalvarVinculos)
  timerSalvarVinculos = null

  const falhas: string[] = []
  const { repo, personagens, caminhoPorId, cenarios, caminhoCenarioPorId, vinculos } = get()
  if (!repo) return falhas

  for (const id of idsPersonagens) {
    const caminho = caminhoPorId[id]
    const p = personagens[id]
    if (!caminho || !p) continue
    try {
      await repo.salvarPersonagem(caminho, { ...p })
    } catch (e) {
      console.error('Falha ao salvar personagem:', e)
      falhas.push(caminho)
    }
  }
  for (const id of idsCenarios) {
    const caminho = caminhoCenarioPorId[id]
    const c = cenarios[id]
    if (!caminho || !c) continue
    try {
      await repo.salvarCenario(caminho, { ...c })
    } catch (e) {
      console.error('Falha ao salvar cenário:', e)
      falhas.push(caminho)
    }
  }
  if (tinhaVinculos) {
    try {
      await repo.salvarVinculos(vinculos)
    } catch (e) {
      console.error('Falha ao salvar vínculos:', e)
      falhas.push('vinculos.json')
    }
  }
  return falhas
}

/**
 * Campos do state que pertencem ao cofre aberto. Ficam numa função só para que trocar
 * de cofre não deixe resíduo: id de campanha, id de personagem e caminho não têm
 * significado nenhum no cofre seguinte.
 */
export function estadoLimpoDeCofre() {
  return {
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
    erroCofre: null,
  }
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
      const norm = normalizarCaminho(path)
      const repo = new VaultRepo(norm, tauriFs)
      await repo.inicializar()
      // guarda NORMALIZADO: o caminho é a identidade do cofre (registro + chaves por cofre).
      // Ambas as gravações vêm ANTES do set: se o localStorage estourar, vaultPath fica
      // null e o VaultPicker mostra o erroCofre — depois do set o app travaria em "Carregando…"
      localStorage.setItem('grimorio.vault', norm)
      registrarCofre(norm)
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
      personagens: { ...s.personagens, [id]: aplicarPatchPersonagem(s.personagens[id], mudancas) },
    }))
    agendarSalvarPersonagem(get, id)
  },

  definirVersaoAtivaPersonagem(id, versaoId) {
    const p = get().personagens[id]
    if (!p || !p.versoes.some((v) => v.id === versaoId)) return
    get().salvarPersonagemParcial(id, { versaoAtivaId: versaoId })
  },

  adicionarVersaoPersonagem(id, nome) {
    const p = get().personagens[id]
    if (!p) return
    const base = versaoAtivaPersonagem(p)
    const nova: VersaoPersonagem = { ...base, id: crypto.randomUUID(), nome, imagens: base.imagens.map((i) => ({ ...i })) }
    set((s) => {
      const a = s.personagens[id]
      return { personagens: { ...s.personagens, [id]: comNomeEspelho({ ...a, versoes: [...a.versoes, nova], versaoAtivaId: nova.id }) } }
    })
    agendarSalvarPersonagem(get, id)
  },

  renomearVersaoPersonagem(id, versaoId, nome) {
    if (!get().personagens[id]) return
    set((s) => {
      const a = s.personagens[id]
      return { personagens: { ...s.personagens, [id]: comNomeEspelho({ ...a, versoes: a.versoes.map((v) => (v.id === versaoId ? { ...v, nome } : v)) }) } }
    })
    agendarSalvarPersonagem(get, id)
  },

  async renomearPersonagemAtivo(id, nome) {
    const p = get().personagens[id]
    if (!p) return
    const atualizado = comNomeEspelho({ ...p, versoes: p.versoes.map((v) => (v.id === p.versaoAtivaId ? { ...v, nome } : v)) })
    set((s) => ({ personagens: { ...s.personagens, [id]: atualizado } }))
    const { repo, caminhoPorId } = get()
    const caminho = caminhoPorId[id]
    if (repo && caminho) await repo.salvarPersonagem(caminho, atualizado)
  },

  removerVersaoPersonagem(id, versaoId) {
    const p = get().personagens[id]
    if (!p || p.versoes.length <= 1) return
    const versoes = p.versoes.filter((v) => v.id !== versaoId)
    const versaoAtivaId = p.versaoAtivaId === versaoId ? versoes[0].id : p.versaoAtivaId
    set((s) => ({ personagens: { ...s.personagens, [id]: comNomeEspelho({ ...s.personagens[id], versoes, versaoAtivaId }) } }))
    agendarSalvarPersonagem(get, id)
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
      cenarios: { ...s.cenarios, [id]: aplicarPatchCenario(s.cenarios[id], mudancas) },
    }))
    agendarSalvarCenario(get, id)
  },

  definirVersaoAtiva(id, versaoId) {
    const c = get().cenarios[id]
    if (!c || !c.versoes.some((v) => v.id === versaoId)) return
    get().salvarCenarioParcial(id, { versaoAtivaId: versaoId })
  },

  adicionarVersao(id, nome) {
    const c = get().cenarios[id]
    if (!c) return
    const base = versaoAtiva(c)
    const nova: VersaoCenario = { ...base, id: crypto.randomUUID(), nome, imagens: base.imagens.map((i) => ({ ...i })) }
    set((s) => {
      const atual = s.cenarios[id]
      return { cenarios: { ...s.cenarios, [id]: { ...atual, versoes: [...atual.versoes, nova], versaoAtivaId: nova.id } } }
    })
    agendarSalvarCenario(get, id)
  },

  renomearVersao(id, versaoId, nome) {
    if (!get().cenarios[id]) return
    set((s) => {
      const atual = s.cenarios[id]
      return { cenarios: { ...s.cenarios, [id]: { ...atual, versoes: atual.versoes.map((v) => (v.id === versaoId ? { ...v, nome } : v)) } } }
    })
    agendarSalvarCenario(get, id)
  },

  removerVersao(id, versaoId) {
    const c = get().cenarios[id]
    if (!c || c.versoes.length <= 1) return
    const versoes = c.versoes.filter((v) => v.id !== versaoId)
    const versaoAtivaId = c.versaoAtivaId === versaoId ? versoes[0].id : c.versaoAtivaId
    set((s) => ({ cenarios: { ...s.cenarios, [id]: { ...s.cenarios[id], versoes, versaoAtivaId } } }))
    agendarSalvarCenario(get, id)
  },

  abrirCenario(id) {
    set({ cenarioAbertoId: id })
  },

  fecharCenario() {
    set({ cenarioAbertoId: null })
  },

  async carregarVinculos() {
    const { repo, tree, vaultPath } = get()
    if (!repo) return
    const vinculos = await repo.lerVinculos()
    // restaura o filtro salvo DESTE cofre; campanha apagada → volta a "Todas"
    const salvo = vaultPath ? localStorage.getItem(chaveDeCofre(CHAVE_FILTRO, vaultPath)) : null
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
    const { vaultPath } = get()
    if (vaultPath) {
      const chave = chaveDeCofre(CHAVE_FILTRO, vaultPath)
      if (id) localStorage.setItem(chave, id)
      else localStorage.removeItem(chave)
    }
    set({ campanhaFiltro: id })
  },

  definirCampanhas(entidadeTipo, entidadeId, campanhaIds) {
    const alvo = new Set(campanhaIds)
    const atuais = campanhasDe(get().vinculos, entidadeId)
    const atualSet = new Set(atuais)
    // remove os que saíram
    for (const campId of atuais) {
      if (alvo.has(campId)) continue
      const v = participacaoDe(get().vinculos, entidadeId, campId)
      if (v) get().removerVinculo(v.id)
    }
    // adiciona os novos (adicionarVinculo já deduplica)
    for (const campId of campanhaIds) {
      if (atualSet.has(campId)) continue
      get().adicionarVinculo({
        deTipo: entidadeTipo, deId: entidadeId,
        paraTipo: 'campanha', paraId: campId,
        tipo: TIPO_PARTICIPA, notas: '',
      })
    }
  },

  async descarregarFilas() {
    return descarregarFilasPendentes(get)
  },

  async trocarCofre(caminho, confirmarFalhas) {
    const norm = normalizarCaminho(caminho)
    if (norm === get().vaultPath) return
    // 1) fecha TUDO que tem debounce próprio. descarregarFilas só enxerga os timers
    //    de nível de módulo; PerfilModal, CenarioModal, NotasEditor e CanvasView
    //    guardam o seu em timer.current, lendo repo/caminho de uma closure do React.
    //    Desmontá-los antes é o que faz esses timers gravarem no cofre certo.
    //    perfilAbertoId/cenarioAbertoId NÃO saem junto com `aberto`.
    //    Consequência aceita: se `confirmarFalhas` recusar lá embaixo, o que estava
    //    aberto na tela já foi fechado — só o cache de dados é que fica intacto.
    set({ aberto: null, perfilAbertoId: null, cenarioAbertoId: null })
    // 2) cede um tick para o React processar os unmounts agendados acima
    await new Promise((r) => setTimeout(r, 0))
    // 3) descarrega o que ainda aponta pro cofre atual
    const falhas = await get().descarregarFilas()
    // 4) gravação falhada é perda definitiva: o cache vai ser descartado no passo 5
    if (falhas.length > 0 && confirmarFalhas && !(await confirmarFalhas(falhas))) return
    // 5) zera o cache do cofre antigo
    set(estadoLimpoDeCofre())
    try {
      await get().abrirCofre(norm)
    } catch (e) {
      // sem isto o app fica com vaultPath válido e tree null: a sidebar trava em
      // "Carregando…" (Sidebar.tsx:68) e o erroCofre, que só é renderizado no
      // VaultPicker (VaultPicker.tsx:23), fica inalcançável.
      set({ vaultPath: null, repo: null })
      throw e
    }
  },
}))
