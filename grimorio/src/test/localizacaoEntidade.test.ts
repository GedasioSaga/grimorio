import { describe, expect, it } from 'vitest'
import {
  absorverCenario, caminhoLegivelCenario, caminhoLegivelItem, caminhoLegivelPersonagem,
  cenarioDestinoValido, destinosAbsorverCenario, destinosItem, destinosMoverCenario, destinosPersonagem,
  localizarCenario, localizarItem, localizarPersonagem, localizarPersonagemEmCampanha,
  mesclarPersonagensCenario, nomesVersoesAbsorcao, redirecionarVinculosAbsorcao, versoesParaAbsorcao,
} from '../lib/localizacaoEntidade'
import type { CampanhaNode, Cenario, CenarioNode, PastaCenarioNode, PastaItemNode, PastaNode, VaultTree, Vinculo, VersaoCenario } from '../lib/types'

// ---------- fixtures ----------

function pastaPersonagem(caminho: string, nome: string, personagens: { id: string; nome: string }[] = [], subpastas: PastaNode[] = []): PastaNode {
  return { slug: caminho.split('/').pop() ?? caminho, nome, caminho, subpastas, personagens: personagens.map((p) => ({ ...p, slug: p.id, caminho: `${caminho}/${p.id}.json` })) }
}

function pastaItem(caminho: string, nome: string, itens: { id: string; nome: string }[] = [], subpastas: PastaItemNode[] = []): PastaItemNode {
  return { slug: caminho.split('/').pop() ?? caminho, nome, caminho, subpastas, itens: itens.map((i) => ({ ...i, slug: i.id, caminho: `${caminho}/${i.id}.json` })) }
}

/**
 * Cenário de teste com o dir de verdade aninhado sob `dirPai` — igual ao que `vaultRepo.moverCenario`
 * produz no disco. `filhos` recebe FÁBRICAS (não nós prontos): cada uma constrói o próprio nó já
 * sabendo o dir do pai, senão o filho nasceria com `cenarios/<id>` solto em vez de `<dirPai>/<id>`.
 */
function noCenario(dirPai: string, id: string, nome: string, filhos: ((dirPai: string) => CenarioNode)[] = []): CenarioNode {
  const caminho = `${dirPai}/${id}`
  return { id, slug: id, nome, caminho, filhos: filhos.map((f) => f(caminho)) }
}

function campanha(slug: string, nome: string, personagens: { id: string; nome: string }[] = []): CampanhaNode {
  return {
    id: slug, slug, nome,
    sessoes: [], canvases: [], escritas: [],
    personagens: personagens.map((p) => ({ ...p, slug: p.id, caminho: `campanhas/${slug}/personagens/${p.id}.json` })),
  }
}

function arvoreVazia(): VaultTree {
  return {
    campanhas: [],
    canvasesSoltos: [],
    mapasSoltos: [],
    personagensSoltos: pastaPersonagem('personagens-soltos', 'personagens-soltos'),
    cenarios: { slug: 'cenarios', nome: 'cenarios', caminho: 'cenarios', subpastas: [], cenarios: [] },
    itens: pastaItem('itens', 'itens'),
  }
}

// ---------- localizar* ----------

describe('localizarPersonagem', () => {
  it('acha na raiz (caminho vazio de ancestrais)', () => {
    const raiz = pastaPersonagem('personagens-soltos', 'personagens-soltos', [{ id: 'p1', nome: 'Joker' }])
    expect(localizarPersonagem(raiz, 'p1')).toEqual({ dir: 'personagens-soltos', ancestrais: [] })
  })

  it('acha em subpasta legada sem pasta.json (nome cai no slug do diretório)', () => {
    const sub = pastaPersonagem('personagens-soltos/viloes', 'viloes', [{ id: 'p1', nome: 'Joker' }])
    const raiz = pastaPersonagem('personagens-soltos', 'personagens-soltos', [], [sub])
    expect(localizarPersonagem(raiz, 'p1')).toEqual({ dir: 'personagens-soltos/viloes', ancestrais: ['viloes'] })
  })

  it('nome de pasta com acento e barra passa intacto, sem virar separador de caminho', () => {
    const sub = pastaPersonagem('personagens-soltos/torre', 'Torre do Mágo / Anexo', [{ id: 'p1', nome: 'José' }])
    const raiz = pastaPersonagem('personagens-soltos', 'personagens-soltos', [], [sub])
    expect(localizarPersonagem(raiz, 'p1')).toEqual({ dir: 'personagens-soltos/torre', ancestrais: ['Torre do Mágo / Anexo'] })
  })

  it('id que não existe mais no cache devolve null', () => {
    const raiz = pastaPersonagem('personagens-soltos', 'personagens-soltos', [{ id: 'p1', nome: 'Joker' }])
    expect(localizarPersonagem(raiz, 'fantasma')).toBeNull()
  })
})

