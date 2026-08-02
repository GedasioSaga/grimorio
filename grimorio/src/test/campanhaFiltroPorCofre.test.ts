// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { useApp } from '../state/store'
import type { VaultRepo } from '../lib/vaultRepo'
import type { CampanhaNode, VaultTree } from '../lib/types'

beforeEach(() => {
  localStorage.clear()
  useApp.setState({ vaultPath: null, campanhaFiltro: null, repo: null, tree: null })
})

describe('filtro de campanha por cofre', () => {
  it('grava na chave do cofre atual, não na chave global', () => {
    useApp.setState({ vaultPath: 'C:/cofreA' })
    useApp.getState().setCampanhaFiltro('camp-1')
    expect(localStorage.getItem('grimorio.campanhaFiltro.C:/cofreA')).toBe('camp-1')
    expect(localStorage.getItem('grimorio.campanhaFiltro')).toBeNull()
  })

  it('cofres diferentes não compartilham o filtro', () => {
    useApp.setState({ vaultPath: 'C:/cofreA' })
    useApp.getState().setCampanhaFiltro('camp-1')
    useApp.setState({ vaultPath: 'C:/cofreB' })
    useApp.getState().setCampanhaFiltro('camp-2')
    expect(localStorage.getItem('grimorio.campanhaFiltro.C:/cofreA')).toBe('camp-1')
    expect(localStorage.getItem('grimorio.campanhaFiltro.C:/cofreB')).toBe('camp-2')
  })

  it('limpar o filtro remove só a chave do cofre atual', () => {
    useApp.setState({ vaultPath: 'C:/cofreA' })
    useApp.getState().setCampanhaFiltro('camp-1')
    useApp.setState({ vaultPath: 'C:/cofreB' })
    useApp.getState().setCampanhaFiltro('camp-2')
    useApp.getState().setCampanhaFiltro(null)
    expect(localStorage.getItem('grimorio.campanhaFiltro.C:/cofreB')).toBeNull()
    expect(localStorage.getItem('grimorio.campanhaFiltro.C:/cofreA')).toBe('camp-1')
  })

  it('sem cofre aberto não grava nada no localStorage', () => {
    useApp.getState().setCampanhaFiltro('camp-1')
    expect(useApp.getState().campanhaFiltro).toBe('camp-1')
    expect(localStorage.length).toBe(0)
  })
})

function campanha(id: string, nome: string): CampanhaNode {
  return { id, slug: id, nome, sessoes: [], personagens: [], canvases: [], escritas: [] }
}

function arvore(campanhas: CampanhaNode[]): VaultTree {
  return {
    campanhas,
    canvasesSoltos: [],
    personagensSoltos: { slug: 'personagens-soltos', nome: 'personagens-soltos', caminho: 'personagens-soltos', subpastas: [], personagens: [] },
    cenarios: { slug: 'cenarios', nome: 'cenarios', caminho: 'cenarios', subpastas: [], cenarios: [] },
    itens: { slug: 'itens', nome: 'itens', caminho: 'itens', subpastas: [], itens: [] },
  }
}

/** Repo de mentira: carregarVinculos só precisa de lerVinculos. */
const repoVazio = { lerVinculos: async () => [] } as unknown as VaultRepo

describe('carregarVinculos restaura o filtro do cofre', () => {
  it('restaura o filtro salvo DESTE cofre', async () => {
    localStorage.setItem('grimorio.campanhaFiltro.C:/cofreA', 'camp-1')
    useApp.setState({ repo: repoVazio, vaultPath: 'C:/cofreA', tree: arvore([campanha('camp-1', 'Campanha 1')]) })
    await useApp.getState().carregarVinculos()
    expect(useApp.getState().campanhaFiltro).toBe('camp-1')
  })

  it('descarta filtro cuja campanha não existe mais no cofre', async () => {
    // isca: 'camp-1' EXISTE na árvore, então uma leitura pela chave global restauraria
    // o filtro e quebraria o toBeNull — sem a isca este teste passa mesmo com a regressão
    localStorage.setItem('grimorio.campanhaFiltro', 'camp-1')
    localStorage.setItem('grimorio.campanhaFiltro.C:/cofreA', 'camp-apagada')
    useApp.setState({ repo: repoVazio, vaultPath: 'C:/cofreA', tree: arvore([campanha('camp-1', 'Campanha 1')]) })
    await useApp.getState().carregarVinculos()
    expect(useApp.getState().campanhaFiltro).toBeNull()
  })

  it('não lê a chave de outro cofre', async () => {
    // mesma isca: a chave global (legada) precisa ter valor válido, senão uma leitura
    // global devolveria null e o teste passaria por engano
    localStorage.setItem('grimorio.campanhaFiltro', 'camp-1')
    localStorage.setItem('grimorio.campanhaFiltro.C:/cofreB', 'camp-1')
    useApp.setState({ repo: repoVazio, vaultPath: 'C:/cofreA', tree: arvore([campanha('camp-1', 'Campanha 1')]) })
    await useApp.getState().carregarVinculos()
    expect(useApp.getState().campanhaFiltro).toBeNull()
  })
})
