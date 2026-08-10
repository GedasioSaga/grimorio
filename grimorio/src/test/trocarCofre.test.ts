import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useApp, type FalhaDescarga } from '../state/store'
import { VaultRepo } from '../lib/vaultRepo'
import type { Cenario, Personagem, VaultTree, Vinculo } from '../lib/types'
import { criarFakeFs } from './fakeFs'

const CAMINHO_BRUCE = 'personagens-soltos/bruce.json'
const CAMINHO_CIDADE = 'cenarios/cidade-alta'

function pers(): Personagem {
  return {
    id: 'p1', nome: 'Bruce',
    versoes: [{ id: 'v1', nome: 'Bruce', retrato: null, resumo: 'humano', descricao: '', informacao: '', historia: '', extras: '', anotacoes: '', imagens: [] }],
    versaoAtivaId: 'v1', criadoEm: 'x', modificadoEm: 'y',
  }
}

function cen(): Cenario {
  return {
    id: 'c1', nome: 'Cidade Alta', personagens: [],
    versoes: [{ id: 'cv1', nome: 'Dia', retrato: null, resumo: 'ensolarada', descricao: '', informacao: '', historia: '', eventos: '', itens: '', acervo: [], anotacoes: '', imagens: [] }],
    versaoAtivaId: 'cv1', criadoEm: 'x', modificadoEm: 'y',
  }
}

function vinc(id: string): Vinculo {
  return { id, deTipo: 'personagem', deId: 'p1', paraTipo: 'cenario', paraId: 'c1', tipo: 'mora em', notas: '', criadoEm: 'x' }
}

/** Repo de mentira que só anota onde gravaram. Os caminhos em `falharEm` rejeitam. */
function repoEspiao(falharEm: string | string[] = []) {
  const falhando = new Set(typeof falharEm === 'string' ? [falharEm] : falharEm)
  const gravacoes: { caminho: string; descricao: string }[] = []
  const anotar = (caminho: string, descricao: string) => {
    if (falhando.has(caminho)) throw new Error(`disco cheio: ${caminho}`)
    gravacoes.push({ caminho, descricao })
  }
  const repo = {
    async salvarPersonagem(caminho: string, p: Personagem) {
      anotar(caminho, p.versoes[0].descricao)
    },
    async salvarCenario(caminho: string, c: Cenario) {
      anotar(caminho, c.versoes[0].descricao)
    },
    async salvarVinculos(lista: Vinculo[]) {
      anotar('vinculos.json', lista.map((v) => v.tipo).join('|'))
    },
  }
  return { repo: repo as unknown as VaultRepo, gravacoes }
}

/** Silencia o console.error dos caminhos de falha (restaurado no afterEach). */
function calarConsole() {
  vi.spyOn(console, 'error').mockImplementation(() => {})
}

beforeEach(() => {
  vi.useRealTimers()
  useApp.setState({
    repo: null, vaultPath: null, personagens: {}, caminhoPorId: {},
    cenarios: {}, caminhoCenarioPorId: {}, vinculos: [], tree: null, aberto: null,
    perfilAbertoId: null, cenarioAbertoId: null, erroCofre: null, carregando: false,
  })
})

afterEach(async () => {
  vi.useRealTimers()
  // restaurado aqui e não no corpo do teste: assert que falha no meio não pode deixar
  // o console.error mockado para o resto do arquivo
  vi.restoreAllMocks()
  // timer de módulo é global: sem desarmar, um pendente vaza pro teste seguinte
  useApp.setState({ repo: null })
  await useApp.getState().descarregarFilas()
})

