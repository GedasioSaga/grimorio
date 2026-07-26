// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { useApp } from '../state/store'

beforeEach(() => {
  localStorage.clear()
  useApp.setState({ vaultPath: null, campanhaFiltro: null })
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
