// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FsBridge } from '../lib/fsBridge'
import type { ClienteDrive } from '../lib/sync/driveBridge'
import type { Manifesto } from '../lib/sync/tipos'
import type { Personagem } from '../lib/types'

/**
 * A costura: `state/sync.ts` ligando o motor ao cofre aberto.
 *
 * Tudo o que toca o Tauri entra falso — disco, hash, conta do Google e cliente do Drive —, e o
 * relógio é o de mentira do vitest, porque as três garantias que este arquivo existe para provar
 * só aparecem no TEMPO: que o sincronizador do cofre antigo para de tocar depois da troca, que o
 * gatilho de gravação vira um ciclo depois do debounce, e que sem conta ou sem pareamento nenhum
 * tique chega ao Drive.
 *
 * O cofre é aberto mexendo em `vaultPath` direto, e não por `abrirCofre`: a costura observa esse
 * campo e nada mais, e passar pelo `VaultRepo` só traria um cofre de mentira no disco para nada.
 */

const CONFIG = 'C:/Config'
const COFRE_A = 'C:/Cofre/A'
const COFRE_B = 'C:/Cofre/B'

const h = vi.hoisted(() => ({
  fs: null as unknown as FsBridge & { arquivos: Map<string, string> },
  conta: null as string | null,
  chamadas: [] as string[],
  /**
   * Quantos ciclos COMEÇARAM. Contado pela descarga das filas, que é a primeira linha de
   * `executarCiclo` — antes até de ele saber se o cofre está pareado. É o único jeito de
   * distinguir "não rodou ciclo nenhum" de "rodou e desistiu na leitura do manifesto", e a
   * diferença importa: a segunda acorda o app a cada 60 s para não fazer nada.
   */
  ciclos: 0,
}))

vi.mock('@tauri-apps/api/path', () => ({ appConfigDir: async () => CONFIG }))
vi.mock('../lib/hashBridge', () => ({
  hashTexto: async (texto: string) => `h(${texto})`,
  hashArquivo: async (caminho: string) => `sha(${caminho})`,
}))
vi.mock('../lib/googleAuth', () => ({ googleConta: async () => h.conta }))
vi.mock('../lib/fsBridge', async () => {
  const { criarFakeFs } = await import('./fakeFs')
  h.fs = criarFakeFs()
  return { tauriFs: h.fs }
})
vi.mock('../lib/sync/driveBridge', () => {
  const drive: ClienteDrive = {
    async pastaRaiz() { h.chamadas.push('pastaRaiz'); return 'raizGrimorio' },
    async garantirPasta(_mae, caminho) { h.chamadas.push(`garantirPasta:${caminho}`); return `id(${caminho})` },
    async listar(pastaRaizId) { h.chamadas.push(`listar:${pastaRaizId}`); return { pastas: [], arquivos: [] } },
    async enviar(pedido) {
      h.chamadas.push(`enviar:${pedido.nome}`)
      return { fileId: 'novo', hash: null, versao: 'v1', tamanho: null }
    },
    async baixar(fileId) { h.chamadas.push(`baixar:${fileId}`) },
    async apagar(fileId) { h.chamadas.push(`apagar:${fileId}`) },
  }
  return { tauriDrive: drive }
})

const { useApp } = await import('../state/store')
const { useSync, limparSync } = await import('../state/syncStore')
const { observarCofreAberto, sincronizarAgora } = await import('../state/sync')

/** Espelham as constantes do sincronizador. Repetidos de propósito: mudar lá tem de quebrar aqui. */
const DEBOUNCE_MS = 3_000
const POLL_MS = 60_000

function manifesto(pastaRaizId: string): Manifesto {
  return {
    versao: 1,
    cofreId: `cofre-${pastaRaizId}`,
    pastaRaizId,
    startPageToken: '',
    deviceId: 'dev-1',
    deviceNome: 'PC Casa',
    ultimoSync: '2026-07-26T10:00:00.000Z',
    pastas: {},
    arquivos: {},
  }
}