describe('descarregarFilas', () => {
  it('grava o pendente no caminho do cofre ATUAL', async () => {
    const { repo, gravacoes } = repoEspiao()
    useApp.setState({ repo, vaultPath: 'C:/cofreA', personagens: { p1: pers() }, caminhoPorId: { p1: CAMINHO_BRUCE } })

    useApp.getState().salvarPersonagemParcial('p1', { descricao: '<p>rascunho</p>' })
    await useApp.getState().descarregarFilas()

    expect(gravacoes).toEqual([{ caminho: CAMINHO_BRUCE, descricao: '<p>rascunho</p>' }])
  })

  it('cancela o timer: nada é gravado de novo depois da descarga', async () => {
    const { repo, gravacoes } = repoEspiao()
    useApp.setState({ repo, vaultPath: 'C:/cofreA', personagens: { p1: pers() }, caminhoPorId: { p1: CAMINHO_BRUCE } })

    vi.useFakeTimers()
    useApp.getState().salvarPersonagemParcial('p1', { descricao: '<p>rascunho</p>' })
    await useApp.getState().descarregarFilas()
    expect(gravacoes).toHaveLength(1)

    // se o timer não tivesse sido cancelado, ele dispararia aqui
    await vi.advanceTimersByTimeAsync(2000)
    expect(gravacoes).toHaveLength(1)
    vi.useRealTimers()
  })

  it('grava o cenário pendente no caminho do cofre ATUAL', async () => {
    const { repo, gravacoes } = repoEspiao()
    useApp.setState({ repo, vaultPath: 'C:/cofreA', cenarios: { c1: cen() }, caminhoCenarioPorId: { c1: CAMINHO_CIDADE } })

    useApp.getState().salvarCenarioParcial('c1', { descricao: '<p>rascunho do cenário</p>' })
    await useApp.getState().descarregarFilas()

    expect(gravacoes).toEqual([{ caminho: CAMINHO_CIDADE, descricao: '<p>rascunho do cenário</p>' }])
  })

  it('grava os vínculos pendentes', async () => {
    const { repo, gravacoes } = repoEspiao()
    useApp.setState({ repo, vaultPath: 'C:/cofreA', vinculos: [] })

    const novo = useApp.getState().adicionarVinculo({ deTipo: 'personagem', deId: 'p1', paraTipo: 'cenario', paraId: 'c1', tipo: 'mora em', notas: '' })
    expect(novo).toBe(true)
    await useApp.getState().descarregarFilas()

    expect(gravacoes).toEqual([{ caminho: 'vinculos.json', descricao: 'mora em' }])
  })

  it('NÃO regrava vinculos.json quando não havia timer de vínculos pendente', async () => {
    const { repo, gravacoes } = repoEspiao()
    useApp.setState({
      repo, vaultPath: 'C:/cofreA', vinculos: [vinc('x1')],
      personagens: { p1: pers() }, caminhoPorId: { p1: CAMINHO_BRUCE },
    })

    // só o personagem está sujo; vínculos vieram do disco e não foram tocados
    useApp.getState().salvarPersonagemParcial('p1', { descricao: '<p>rascunho</p>' })
    await useApp.getState().descarregarFilas()

    expect(gravacoes.map((g) => g.caminho)).toEqual([CAMINHO_BRUCE])
  })

  it('devolve a falha em vez de engolir, e nada é gravado', async () => {
    const { repo, gravacoes } = repoEspiao(CAMINHO_BRUCE)
    useApp.setState({ repo, vaultPath: 'C:/cofreA', personagens: { p1: pers() }, caminhoPorId: { p1: CAMINHO_BRUCE } })
    calarConsole()

    useApp.getState().salvarPersonagemParcial('p1', { descricao: '<p>rascunho</p>' })
    const falhas = await useApp.getState().descarregarFilas()

    expect(falhas.map((f) => f.caminho)).toEqual([CAMINHO_BRUCE])
    expect(gravacoes).toHaveLength(0)
  })

  it('cada falha carrega rótulo e erro, não só o caminho', async () => {
    const { repo } = repoEspiao([CAMINHO_BRUCE, CAMINHO_CIDADE, 'vinculos.json'])
    useApp.setState({
      repo, vaultPath: 'C:/cofreA',
      personagens: { p1: pers() }, caminhoPorId: { p1: CAMINHO_BRUCE },
      cenarios: { c1: cen() }, caminhoCenarioPorId: { c1: CAMINHO_CIDADE },
      vinculos: [],
    })
    calarConsole()

    useApp.getState().salvarPersonagemParcial('p1', { descricao: '<p>a</p>' })
    useApp.getState().salvarCenarioParcial('c1', { descricao: '<p>b</p>' })
    useApp.getState().adicionarVinculo({ deTipo: 'personagem', deId: 'p1', paraTipo: 'cenario', paraId: 'c1', tipo: 'mora em', notas: '' })
    const falhas = await useApp.getState().descarregarFilas()

    // rótulo é o nome que o usuário reconhece, não o caminho do arquivo
    expect(falhas.map((f) => [f.caminho, f.rotulo])).toEqual([
      [CAMINHO_BRUCE, 'Bruce'],
      [CAMINHO_CIDADE, 'Cidade Alta'],
      ['vinculos.json', 'Vínculos'],
    ])
    // e o motivo chega inteiro, pro diálogo dizer se adianta tentar de novo
    expect(falhas.map((f) => (f.erro as Error).message)).toEqual([
      `disco cheio: ${CAMINHO_BRUCE}`,
      `disco cheio: ${CAMINHO_CIDADE}`,
      'disco cheio: vinculos.json',
    ])
  })

  it('devolve [] quando tudo grava', async () => {
    const { repo } = repoEspiao()
    useApp.setState({ repo, vaultPath: 'C:/cofreA', personagens: { p1: pers() }, caminhoPorId: { p1: CAMINHO_BRUCE } })

    useApp.getState().salvarPersonagemParcial('p1', { descricao: '<p>rascunho</p>' })
    await expect(useApp.getState().descarregarFilas()).resolves.toEqual([])
  })

  it('sem repo não explode', async () => {
    await expect(useApp.getState().descarregarFilas()).resolves.toEqual([])
  })
})

