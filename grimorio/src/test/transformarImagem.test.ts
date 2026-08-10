import { describe, expect, it } from 'vitest'
import {
  destinoRetrato,
  dirDoCaminho,
  extensaoDe,
  pastasDaSecao,
  sugestaoDeNome,
} from '../lib/transformarImagem'
import type { VaultTree } from '../lib/types'

describe('sugestaoDeNome', () => {
  it('remove a extensão e espaços das pontas', () => {
    expect(sugestaoDeNome('Den Den Mushi.png')).toBe('Den Den Mushi')
    expect(sugestaoDeNome(' flor.JPEG ')).toBe('flor')
  })

  it('mantém pontos internos e nome sem extensão', () => {
    expect(sugestaoDeNome('sr. caracol v2.png')).toBe('sr. caracol v2')
    expect(sugestaoDeNome('caracol')).toBe('caracol')
  })

  it('string vazia continua vazia', () => {
    expect(sugestaoDeNome('')).toBe('')
  })
})

describe('extensaoDe', () => {
  it('extrai a extensão em minúsculas', () => {
    expect(extensaoDe('imagens-canvas/abc.PNG')).toBe('png')
    expect(extensaoDe('imagens-canvas/abc.webp')).toBe('webp')
  })

  it('cai para png sem extensão', () => {
    expect(extensaoDe('imagens-canvas/semext')).toBe('png')
  })
})

describe('dirDoCaminho', () => {
  it('remove o arquivo .json do fim', () => {
    expect(dirDoCaminho('personagens-soltos/heroi/heroi.json')).toBe('personagens-soltos/heroi')
    expect(dirDoCaminho('personagens-soltos\\heroi\\heroi.json')).toBe('personagens-soltos\\heroi')
  })

  it('caminho que já é diretório fica intacto', () => {
    expect(dirDoCaminho('cenarios/taverna')).toBe('cenarios/taverna')
  })
})

describe('destinoRetrato', () => {
  it('personagem: assets/ da própria pasta, com id e versão', () => {
    expect(
      destinoRetrato('personagem', { id: 'p1', caminho: 'personagens-soltos/heroi/heroi.json', versaoAtivaId: 'v1' }, 'png'),
    ).toBe('personagens-soltos/heroi/assets/retrato-p1-v1.png')
  })

  it('cenário: pasta global imagens-cenarios com id e versão', () => {
    expect(destinoRetrato('cenario', { id: 'c1', caminho: 'cenarios/taverna', versaoAtivaId: 'v9' }, 'jpg')).toBe(
      'imagens-cenarios/retrato-c1-v9.jpg',
    )
  })

  it('item: pasta global imagens-itens só com id', () => {
    expect(destinoRetrato('item', { id: 'i1', caminho: 'itens/espada.json' }, 'webp')).toBe(
      'imagens-itens/retrato-i1.webp',
    )
  })
})

describe('pastasDaSecao', () => {
  const tree = {
    personagensSoltos: {
      nome: 'Personagens',
      caminho: 'personagens-soltos',
      subpastas: [
        {
          nome: 'Vilões',
          caminho: 'personagens-soltos/viloes',
          subpastas: [{ nome: 'Chefes', caminho: 'personagens-soltos/viloes/chefes', subpastas: [] }],
        },
        { nome: 'Aliados', caminho: 'personagens-soltos/aliados', subpastas: [] },
      ],
    },
    cenarios: { nome: 'Cenários', caminho: 'cenarios', subpastas: [] },
    itens: { nome: 'Itens', caminho: 'itens', subpastas: [] },
  } as unknown as VaultTree

  it('achata em pré-ordem com níveis de recuo', () => {
    expect(pastasDaSecao(tree, 'personagem')).toEqual([
      { nome: 'Personagens', caminho: 'personagens-soltos', nivel: 0 },
      { nome: 'Vilões', caminho: 'personagens-soltos/viloes', nivel: 1 },
      { nome: 'Chefes', caminho: 'personagens-soltos/viloes/chefes', nivel: 2 },
      { nome: 'Aliados', caminho: 'personagens-soltos/aliados', nivel: 1 },
    ])
  })

  it('seção sem subpastas devolve só a raiz', () => {
    expect(pastasDaSecao(tree, 'item')).toEqual([{ nome: 'Itens', caminho: 'itens', nivel: 0 }])
  })

  it('sem árvore devolve vazio', () => {
    expect(pastasDaSecao(null, 'cenario')).toEqual([])
  })
})