/** Escreve o manifesto no mesmo lugar que `diretorioDoManifesto` calcula. */
function pareado(caminho: string, pastaRaizId: string): void {
  h.fs.arquivos.set(`${CONFIG}/cofres/h(${caminho})/manifesto.json`, JSON.stringify(manifesto(pastaRaizId)))
}

/** Personagem mínimo no cache, só para `salvarPersonagemParcial` ter o que agendar. */
function porPersonagem(): Record<string, Personagem> {
  return {
    p1: {
      id: 'p1',
      nome: 'Bruce',
      versoes: [{
        id: 'v1', nome: 'Bruce', retrato: null, resumo: '', descricao: '',
        informacao: '', historia: '', extras: '', anotacoes: '', imagens: [],
      }],
      versaoAtivaId: 'v1',
      criadoEm: 'x',
      modificadoEm: 'y',
    },
  }
}

/** Deixa a cadeia de promises da reconstrução andar sem depender de timer. */
async function assentar(): Promise<void> {
  for (let i = 0; i < 50; i += 1) await Promise.resolve()
}

async function abrir(caminho: string | null): Promise<void> {
  useApp.setState({ vaultPath: caminho })
  await assentar()
}

let parar: () => void = () => {}

beforeEach(() => {
  vi.useFakeTimers()
  h.fs.arquivos.clear()
  h.conta = null
  h.chamadas = []
  h.ciclos = 0
  useApp.setState({
    vaultPath: null,
    repo: null,
    personagens: {},
    caminhoPorId: {},
    async descarregarFilas() { h.ciclos += 1; return [] },
  })
  limparSync()
})

afterEach(() => {
  parar()
  parar = () => {}
  vi.useRealTimers()
})

describe('sem conta do Google conectada', () => {
  it('o app abre o cofre e nada fala com o Drive', async () => {
    pareado(COFRE_A, 'pastaA')
    parar = observarCofreAberto()

    await abrir(COFRE_A)
    await vi.advanceTimersByTimeAsync(POLL_MS * 2)
    await assentar()

    expect(h.chamadas).toEqual([])
    expect(useSync.getState().ultimoErro).toBe(null)
  })

  it('mas a aba Nuvem continua sabendo que o cofre está pareado', async () => {
    // Dizer "ainda não está ligado" aqui empurraria o usuário a parear de novo um cofre que já
    // está — e parear por cima zeraria o manifesto do último sync.
    pareado(COFRE_A, 'pastaA')
    parar = observarCofreAberto()

    await abrir(COFRE_A)

    expect(useSync.getState().pareado).toBe(true)
  })
})

describe('cofre que nunca foi pareado', () => {
  it('não sobe sincronizador nenhum, mesmo com conta conectada', async () => {
    h.conta = 'eu@exemplo.com'
    parar = observarCofreAberto()

    await abrir(COFRE_A)
    await vi.advanceTimersByTimeAsync(POLL_MS * 2)
    await assentar()

    // é o guard-rail do spec: sync automático só depois de o dono do cofre parear de propósito
    expect(h.chamadas).toEqual([])
    expect(useSync.getState().pareado).toBe(false)
    // e nem ciclo vazio roda: sem esta conferência, um sincronizador criado à toa passaria no
    // teste acima — ele desistiria na leitura do manifesto sem nunca chamar o Drive, mas
    // acordaria o app a cada 60 s pelo resto da sessão
    expect(h.ciclos).toBe(0)
  })
})