describe('recarregarArvore', () => {
  it('descarta a árvore quando o repo mudou durante a montagem', async () => {
    const repoLento = {
      async montarArvore() {
        // a troca de cofre acontece enquanto o disco (OneDrive) ainda responde
        useApp.setState({ repo: {} as VaultRepo })
        return { campanhas: [], canvasesSoltos: [] }
      },
    } as unknown as VaultRepo
    useApp.setState({ repo: repoLento, vaultPath: 'C:/cofreA' })

    await useApp.getState().recarregarArvore()

    expect(useApp.getState().tree).toBeNull()
  })
})

describe('trocarCofre', () => {
  it('trocar para o MESMO cofre (grafado com \\) é no-op: não descarrega nem limpa', async () => {
    const { repo, gravacoes } = repoEspiao()
    useApp.setState({ repo, vaultPath: 'C:/cofreA', personagens: { p1: pers() }, caminhoPorId: { p1: CAMINHO_BRUCE } })

    useApp.getState().salvarPersonagemParcial('p1', { descricao: '<p>rascunho</p>' })
    await useApp.getState().trocarCofre('C:\\cofreA', async () => true)

    expect(gravacoes).toEqual([])
    expect(useApp.getState().vaultPath).toBe('C:/cofreA')
    expect(useApp.getState().personagens.p1).toBeDefined()
    expect(useApp.getState().caminhoPorId.p1).toBe(CAMINHO_BRUCE)
  })

  it('com outra abertura já em curso (carregando) nem começa: não descarrega nem limpa', async () => {
    const { repo, gravacoes } = repoEspiao()
    useApp.setState({ repo, vaultPath: 'C:/cofreA', carregando: true, personagens: { p1: pers() }, caminhoPorId: { p1: CAMINHO_BRUCE } })

    useApp.getState().salvarPersonagemParcial('p1', { descricao: '<p>rascunho</p>' })
    await useApp.getState().trocarCofre('C:/cofreB', async () => true)

    expect(gravacoes).toEqual([])
    expect(useApp.getState().vaultPath).toBe('C:/cofreA')
    expect(useApp.getState().personagens.p1).toBeDefined()
  })

  it('abertura cancelada em silêncio no meio do caminho: lança em vez de travar a sidebar', async () => {
    const { repo } = repoEspiao(CAMINHO_BRUCE)
    useApp.setState({ repo, vaultPath: 'C:/cofreA', personagens: { p1: pers() }, caminhoPorId: { p1: CAMINHO_BRUCE } })
    calarConsole()
    useApp.getState().salvarPersonagemParcial('p1', { descricao: '<p>rascunho</p>' })

    // o diálogo de confirmação é modal e demorado: dá tempo de a abertura do boot
    // (App.tsx) entrar em curso, e aí abrirCofre desiste em silêncio lá embaixo
    const confirmarEEntrarEmCarga = async () => {
      useApp.setState({ carregando: true })
      return true
    }
    await expect(useApp.getState().trocarCofre('C:/cofreB', confirmarEEntrarEmCarga))
      .rejects.toThrow(/outra abertura em andamento/)

    // sem vaultPath a Sidebar não trava em "Carregando…" e o VaultPicker mostra o erro
    expect(useApp.getState().vaultPath).toBeNull()
    expect(useApp.getState().repo).toBeNull()
    expect(useApp.getState().erroCofre).toBeTruthy()
  })

  it('descarrega o pendente no cofre ANTIGO antes de descartar o cache', async () => {
    const { repo, gravacoes } = repoEspiao()
    useApp.setState({ repo, vaultPath: 'C:/cofreA', personagens: { p1: pers() }, caminhoPorId: { p1: CAMINHO_BRUCE } })

    useApp.getState().salvarPersonagemParcial('p1', { descricao: '<p>rascunho</p>' })
    // abrirCofre monta um VaultRepo real sobre o tauriFs: fora do Tauri ele rejeita
    await expect(useApp.getState().trocarCofre('C:/cofreB', async () => true)).rejects.toBeDefined()

    expect(gravacoes).toEqual([{ caminho: CAMINHO_BRUCE, descricao: '<p>rascunho</p>' }])
    expect(useApp.getState().personagens).toEqual({})
  })

  it('descarga falhou e confirmarFalhas recusou: não troca de cofre nem descarta o cache', async () => {
    const { repo } = repoEspiao(CAMINHO_BRUCE)
    useApp.setState({ repo, vaultPath: 'C:/cofreA', personagens: { p1: pers() }, caminhoPorId: { p1: CAMINHO_BRUCE } })
    calarConsole()

    useApp.getState().salvarPersonagemParcial('p1', { descricao: '<p>rascunho</p>' })
    let recebidas: FalhaDescarga[] = []
    await useApp.getState().trocarCofre('C:/cofreB', async (falhas) => {
      recebidas = falhas
      return false
    })

    expect(recebidas.map((f) => f.caminho)).toEqual([CAMINHO_BRUCE])
    expect(useApp.getState().vaultPath).toBe('C:/cofreA')
    expect(useApp.getState().repo).toBe(repo)
    // o rascunho não gravado continua em memória, pronto pra nova tentativa
    expect(useApp.getState().personagens.p1.versoes[0].descricao).toBe('<p>rascunho</p>')
    expect(useApp.getState().caminhoPorId.p1).toBe(CAMINHO_BRUCE)
  })

  it('descarga falhou mas confirmarFalhas aceitou: segue e descarta o cache', async () => {
    const { repo } = repoEspiao(CAMINHO_BRUCE)
    useApp.setState({ repo, vaultPath: 'C:/cofreA', personagens: { p1: pers() }, caminhoPorId: { p1: CAMINHO_BRUCE } })
    calarConsole()

    useApp.getState().salvarPersonagemParcial('p1', { descricao: '<p>rascunho</p>' })
    await expect(useApp.getState().trocarCofre('C:/cofreB', async () => true)).rejects.toBeDefined()

    expect(useApp.getState().personagens).toEqual({})
    expect(useApp.getState().caminhoPorId).toEqual({})
  })

  it('abrirCofre falhou: derruba vaultPath/repo para o VaultPicker poder mostrar o erro', async () => {
    const { repo } = repoEspiao()
    useApp.setState({ repo, vaultPath: 'C:/cofreA' })

    await expect(useApp.getState().trocarCofre('C:/cofreInexistente', async () => true)).rejects.toBeDefined()

    expect(useApp.getState().vaultPath).toBeNull()
    expect(useApp.getState().repo).toBeNull()
    expect(useApp.getState().erroCofre).toBeTruthy()
  })
})

