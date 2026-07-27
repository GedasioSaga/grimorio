import { describe, it, expect } from 'vitest'
import { estadoInicialSync, type EstadoSync } from '../lib/sync/sincronizador'
import type { Cenario, Personagem } from '../lib/types'
import {
  avisosDoSync,
  copiasDeConflito,
  descreverAcao,
  quandoFoi,
  resumirSync,
} from '../lib/painelSync'

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
    const personagens = {
      p1: personagem('p1', 'Gandalf'),
      p2: personagem('p2', '(conflito) Gandalf'),
    }
    const cenarios = {
      c1: cenario('c1', 'Taverna'),
      c2: cenario('c2', '(conflito) Taverna'),
    }
    expect(copiasDeConflito(personagens, cenarios)).toEqual([
      { tipo: 'personagem', id: 'p2', nome: '(conflito) Gandalf' },
      { tipo: 'cenario', id: 'c2', nome: '(conflito) Taverna' },
    ])
  })

  it('a marca só vale no começo do nome — "Cópia (conflito)" não é cópia de conflito', () => {
    const personagens = { p1: personagem('p1', 'Guerra do (conflito) eterno') }
    expect(copiasDeConflito(personagens, {})).toEqual([])
  })

  it('cofre sem conflito nenhum devolve lista vazia', () => {
    expect(copiasDeConflito({ p1: personagem('p1', 'Gandalf') }, { c1: cenario('c1', 'Taverna') })).toEqual([])
  })
})
