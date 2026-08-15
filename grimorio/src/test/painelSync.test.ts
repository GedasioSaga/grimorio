import { describe, it, expect } from 'vitest'
import { estadoInicialSync, type EstadoSync } from '../lib/sync/sincronizador'
import { nomeDaCopia } from '../lib/sync/conflito'
import type { Cenario, ItemRef, Personagem } from '../lib/types'
import {
  avisosDoSync,
  copiasDeConflito,
  descreverAcao,
  quandoFoi,
  resumirSync,
} from '../lib/painelSync'

const QUANDO_MARCA = new Date(2026, 6, 26, 14, 32)

/** Caminho de cópia GERADA por `nomeDaCopia` — a marca de verdade, não o prefixo no nome exibido. */
function caminhoMarcado(original: string): string {
  return nomeDaCopia(original, 'PC Casa', QUANDO_MARCA, 0)
}

/** `caminhoCenarioPorId` guarda a PASTA, não o `cenario.json` — mesma forma que o store usa. */
function dirCenarioMarcado(original: string): string {
  const marcado = caminhoMarcado(original)
  return marcado.slice(0, marcado.length - '/cenario.json'.length)
}

/** Retrato do sync com só o que o teste quiser mudar. */
function sync(parcial: Partial<EstadoSync> = {}): EstadoSync {
  return { ...estadoInicialSync(), ...parcial }
}

/** Cofre já pareado e sem problema nenhum — o ponto de partida da maioria dos casos. */
function emDia(parcial: Partial<EstadoSync> = {}): EstadoSync {
  return sync({ pareado: true, ultimoSync: '2026-07-26T14:32:00', ...parcial })
}

const AGORA = new Date('2026-07-26T18:00:00')

function personagem(id: string, nome: string): Personagem {
  return { id, nome, versoes: [], versaoAtivaId: '', criadoEm: '', modificadoEm: '' }
}

function cenario(id: string, nome: string): Cenario {
  return { id, nome, personagens: [], versoes: [], versaoAtivaId: '', criadoEm: '', modificadoEm: '' }
}

function item(caminho: string, nome: string): ItemRef {
  return { slug: nome, nome, caminho }
}

describe('resumirSync', () => {
  it('cofre sem manifesto avisa que não está ligado ao Drive', () => {
    expect(resumirSync(sync(), AGORA)).toEqual({
      tom: 'parado',
      titulo: 'Este cofre ainda não está ligado ao Google Drive.',
      detalhe: 'Nada sobe nem desce enquanto ele não for ligado a uma pasta de lá.',
    })
  })

  it('ciclo em andamento vira "Sincronizando…" mesmo com problema de pé', () => {
    const r = resumirSync(emDia({ fase: 'sincronizando', freio: { apagaria: 9, total: 10 } }), AGORA)
    expect(r.tom).toBe('ocupado')
    expect(r.titulo).toBe('Sincronizando…')
  })

  it('pareado, ocioso e sem falha nenhuma diz que está em dia, com a hora', () => {
    expect(resumirSync(emDia(), AGORA)).toEqual({
      tom: 'ok',
      titulo: 'Tudo em dia com o Google Drive.',
      detalhe: 'Última sincronização completa: hoje às 14h32.',
    })
  })

  it('gravação pendente ganha do freio — é o que barra o ciclo mais cedo', () => {
    const r = resumirSync(
      emDia({
        freio: { apagaria: 9, total: 10 },
        gravacoesPendentes: [{ caminho: 'a.json', rotulo: 'Alice' }],
      }),
      AGORA,
    )
    expect(r.titulo).toBe('Sincronização adiada.')
    expect(r.detalhe).toBe('Há alterações que ainda não chegaram ao disco deste computador.')
  })

  it('freio ganha do erro e promete que nada foi apagado', () => {
    const r = resumirSync(emDia({ freio: { apagaria: 42, total: 50 }, ultimoErro: 'sem internet' }), AGORA)
    expect(r.tom).toBe('atencao')
    expect(r.titulo).toBe('Sincronização parada por segurança.')
    expect(r.detalhe).toBe('Nenhum arquivo foi apagado, nem aqui nem no Google Drive.')
  })

  it('erro de infraestrutura vira "não foi possível sincronizar"', () => {
    const r = resumirSync(emDia({ ultimoErro: 'sem internet' }), AGORA)
    expect(r.tom).toBe('atencao')
    expect(r.titulo).toBe('Não foi possível sincronizar.')
  })

  it('ação falha não diz que deu tudo certo', () => {
    const r = resumirSync(emDia({ falhas: [{ acao: { tipo: 'subir', caminho: 'a.json' }, erro: 'x' }] }), AGORA)
    expect(r.tom).toBe('atencao')
    expect(r.titulo).toBe('Sincronizou, mas alguns arquivos ficaram para trás.')
  })

  it('pareado sem nenhum ciclo concluído não inventa "em dia"', () => {
    const r = resumirSync(sync({ pareado: true }), AGORA)
    expect(r.tom).toBe('parado')
    expect(r.titulo).toBe('Ainda não sincronizou desde que o Grimório abriu.')
  })

  it('data ilegível some do resumo em vez de virar "Invalid Date"', () => {
    expect(resumirSync(emDia({ ultimoSync: 'nem-data' }), AGORA).detalhe).toBeNull()
  })
})

