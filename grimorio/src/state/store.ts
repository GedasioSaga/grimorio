import { create } from 'zustand'
import type { Cenario, Item, ItemRef, PastaItemNode, PastaNode, Personagem, TipoEntidadeVinculo, VaultTree, VersaoCenario, VersaoPersonagem, Vinculo } from '../lib/types'
import { tauriFs } from '../lib/fsBridge'
import { VaultRepo } from '../lib/vaultRepo'
import { coletarCenarioRefs, encontrarCenarioNode, idsDescendentes } from '../lib/cenarioArvore'
import { adicionarVinculo as adicionarVinculoPuro, removerVinculo as removerVinculoPuro, campanhasDe, participacaoDe, TIPO_PARTICIPA } from '../lib/vinculos'
import { aplicarPatchCenario, versaoAtiva, type PatchCenario } from '../lib/cenarioVersao'
import { absorverCenario, cenarioDestinoValido, redirecionarVinculosAbsorcao } from '../lib/localizacaoEntidade'
import { aplicarPatchPersonagem, versaoAtivaPersonagem, comNomeEspelho, type PatchPersonagem } from '../lib/personagemVersao'
import { CHAVE_FILTRO, CHAVE_VAULT, chaveDeCofre, normalizarCaminho, registrar as registrarCofre } from '../lib/cofres'
import { atualizarLayoutSalvo, type LayoutSalvo, type Posicao } from '../lib/grafoLayoutPersistido'

export type TipoAberto = 'sessao' | 'canvas' | 'escrita' | 'mapa'

const SALVAR_PARCIAL_DEBOUNCE_MS = 800

// timers por personagem em nível de módulo: o debounce sobrevive ao unmount do
// card no canvas (tldraw desmonta shapes fora da viewport) sem perder a gravação
const timersSalvarParcial = new Map<string, ReturnType<typeof setTimeout>>()

// mesmo racional para cenários (cards no canvas desmontam fora da viewport)
const timersSalvarCenario = new Map<string, ReturnType<typeof setTimeout>>()

// itens não têm card no canvas, mas o modal fecha durante o debounce pelos mesmos motivos
const timersSalvarItem = new Map<string, ReturnType<typeof setTimeout>>()

/**
 * Ids com edição no cache ainda não confirmada em disco — SEPARADO dos timers acima de
 * propósito. `descarregarFilasPendentes` cancela e some com o timer ANTES de tentar gravar
 * (precisa: um timer que sobrevive à troca de cofre gravaria no caminho do cofre novo com o
 * conteúdo do antigo). Se a gravação falhar depois disso, sem este registro à parte o id
 * não fica pendente em lugar nenhum — a PRÓXIMA chamada (outro clique em "Mover", por
 * exemplo) não encontraria timer nenhum, reportaria "nada pendente" e deixaria a edição pra
 * trás. Um id só sai daqui quando `repo.salvar*` de fato confirma a gravação; entidade que
 * sumiu (excluída/movida por fora) também sai — não há mais o que gravar, e isso não é falha.
 */
const personagensSujos = new Set<string>()
const cenariosSujos = new Set<string>()
const itensSujos = new Set<string>()
// vínculos e layout da teia são arquivo único cada: dirty é booleano, não Set
let vinculosSujo = false
let layoutTeiaSujo = false

/**
 * Avisado sempre que uma gravação é AGENDADA. É o gatilho de "o usuário salvou alguma coisa"
 * que o sincronizador espera (`state/sync.ts`), e chega antes do disco de propósito: o ciclo
 * começa descarregando esta mesma fila, então avisar no agendamento e não na gravação só
 * antecipa o debounce dele.
 *
 * Callback registrado em vez de import direto porque `state/sync.ts` já depende deste módulo
 * (é dele que sai `descarregarFilas`), e importar de volta fecharia um ciclo entre os dois.
 *
 * NÃO fecha o laço com o próprio sync: as gravações do sync (download pelo Rust, cópia de
 * conflito pelo `FsBridge`) não passam por agendador nenhum, e `descarregarFilasPendentes`
 * chama o repo direto em vez de reagendar.
 */
let avisarGravacaoAgendada: (() => void) | null = null

/** Registra o ouvinte do gatilho e devolve o cancelador. Um por vez: só o sync escuta. */
export function aoAgendarGravacao(callback: () => void): () => void {
  avisarGravacaoAgendada = callback
  return () => {
    if (avisarGravacaoAgendada === callback) avisarGravacaoAgendada = null
  }
}

/** Aviso é aviso: sync quebrado não pode derrubar a edição que o disparou. */
function sinalizarGravacao(): void {
  try {
    avisarGravacaoAgendada?.()
  } catch (e) {
    console.error('Falha ao avisar a sincronização:', e)
  }
}

