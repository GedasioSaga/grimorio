import { describe, expect, it } from 'vitest'
import {
  destinoRetrato,
  dirDoCaminho,
  extensaoDe,
  novaVersaoCenarioComRetrato,
  novaVersaoPersonagemComRetrato,
  pastasDaSecao,
  sugestaoDeNome,
} from '../lib/transformarImagem'
import type { Cenario, Personagem, VaultTree, VersaoCenario, VersaoPersonagem } from '../lib/types'

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

function vp(id: string, nome: string, over: Partial<VersaoPersonagem> = {}): VersaoPersonagem {
  return { id, nome, retrato: null, resumo: '', descricao: '', informacao: '', historia: '', extras: '', anotacoes: '', imagens: [], ...over }
}
function personagem(over: Partial<Personagem> = {}): Personagem {
  const vs = over.versoes ?? [vp('v1', 'Bruce'), vp('v2', 'Hulk')]
  return { id: 'p1', nome: vs[0].nome, versoes: vs, versaoAtivaId: over.versaoAtivaId ?? vs[0].id, criadoEm: 'x', modificadoEm: 'y', ...over }
}

function vc(id: string, nome: string, over: Partial<VersaoCenario> = {}): VersaoCenario {
  return { id, nome, retrato: null, resumo: '', descricao: '', informacao: '', historia: '', eventos: '', itens: '', acervo: [], anotacoes: '', imagens: [], ...over }
}
function cenario(over: Partial<Cenario> = {}): Cenario {
  const vs = over.versoes ?? [vc('v1', 'Dia'), vc('v2', 'Noite')]
  return { id: 'c1', nome: 'Taverna', personagens: [], versoes: vs, versaoAtivaId: over.versaoAtivaId ?? vs[0].id, criadoEm: 'x', modificadoEm: 'y', ...over }
}

describe('novaVersaoPersonagemComRetrato', () => {
  it('clona a versão ATIVA, com id novo, nome e retrato da nova versão, e a torna ativa', () => {
    const p = personagem({ versaoAtivaId: 'v2', versoes: [vp('v1', 'Bruce', { resumo: 'a' }), vp('v2', 'Hulk', { resumo: 'b' })] })
    const r = novaVersaoPersonagemComRetrato(p, 'Hulk Cinza', 'assets/retrato-p1-novo.png')
    expect(r.versoes).toHaveLength(3)
    const nova = r.versoes[2]
    expect(nova.id).not.toBe('v1')
    expect(nova.id).not.toBe('v2')
    expect(nova.nome).toBe('Hulk Cinza')
    expect(nova.retrato).toBe('assets/retrato-p1-novo.png')
    expect(nova.resumo).toBe('b') // clonou o conteúdo da ativa (Hulk), não da primeira
    expect(r.versaoAtivaId).toBe(nova.id)
  })

  it('espelha o nome do topo para a versão nova (é a nova forma ativa)', () => {
    const r = novaVersaoPersonagemComRetrato(personagem(), 'Hulk Cinza', 'x.png')
    expect(r.nome).toBe('Hulk Cinza')
  })

  it('imagens clonadas por valor: mexer na cópia não afeta a base', () => {
    const p = personagem({ versoes: [vp('v1', 'Bruce', { imagens: [{ rel: 'a.png' }] })], versaoAtivaId: 'v1' })
    const r = novaVersaoPersonagemComRetrato(p, 'Forma X', 'x.png')
    r.versoes[1].imagens[0].legenda = 'mudou'
    expect(p.versoes[0].imagens[0].legenda).toBeUndefined()
  })

  it('versaoAtivaId inexistente cai na primeira versão como base', () => {
    const p = personagem({ versaoAtivaId: 'sumiu' })
    const r = novaVersaoPersonagemComRetrato(p, 'Forma X', 'x.png')
    expect(r.versoes[2].resumo).toBe(p.versoes[0].resumo)
  })

  it('não muta o personagem original', () => {
    const p = personagem()
    novaVersaoPersonagemComRetrato(p, 'Forma X', 'x.png')
    expect(p.versoes).toHaveLength(2)
  })

  it('aceita id de versão fixado pelo chamador (retrato já foi copiado com esse id no nome)', () => {
    const r = novaVersaoPersonagemComRetrato(personagem(), 'Forma X', 'x.png', 'id-fixo')
    expect(r.versoes[2].id).toBe('id-fixo')
    expect(r.versaoAtivaId).toBe('id-fixo')
  })
})

describe('novaVersaoCenarioComRetrato', () => {
  it('clona a versão ativa, com id novo, nome e retrato da nova versão, e a torna ativa', () => {
    const c = cenario({ versaoAtivaId: 'v2', versoes: [vc('v1', 'Dia', { resumo: 'a' }), vc('v2', 'Noite', { resumo: 'b' })] })
    const r = novaVersaoCenarioComRetrato(c, 'Destruída', 'imagens-cenarios/retrato-c1-novo.png')
    expect(r.versoes).toHaveLength(3)
    const nova = r.versoes[2]
    expect(nova.nome).toBe('Destruída')
    expect(nova.retrato).toBe('imagens-cenarios/retrato-c1-novo.png')
    expect(nova.resumo).toBe('b')
    expect(r.versaoAtivaId).toBe(nova.id)
  })

  it('NÃO espelha nome no topo — nome do cenário é compartilhado por todas as versões', () => {
    const c = cenario()
    const r = novaVersaoCenarioComRetrato(c, 'Destruída', 'x.png')
    expect(r.nome).toBe('Taverna')
  })

  it('imagens clonadas por valor', () => {
    const c = cenario({ versoes: [vc('v1', 'Dia', { imagens: [{ rel: 'a.png' }] })], versaoAtivaId: 'v1' })
    const r = novaVersaoCenarioComRetrato(c, 'Noite', 'x.png')
    r.versoes[1].imagens[0].legenda = 'mudou'
    expect(c.versoes[0].imagens[0].legenda).toBeUndefined()
  })

  it('versaoAtivaId inexistente cai na primeira versão como base', () => {
    const c = cenario({ versaoAtivaId: 'sumiu' })
    const r = novaVersaoCenarioComRetrato(c, 'Noite', 'x.png')
    expect(r.versoes[2].resumo).toBe(c.versoes[0].resumo)
  })

  it('não muta o cenário original', () => {
    const c = cenario()
    novaVersaoCenarioComRetrato(c, 'Noite', 'x.png')
    expect(c.versoes).toHaveLength(2)
  })

  it('aceita id de versão fixado pelo chamador', () => {
    const r = novaVersaoCenarioComRetrato(cenario(), 'Noite', 'x.png', 'id-fixo')
    expect(r.versoes[2].id).toBe('id-fixo')
    expect(r.versaoAtivaId).toBe('id-fixo')
  })
})