describe('quandoFoi', () => {
  it('hoje, ontem e data mais velha', () => {
    expect(quandoFoi('2026-07-26T14:32:00', AGORA)).toBe('hoje às 14h32')
    expect(quandoFoi('2026-07-25T09:05:00', AGORA)).toBe('ontem às 09h05')
    expect(quandoFoi('2026-07-19T23:59:00', AGORA)).toBe('19/07 às 23h59')
  })

  it('vira noite sem virar "hoje": 23h59 de ontem continua ontem', () => {
    expect(quandoFoi('2026-07-25T23:59:00', new Date('2026-07-26T00:01:00'))).toBe('ontem às 23h59')
  })

  it('texto que não é data devolve null', () => {
    expect(quandoFoi('nem-data', AGORA)).toBeNull()
  })
})

describe('avisosDoSync', () => {
  it('cofre saudável não tem aviso nenhum', () => {
    expect(avisosDoSync(emDia())).toEqual([])
  })

  it('o freio explica quantos arquivos estavam em jogo e jura que nada foi apagado', () => {
    const [aviso] = avisosDoSync(emDia({ freio: { apagaria: 42, total: 50 } }))
    expect(aviso.chave).toBe('freio')
    expect(aviso.titulo).toBe('Sincronização parada por segurança')
    expect(aviso.paragrafos[0]).toBe(
      'Para deixar este computador e o Google Drive iguais, o Grimório teria que apagar 42 dos 50 arquivos que ele conhece deste cofre. É apagar demais de uma vez, então ele parou antes de mexer em qualquer coisa: nada foi apagado, nem aqui nem no Drive.',
    )
    // não existe "apagar mesmo assim": o plano recusado volta sem as ações
    expect(aviso.itens).toEqual([])
  })

  it('gravação pendente lista o rótulo, e cai no caminho quando não há rótulo', () => {
    const [aviso] = avisosDoSync(
      emDia({
        gravacoesPendentes: [
          { caminho: 'personagens/alice.json', rotulo: 'Alice' },
          { caminho: 'personagens/sem-nome.json', rotulo: '' },
        ],
      }),
    )
    expect(aviso.chave).toBe('gravacoes')
    expect(aviso.itens).toEqual(['Alice', 'personagens/sem-nome.json'])
  })

  it('erro de infraestrutura carrega a mensagem crua como detalhe', () => {
    const [aviso] = avisosDoSync(emDia({ ultimoErro: 'não foi possível falar com o Google Drive' }))
    expect(aviso.chave).toBe('erro')
    expect(aviso.itens).toEqual(['não foi possível falar com o Google Drive'])
  })

  it('ação falha vira uma linha com verbo em português e o motivo', () => {
    const [aviso] = avisosDoSync(
      emDia({
        falhas: [
          { acao: { tipo: 'baixar', caminho: 'imagens/mapa.png' }, erro: 'arquivo em uso' },
        ],
      }),
    )
    expect(aviso.chave).toBe('falhas')
    expect(aviso.itens).toEqual(['baixar imagens/mapa.png — arquivo em uso'])
  })

  it('todos os problemas de pé aparecem juntos, do mais cedo no ciclo para o mais tarde', () => {
    const chaves = avisosDoSync(
      emDia({
        gravacoesPendentes: [{ caminho: 'a.json', rotulo: 'A' }],
        freio: { apagaria: 9, total: 10 },
        ultimoErro: 'sem internet',
        falhas: [{ acao: { tipo: 'subir', caminho: 'b.json' }, erro: 'x' }],
      }),
    ).map((a) => a.chave)
    expect(chaves).toEqual(['gravacoes', 'freio', 'erro', 'falhas'])
  })
})