describe('cofre pareado, com conta conectada', () => {
  beforeEach(() => {
    h.conta = 'eu@exemplo.com'
    pareado(COFRE_A, 'pastaA')
  })

  it('roda um ciclo ao abrir e volta a rodar a cada tique', async () => {
    parar = observarCofreAberto()

    await abrir(COFRE_A)
    expect(h.chamadas).toEqual(['listar:pastaA'])
    expect(h.ciclos).toBe(1)
    expect(useSync.getState().fase).toBe('ocioso')

    await vi.advanceTimersByTimeAsync(POLL_MS)
    await assentar()
    expect(h.chamadas).toEqual(['listar:pastaA', 'listar:pastaA'])
    expect(h.ciclos).toBe(2)
  })

  it('salvar dispara um ciclo depois do debounce, e não fica em laço', async () => {
    parar = observarCofreAberto()
    await abrir(COFRE_A)
    useApp.setState({ personagens: porPersonagem() })
    h.chamadas = []

    useApp.getState().salvarPersonagemParcial('p1', { anotacoes: 'algo' })
    expect(h.chamadas).toEqual([])

    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)
    await assentar()
    expect(h.chamadas).toEqual(['listar:pastaA'])

    // o próprio ciclo grava (manifesto, downloads, cópias de conflito). Se alguma dessas
    // gravações reagendasse o gatilho, o sync giraria sozinho a cada 3 s para sempre.
    h.chamadas = []
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS * 3)
    await assentar()
    expect(h.chamadas).toEqual([])
  })

  it('"sincronizar agora" roda uma rodada na hora', async () => {
    parar = observarCofreAberto()
    await abrir(COFRE_A)
    h.chamadas = []

    await sincronizarAgora()
    await assentar()

    expect(h.chamadas).toEqual(['listar:pastaA'])
  })
})

describe('troca de cofre', () => {
  beforeEach(() => {
    h.conta = 'eu@exemplo.com'
    pareado(COFRE_A, 'pastaA')
    pareado(COFRE_B, 'pastaB')
  })

  it('desliga o sincronizador do cofre antigo: ele nunca mais toca no Drive dele', async () => {
    parar = observarCofreAberto()
    await abrir(COFRE_A)
    expect(h.chamadas).toEqual(['listar:pastaA'])

    await abrir(COFRE_B)
    expect(h.chamadas).toEqual(['listar:pastaA', 'listar:pastaB'])

    // O tique de 60 s é onde um sincronizador esquecido apareceria — e ele sincronizaria o cofre
    // ERRADO, subindo para a pasta A o que a varredura do caminho A encontrasse.
    h.chamadas = []
    await vi.advanceTimersByTimeAsync(POLL_MS * 3)
    await assentar()

    expect(h.chamadas.every((c) => c === 'listar:pastaB')).toBe(true)
    expect(h.chamadas).not.toContain('listar:pastaA')
  })

  it('o gatilho de gravação passa a valer para o cofre novo, e só para ele', async () => {
    parar = observarCofreAberto()
    await abrir(COFRE_A)
    await abrir(COFRE_B)
    useApp.setState({ personagens: porPersonagem() })
    h.chamadas = []

    useApp.getState().salvarPersonagemParcial('p1', { anotacoes: 'algo' })
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)
    await assentar()

    expect(h.chamadas).toEqual(['listar:pastaB'])
  })

  it('fechar o cofre (falha ao abrir) desliga tudo', async () => {
    parar = observarCofreAberto()
    await abrir(COFRE_A)

    await abrir(null)
    h.chamadas = []
    await vi.advanceTimersByTimeAsync(POLL_MS * 3)
    await assentar()

    expect(h.chamadas).toEqual([])
    // o retrato do cofre antigo não pode ficar de pé descrevendo um cofre que já não está aberto
    expect(useSync.getState().pareado).toBe(false)
    expect(useSync.getState().ultimoSync).toBe(null)
  })

  it('cancelar a observação para o sincronizador em pé', async () => {
    parar = observarCofreAberto()
    await abrir(COFRE_A)

    parar()
    parar = () => {}
    h.chamadas = []
    await vi.advanceTimersByTimeAsync(POLL_MS * 3)
    await assentar()

    expect(h.chamadas).toEqual([])
  })

  it('cancelar NO MEIO de uma reconstrução também não deixa sincronizador de pé', async () => {
    // O React desmonta e remonta o efeito em StrictMode, e a leitura do manifesto é assíncrona:
    // sem invalidar a reconstrução em voo, ela instalaria um sincronizador depois do
    // cancelamento — e aí não haveria mais ninguém para pará-lo.
    parar = observarCofreAberto()
    useApp.setState({ vaultPath: COFRE_A })
    parar()
    parar = () => {}

    await assentar()
    await vi.advanceTimersByTimeAsync(POLL_MS * 3)
    await assentar()

    expect(h.chamadas).toEqual([])
    expect(h.ciclos).toBe(0)
  })
})