describe('localizarPersonagemEmCampanha', () => {
  it('acha o personagem na pasta de personagens de uma campanha', () => {
    const camps = [campanha('reino', 'Reino Perdido', [{ id: 'p1', nome: 'Joker' }])]
    expect(localizarPersonagemEmCampanha(camps, 'p1')).toEqual({
      dir: 'campanhas/reino/personagens', ancestrais: ['Reino Perdido', 'Personagens'], campanhaNome: 'Reino Perdido',
    })
  })

  it('null quando não está em nenhuma campanha', () => {
    expect(localizarPersonagemEmCampanha([campanha('reino', 'Reino Perdido')], 'fantasma')).toBeNull()
  })
})

describe('localizarItem', () => {
  it('acha em profundidade e devolve null pra id inexistente', () => {
    const neta = pastaItem('itens/armas/lendarias', 'Lendárias', [{ id: 'i1', nome: 'Excalibur' }])
    const filha = pastaItem('itens/armas', 'Armas', [], [neta])
    const raiz = pastaItem('itens', 'itens', [], [filha])
    expect(localizarItem(raiz, 'i1')).toEqual({ dir: 'itens/armas/lendarias', ancestrais: ['Armas', 'Lendárias'] })
    expect(localizarItem(raiz, 'fantasma')).toBeNull()
  })
})

describe('localizarCenario', () => {
  const raiz: PastaCenarioNode = {
    slug: 'cenarios', nome: 'cenarios', caminho: 'cenarios',
    subpastas: [{
      slug: 'reino', nome: 'Reino', caminho: 'cenarios/reino',
      subpastas: [], cenarios: [noCenario('cenarios/reino', 'cidade', 'Cidade Alta', [(dirPai) => noCenario(dirPai, 'bairro', 'Bairro')])],
    }],
    cenarios: [noCenario('cenarios', 'floresta', 'Floresta')],
  }

  it('cenário raiz de uma pasta organizacional', () => {
    expect(localizarCenario(raiz, 'cidade')).toEqual({ dir: 'cenarios/reino/cidade', ancestrais: ['Reino'] })
  })

  it('sub-cenário aninhado soma pasta + cenário pai', () => {
    expect(localizarCenario(raiz, 'bairro')).toEqual({ dir: 'cenarios/reino/cidade/bairro', ancestrais: ['Reino', 'Cidade Alta'] })
  })

  it('cenário direto na raiz (sem pasta)', () => {
    expect(localizarCenario(raiz, 'floresta')).toEqual({ dir: 'cenarios/floresta', ancestrais: [] })
  })

  it('id inexistente devolve null', () => {
    expect(localizarCenario(raiz, 'fantasma')).toBeNull()
  })
})

// ---------- caminho legível ----------

