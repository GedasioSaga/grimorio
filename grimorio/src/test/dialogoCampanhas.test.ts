import { beforeEach, describe, it, expect } from 'vitest'
import { pedirCampanhas, useDialogoCampanhas, associarNaCriacao } from '../components/dialogoCampanhas'
import { useApp } from '../state/store'
import { TIPO_PARTICIPA, campanhasDe, idsDaCampanha } from '../lib/vinculos'
import type { TipoEntidadeVinculo, VaultTree, Vinculo } from '../lib/types'

function mkPart(id: string, deTipo: TipoEntidadeVinculo, deId: string, campId: string): Vinculo {
  return { id, deTipo, deId, paraTipo: 'campanha', paraId: campId, tipo: TIPO_PARTICIPA, notas: '', criadoEm: '' }
}

const tree: VaultTree = {
  campanhas: [{ id: 'c1', slug: 'c1', nome: 'Aventura', sessoes: [], personagens: [], canvases: [], escritas: [] }],
  canvasesSoltos: [],
  personagensSoltos: { slug: '', nome: '', caminho: 'personagens-soltos', subpastas: [], personagens: [] },
  cenarios: { slug: '', nome: '', caminho: 'cenarios', subpastas: [], cenarios: [] },
}

beforeEach(() => {
  useDialogoCampanhas.setState({ pedido: null })
  useApp.setState({ vinculos: [], campanhaFiltro: null, tree: null })
})

describe('pedirCampanhas (diálogo multi-seleção)', () => {
  it('resolve com os ids escolhidos ao salvar', async () => {
    const p = pedirCampanhas('Campanhas:', [{ id: 'c1', nome: 'A' }], ['c1'])
    useDialogoCampanhas.getState().responder(['c1'])
    expect(await p).toEqual(['c1'])
  })
  it('resolve [] quando nada é selecionado ("nenhuma")', async () => {
    const p = pedirCampanhas('x', [{ id: 'c1', nome: 'A' }], [])
    useDialogoCampanhas.getState().responder([])
    expect(await p).toEqual([])
  })
  it('resolve null ao cancelar', async () => {
    const p = pedirCampanhas('x', [], [])
    useDialogoCampanhas.getState().responder(null)
    expect(await p).toBeNull()
  })
  it('abrir novo pedido cancela o anterior pendente (resolve null)', async () => {
    const primeiro = pedirCampanhas('1', [], [])
    const segundo = pedirCampanhas('2', [], [])
    expect(await primeiro).toBeNull()
    useDialogoCampanhas.getState().responder(['z'])
    expect(await segundo).toEqual(['z'])
  })
})

describe('definirCampanhas (reconciliação de etiquetas)', () => {
  it('adiciona os novos e remove os que saíram', () => {
    useApp.setState({ vinculos: [mkPart('p1', 'personagem', 'a', 'camp1'), mkPart('p2', 'personagem', 'a', 'camp2')] })
    useApp.getState().definirCampanhas('personagem', 'a', ['camp2', 'camp3'])
    expect(campanhasDe(useApp.getState().vinculos, 'a').sort()).toEqual(['camp2', 'camp3'])
  })
  it('lista vazia remove todas as etiquetas', () => {
    useApp.setState({ vinculos: [mkPart('p1', 'personagem', 'a', 'camp1')] })
    useApp.getState().definirCampanhas('personagem', 'a', [])
    expect(campanhasDe(useApp.getState().vinculos, 'a')).toEqual([])
  })
  it('cria vínculo de canvas (deTipo canvas)', () => {
    useApp.getState().definirCampanhas('canvas', 'cv1', ['camp1'])
    expect([...idsDaCampanha(useApp.getState().vinculos, 'camp1')]).toEqual(['cv1'])
    expect(useApp.getState().vinculos[0].deTipo).toBe('canvas')
  })
})

describe('associarNaCriacao (criação contextual)', () => {
  it('com filtro ativo etiqueta direto, sem abrir diálogo', async () => {
    useApp.setState({ campanhaFiltro: 'camp1' })
    await associarNaCriacao('personagem', 'p9', 'Fulano')
    expect(campanhasDe(useApp.getState().vinculos, 'p9')).toEqual(['camp1'])
    expect(useDialogoCampanhas.getState().pedido).toBeNull()
  })
  it('em "Todas" abre o seletor e aplica a escolha', async () => {
    useApp.setState({ tree })
    const done = associarNaCriacao('canvas', 'cv9', 'Mapa')
    expect(useDialogoCampanhas.getState().pedido?.opcoes).toEqual([{ id: 'c1', nome: 'Aventura' }])
    useDialogoCampanhas.getState().responder(['c1'])
    await done
    expect([...idsDaCampanha(useApp.getState().vinculos, 'c1')]).toEqual(['cv9'])
  })
  it('em "Todas" sem campanhas não pergunta nada (nasce órfão)', async () => {
    await associarNaCriacao('personagem', 'p0', 'Zé')
    expect(useApp.getState().vinculos).toHaveLength(0)
    expect(useDialogoCampanhas.getState().pedido).toBeNull()
  })
})