describe('carregarPersonagens', () => {
  it('lê refs em paralelo, mas preserva a ordem original e pula corrompido', async () => {
    const fs = criarFakeFs()
    const repo = new VaultRepo('C:/Cofre', fs)

    // b.json demora mais pra "gravar" (não afeta leitura, mas comprova que a ordem
    // do resultado não depende de qual promise resolve primeiro)
    await fs.writeTextAtomic('C:/Cofre/personagens-soltos/a.json', JSON.stringify({ id: 'pa', nome: 'A', versoes: [], versaoAtivaId: '', criadoEm: 'x', modificadoEm: 'y' }))
    await fs.writeTextAtomic('C:/Cofre/personagens-soltos/b.json', '{not json')
    await fs.writeTextAtomic('C:/Cofre/personagens-soltos/c.json', JSON.stringify({ id: 'pc', nome: 'C', versoes: [], versaoAtivaId: '', criadoEm: 'x', modificadoEm: 'y' }))

    const tree: VaultTree = {
      campanhas: [],
      canvasesSoltos: [],
      personagensSoltos: {
        slug: 'personagens-soltos', nome: 'Personagens', caminho: 'personagens-soltos', subpastas: [],
        personagens: [
          { slug: 'a', nome: 'A', caminho: 'personagens-soltos/a.json' },
          { slug: 'b', nome: 'B', caminho: 'personagens-soltos/b.json' },
          { slug: 'c', nome: 'C', caminho: 'personagens-soltos/c.json' },
        ],
      },
      cenarios: { slug: 'cenarios', nome: 'Cenários', caminho: 'cenarios', subpastas: [], cenarios: [] },
      itens: { slug: 'itens', nome: 'Itens', caminho: 'itens', subpastas: [], itens: [] },
    }
    useApp.setState({ repo, tree })

    await useApp.getState().carregarPersonagens()

    expect(Object.keys(useApp.getState().personagens)).toEqual(['pa', 'pc'])
    expect(useApp.getState().caminhoPorId).toEqual({
      pa: 'personagens-soltos/a.json',
      pc: 'personagens-soltos/c.json',
    })
  })
})