/**
 * Registro de "descarregue agora" para os autosaves LOCAIS dos modais (Perfil/Cenário/Item).
 * Esses modais mantêm timer e closure de gravação PRÓPRIOS (`timer.current` em cada
 * componente), fora dos timers de módulo acima — por isso `descarregarFilas` não os
 * enxerga (ver a docstring dela). A Barra de Localização precisa flushar esse pendente
 * ANTES de mover/absorver a entidade: sem isso, o timer local do modal (agendado com o
 * caminho de ANTES da mudança) dispara depois — e escreve no lugar errado, ou falha
 * silenciosamente e perde a edição. Ver `CenarioModal`/`PerfilModal`/`ItemModal`.
 *
 * Chave = `${tipo}:${id}`; só o modal aberto para aquela entidade se registra, então nunca
 * há mais de um flusher por chave — o `set` simplesmente substitui.
 *
 * O flusher devolve `boolean` (mesmo contrato do `salvar()` de cada modal): `true` = gravou
 * (ou não tinha nada pendente), `false` = tentou gravar e falhou. A Barra de Localização
 * PRECISA desse booleano — sem ele, uma falha de disco vira sucesso aparente e o mover/
 * absorver segue em frente sem a edição do usuário em lugar nenhum. Ver `flushModalPendente`.
 */
const flushersModal = new Map<string, () => Promise<boolean>>()

/** Chamado pelo modal ao montar; devolve o cancelador (chamar no cleanup do efeito). */
export function registrarFlushModal(tipo: string, id: string, flush: () => Promise<boolean>): () => void {
  const chave = `${tipo}:${id}`
  flushersModal.set(chave, flush)
  return () => {
    if (flushersModal.get(chave) === flush) flushersModal.delete(chave)
  }
}

/**
 * Chamado pela Barra de Localização antes de mover/absorver. Devolve `true` quando não há
 * modal registrado para `tipo:id` (nada para flushar, nada falhou) OU quando a gravação deu
 * certo; `false` quando havia gravação pendente e ela FALHOU — quem chama não pode seguir
 * para mover/absorver nesse caso (a edição só existe no cache agora; mover apontaria o
 * caminho novo para um arquivo que nunca recebeu essa edição).
 */
export async function flushModalPendente(tipo: string, id: string): Promise<boolean> {
  const flush = flushersModal.get(`${tipo}:${id}`)
  if (!flush) return true
  return flush()
}

/** Agenda a persistência debounced do cenário `id` (reusada por edições e ações de versão). */
function agendarSalvarCenario(get: () => AppState, id: string) {
  sinalizarGravacao()
  cenariosSujos.add(id)
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
      if (!repo || !caminho || !c) { cenariosSujos.delete(id); return } // sumiu: nada a gravar
      // fire-and-forget: VaultRepo serializa escritas por caminho. NÃO limpa `cenariosSujos`
      // no catch: a falha tem de continuar pendente para `descarregarFilasPendentes` pegar.
      repo.salvarCenario(caminho, { ...c })
        .then(() => cenariosSujos.delete(id))
        .catch((e) => {
          console.error('Falha ao salvar cenário:', e)
        })
    }, SALVAR_PARCIAL_DEBOUNCE_MS),
  )
}

/** Agenda a persistência debounced do item `id`. */
function agendarSalvarItem(get: () => AppState, id: string) {
  sinalizarGravacao()
  itensSujos.add(id)
  const pendente = timersSalvarItem.get(id)
  if (pendente) clearTimeout(pendente)
  timersSalvarItem.set(
    id,
    setTimeout(() => {
      timersSalvarItem.delete(id)
      // caminho re-resolvido no disparo: após mover/excluir não grava no lugar antigo
      const { repo, caminhoItemPorId, itens } = get()
      const caminho = caminhoItemPorId[id]
      const i = itens[id]
      if (!repo || !caminho || !i) { itensSujos.delete(id); return } // sumiu: nada a gravar
      // fire-and-forget: VaultRepo serializa escritas por caminho. NÃO limpa `itensSujos`
      // no catch: a falha tem de continuar pendente para `descarregarFilasPendentes` pegar.
      repo.salvarItem(caminho, { ...i })
        .then(() => itensSujos.delete(id))
        .catch((e) => {
          console.error('Falha ao salvar item:', e)
        })
    }, SALVAR_PARCIAL_DEBOUNCE_MS),
  )
}

/** Agenda a persistência debounced do personagem `id` (reusada por edições e ações de versão). */
function agendarSalvarPersonagem(get: () => AppState, id: string) {
  sinalizarGravacao()
  personagensSujos.add(id)
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
      if (!repo || !caminho || !p) { personagensSujos.delete(id); return } // sumiu: nada a gravar
      // fire-and-forget: VaultRepo serializa escritas por caminho. NÃO limpa `personagensSujos`
      // no catch: a falha tem de continuar pendente para `descarregarFilasPendentes` pegar.
      repo.salvarPersonagem(caminho, { ...p })
        .then(() => personagensSujos.delete(id))
        .catch((e) => {
          console.error('Falha ao salvar personagem:', e)
        })
    }, SALVAR_PARCIAL_DEBOUNCE_MS),
  )
}

// um arquivo só (vinculos.json): um timer só
let timerSalvarVinculos: ReturnType<typeof setTimeout> | null = null

// mesma lógica de arquivo único para o layout da teia (layout-teia.json)
let timerSalvarLayoutTeia: ReturnType<typeof setTimeout> | null = null