describe('caminhoLegivel*', () => {
  it('personagem na raiz: caminho vazio, só rótulo fixo + nome', () => {
    const tree = arvoreVazia()
    tree.personagensSoltos.personagens.push({ id: 'p1', nome: 'Joker', slug: 'p1', caminho: 'personagens-soltos/p1.json' })
    expect(caminhoLegivelPersonagem(tree, 'p1', 'Joker')).toEqual(['Personagens', 'Joker'])
  })

  it('personagem numa campanha usa o nome da campanha, não o slug', () => {
    const tree = arvoreVazia()
    tree.campanhas.push(campanha('reino', 'Reino Perdido', [{ id: 'p1', nome: 'Joker' }]))
    expect(caminhoLegivelPersonagem(tree, 'p1', 'Joker')).toEqual(['Campanhas', 'Reino Perdido', 'Personagens', 'Joker'])
  })

  it('personagem com id fora do cache (excluído entre a leitura da árvore e o render) devolve null', () => {
    expect(caminhoLegivelPersonagem(arvoreVazia(), 'fantasma', 'Joker')).toBeNull()
  })

  it('item devolve caminho com o rótulo fixo "Itens"', () => {
    const tree = arvoreVazia()
    tree.itens.itens.push({ id: 'i1', nome: 'Excalibur', slug: 'i1', caminho: 'itens/i1.json' })
    expect(caminhoLegivelItem(tree, 'i1', 'Excalibur')).toEqual(['Itens', 'Excalibur'])
  })

  it('cenário devolve caminho com pastas + cenários pais', () => {
    const tree = arvoreVazia()
    tree.cenarios.subpastas.push({ slug: 'reino', nome: 'Reino', caminho: 'cenarios/reino', subpastas: [], cenarios: [noCenario('cenarios/reino', 'cidade', 'Cidade Alta')] })
    expect(caminhoLegivelCenario(tree, 'cidade', 'Cidade Alta')).toEqual(['Cenários', 'Reino', 'Cidade Alta'])
  })
})

// ---------- listas de destino ----------

describe('destinosPersonagem / destinosItem', () => {
  it('inclui raiz, subpastas e a pasta de personagens de cada campanha', () => {
    const sub = pastaPersonagem('personagens-soltos/viloes', 'Vilões')
    const tree = arvoreVazia()
    tree.personagensSoltos.subpastas.push(sub)
    tree.campanhas.push(campanha('reino', 'Reino Perdido'))
    const destinos = destinosPersonagem(tree).map((d) => d.caminho)
    expect(destinos).toEqual(['personagens-soltos', 'personagens-soltos/viloes', 'campanhas/reino/personagens'])
  })

  it('itens não ganham entrada de campanha (item não vive em campanha)', () => {
    const tree = arvoreVazia()
    tree.campanhas.push(campanha('reino', 'Reino Perdido'))
    expect(destinosItem(tree).map((d) => d.caminho)).toEqual(['itens'])
  })
})

describe('destinosMoverCenario / destinosAbsorverCenario', () => {
  function arvoreComCenarios(): VaultTree {
    const tree = arvoreVazia()
    tree.cenarios = {
      slug: 'cenarios', nome: 'cenarios', caminho: 'cenarios',
      subpastas: [{ slug: 'reino', nome: 'Reino', caminho: 'cenarios/reino', subpastas: [], cenarios: [] }],
      cenarios: [
        noCenario('cenarios', 'cidade', 'Cidade Alta', [
          (dirPai) => noCenario(dirPai, 'bairro', 'Bairro', [(dirPai2) => noCenario(dirPai2, 'casa', 'Casa')]),
        ]),
        noCenario('cenarios', 'floresta', 'Floresta'),
      ],
    }
    return tree
  }

  it('mover: oferece pastas + todo cenário que não é o próprio nem descendente dele', () => {
    const tree = arvoreComCenarios()
    const destinos = destinosMoverCenario(tree, 'cidade').map((d) => d.caminho)
    // "cidade", "bairro" e "casa" (ele mesmo + descendentes) ficam de fora
    expect(destinos).toEqual(['cenarios', 'cenarios/reino', 'cenarios/floresta'])
  })

  it('mover: cenário sem filhos só perde a si mesmo da lista', () => {
    const tree = arvoreComCenarios()
    const destinos = destinosMoverCenario(tree, 'floresta').map((d) => d.caminho)
    expect(destinos).toContain('cenarios/cidade')
    expect(destinos).toContain('cenarios/cidade/bairro')
    expect(destinos).not.toContain('cenarios/floresta')
  })

  it('absorver: só cenários, nunca uma pasta organizacional', () => {
    const tree = arvoreComCenarios()
    const destinos = destinosAbsorverCenario(tree, 'floresta')
    expect(destinos.every((d) => !!d.id)).toBe(true)
    expect(destinos.map((d) => d.caminho)).toEqual(['cenarios/cidade', 'cenarios/cidade/bairro', 'cenarios/cidade/bairro/casa'])
  })

  it('absorver: exclui o próprio e os descendentes (não pode virar versão de si mesmo ou de um filho)', () => {
    const tree = arvoreComCenarios()
    const destinos = destinosAbsorverCenario(tree, 'cidade').map((d) => d.caminho)
    expect(destinos).not.toContain('cenarios/cidade')
    expect(destinos).not.toContain('cenarios/cidade/bairro')
    expect(destinos).not.toContain('cenarios/cidade/bairro/casa')
    expect(destinos).toContain('cenarios/floresta')
  })
})

