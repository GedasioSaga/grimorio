import { describe, expect, it } from 'vitest'
import type { ResultadoDoCiclo } from '../lib/sync/ciclo'
import {
  criarSincronizador,
  estadoInicialSync,
  type EstadoSync,
  type Relogio,
} from '../lib/sync/sincronizador'
import type { Manifesto } from '../lib/sync/tipos'

/** Espelham as constantes do módulo. Repetidos de propósito: mudar o valor lá tem de quebrar aqui. */
const DEBOUNCE_MS = 3_000
const ESPERA_ENTRE_CICLOS_MS = 2_500
const INTERVALO_POLL_MS = 60_000

const AGORA = '2026-07-27T12:00:00.000Z'

const MANIFESTO: Manifesto = {
  versao: 1,
  cofreId: 'cofre-1',
  pastaRaizId: 'raizDrive',
  startPageToken: '900',
  deviceId: 'dev-1',
  deviceNome: 'PC Casa',
  ultimoSync: AGORA,
  pastas: {},
  arquivos: {},
}

const SINCRONIZADO: ResultadoDoCiclo = { tipo: 'sincronizado', manifesto: MANIFESTO, falhas: [] }

/** Deixa a cadeia de promises do sincronizador andar sem depender de timer real. */
async function assentar(): Promise<void> {
  for (let i = 0; i < 20; i += 1) await Promise.resolve()
}

function criarRelogioFalso() {
  let seq = 0
  const armados = new Map<number, { ms: number; fn: () => void }>()

  const relogio: Relogio = {
    agendar(ms, fn) {
      const id = seq
      seq += 1
      armados.set(id, { ms, fn })
      return () => {
        armados.delete(id)
      }
    },
  }

  return {
    relogio,
    /** Quantos timers estão armados agora. */
    quantos: () => armados.size,
    /** Dispara os timers de `ms` (todos, se omitido), na ordem em que foram armados. */
    disparar(ms?: number) {
      for (const [id, t] of [...armados]) {
        if (ms !== undefined && t.ms !== ms) continue
        armados.delete(id)
        t.fn()
      }
    },
  }
}

/**
 * Ciclo falso que só termina quando o teste manda. É o que permite provar o comportamento
 * "gatilho durante um ciclo em andamento" sem depender de temporização.
 */
function criarCicloFalso() {
  let iniciados = 0
  let emVoo = 0
  let maxEmVoo = 0
  let resolver: ((r: ResultadoDoCiclo) => void) | null = null
  let rejeitar: ((e: unknown) => void) | null = null

  function ciclo(): Promise<ResultadoDoCiclo> {
    iniciados += 1
    emVoo += 1
    maxEmVoo = Math.max(maxEmVoo, emVoo)
    return new Promise<ResultadoDoCiclo>((res, rej) => {
      resolver = res
      rejeitar = rej
    }).finally(() => {
      emVoo -= 1
    })
  }

  async function concluir(resultado: ResultadoDoCiclo = SINCRONIZADO): Promise<void> {
    const pronto = resolver
    resolver = null
    rejeitar = null
    pronto?.(resultado)
    await assentar()
  }

  async function falhar(erro: unknown): Promise<void> {
    const quebrou = rejeitar
    resolver = null
    rejeitar = null
    quebrou?.(erro)
    await assentar()
  }

  return { ciclo, concluir, falhar, iniciados: () => iniciados, maxEmVoo: () => maxEmVoo }
}

function montar() {
  const relogio = criarRelogioFalso()
  const falso = criarCicloFalso()
  let estado: EstadoSync = estadoInicialSync()
  const publicados: Partial<EstadoSync>[] = []

  const sinc = criarSincronizador({
    ciclo: falso.ciclo,
    publicar(parcial) {
      publicados.push(parcial)
      estado = { ...estado, ...parcial }
    },
    relogio: relogio.relogio,
  })

  return { sinc, relogio, falso, publicados, estado: () => estado }
}