/**
 * Documento aberto no workspace (sessão, canvas ou caderno de escrita).
 *
 * Chamava-se `ItemAberto`, e o par que o manipula, `abrirItem`/`fecharItem`. O nome foi
 * cedido: "Item" agora é uma entidade de verdade do cofre (arma, relíquia), e manter os
 * dois significados na mesma interface seria pedir para alguém abrir um documento achando
 * que está abrindo a ficha de um item.
 */
export interface DocumentoAberto {
  tipo: TipoAberto
  /** sessao/canvas: caminho do .json do mapa. escrita: caminho da pasta do caderno (relativo ao cofre). */
  caminho: string
  nome: string
}

/** Gravação pendente que não chegou ao disco. `rotulo` é o nome que o usuário reconhece. */
export interface FalhaDescarga {
  caminho: string
  /** Nome da entidade ('Bruce Wayne', 'Vínculos'); '' quando não dá pra saber. */
  rotulo: string
  erro: unknown
}

/**
 * Campos que pertencem ao cofre aberto: somem junto com ele (ver `estadoLimpoDeCofre`).
 * Campo novo aqui sem entrada lá = erro de compilação, que é o ponto de separar.
 */
interface EstadoDeCofre {
  tree: VaultTree | null
  aberto: DocumentoAberto | null
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
  /** cache de itens do cofre: id -> Item */
  itens: Record<string, Item>
  /** id -> caminho do .json do item relativo ao cofre */
  caminhoItemPorId: Record<string, string>
  itemAbertoId: string | null
  /** relações tipadas entre entidades + participação em campanhas (vinculos.json único) */
  vinculos: Vinculo[]
  /** id da campanha selecionada no filtro da sidebar; null = "Todas" */
  campanhaFiltro: string | null
  /**
   * Posições que o usuário arrumou na teia (`layout-teia.json`), por escopo — `'cofre'` ou
   * `'campanha:<id>'` (ver `chaveDoEscopo`). Nó ausente do escopo cai no layout automático.
   */
  layoutsTeia: Record<string, LayoutSalvo>
  /** teia de vínculos ocupando a área principal (some junto com o cofre) */
  grafoAberto: boolean
  /**
   * Sobe a cada `recarregarDoDisco` que chegou ao fim. É o sinal para views com cache PRÓPRIO
   * — hoje, o canvas aberto, cujo snapshot vive num store do tldraw fora destes caches —
   * relerem o arquivo delas depois de o sync ter escrito no cofre.
   */
  recargasDoDisco: number
  erroCofre: string | null
}

interface AppState extends EstadoDeCofre {
  vaultPath: string | null
  repo: VaultRepo | null
  carregando: boolean

  abrirCofre(path: string): Promise<void>
  recarregarArvore(): Promise<void>
  /**
   * Relê o cofre inteiro do disco. Para quando alguém MEXEU nos arquivos por fora do app —
   * hoje, só o sincronizador. Ver a implementação para a ordem, que não é acidental.
   */
  recarregarDoDisco(): Promise<void>
  abrirDocumento(tipo: TipoAberto, caminho: string, nome: string): void
  fecharDocumento(): void
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
  /**
   * Barra de Localização, ação "Transformar em versão de...": `origemId` deixa de existir como
   * cenário próprio e vira uma (ou mais, se tinha várias versões) versão nova de `destinoId`.
   * O que sobra de `origemId` no disco vai para a lixeira — nunca some de vez. Se a origem
   * estava aberta na tela, a ficha passa a apontar para o destino (ele é quem sobrevive).
   */
  absorverCenarioComoVersao(origemId: string, destinoId: string): Promise<void>
  abrirCenario(id: string): void
  fecharCenario(): void
  carregarItens(): Promise<void>
  /** Merge otimista no cache + gravação debounced (edição no modal do item). */
  salvarItemParcial(id: string, mudancas: Partial<Item>): void
  abrirItem(id: string): void
  fecharItem(): void
  carregarVinculos(): Promise<void>
  /** true quando adicionou; false quando já existia (dedupe por deId/paraId/tipo). */
  adicionarVinculo(v: Omit<Vinculo, 'id' | 'criadoEm'>): boolean
  removerVinculo(id: string): void
  /** Tira todos os vínculos da entidade (as duas pontas). Usado ao excluir pasta. */
  removerVinculosDe(entidadeId: string): void
  alternarParticipacao(entidadeTipo: TipoEntidadeVinculo, entidadeId: string, campanhaId: string): void
  setCampanhaFiltro(id: string | null): void
  /** Abre/fecha a teia de vínculos na área principal. */
  alternarGrafo(): void
  carregarLayoutTeia(): Promise<void>
  /** Registra a posição arrastada de `id` no `escopo` atual (persiste debounced). */
  salvarPosicaoTeia(escopo: string, idsAtuais: ReadonlySet<string>, id: string, posicaoFracao: Posicao): void
  /** Volta o `escopo` ao layout automático (some com o que foi arrumado à mão). */
  resetarLayoutTeia(escopo: string): void
  /** Ajusta os vínculos 'participa' da entidade para bater EXATAMENTE com a lista (add os novos, remove os que saíram). */
  definirCampanhas(entidadeTipo: TipoEntidadeVinculo, entidadeId: string, campanhaIds: string[]): void
  /**
   * Executa AGORA as gravações debounced pendentes e cancela os timers. Devolve as que falharam.
   *
   * Cobre APENAS os timers de nível de módulo (personagens, cenários, itens, vínculos).
   * NotasEditor (via `NotebookRepo.salvarCorpo`), CanvasView e ChatIA gravam pelas
   * closures deles e as falhas de lá nunca chegam em `falhas` — ou seja, o diálogo de
   * confirmação pode dizer "tudo certo" com uma dessas tendo falhado.
   */
  descarregarFilas(): Promise<FalhaDescarga[]>
  /**
   * Troca o cofre aberto sem reiniciar o app. `confirmarFalhas` decide se segue quando a
   * descarga falha — e PRECISA bloquear a interação enquanto estiver aberto (diálogo modal):
   * uma edição feita enquanto ele está na tela entra num cache que já vai ser descartado.
   * O store não tem como garantir isso, nem o tipo como expressar.
   */
  trocarCofre(caminho: string, confirmarFalhas: (falhas: FalhaDescarga[]) => Promise<boolean>): Promise<void>
}

