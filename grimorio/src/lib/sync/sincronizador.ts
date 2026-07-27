import type { FalhaAcao } from './executar'
import { mensagemDeErro } from './executar'
import type { FalhaDeGravacao, ResultadoDoCiclo } from './ciclo'

/**
 * Quem decide QUANDO um ciclo roda, e o que a interface enxerga enquanto isso.
 *
 * As quatro regras que o arquivo existe para garantir:
 *
 * 1. **Um ciclo por vez.** Dois ciclos concorrentes leem o mesmo manifesto, executam planos
 *    derivados do mesmo estado e gravam por cima um do outro — o segundo apagaria do manifesto o
 *    que o primeiro acabou de registrar. Gatilho que chega durante um ciclo NÃO abre outro:
 *    marca um pedido pendente, e no fim do ciclo corre exatamente UMA rodada a mais.
 *
 *    Ignorar o gatilho seria errado porque o ciclo em andamento leu o disco ANTES dele: a escrita
 *    que o disparou não está naquele plano e ficaria invisível até o tique dos 60 s. Enfileirar um
 *    ciclo por gatilho seria desperdício, porque cada ciclo já lê o cofre inteiro — dez gatilhos
 *    não geram mais trabalho que um. Um pedido pendente booleano é o mínimo que garante
 *    "todo gatilho é coberto por um ciclo que começou depois dele".
 *
 * 2. **Erro de rede não derruba nada.** O Grimório é um app local que sincroniza, não um cliente
 *    de nuvem: sem internet ele continua inteiro. Toda falha do ciclo vira estado observável e a
 *    próxima rodada é agendada como se nada tivesse acontecido.
 *
 * 3. **Estado observável, e nada de interface.** O sincronizador PUBLICA um retrato; quem o guarda
 *    num store zustand é `src/state/syncStore.ts`. A porta `publicar` é o que mantém esta peça
 *    testável sem React.
 *
 * 4. **Espera entre ciclos encadeados.** Ver `ESPERA_ENTRE_CICLOS_MS`.
 */

/** Spec: download a cada 60 s. */
const INTERVALO_POLL_MS = 60_000

/** Spec: upload ~3 s após salvar. Uma rajada de gravações vira um ciclo só. */
const DEBOUNCE_GATILHO_MS = 3_000

/**
 * Pausa antes de uma rodada encadeada logo depois de outra.
 *
 * O spike mediu ~2 s de consistência eventual no Drive (achado 3 do design). Um ciclo colado no
 * anterior pode listar sem ver o arquivo que o anterior acabou de enviar — e a matriz lê ausência
 * no Drive como exclusão: com o manifesto já registrando o envio, a célula `igual × apagado` manda
 * `apagarLocal`. Seria o sync apagando um arquivo local por causa de latência da API, e o freio de
 * deleção em massa não pega um caso de um arquivo só.
 *
 * Não é prova de consistência, é folga sobre os ~2 s medidos. A defesa estrutural continua sendo
 * comparar cada lado contra o manifesto e nunca derivar exclusão do feed de mudanças.
 */
const ESPERA_ENTRE_CICLOS_MS = 2_500

/** O retrato que a interface assina. Só dados — a cópia para o usuário é da camada de cima. */
export interface EstadoSync {
  fase: 'ocioso' | 'sincronizando'
  /** Se este cofre tem manifesto, isto é, se já foi pareado com a nuvem. */
  pareado: boolean
  /** ISO do último ciclo que chegou ao fim, ou `null` se nenhum chegou nesta sessão. */
  ultimoSync: string | null
  /** Falha de infraestrutura do último ciclo (rede, disco). `null` quando o último deu certo. */
  ultimoErro: string | null
  /** Ações que falharam no último ciclo executado. O resto do plano seguiu normalmente. */
  falhas: FalhaAcao[]
  /** Preenchido quando o freio disparou. Nada foi executado; a interface tem de perguntar. */
  freio: { apagaria: number; total: number } | null
  /** Gravações do app que não chegaram ao disco. Com isto preenchido, o cofre nem foi lido. */
  gravacoesPendentes: FalhaDeGravacao[]
}

/**
 * Valor zerado. Função e não constante: `falhas` e `gravacoesPendentes` são arrays, e uma
 * constante compartilhada viraria estado global mutável entre cofres.
 */
export function estadoInicialSync(): EstadoSync {
  return {
    fase: 'ocioso',
    pareado: false,
    ultimoSync: null,
    ultimoErro: null,
    falhas: [],
    freio: null,
    gravacoesPendentes: [],
  }
}

/**
 * Os timers, injetados. É o que torna o agendamento testável sem esperar 60 s de relógio de
 * parede e sem depender de fake timers atravessarem uma cadeia de promises.
 */
export interface Relogio {
  /** Agenda `fn` para daqui a `ms` e devolve o cancelador. */
  agendar(ms: number, fn: () => void): () => void
}

