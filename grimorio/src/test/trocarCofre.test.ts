import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { estadoLimpoDeCofre, useApp } from '../state/store'
import type { VaultRepo } from '../lib/vaultRepo'
import type { Cenario, Personagem, Vinculo } from '../lib/types'

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
    versoes: [{ id: 'cv1', nome: 'Dia', retrato: null, resumo: 'ensolarada', descricao: '', informacao: '', historia: '', eventos: '', itens: '', anotacoes: '', imagens: [] }],
    versaoAtivaId: 'cv1', criadoEm: 'x', modificadoEm: 'y',
  }
}

function vinc(id: string): Vinculo {
  return { id, deTipo: 'personagem', deId: 'p1', paraTipo: 'cenario', paraId: 'c1', tipo: 'mora em', notas: '', criadoEm: 'x' }
}

/** Repo de mentira que só anota onde gravaram. `falharEm` faz a gravação daquele caminho rejeitar. */
function repoEspiao(falharEm?: string) {
  const gravacoes: { caminho: string; descricao: string }[] = []
  const anotar = (caminho: string, descricao: string) => {
    if (caminho === falharEm) throw new Error(`disco cheio: ${caminho}`)
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

beforeEach(() => {
  vi.useRealTimers()
  useApp.setState({
    repo: null, vaultPath: null, personagens: {}, caminhoPorId: {},
    cenarios: {}, caminhoCenarioPorId: {}, vinculos: [], tree: null, aberto: null,
    perfilAbertoId: null, cenarioAbertoId: null, erroCofre: null, carregando: false,
  })
})

// timer de módulo é global: sem desarmar, um pendente vaza pro teste seguinte
afterEach(async () => {
  vi.useRealTimers()
  useApp.setState({ repo: null })
  await useApp.getState().descarregarFilas()
})

describe('descarregarFilas', () => {
  it('grava o pendente no caminho do cofre ATUAL', async () => {
    const { repo, gravacoes } = repoEspiao()
    useApp.setState({ repo, vaultPath: 'C:/cofreA', personagens: { p1: pers() }, caminhoPorId: { p1: 'personagens-soltos/bruce.json' } })

    useApp.getState().salvarPersonagemParcial('p1', { descricao: '<p>rascunho</p>' })
    await useApp.getState().descarregarFilas()

    expect(gravacoes).toEqual([{ caminho: 'personagens-soltos/bruce.json', descricao: '<p>rascunho</p>' }])
  })

  it('cancela o timer: nada é gravado de novo depois da descarga', async () => {
    const { repo, gravacoes } = repoEspiao()
    useApp.setState({ repo, vaultPath: 'C:/cofreA', personagens: { p1: pers() }, caminhoPorId: { p1: 'personagens-soltos/bruce.json' } })

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
    useApp.setState({ repo, vaultPath: 'C:/cofreA', cenarios: { c1: cen() }, caminhoCenarioPorId: { c1: 'cenarios/cidade-alta' } })

    useApp.getState().salvarCenarioParcial('c1', { descricao: '<p>rascunho do cenário</p>' })
    await useApp.getState().descarregarFilas()

    expect(gravacoes).toEqual([{ caminho: 'cenarios/cidade-alta', descricao: '<p>rascunho do cenário</p>' }])
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
      personagens: { p1: pers() }, caminhoPorId: { p1: 'personagens-soltos/bruce.json' },
    })

    // só o personagem está sujo; vínculos vieram do disco e não foram tocados
    useApp.getState().salvarPersonagemParcial('p1', { descricao: '<p>rascunho</p>' })
    await useApp.getState().descarregarFilas()

    expect(gravacoes.map((g) => g.caminho)).toEqual(['personagens-soltos/bruce.json'])
  })

  it('devolve o caminho que falhou na gravação', async () => {
    const { repo, gravacoes } = repoEspiao('personagens-soltos/bruce.json')
    useApp.setState({ repo, vaultPath: 'C:/cofreA', personagens: { p1: pers() }, caminhoPorId: { p1: 'personagens-soltos/bruce.json' } })
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {})

    useApp.getState().salvarPersonagemParcial('p1', { descricao: '<p>rascunho</p>' })
    await expect(useApp.getState().descarregarFilas()).resolves.toEqual(['personagens-soltos/bruce.json'])

    expect(gravacoes).toHaveLength(0)
    erro.mockRestore()
  })

  it('devolve [] quando tudo grava', async () => {
    const { repo } = repoEspiao()
    useApp.setState({ repo, vaultPath: 'C:/cofreA', personagens: { p1: pers() }, caminhoPorId: { p1: 'personagens-soltos/bruce.json' } })

    useApp.getState().salvarPersonagemParcial('p1', { descricao: '<p>rascunho</p>' })
    await expect(useApp.getState().descarregarFilas()).resolves.toEqual([])
  })

  it('sem repo não explode', async () => {
    await expect(useApp.getState().descarregarFilas()).resolves.toEqual([])
  })
})

