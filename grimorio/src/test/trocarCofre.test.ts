import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useApp } from '../state/store'
import type { VaultRepo } from '../lib/vaultRepo'
import type { Personagem } from '../lib/types'

function pers(): Personagem {
  return {
    id: 'p1', nome: 'Bruce',
    versoes: [{ id: 'v1', nome: 'Bruce', retrato: null, resumo: 'humano', descricao: '', informacao: '', historia: '', extras: '', anotacoes: '', imagens: [] }],
    versaoAtivaId: 'v1', criadoEm: 'x', modificadoEm: 'y',
  }
}

/** Repo de mentira que só anota onde gravaram. */
function repoEspiao() {
  const gravacoes: { caminho: string; descricao: string }[] = []
  const repo = {
    async salvarPersonagem(caminho: string, p: Personagem) {
      gravacoes.push({ caminho, descricao: p.versoes[0].descricao })
    },
    async salvarCenario() {},
    async salvarVinculos() {},
  }
  return { repo: repo as unknown as VaultRepo, gravacoes }
}

beforeEach(() => {
  vi.useRealTimers()
  useApp.setState({
    repo: null, vaultPath: null, personagens: {}, caminhoPorId: {},
    cenarios: {}, caminhoCenarioPorId: {}, vinculos: [], tree: null, aberto: null,
  })
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

  it('sem repo não explode', async () => {
    await expect(useApp.getState().descarregarFilas()).resolves.toBeUndefined()
  })
})