describe('cenarioDestinoValido', () => {
  const tree = arvoreVazia()
  tree.cenarios = {
    slug: 'cenarios', nome: 'cenarios', caminho: 'cenarios', subpastas: [],
    cenarios: [noCenario('cenarios', 'cidade', 'Cidade Alta', [(dirPai) => noCenario(dirPai, 'bairro', 'Bairro')])],
  }

  it('barra mover para dentro de si mesmo', () => {
    expect(cenarioDestinoValido(tree, 'cidade', 'cenarios/cidade')).toBe(false)
  })

  it('barra mover para dentro de um descendente', () => {
    expect(cenarioDestinoValido(tree, 'cidade', 'cenarios/cidade/bairro')).toBe(false)
  })

  it('aceita destino que não é o próprio nem descendente', () => {
    expect(cenarioDestinoValido(tree, 'bairro', 'cenarios')).toBe(true)
  })

  it('id que não está mais na árvore nunca tem destino válido', () => {
    expect(cenarioDestinoValido(tree, 'fantasma', 'cenarios')).toBe(false)
  })
})

// ---------- absorção (transformar em versão de) ----------

function versao(id: string, nome: string): VersaoCenario {
  return { id, nome, retrato: null, resumo: '', descricao: '', informacao: '', historia: '', eventos: '', itens: '', acervo: [], anotacoes: '', imagens: [] }
}

function cenario(id: string, nome: string, versoes: VersaoCenario[], personagens: string[] = []): Cenario {
  return { id, nome, personagens, versoes, versaoAtivaId: versoes[0].id, criadoEm: '2026-01-01', modificadoEm: '2026-01-01' }
}

describe('nomesVersoesAbsorcao', () => {
  it('cenário com uma versão só vira uma versão homônima', () => {
    expect(nomesVersoesAbsorcao('Torre do Mágo', [versao('v1', 'Base')])).toEqual(['Torre do Mágo'])
  })

  it('cenário com várias versões distingue cada uma no nome, pra não colidir no destino', () => {
    expect(nomesVersoesAbsorcao('Torre', [versao('v1', 'Base'), versao('v2', 'Destruída')]))
      .toEqual(['Torre — Base', 'Torre — Destruída'])
  })
})

describe('versoesParaAbsorcao', () => {
  it('gera id novo pra cada versão (nunca reusa o id do cenário absorvido)', () => {
    let n = 0
    const novoId = () => `novo-${n++}`
    const origem = cenario('c1', 'Torre', [versao('v1', 'Base'), versao('v2', 'Destruída')])
    const versoes = versoesParaAbsorcao(origem, novoId)
    expect(versoes.map((v) => v.id)).toEqual(['novo-0', 'novo-1'])
    expect(versoes.map((v) => v.nome)).toEqual(['Torre — Base', 'Torre — Destruída'])
    // conteúdo de cada versão é preservado
    expect(versoes[0].resumo).toBe(origem.versoes[0].resumo)
  })
})

describe('mesclarPersonagensCenario', () => {
  it('une sem duplicar quem já estava vinculado nos dois lados', () => {
    expect(mesclarPersonagensCenario(['a', 'b'], ['b', 'c'])).toEqual(['a', 'b', 'c'])
  })

  it('caso vazio dos dois lados', () => {
    expect(mesclarPersonagensCenario([], [])).toEqual([])
  })
})