const SALVAR_VINCULOS_DEBOUNCE_MS = 800

function agendarSalvarVinculos(get: () => AppState) {
  sinalizarGravacao()
  vinculosSujo = true
  if (timerSalvarVinculos) clearTimeout(timerSalvarVinculos)
  timerSalvarVinculos = setTimeout(() => {
    timerSalvarVinculos = null
    const { repo, vinculos } = get()
    if (!repo) { vinculosSujo = false; return }
    // fire-and-forget: VaultRepo serializa escritas por caminho. NÃO limpa `vinculosSujo`
    // no catch: a falha tem de continuar pendente para `descarregarFilasPendentes` pegar.
    repo.salvarVinculos(vinculos)
      .then(() => { vinculosSujo = false })
      .catch((e) => console.error('Falha ao salvar vínculos:', e))
  }, SALVAR_VINCULOS_DEBOUNCE_MS)
}

/**
 * Mesma janela dos outros arquivos, de propósito.
 *
 * Uma versão anterior usava 1500ms alegando que `salvarPosicaoTeia` dispara a cada pixel do
 * arrasto. Não dispara: a única chamada está em `encerrarArrasto` (GrafoVinculos.tsx), no
 * mouseup — um arrasto inteiro gera UMA chamada. A janela maior não comprava nada e só
 * ampliava o intervalo em que fechar o app perde o arranjo, que aqui é trabalho manual.
 */
const SALVAR_LAYOUT_TEIA_DEBOUNCE_MS = SALVAR_PARCIAL_DEBOUNCE_MS

function agendarSalvarLayoutTeia(get: () => AppState) {
  sinalizarGravacao()
  layoutTeiaSujo = true
  if (timerSalvarLayoutTeia) clearTimeout(timerSalvarLayoutTeia)
  timerSalvarLayoutTeia = setTimeout(() => {
    timerSalvarLayoutTeia = null
    const { repo, layoutsTeia } = get()
    if (!repo) { layoutTeiaSujo = false; return }
    // fire-and-forget: VaultRepo serializa escritas por caminho. NÃO limpa `layoutTeiaSujo`
    // no catch: a falha tem de continuar pendente para `descarregarFilasPendentes` pegar.
    repo.salvarLayoutTeia(layoutsTeia)
      .then(() => { layoutTeiaSujo = false })
      .catch((e) => console.error('Falha ao salvar layout da teia:', e))
  }, SALVAR_LAYOUT_TEIA_DEBOUNCE_MS)
}

/**
 * Executa AGORA todo debounce pendente e limpa os timers. Existe por causa de
 * `agendarSalvarPersonagem`/`agendarSalvarCenario`, que re-resolvem o caminho no
 * disparo: um timer que sobrevive à troca de cofre gravaria o conteúdo do cofre
 * antigo no caminho do cofre novo.
 *
 * Devolve o que FALHOU. Aqui a falha não pode ser engolida como no fire-and-forget
 * dos agendadores (lá a próxima edição reagenda): quem chama descarta o cache logo
 * depois, então gravação perdida é perda definitiva.
 *
 * Enxerga só os timers de nível de módulo — ver a docstring de `descarregarFilas`.
 */