describe('estadoLimpoDeCofre', () => {
  it('zera exatamente os campos que pertencem ao cofre aberto', () => {
    expect(estadoLimpoDeCofre()).toEqual({
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
    })
  })
})

describe('trocarCofre', () => {
  it('trocar para o MESMO cofre (grafado com \\) é no-op: não descarrega nem limpa', async () => {
    const { repo, gravacoes } = repoEspiao()
    useApp.setState({ repo, vaultPath: 'C:/cofreA', personagens: { p1: pers() }, caminhoPorId: { p1: 'personagens-soltos/bruce.json' } })

    useApp.getState().salvarPersonagemParcial('p1', { descricao: '<p>rascunho</p>' })
    await useApp.getState().trocarCofre('C:\\cofreA')

    expect(gravacoes).toEqual([])
    expect(useApp.getState().vaultPath).toBe('C:/cofreA')
    expect(useApp.getState().personagens.p1).toBeDefined()
    expect(useApp.getState().caminhoPorId.p1).toBe('personagens-soltos/bruce.json')
  })

  it('descarga falhou e confirmarFalhas recusou: não troca de cofre nem descarta o cache', async () => {
    const { repo } = repoEspiao('personagens-soltos/bruce.json')
    useApp.setState({ repo, vaultPath: 'C:/cofreA', personagens: { p1: pers() }, caminhoPorId: { p1: 'personagens-soltos/bruce.json' } })
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {})

    useApp.getState().salvarPersonagemParcial('p1', { descricao: '<p>rascunho</p>' })
    const confirmar = vi.fn(async () => false)
    await useApp.getState().trocarCofre('C:/cofreB', confirmar)

    expect(confirmar).toHaveBeenCalledWith(['personagens-soltos/bruce.json'])
    expect(useApp.getState().vaultPath).toBe('C:/cofreA')
    expect(useApp.getState().repo).toBe(repo)
    // o rascunho não gravado continua em memória, pronto pra nova tentativa
    expect(useApp.getState().personagens.p1.versoes[0].descricao).toBe('<p>rascunho</p>')
    expect(useApp.getState().caminhoPorId.p1).toBe('personagens-soltos/bruce.json')
    erro.mockRestore()
  })

  it('descarga falhou mas confirmarFalhas aceitou: segue e descarta o cache', async () => {
    const { repo } = repoEspiao('personagens-soltos/bruce.json')
    useApp.setState({ repo, vaultPath: 'C:/cofreA', personagens: { p1: pers() }, caminhoPorId: { p1: 'personagens-soltos/bruce.json' } })
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {})

    useApp.getState().salvarPersonagemParcial('p1', { descricao: '<p>rascunho</p>' })
    // abrirCofre monta um VaultRepo real sobre o tauriFs: fora do Tauri ele rejeita
    await expect(useApp.getState().trocarCofre('C:/cofreB', async () => true)).rejects.toBeDefined()

    expect(useApp.getState().personagens).toEqual({})
    expect(useApp.getState().caminhoPorId).toEqual({})
    erro.mockRestore()
  })

  it('abrirCofre falhou: derruba vaultPath/repo para o VaultPicker poder mostrar o erro', async () => {
    const { repo } = repoEspiao()
    useApp.setState({ repo, vaultPath: 'C:/cofreA' })

    await expect(useApp.getState().trocarCofre('C:/cofreInexistente')).rejects.toBeDefined()

    expect(useApp.getState().vaultPath).toBeNull()
    expect(useApp.getState().repo).toBeNull()
    expect(useApp.getState().erroCofre).toBeTruthy()
  })
})