export const relogioReal: Relogio = {
  agendar(ms, fn) {
    const id = setTimeout(fn, ms)
    return () => clearTimeout(id)
  },
}

export interface DependenciasDoSincronizador {
  /** Um ciclo completo. Em produção, `() => executarCiclo(deps)`. */
  ciclo(): Promise<ResultadoDoCiclo>
  /** Aplica um retrato parcial sobre o estado observável. */
  publicar(parcial: Partial<EstadoSync>): void
  relogio: Relogio
}

export interface Sincronizador {
  /** Liga o sync contínuo: roda um ciclo agora e passa a rodar a cada 60 s. Idempotente. */
  iniciar(): void
  /** Desliga. Um ciclo em andamento termina — não há como cancelar I/O em voo —, mas não encadeia. */
  parar(): void
  /** Pede um ciclo com debounce de 3 s. É o gatilho de "o usuário salvou alguma coisa". */
  agendar(): void
  /** Pede um ciclo sem debounce (botão "Sincronizar agora", ganho de foco). Resolve no fim. */
  sincronizarAgora(): Promise<void>
}

/** O que cada desfecho do ciclo muda no retrato. */
function resumoDe(resultado: ResultadoDoCiclo): Partial<EstadoSync> {
  switch (resultado.tipo) {
    case 'sincronizado':
      // Limpa freio, erro e pendências: o ciclo passou por todos eles sem esbarrar.
      return {
        pareado: true,
        ultimoSync: resultado.manifesto.ultimoSync,
        falhas: resultado.falhas,
        ultimoErro: null,
        freio: null,
        gravacoesPendentes: [],
      }
    case 'freio':
      return { pareado: true, freio: { apagaria: resultado.apagaria, total: resultado.total } }
    case 'gravacaoPendente':
      return { gravacoesPendentes: resultado.falhas }
    case 'naoPareado':
      return { pareado: false }
  }
}

export function criarSincronizador(deps: DependenciasDoSincronizador): Sincronizador {
  let ligado = false
  let cancelarPeriodico: (() => void) | null = null
  let cancelarDebounce: (() => void) | null = null
  /** A cadeia em andamento, ou `null`. É a trava de "um ciclo por vez". */
  let emAndamento: Promise<void> | null = null
  /** Um gatilho chegou durante o ciclo. Booleano, não fila: N gatilhos = uma rodada a mais. */
  let pendente = false

  function cancelarPeriodicoSeArmado(): void {
    if (cancelarPeriodico === null) return
    cancelarPeriodico()
    cancelarPeriodico = null
  }

  function cancelarDebounceSeArmado(): void {
    if (cancelarDebounce === null) return
    cancelarDebounce()
    cancelarDebounce = null
  }

  function esperar(ms: number): Promise<void> {
    return new Promise((resolver) => deps.relogio.agendar(ms, resolver))
  }

  async function rodarUm(): Promise<void> {
    deps.publicar({ fase: 'sincronizando' })
    deps.publicar({ fase: 'ocioso', ...(await tentarCiclo()) })
  }

  async function tentarCiclo(): Promise<Partial<EstadoSync>> {
    try {
      return resumoDe(await deps.ciclo())
    } catch (erro) {
      return { ultimoErro: mensagemDeErro(erro) }
    }
  }

  async function rodarEncadeado(): Promise<void> {
    try {
      // O tique periódico armado seria só uma repetição do que começa agora.
      cancelarPeriodicoSeArmado()
      let primeira = true
      do {
        if (!primeira) await esperar(ESPERA_ENTRE_CICLOS_MS)
        primeira = false
        // Limpo ANTES de rodar: gatilho que chegar durante o ciclo tem de marcar de novo.
        pendente = false
        await rodarUm()
      } while (pendente)
    } finally {
      emAndamento = null
      if (ligado) armarPeriodico()
    }
  }

  function armarPeriodico(): void {
    cancelarPeriodicoSeArmado()
    cancelarPeriodico = deps.relogio.agendar(INTERVALO_POLL_MS, () => {
      cancelarPeriodico = null
      void disparar()
    })
  }

  function disparar(): Promise<void> {
    if (emAndamento !== null) {
      pendente = true
      return emAndamento
    }
    emAndamento = rodarEncadeado()
    return emAndamento
  }

  return {
    iniciar() {
      if (ligado) return
      ligado = true
      void disparar()
    },
    parar() {
      ligado = false
      // Zera o pedido pendente: o ciclo em voo termina, mas não encadeia outro.
      pendente = false
      cancelarPeriodicoSeArmado()
      cancelarDebounceSeArmado()
    },
    agendar() {
      if (!ligado) return
      cancelarDebounceSeArmado()
      cancelarDebounce = deps.relogio.agendar(DEBOUNCE_GATILHO_MS, () => {
        cancelarDebounce = null
        void disparar()
      })
    },
    sincronizarAgora() {
      // Roda mesmo com o contínuo desligado: é ação explícita do usuário, não automação.
      cancelarDebounceSeArmado()
      return disparar()
    },
  }
}