describe('redirecionarVinculosAbsorcao', () => {
  function vinc(id: string, over: Partial<Vinculo>): Vinculo {
    return { id, deTipo: 'personagem', deId: 'p1', paraTipo: 'cenario', paraId: 'origem', tipo: 'mora em', notas: '', criadoEm: 'x', ...over }
  }

  it('redireciona deId/paraId que apontavam pra origem', () => {
    const vinculos = [vinc('v1', { paraId: 'origem' }), vinc('v2', { deTipo: 'cenario', deId: 'origem', paraTipo: 'personagem', paraId: 'p2' })]
    const out = redirecionarVinculosAbsorcao(vinculos, [{ id: 'origem' }], 'destino')
    expect(out.find((v) => v.id === 'v1')?.paraId).toBe('destino')
    expect(out.find((v) => v.id === 'v2')?.deId).toBe('destino')
  })

  it('devolve a MESMA referência quando nada tocava a origem', () => {
    const vinculos = [vinc('v1', { paraId: 'outro-cenario' })]
    expect(redirecionarVinculosAbsorcao(vinculos, [{ id: 'origem' }], 'destino')).toBe(vinculos)
  })

  it('descarta o vínculo que viraria auto-relação (origem já apontava direto pro destino)', () => {
    const vinculos = [vinc('v1', { deTipo: 'cenario', deId: 'origem', paraTipo: 'cenario', paraId: 'destino', tipo: 'perto de' })]
    expect(redirecionarVinculosAbsorcao(vinculos, [{ id: 'origem' }], 'destino')).toEqual([])
  })

  it('dedupe: um vínculo redirecionado que colide com um vínculo pré-existente do destino é mesclado', () => {
    const vinculos = [
      // já existia: p1 "mora em" destino
      vinc('ja-existia', { deId: 'p1', paraId: 'destino' }),
      // vai ser redirecionado pra p1 "mora em" destino também — mesma chave depois do redirect
      vinc('redirecionado', { deId: 'p1', paraId: 'origem' }),
    ]
    const out = redirecionarVinculosAbsorcao(vinculos, [{ id: 'origem' }], 'destino')
    expect(out).toHaveLength(1)
  })

  /**
   * O DEFEITO desta rodada: `absorverCenarioComoVersao` chamava esta função UMA VEZ POR
   * DESCENDENTE, encadeando o resultado. A dedupe só enxerga o que ELA tocou — então o vínculo
   * do segundo descendente, ao colidir com o vínculo do primeiro (já redirecionado numa chamada
   * ANTERIOR, portanto "alheio" do ponto de vista da segunda chamada), sumia sem nenhum aviso,
   * junto com a nota dele. Processando os dois descendentes NUMA ÚNICA chamada (lote) não bastava
   * sozinho: a dedupe original também precisou aprender a distinguir "colidiu com algo que o
   * destino já tinha" (funde sem nota, comportamento antigo) de "duas origens do MESMO lote
   * convergiram pra mesma chave" (funde as DUAS notas — nenhuma se perde).
   */
  it('dois descendentes com vínculo colidindo entre si: nenhum some, as duas notas sobrevivem fundidas', () => {
    const vinculos = [
      // sub-cenário A e sub-cenário B mencionam o MESMO personagem — mesma chave (de,para,tipo)
      // depois que os dois forem redirecionados pro destino
      vinc('v-a', { deTipo: 'cenario', deId: 'subA', paraTipo: 'personagem', paraId: 'npc', tipo: 'menciona' }),
      vinc('v-b', { deTipo: 'cenario', deId: 'subB', paraTipo: 'personagem', paraId: 'npc', tipo: 'menciona' }),
    ]
    const out = redirecionarVinculosAbsorcao(
      vinculos,
      [{ id: 'subA', notaDescendente: 'Sala A' }, { id: 'subB', notaDescendente: 'Sala B' }],
      'destino',
    )
    // vira UMA relação no destino (mesma chave de/para/tipo), mas as notas dos DOIS
    // descendentes sobrevivem juntas — nenhum rastro se perde
    expect(out).toHaveLength(1)
    expect(out[0].deId).toBe('destino')
    expect(out[0].notas).toBe('(era sobre: Sala A, fundido no destino) (era sobre: Sala B, fundido no destino)')
  })

  it('dedupe legítima continua valendo dentro do lote: redirecionado que colide com pré-existente do destino mescla', () => {
    const vinculos = [
      vinc('ja-existia', { deId: 'p1', paraId: 'destino' }),
      vinc('do-sub', { deId: 'p1', paraTipo: 'cenario', paraId: 'sub', tipo: 'mora em' }),
    ]
    const out = redirecionarVinculosAbsorcao(vinculos, [{ id: 'sub', notaDescendente: 'Sub' }], 'destino')
    expect(out).toHaveLength(1)
  })

  it('vínculos alheios pré-existentes que já colidiam entre si continuam intactos mesmo com lote de 2+ origens', () => {
    const vinculos: Vinculo[] = [
      { id: 'alheio-1', deTipo: 'personagem', deId: 'pX', paraTipo: 'personagem', paraId: 'pY', tipo: 'amigo de', notas: 'primeira cópia', criadoEm: 'a' },
      { id: 'alheio-2', deTipo: 'personagem', deId: 'pX', paraTipo: 'personagem', paraId: 'pY', tipo: 'amigo de', notas: 'segunda cópia (conflito de sync)', criadoEm: 'b' },
      vinc('tocado-a', { deTipo: 'cenario', deId: 'subA', paraTipo: 'personagem', paraId: 'p2', tipo: 'menciona' }),
      vinc('tocado-b', { deTipo: 'cenario', deId: 'subB', paraTipo: 'personagem', paraId: 'p3', tipo: 'menciona' }),
    ]
    const out = redirecionarVinculosAbsorcao(
      vinculos,
      [{ id: 'subA', notaDescendente: 'Sala A' }, { id: 'subB', notaDescendente: 'Sala B' }],
      'destino',
    )
    expect(out.find((v) => v.id === 'alheio-1')).toBeDefined()
    expect(out.find((v) => v.id === 'alheio-2')).toBeDefined()
  })

  /**
   * Defeito baixo (reauditoria 3): vínculo de um SUB-cenário absorvido é redirecionado pro
   * destino, mas o conteúdo do sub-cenário não virou versão de nada — foi inteiro pra lixeira.
   * Sem a nota, o vínculo aponta pro destino como se o destino guardasse aquele conteúdo, e a
   * relação mente em silêncio. `notaDescendente`, quando informado por origem, é opt-in: só
   * quem chama por um DESCENDENTE (não pela origem direta, cujo conteúdo de fato migra) precisa passá-lo.
   */
  it('com notaDescendente: anexa "(era sobre: X, fundido no destino)" só nos vínculos TOCADOS', () => {
    const vinculos = [vinc('v-sub', { deId: 'p1', paraId: 'origem' }), vinc('v-alheio', { deId: 'p1', paraId: 'outro-cenario' })]
    const out = redirecionarVinculosAbsorcao(vinculos, [{ id: 'origem', notaDescendente: 'Prisão da Torre' }], 'destino')
    expect(out.find((v) => v.id === 'v-sub')?.notas).toBe('(era sobre: Prisão da Torre, fundido no destino)')
    // vínculo que o redirect nem tocou não ganha nota nenhuma
    expect(out.find((v) => v.id === 'v-alheio')?.notas).toBe('')
  })

  it('com notaDescendente: preserva a nota que o usuário já tinha escrito, em vez de sobrescrever', () => {
    const vinculos = [vinc('v-sub', { deId: 'p1', paraId: 'origem', notas: 'gancho pendente' })]
    const out = redirecionarVinculosAbsorcao(vinculos, [{ id: 'origem', notaDescendente: 'Prisão da Torre' }], 'destino')
    expect(out.find((v) => v.id === 'v-sub')?.notas).toBe('gancho pendente (era sobre: Prisão da Torre, fundido no destino)')
  })

  it('sem notaDescendente (redirect da origem DIRETA): não anexa nota nenhuma', () => {
    const vinculos = [vinc('v1', { deId: 'p1', paraId: 'origem' })]
    const out = redirecionarVinculosAbsorcao(vinculos, [{ id: 'origem' }], 'destino')
    expect(out.find((v) => v.id === 'v1')?.notas).toBe('')
  })
})

describe('absorverCenario', () => {
  it('acrescenta as versões absorvidas, ativa a primeira delas, e mescla personagens', () => {
    let n = 0
    const novoId = () => `novo-${n++}`
    const destino = cenario('destino', 'Cidade', [versao('d1', 'Base')], ['heroi'])
    const origem = cenario('origem', 'Torre', [versao('o1', 'Base')], ['vilao', 'heroi'])
    const resultado = absorverCenario(destino, origem, novoId)

    expect(resultado.versoes.map((v) => v.nome)).toEqual(['Base', 'Torre'])
    expect(resultado.versaoAtivaId).toBe('novo-0')
    expect(resultado.personagens).toEqual(['heroi', 'vilao'])
    // a versão original do destino continua intacta na lista
    expect(resultado.versoes[0]).toEqual(destino.versoes[0])
  })
})