async function descarregarFilasPendentes(get: () => AppState): Promise<FalhaDescarga[]> {
  // a fila de tentativa é `*Sujos` (sobrevive a uma falha), NÃO as chaves do timer (que
  // acabou de ser cancelado embaixo). Ver a docstring de `personagensSujos` acima: sem essa
  // separação, um id cuja gravação falhar aqui não fica pendente em lugar nenhum, e a
  // PRÓXIMA chamada (outro "Mover" na Barra de Localização, por exemplo) reportaria "nada
  // pendente" sem ter gravado nada — perda silenciosa e definitiva.
  const idsPersonagens = [...personagensSujos]
  for (const t of timersSalvarParcial.values()) clearTimeout(t)
  timersSalvarParcial.clear()

  const idsCenarios = [...cenariosSujos]
  for (const t of timersSalvarCenario.values()) clearTimeout(t)
  timersSalvarCenario.clear()

  const idsItens = [...itensSujos]
  for (const t of timersSalvarItem.values()) clearTimeout(t)
  timersSalvarItem.clear()

  const tinhaVinculos = vinculosSujo
  if (timerSalvarVinculos) clearTimeout(timerSalvarVinculos)
  timerSalvarVinculos = null

  const tinhaLayoutTeia = layoutTeiaSujo
  if (timerSalvarLayoutTeia) clearTimeout(timerSalvarLayoutTeia)
  timerSalvarLayoutTeia = null

  const falhas: FalhaDescarga[] = []
  const { repo, personagens, caminhoPorId, cenarios, caminhoCenarioPorId, itens, caminhoItemPorId, vinculos, layoutsTeia } = get()
  if (!repo) return falhas

  for (const id of idsPersonagens) {
    const caminho = caminhoPorId[id]
    const p = personagens[id]
    // pular NÃO é falha: sem caminho ou sem entidade = foi excluída antes do disparo
    if (!caminho || !p) { personagensSujos.delete(id); continue }
    try {
      await repo.salvarPersonagem(caminho, { ...p })
      personagensSujos.delete(id) // só sai da fila quando REALMENTE gravou
    } catch (e) {
      console.error('Falha ao salvar personagem:', e)
      falhas.push({ caminho, rotulo: p.nome, erro: e })
      // continua em `personagensSujos`: a próxima chamada tenta de novo de verdade
    }
  }
  for (const id of idsCenarios) {
    const caminho = caminhoCenarioPorId[id]
    const c = cenarios[id]
    // pular NÃO é falha: sem caminho ou sem entidade = foi excluído antes do disparo
    if (!caminho || !c) { cenariosSujos.delete(id); continue }
    try {
      await repo.salvarCenario(caminho, { ...c })
      cenariosSujos.delete(id) // só sai da fila quando REALMENTE gravou
    } catch (e) {
      console.error('Falha ao salvar cenário:', e)
      falhas.push({ caminho, rotulo: c.nome, erro: e })
      // continua em `cenariosSujos`: a próxima chamada tenta de novo de verdade
    }
  }
  for (const id of idsItens) {
    const caminho = caminhoItemPorId[id]
    const i = itens[id]
    // pular NÃO é falha: sem caminho ou sem entidade = foi excluído antes do disparo
    if (!caminho || !i) { itensSujos.delete(id); continue }
    try {
      await repo.salvarItem(caminho, { ...i })
      itensSujos.delete(id) // só sai da fila quando REALMENTE gravou
    } catch (e) {
      console.error('Falha ao salvar item:', e)
      falhas.push({ caminho, rotulo: i.nome, erro: e })
      // continua em `itensSujos`: a próxima chamada tenta de novo de verdade
    }
  }
  if (tinhaVinculos) {
    try {
      await repo.salvarVinculos(vinculos)
      vinculosSujo = false // só sai da fila quando REALMENTE gravou
    } catch (e) {
      console.error('Falha ao salvar vínculos:', e)
      falhas.push({ caminho: 'vinculos.json', rotulo: 'Vínculos', erro: e })
      // `vinculosSujo` continua true: a próxima chamada tenta de novo de verdade
    }
  }
  if (tinhaLayoutTeia) {
    try {
      await repo.salvarLayoutTeia(layoutsTeia)
      layoutTeiaSujo = false // só sai da fila quando REALMENTE gravou
    } catch (e) {
      console.error('Falha ao salvar layout da teia:', e)
      falhas.push({ caminho: 'layout-teia.json', rotulo: 'Layout da teia', erro: e })
      // `layoutTeiaSujo` continua true: a próxima chamada tenta de novo de verdade
    }
  }
  return falhas
}

/**
 * Valor zerado de `EstadoDeCofre`: trocar de cofre não pode deixar resíduo, porque id de
 * campanha, id de personagem e caminho não têm significado nenhum no cofre seguinte.
 * O tipo de retorno explícito é o que segura a lista: campo novo em `EstadoDeCofre` sem
 * entrada aqui não compila.
 */
