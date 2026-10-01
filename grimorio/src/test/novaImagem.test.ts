import { describe, expect, it } from 'vitest'
import { cadeiaCenario, donoDoDocumento, papelDoNomeOriginal, reservarDestino } from '../lib/organizarImagens/novaImagem'

describe('reservarDestino — imagem nova já nasce com nome legível', () => {
  it('duas imagens coladas ao mesmo tempo não caem no mesmo número', async () => {
    const listar = async (): Promise<string[]> => []
    const dono = { tipo: 'mapa', nome: 'Masmorra' } as const
    const [a, b] = await Promise.all([
      reservarDestino(listar, dono, { papel: 'numerada' }, 'png'),
      reservarDestino(listar, dono, { papel: 'numerada' }, 'png'),
    ])
    expect(new Set([a, b])).toEqual(new Set(['imagens/mapas/Masmorra/01.png', 'imagens/mapas/Masmorra/02.png']))
  })

  it('respeita o que já existe na pasta', async () => {
    const listar = async (pasta: string) => (pasta === 'imagens/notas/Sessão 9' ? ['imagens/notas/Sessão 9/01.png'] : [])
    expect(await reservarDestino(listar, { tipo: 'nota', nome: 'Sessão 9' }, { papel: 'numerada' }, 'png'))
      .toBe('imagens/notas/Sessão 9/02.png')
  })

  it('trocar o retrato reaproveita o arquivo atual SÓ quando a checagem diz que ninguém mais o cita', async () => {
    const atual = 'imagens/personagens/Aragorn/retrato-a3f9.png'
    const listar = async () => [atual]
    const perguntados: string[] = []
    const destino = await reservarDestino(listar, { tipo: 'personagem', nome: 'Aragorn' }, { papel: 'retrato' }, 'png', {
      atual, sufixo: 'b7c1', podeSobrescrever: async (rel) => { perguntados.push(rel); return true },
    })
    expect(destino).toBe(atual)
    expect(perguntados).toEqual([atual])
  })

  it('outra versão (ou ficha) ainda cita o retrato atual: nome novo, o arquivo antigo fica intacto', async () => {
    const atual = 'imagens/personagens/Aragorn/retrato-a3f9.png'
    const listar = async () => [atual]
    expect(await reservarDestino(listar, { tipo: 'personagem', nome: 'Aragorn' }, { papel: 'retrato' }, 'png', {
      atual, sufixo: 'b7c1', podeSobrescrever: async () => false,
    })).toBe('imagens/personagens/Aragorn/retrato-b7c1.png')
  })

  it('sem checagem de citação, nunca sobrescreve (na dúvida, nome novo)', async () => {
    const atual = 'imagens/personagens/Aragorn/retrato-a3f9.png'
    const listar = async () => [atual]
    expect(await reservarDestino(listar, { tipo: 'personagem', nome: 'Aragorn' }, { papel: 'retrato' }, 'png', { atual, sufixo: 'a3f9' }))
      .toBe('imagens/personagens/Aragorn/retrato-a3f9-2.png')
  })

  it('retrato atual em outro lugar (nome antigo) não é reaproveitado, nem perguntado', async () => {
    const listar = async () => ['imagens/personagens/Aragorn/retrato.png']
    let perguntou = false
    expect(await reservarDestino(listar, { tipo: 'personagem', nome: 'Aragorn' }, { papel: 'retrato' }, 'png', {
      atual: 'campanhas/x/assets/retrato-p-v.png', podeSobrescrever: async () => { perguntou = true; return true },
    })).toBe('imagens/personagens/Aragorn/retrato-2.png')
    expect(perguntou).toBe(false)
  })

  it('imagem nova leva o sufixo do conteúdo', async () => {
    const listar = async (): Promise<string[]> => []
    expect(await reservarDestino(listar, { tipo: 'canvas', nome: 'Quadro' }, { papel: 'numerada' }, 'png', { sufixo: 'c0de' }))
      .toBe('imagens/canvas/Quadro/01-c0de.png')
  })

  it('listagem que falha (pasta ainda não existe) conta como pasta vazia', async () => {
    const listar = async (): Promise<string[]> => { throw new Error('os error 3') }
    expect(await reservarDestino(listar, { tipo: 'item', nome: 'Anel Único' }, { papel: 'retrato' }, 'png'))
      .toBe('imagens/itens/Anel Único.png')
  })
})

describe('donoDoDocumento', () => {
  it('mapa pelas camadas ou pela seção; sessão e canvas solto são canvas', () => {
    expect(donoDoDocumento('mapas-soltos/m.json', { nome: 'Masmorra' })).toEqual({ tipo: 'mapa', nome: 'Masmorra' })
    expect(donoDoDocumento('campanhas/c/sessoes/s.json', { nome: 'Sessão 1', camadas: [] })).toEqual({ tipo: 'mapa', nome: 'Sessão 1' })
    expect(donoDoDocumento('campanhas/c/sessoes/s.json', { nome: 'Sessão 1' })).toEqual({ tipo: 'canvas', nome: 'Sessão 1' })
    expect(donoDoDocumento('canvases-soltos/quadro.json', {})).toEqual({ tipo: 'canvas', nome: 'quadro' })
  })
})

describe('papelDoNomeOriginal', () => {
  it('nome do usuário vira o nome do arquivo; nome de clipboard vira número', () => {
    expect(papelDoNomeOriginal('porta secreta.png')).toEqual({ papel: 'nomeada', nome: 'porta secreta' })
    expect(papelDoNomeOriginal('image.png')).toEqual({ papel: 'numerada' })
    expect(papelDoNomeOriginal('')).toEqual({ papel: 'numerada' })
  })

  it('imagem colada no canvas chega como "tldrawFile" (o tldraw embrulha o blob com esse nome): vira número', async () => {
    expect(papelDoNomeOriginal('tldrawFile')).toEqual({ papel: 'numerada' })
    // o mesmo trajeto do `upload` de `canvasDoc.ts`: dono pelo documento, papel pelo nome do arquivo
    const listar = async (pasta: string) => (pasta === 'imagens/canvas/Sessão 3' ? ['imagens/canvas/Sessão 3/01-a3f9.png'] : [])
    expect(await reservarDestino(
      listar, donoDoDocumento('campanhas/c/sessoes/s3.json', { nome: 'Sessão 3' }), papelDoNomeOriginal('tldrawFile'), 'png', { sufixo: 'c0de' },
    )).toBe('imagens/canvas/Sessão 3/02-c0de.png')
  })
})

describe('cadeiaCenario', () => {
  it('monta a cadeia de nomes do cenário raiz até ele, sem repetir o prefixo do pai', () => {
    const nomes = new Map([
      ['cenarios/reino', 'Reino'],
      ['cenarios/reino/torre', 'Reino: Torre'],
      ['cenarios/reino/torre/sotao', 'Reino: Torre: Sótão'],
    ])
    expect(cadeiaCenario('cenarios/reino/torre/sotao', nomes)).toEqual(['Reino', 'Torre', 'Sótão'])
  })

  it('cenário sem pai conhecido é cadeia de um nome só', () => {
    expect(cadeiaCenario('cenarios/pasta-organizacional/vila', new Map([['cenarios/pasta-organizacional/vila', 'Vila']])))
      .toEqual(['Vila'])
  })
})