describe('descreverAcao', () => {
  it('cada verbo do motor tem uma frase que um não-programador entende', () => {
    expect(descreverAcao({ tipo: 'subir', caminho: 'a.json' })).toBe('enviar a.json')
    expect(descreverAcao({ tipo: 'baixar', caminho: 'a.json' })).toBe('baixar a.json')
    expect(descreverAcao({ tipo: 'apagarLocal', caminho: 'a.json' })).toBe('apagar a.json deste computador')
    expect(descreverAcao({ tipo: 'apagarRemoto', caminho: 'a.json' })).toBe('apagar a.json do Google Drive')
    expect(descreverAcao({ tipo: 'conflito', caminho: 'a.json', vencedor: 'local' }))
      .toBe('resolver as duas versões de a.json')
    expect(descreverAcao({ tipo: 'registrar', caminho: 'a.json' })).toBe('anotar a.json')
  })
})

describe('copiasDeConflito', () => {
  it('acha personagem e cenário marcados e ignora o resto', () => {
    const caminhoGandalf = 'personagens-soltos/gandalf.json'
    const caminhoTaverna = 'cenarios/taverna/cenario.json'
    const personagens = {
      p1: personagem('p1', 'Gandalf'),
      p2: personagem('p2', '(conflito) Gandalf'),
    }
    const cenarios = {
      c1: cenario('c1', 'Taverna'),
      c2: cenario('c2', '(conflito) Taverna'),
    }
    const caminhoPorId = { p2: caminhoMarcado(caminhoGandalf) }
    const caminhoCenarioPorId = { c2: dirCenarioMarcado(caminhoTaverna) }

    expect(copiasDeConflito(personagens, cenarios, [], [], caminhoPorId, caminhoCenarioPorId)).toEqual([
      { tipo: 'personagem', id: 'p2', nome: '(conflito) Gandalf' },
      { tipo: 'cenario', id: 'c2', nome: '(conflito) Taverna' },
    ])
  })

  it('a marca só vale no começo do nome — "Cópia (conflito)" não é cópia de conflito', () => {
    const personagens = { p1: personagem('p1', 'Guerra do (conflito) eterno') }
    expect(copiasDeConflito(personagens, {}, [], [], {}, {})).toEqual([])
  })

  it('cofre sem conflito nenhum devolve lista vazia', () => {
    expect(copiasDeConflito({ p1: personagem('p1', 'Gandalf') }, { c1: cenario('c1', 'Taverna') }, [], [], {}, {}))
      .toEqual([])
  })

  it('Defeito B: acha canvas e mapa soltos marcados — antes o painel nem olhava essas duas listas', () => {
    const canvasesSoltos = [
      item('canvases-soltos/mapa-mental.json', 'Mapa Mental'),
      item(caminhoMarcado('canvases-soltos/mapa-mental.json'), '(conflito) Mapa Mental'),
    ]
    const mapasSoltos = [
      item('mapas-soltos/castelo.json', 'Castelo'),
      item(caminhoMarcado('mapas-soltos/castelo.json'), '(conflito) Castelo'),
    ]
    expect(copiasDeConflito({}, {}, canvasesSoltos, mapasSoltos, {}, {})).toEqual([
      { tipo: 'mapa', caminho: caminhoMarcado('mapas-soltos/castelo.json'), nome: '(conflito) Castelo' },
      { tipo: 'canvas', caminho: caminhoMarcado('canvases-soltos/mapa-mental.json'), nome: '(conflito) Mapa Mental' },
    ])
  })

  it('as quatro entidades convivem na mesma lista, ordenada por nome', () => {
    const personagens = { p2: personagem('p2', '(conflito) Zelda') }
    const cenarios = { c2: cenario('c2', '(conflito) Bosque') }
    const canvasesSoltos = [item(caminhoMarcado('canvases-soltos/x.json'), '(conflito) Anotações')]
    const mapasSoltos = [item(caminhoMarcado('mapas-soltos/y.json'), '(conflito) Mapa do Castelo L2')]
    const caminhoPorId = { p2: caminhoMarcado('personagens-soltos/zelda.json') }
    const caminhoCenarioPorId = { c2: dirCenarioMarcado('cenarios/bosque/cenario.json') }

    const nomes = copiasDeConflito(
      personagens, cenarios, canvasesSoltos, mapasSoltos, caminhoPorId, caminhoCenarioPorId,
    ).map((c) => c.nome)
    expect(nomes).toEqual([
      '(conflito) Anotações',
      '(conflito) Bosque',
      '(conflito) Mapa do Castelo L2',
      '(conflito) Zelda',
    ])
  })

  describe('CRÍTICO: prefixo no nome exibido não basta — a marca precisa estar no caminho', () => {
    it('personagem nomeado pelo usuário com o prefixo NÃO entra, mesmo com entrada no cache', () => {
      const personagens = { p1: personagem('p1', '(conflito) Nome Escolhido Pelo Jogador') }
      // caminho REAL, sem a marca de `nomeDaCopia` — é exatamente o caso do mestre que batiza
      // a entidade assim de propósito
      const caminhoPorId = { p1: 'personagens-soltos/conflito-nome-escolhido-pelo-jogador.json' }
      expect(copiasDeConflito(personagens, {}, [], [], caminhoPorId, {})).toEqual([])
    })

    it('cenário nomeado pelo usuário com o prefixo NÃO entra — caso do relato original', () => {
      const cenarios = { c1: cenario('c1', '(conflito) na Ilha dos Piratas') }
      const caminhoCenarioPorId = { c1: 'cenarios/na-ilha-dos-piratas' }
      expect(copiasDeConflito({}, cenarios, [], [], {}, caminhoCenarioPorId)).toEqual([])
    })

    it('canvas/mapa com nome digitado começando com o prefixo também não entra', () => {
      const canvasesSoltos = [item('canvases-soltos/conflito-armado.json', '(conflito) Armado')]
      const mapasSoltos = [item('mapas-soltos/conflito-na-fronteira.json', '(conflito) na Fronteira')]
      expect(copiasDeConflito({}, {}, canvasesSoltos, mapasSoltos, {}, {})).toEqual([])
    })

    it('cópia de VERDADE (caminho gerado por nomeDaCopia) continua entrando', () => {
      const personagens = { p1: personagem('p1', '(conflito) Gandalf') }
      const caminhoPorId = { p1: caminhoMarcado('personagens-soltos/gandalf.json') }
      expect(copiasDeConflito(personagens, {}, [], [], caminhoPorId, {})).toEqual([
        { tipo: 'personagem', id: 'p1', nome: '(conflito) Gandalf' },
      ])
    })

    it('sem entrada no cache (id ainda não resolvido) a entidade fica de fora, não entra por otimismo', () => {
      const personagens = { p1: personagem('p1', '(conflito) Gandalf') }
      const cenarios = { c1: cenario('c1', '(conflito) Taverna') }
      expect(copiasDeConflito(personagens, cenarios, [], [], {}, {})).toEqual([])
    })
  })
})