export function estadoLimpoDeCofre(): EstadoDeCofre {
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
    itens: {},
    caminhoItemPorId: {},
    itemAbertoId: null,
    vinculos: [],
    campanhaFiltro: null,
    layoutsTeia: {},
    grafoAberto: false,
    recargasDoDisco: 0,
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
  itens: {},
  caminhoItemPorId: {},
  itemAbertoId: null,
  vinculos: [],
  campanhaFiltro: null,
  layoutsTeia: {},
  grafoAberto: false,
  recargasDoDisco: 0,
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
      localStorage.setItem(CHAVE_VAULT, norm)
      registrarCofre(norm)
      set({ vaultPath: norm, repo })
      await get().recarregarArvore()
      await get().carregarPersonagens()
      await get().carregarCenarios()
      await get().carregarItens()
      await get().carregarVinculos()
      await get().carregarLayoutTeia()
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
    const tree = await repo.montarArvore()
    // trocou de cofre no meio da montagem: esta árvore é de outro cofre. PerfilModal e
    // CenarioModal chamam isto do flush de unmount sem ninguém dar await, e publicar a
    // árvore antiga faria os caminhos relativos dela resolverem contra a raiz nova.
    if (get().repo !== repo) return
    set({ tree })
  },

  /**
   * Relê árvore e caches do disco, depois de o sincronizador ter escrito nele.
   *
   * A ORDEM é o ponto. As gravações do app são debounced em 800 ms e guardam o CACHE, não o
   * arquivo: reler antes de descarregar faria a fila pendente gravar, 800 ms depois, o cache
   * pré-download por cima do que acabou de ser baixado — que é exatamente a perda de dado que
   * esta função existe para estancar. Descarregar primeiro põe a edição do usuário no disco, e
   * a leitura seguinte já a enxerga.
   *
   * Se a edição local e o download tocaram o mesmo arquivo, a local vence aqui e o ciclo
   * seguinte vê a divergência e gera cópia de conflito — que é o mecanismo desenhado para isso.
   *
   * Falha de descarga NÃO cancela a recarga: o cofre no disco mudou de qualquer jeito, e seguir
   * mostrando o retrato velho é pior do que mostrar o disco com uma gravação perdida (que já
   * foi para o `console` e para a aba Nuvem).
   */
  async recarregarDoDisco() {
    const { repo, carregando } = get()
    // durante `abrirCofre`/`trocarCofre` o cache está a meio caminho; a abertura termina lendo tudo
    if (!repo || carregando) return
    try {
      await get().descarregarFilas()
    } catch (e) {
      console.error('Falha ao descarregar a fila antes de reler o cofre:', e)
    }
    // trocou de cofre no meio: `recarregarArvore` já desiste sozinho, e reler os caches de um
    // cofre que não está mais aberto encheria o store com entidades do cofre anterior
    if (get().repo !== repo) return
    await get().recarregarArvore()
    if (get().repo !== repo) return
    await get().carregarPersonagens()
    await get().carregarCenarios()
    await get().carregarItens()
    await get().carregarVinculos()
    await get().carregarLayoutTeia()
    // por último: quem escuta o contador (CanvasView) relê o próprio arquivo, e os caches
    // acima já têm de estar repostos quando esse reler acontecer
    set((s) => ({ recargasDoDisco: s.recargasDoDisco + 1 }))
  },

  abrirDocumento(tipo, caminho, nome) {
    set({ aberto: { tipo, caminho, nome } })
  },

  fecharDocumento() {
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

    const lidos = await Promise.all(refs.map(async (ref) => {
      if (ref.erro) return null
      try {
        return { caminho: ref.caminho, p: await repo.lerPersonagem(ref.caminho) }
      } catch {
        // ignora corrompido; sidebar já marca erro
        return null
      }
    }))
    const personagens: Record<string, Personagem> = {}
    const caminhoPorId: Record<string, string> = {}
    for (const lido of lidos) {
      if (!lido) continue
      personagens[lido.p.id] = lido.p
      caminhoPorId[lido.p.id] = lido.caminho
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
    // grava na hora em vez de agendar, mas o sync precisa saber do mesmo jeito: renomear na
    // sidebar é das mudanças mais visíveis, e ela não passa por nenhum dos timers acima
    sinalizarGravacao()
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
    const lidos = await Promise.all(coletarCenarioRefs(tree.cenarios).map(async (ref) => {
      // id vazio = cenario.json sem id (normalização geraria id novo a cada load)
      if (ref.erro || !ref.id) return null
      try {
        return { caminho: ref.caminho, c: await repo.lerCenario(ref.caminho) }
      } catch {
        // ignora corrompido; sidebar já marca erro
        return null
      }
    }))
    const cenarios: Record<string, Cenario> = {}
    const caminhoCenarioPorId: Record<string, string> = {}
    for (const lido of lidos) {
      if (!lido) continue
      cenarios[lido.c.id] = lido.c
      caminhoCenarioPorId[lido.c.id] = lido.caminho
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

  async absorverCenarioComoVersao(origemId, destinoId) {
    const { repo, cenarios, caminhoCenarioPorId, tree, vinculos } = get()
    const origem = cenarios[origemId]
    const destino = cenarios[destinoId]
    const caminhoOrigem = caminhoCenarioPorId[origemId]
    const caminhoDestino = caminhoCenarioPorId[destinoId]
    if (!repo || !origem || !destino || !caminhoOrigem || !caminhoDestino || !tree) return
    // defesa em profundidade: a UI já filtra (BarraLocalizacao/destinosAbsorverCenario), mas
    // esta é a ação mais destrutiva da barra e merece a MESMA guarda de baixo nível que
    // `moverCenario` já tem — chamar isto direto com a origem nela mesma (ou num descendente
    // dela) duplicaria as versões do cenário dentro dele mesmo e mandaria o resultado pra
    // lixeira: o cenário se autodestruiria.
    if (!cenarioDestinoValido(tree, origemId, caminhoDestino)) return
    const atualizado = absorverCenario(destino, origem, () => crypto.randomUUID())
    // `moverCenarioParaLixeira` move a PASTA inteira da origem (ver `LixeiraExecutor.
    // moverPastaParaLixeira`), levando junto todo sub-cenário dela — mas só as versões da
    // origem entram em `atualizado` (o conteúdo dos sub-cenários não foi absorvido). Sem
    // incluir os ids deles aqui, um vínculo ou sala de mapa que apontava para um SUB-cenário
    // ficaria "quebrado" para sempre (aponta pra um id que só existe dentro da lixeira) até
    // alguém restaurar a origem a mão. Redireciona para o MESMO destino da origem: não é o
    // conteúdo deles que está lá, mas é o lugar mais próximo que sobrevive na árvore — melhor
    // um vínculo que aponta pra algo vivo do que um ponteiro morto.
    const nodeOrigem = encontrarCenarioNode(tree.cenarios, origemId)
    const idsDescendentesOrigem = nodeOrigem ? idsDescendentes(nodeOrigem) : []
    const idsAbsorvidos = [origemId, ...idsDescendentesOrigem]
    // vínculos e salas de mapa que apontavam pra origem (ou pra um sub-cenário dela): sem
    // redirecionar, sobrevivem "quebrados" mesmo com o conteúdo da origem vivo dentro do
    // destino agora — ver `redirecionarVinculosAbsorcao` e `VaultRepo.redirecionarSalasDeCenario`.
    // a origem DIRETA vira versão de verdade no destino — o conteúdo dela está lá, então o
    // redirect é honesto sem nota nenhuma. Um SUB-cenário não: o conteúdo dele foi inteiro
    // pra lixeira (só as versões da origem direta entram em `atualizado`), então o vínculo
    // redirecionado leva a nota "era sobre: X, fundido no destino" — ver a docstring de
    // `redirecionarVinculosAbsorcao`. Cenário fora do cache (`cenarios[id]` ausente) cai no
    // nome da origem: melhor uma nota genérica do que nenhuma.
    //
    // TODAS as origens (direta + descendentes) entram numa ÚNICA chamada, não uma por
    // descendente encadeada: a dedupe da função só enxerga o que ELA tocou, então encadear
    // faria o vínculo redirecionado do segundo descendente colidir com o do primeiro (que já
    // não é mais "tocado" do ponto de vista da segunda chamada) e sumir sem aviso — ver a
    // docstring de `redirecionarVinculosAbsorcao`.
    const origensAbsorcao = [
      { id: origemId },
      ...idsDescendentesOrigem.map((id) => ({ id, notaDescendente: cenarios[id]?.nome ?? origem.nome })),
    ]
    const novosVinculos = redirecionarVinculosAbsorcao(vinculos, origensAbsorcao, destinoId)
    // grava o destino ANTES de mover a origem pra lixeira: se a gravação falhar, a origem
    // continua existindo (nada foi perdido) em vez de sumir sem o conteúdo ter sido migrado
    await repo.salvarCenario(caminhoDestino, atualizado)
    if (novosVinculos !== vinculos) await repo.salvarVinculos(novosVinculos)
    // best-effort: mapa corrompido não pode derrubar a absorção (o conteúdo já migrou e a
    // origem já vai pra lixeira de qualquer jeito) — o método já loga por documento
    for (const id of idsAbsorvidos) {
      await repo.redirecionarSalasDeCenario(tree, id, destinoId).catch((e) => {
        console.error('Falha ao redirecionar salas de mapa após absorção:', e)
      })
    }
    await repo.moverCenarioParaLixeira(caminhoOrigem, origem.nome, origem.id || undefined)
    set((s) => {
      // a origem sobrevive só na lixeira: some do cache pra não continuar em teia/busca/sidebar
      const { [origemId]: _cenarioRemovido, ...cenariosResto } = s.cenarios
      const { [origemId]: _caminhoRemovido, ...caminhosResto } = s.caminhoCenarioPorId
      return {
        cenarios: { ...cenariosResto, [destinoId]: atualizado },
        caminhoCenarioPorId: caminhosResto,
        // a ficha da origem não existe mais: se estava aberta, o usuário pousa no destino
        cenarioAbertoId: s.cenarioAbertoId === origemId ? destinoId : s.cenarioAbertoId,
        vinculos: novosVinculos,
      }
    })
    await get().recarregarArvore()
    await get().carregarCenarios()
  },

  abrirCenario(id) {
    set({ cenarioAbertoId: id })
  },

  fecharCenario() {
    set({ cenarioAbertoId: null })
  },

  async carregarItens() {
    const { repo, tree } = get()
    if (!repo || !tree) return
    const refs: ItemRef[] = []
    const daPasta = (pasta: PastaItemNode) => {
      refs.push(...pasta.itens)
      pasta.subpastas.forEach(daPasta)
    }
    daPasta(tree.itens)

    const lidos = await Promise.all(refs.map(async (ref) => {
      if (ref.erro) return null
      try {
        return { caminho: ref.caminho, i: await repo.lerItem(ref.caminho) }
      } catch {
        // ignora corrompido; sidebar já marca erro
        return null
      }
    }))
    const itens: Record<string, Item> = {}
    const caminhoItemPorId: Record<string, string> = {}
    for (const lido of lidos) {
      if (!lido) continue
      itens[lido.i.id] = lido.i
      caminhoItemPorId[lido.i.id] = lido.caminho
    }
    set({ itens, caminhoItemPorId })
  },

  salvarItemParcial(id, mudancas) {
    if (!get().itens[id]) return
    set((s) => ({ itens: { ...s.itens, [id]: { ...s.itens[id], ...mudancas } } }))
    agendarSalvarItem(get, id)
  },

  abrirItem(id) {
    set({ itemAbertoId: id })
  },

  fecharItem() {
    set({ itemAbertoId: null })
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

  removerVinculosDe(entidadeId) {
    const atuais = get().vinculos
    const restantes = atuais.filter((v) => v.deId !== entidadeId && v.paraId !== entidadeId)
    // nada mudou: não agenda gravação nem troca a referência do array à toa
    if (restantes.length === atuais.length) return
    set({ vinculos: restantes })
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

  alternarGrafo() {
    set((s) => ({ grafoAberto: !s.grafoAberto }))
  },

  async carregarLayoutTeia() {
    const { repo } = get()
    if (!repo) return
    set({ layoutsTeia: await repo.lerLayoutTeia() })
  },

  salvarPosicaoTeia(escopo, idsAtuais, id, posicaoFracao) {
    const atual = get().layoutsTeia[escopo] ?? {}
    const novo: LayoutSalvo = atualizarLayoutSalvo(atual, idsAtuais, id, posicaoFracao)
    set((s) => ({ layoutsTeia: { ...s.layoutsTeia, [escopo]: novo } }))
    agendarSalvarLayoutTeia(get)
  },

  resetarLayoutTeia(escopo) {
    // escopo sem entrada é EXATAMENTE o mesmo que escopo vazio para `posicoesEfetivas`,
    // mas remover a chave (em vez de gravar {}) mantém o arquivo enxuto
    if (!(escopo in get().layoutsTeia)) return
    set((s) => {
      const { [escopo]: _descartado, ...resto } = s.layoutsTeia
      return { layoutsTeia: resto }
    })
    agendarSalvarLayoutTeia(get)
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
    // `carregando` também barra: com uma abertura já em curso (a do boot, em App.tsx),
    // o abrirCofre lá embaixo desistiria em silêncio DEPOIS de o cache ter sido zerado
    if (norm === get().vaultPath || get().carregando) return
    // 1) fecha TUDO que tem debounce próprio. descarregarFilas só enxerga os timers de
    //    nível de módulo; PerfilModal, CenarioModal, NotasEditor, ChatIA e CanvasView
    //    guardam o seu em timer.current — todos lendo repo/caminho de
    //    uma closure do React. Desmontá-los antes é o que faz esses timers gravarem no
    //    cofre certo. perfilAbertoId/cenarioAbertoId NÃO saem junto com `aberto`.
    //    Consequência aceita: se `confirmarFalhas` recusar lá embaixo, o que estava
    //    aberto na tela já foi fechado — só o cache de dados é que fica intacto.
    set({ aberto: null, perfilAbertoId: null, cenarioAbertoId: null, itemAbertoId: null })
    // 2) dá uma volta na fila de tarefas para o React processar os unmounts de cima.
    //    É best-effort, não garantia: o cleanup de efeito passivo roda numa tarefa de
    //    MessageChannel do Scheduler do React, e ela vir antes de um setTimeout(0)
    //    clampeado é comportamento do Chromium/WebView2, não regra de especificação.
    //    Se o cleanup chegar atrasado, PerfilModal lê a entidade do store na hora de
    //    gravar, acha `undefined` depois do passo 5 e larga até 800 ms de edição.
    await new Promise((r) => setTimeout(r, 0))
    // 3) descarrega o que ainda aponta pro cofre atual
    const falhas = await get().descarregarFilas()
    // 4) gravação falhada é perda definitiva: o cache vai ser descartado no passo 5
    if (falhas.length > 0 && !(await confirmarFalhas(falhas))) return
    // 5) zera o cache do cofre antigo
    set(estadoLimpoDeCofre())
    try {
      await get().abrirCofre(norm)
      // abrirCofre DESISTE EM SILÊNCIO quando `carregando` já era true (guarda de
      // reentrância). Sem esta checagem o cache fica zerado, nada lança, e a sidebar
      // trava para sempre sem erro visível.
      if (get().vaultPath !== norm) throw new Error('Troca cancelada: outra abertura em andamento')
    } catch (e) {
      // sem isto o app fica com vaultPath válido e tree null: a Sidebar devolve
      // "Carregando…" enquanto `tree` for null, e o erroCofre só é renderizado pelo
      // VaultPicker — que por sua vez só aparece com vaultPath null.
      // erroCofre pode estar vazio quando a desistência foi silenciosa (ninguém lançou
      // lá dentro); sem preencher, o VaultPicker apareceria mudo.
      set({ vaultPath: null, repo: null, erroCofre: get().erroCofre ?? `Não foi possível abrir o cofre: ${e}` })
      throw e
    }
  },
}))
