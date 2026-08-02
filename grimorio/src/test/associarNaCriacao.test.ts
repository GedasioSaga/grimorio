import { beforeEach, describe, expect, it } from 'vitest'
import { useApp } from '../state/store'
import { associarNaCriacao, useDialogoCampanhas } from '../components/dialogoCampanhas'
import { campanhasDe } from '../lib/vinculos'
import type { PastaCenarioNode, PastaNode, VaultTree, Vinculo } from '../lib/types'

function pasta(caminho: string, id?: string, subpastas: PastaNode[] = []): PastaNode {
  const slug = caminho.split('/').pop()!
  return { slug, nome: slug, caminho, id, subpastas, personagens: [] }
}

const raizCenarios: PastaCenarioNode = { slug: 'cenarios', nome: 'cenarios', caminho: 'cenarios', subpastas: [], cenarios: [] }

const tree: VaultTree = {
  campanhas: [
    { id: 'camp-1', slug: 'c1', nome: 'Campanha 1', sessoes: [], personagens: [], canvases: [], escritas: [] },
    { id: 'camp-2', slug: 'c2', nome: 'Campanha 2', sessoes: [], personagens: [], canvases: [], escritas: [] },
  ],
  canvasesSoltos: [],
  personagensSoltos: pasta('personagens-soltos', undefined, [pasta('personagens-soltos/viloes', 'pasta-viloes')]),
  cenarios: raizCenarios,
  itens: { slug: 'itens', nome: 'itens', caminho: 'itens', subpastas: [], itens: [] },
}

const vinculoPastaViloes: Vinculo = {
  id: 'v1', deTipo: 'pasta', deId: 'pasta-viloes',
  paraTipo: 'campanha', paraId: 'camp-1', tipo: 'participa', notas: '', criadoEm: '',
}

beforeEach(() => {
  useDialogoCampanhas.setState({ pedido: null })
  useApp.setState({ repo: null, tree, vinculos: [vinculoPastaViloes], campanhaFiltro: null })
})

describe('associarNaCriacao', () => {
  it('com filtro ativo etiqueta na campanha filtrada, sem perguntar', async () => {
    useApp.setState({ campanhaFiltro: 'camp-2' })
    await associarNaCriacao('personagem', 'p1', 'Novo', 'personagens-soltos/viloes')
    expect(useDialogoCampanhas.getState().pedido).toBeNull()
    expect(campanhasDe(useApp.getState().vinculos, 'p1')).toEqual(['camp-2'])
  })

  it('sem filtro, herda da pasta e não abre o seletor', async () => {
    await associarNaCriacao('personagem', 'p2', 'Novo', 'personagens-soltos/viloes')
    expect(useDialogoCampanhas.getState().pedido).toBeNull()
    expect(campanhasDe(useApp.getState().vinculos, 'p2')).toEqual(['camp-1'])
  })

  it('sem filtro e sem herança, abre o seletor', async () => {
    const promessa = associarNaCriacao('personagem', 'p3', 'Novo', 'personagens-soltos')
    expect(useDialogoCampanhas.getState().pedido?.titulo).toBe('Campanhas de "Novo":')
    useDialogoCampanhas.getState().responder(['camp-2'])
    await promessa
    expect(campanhasDe(useApp.getState().vinculos, 'p3')).toEqual(['camp-2'])
  })

  it('sem dirPai continua perguntando (comportamento antigo)', async () => {
    const promessa = associarNaCriacao('personagem', 'p4', 'Novo')
    expect(useDialogoCampanhas.getState().pedido).not.toBeNull()
    useDialogoCampanhas.getState().responder(null)
    await promessa
    expect(campanhasDe(useApp.getState().vinculos, 'p4')).toEqual([])
  })
})