describe('criarSincronizador', () => {
  it('ciclo feliz: publica sincronizando, volta a ocioso e guarda o último sync', async () => {
    const { sinc, falso, estado, publicados } = montar()

    sinc.iniciar()
    await assentar()
    expect(falso.iniciados()).toBe(1)
    expect(estado().fase).toBe('sincronizando')

    await falso.concluir()

    expect(publicados.map((p) => p.fase)).toEqual(['sincronizando', 'ocioso'])
    expect(estado()).toEqual({
      fase: 'ocioso',
      pareado: true,
      ultimoSync: AGORA,
      ultimoErro: null,
      falhas: [],
      freio: null,
      gravacoesPendentes: [],
    })
  })

  it('gatilho durante um ciclo não abre outro: N pedidos viram UMA rodada a mais', async () => {
    const { sinc, relogio, falso } = montar()

    sinc.iniciar()
    await assentar()

    void sinc.sincronizarAgora()
    void sinc.sincronizarAgora()
    void sinc.sincronizarAgora()
    await assentar()
    expect(falso.iniciados()).toBe(1)

    await falso.concluir()
    // a rodada encadeada espera a folga de consistência eventual antes de começar
    expect(falso.iniciados()).toBe(1)

    relogio.disparar(ESPERA_ENTRE_CICLOS_MS)
    await assentar()
    expect(falso.iniciados()).toBe(2)

    await falso.concluir()
    expect(falso.iniciados()).toBe(2)
    expect(falso.maxEmVoo()).toBe(1)
  })

  it('falha de rede vira estado e a próxima rodada continua agendada', async () => {
    const { sinc, relogio, falso, estado } = montar()

    sinc.iniciar()
    await assentar()
    await falso.falhar(new Error('sem internet'))

    expect(estado().fase).toBe('ocioso')
    expect(estado().ultimoErro).toBe('sem internet')

    relogio.disparar(INTERVALO_POLL_MS)
    await assentar()
    expect(falso.iniciados()).toBe(2)
  })

  it('erro que não é Error (o invoke do Tauri rejeita com string) vira mensagem legível', async () => {
    const { sinc, falso, estado } = montar()

    sinc.iniciar()
    await assentar()
    await falso.falhar('403: cota estourada')

    expect(estado().ultimoErro).toBe('403: cota estourada')
  })

  it('freio disparado vira estado, sem apagar o último sync conhecido', async () => {
    const { sinc, falso, estado } = montar()

    sinc.iniciar()
    await assentar()
    await falso.concluir({ tipo: 'freio', apagaria: 8, total: 12 })

    expect(estado().freio).toEqual({ apagaria: 8, total: 12 })
    expect(estado().pareado).toBe(true)
    expect(estado().fase).toBe('ocioso')
  })

  it('gravação pendente aparece no estado para a interface poder nomear o arquivo', async () => {
    const { sinc, falso, estado } = montar()
    const falhas = [{ caminho: 'a.json', rotulo: 'Gandalf' }]

    sinc.iniciar()
    await assentar()
    await falso.concluir({ tipo: 'gravacaoPendente', falhas })

    expect(estado().gravacoesPendentes).toEqual(falhas)
  })

  it('cofre não pareado marca o estado e não fica em erro', async () => {
    const { sinc, falso, estado } = montar()

    sinc.iniciar()
    await assentar()
    await falso.concluir({ tipo: 'naoPareado' })

    expect(estado().pareado).toBe(false)
    expect(estado().ultimoErro).toBe(null)
  })

  it('parar() durante um ciclo não encadeia a rodada pendente nem rearma o periódico', async () => {
    const { sinc, relogio, falso } = montar()

    sinc.iniciar()
    await assentar()
    void sinc.sincronizarAgora()
    sinc.parar()

    await falso.concluir()

    expect(falso.iniciados()).toBe(1)
    expect(relogio.quantos()).toBe(0)
  })

  it('agendar() coalesce a rajada de gravações num debounce só', async () => {
    const { sinc, relogio, falso } = montar()

    sinc.iniciar()
    await assentar()
    await falso.concluir()

    sinc.agendar()
    sinc.agendar()
    sinc.agendar()
    relogio.disparar(DEBOUNCE_MS)
    await assentar()

    expect(falso.iniciados()).toBe(2)
    // o tique periódico armado foi cancelado ao começar o ciclo: se ele sobrasse, dispararia no
    // meio da rodada e marcaria um pedido pendente que só repetiria o que já está acontecendo
    expect(relogio.quantos()).toBe(0)
  })

  it('agendar() não faz nada com o sync desligado', async () => {
    const { sinc, relogio, falso } = montar()

    sinc.agendar()
    relogio.disparar(DEBOUNCE_MS)
    await assentar()

    expect(falso.iniciados()).toBe(0)
  })

  it('a rodada periódica é rearmada depois de cada ciclo, e não durante', async () => {
    const { sinc, relogio, falso } = montar()

    sinc.iniciar()
    await assentar()
    expect(relogio.quantos()).toBe(0)

    await falso.concluir()
    expect(relogio.quantos()).toBe(1)

    relogio.disparar(INTERVALO_POLL_MS)
    await assentar()
    expect(falso.iniciados()).toBe(2)
  })
})
