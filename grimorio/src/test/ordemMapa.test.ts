import { describe, expect, it } from 'vitest'
import {
  bandaDoTipo,
  indiceDaCamada,
  limitesParaNovaForma,
  ordenarPorEmpilhamento,
  precisaReordenar,
  rankDeEmpilhamento,
  type FormaParaOrdenar,
  type IrmaoOrdenado,
} from '../lib/ordemMapa'

describe('bandaDoTipo', () => {
  it('muralha fica na própria banda, antes da estrutura', () => {
    expect(bandaDoTipo('muralha-mapa')).toBe('muralha')
  })

  it('sala, sala-polígono e corredor são estrutura', () => {
    expect(bandaDoTipo('sala-mapa')).toBe('estrutura')
    expect(bandaDoTipo('sala-poligono-mapa')).toBe('estrutura')
    expect(bandaDoTipo('corredor-mapa')).toBe('estrutura')
  })

  it('geo, draw, line e image (parede/divisória/rabisco/imagem) são estrutura', () => {
    expect(bandaDoTipo('geo')).toBe('estrutura')
    expect(bandaDoTipo('draw')).toBe('estrutura')
    expect(bandaDoTipo('line')).toBe('estrutura')
    expect(bandaDoTipo('image')).toBe('estrutura')
  })

  it('o retângulo do mapa é estrutura, junto com as outras formas de planta', () => {
    expect(bandaDoTipo('retangulo-mapa')).toBe('estrutura')
  })

  it('linha-mapa legado é estrutura', () => {
    expect(bandaDoTipo('linha-mapa')).toBe('estrutura')
  })

  it('porta, escada e torre são abertura', () => {
    expect(bandaDoTipo('porta-mapa')).toBe('abertura')
    expect(bandaDoTipo('escada-mapa')).toBe('abertura')
    expect(bandaDoTipo('torre-mapa')).toBe('abertura')
  })

  it('símbolo e item são peca', () => {
    expect(bandaDoTipo('simbolo-mapa')).toBe('peca')
    expect(bandaDoTipo('item-mapa')).toBe('peca')
  })

  it('text é rotulo', () => {
    expect(bandaDoTipo('text')).toBe('rotulo')
  })

  it('cards de entidade são a banda mais alta', () => {
    expect(bandaDoTipo('character-card')).toBe('card')
    expect(bandaDoTipo('cenario-card')).toBe('card')
    expect(bandaDoTipo('item-card')).toBe('card')
  })

  it('tipo desconhecido cai em estrutura (palpite seguro, nem topo nem fundo)', () => {
    expect(bandaDoTipo('group')).toBe('estrutura')
    expect(bandaDoTipo('arrow')).toBe('estrutura')
    expect(bandaDoTipo('frame')).toBe('estrutura')
  })
})

describe('indiceDaCamada', () => {
  const pilha = ['base', 'terreo', 'teto']

  it('devolve a posição na pilha, com 0 no fundo', () => {
    expect(indiceDaCamada('base', pilha)).toBe(0)
    expect(indiceDaCamada('terreo', pilha)).toBe(1)
    expect(indiceDaCamada('teto', pilha)).toBe(2)
  })

  it('camada ausente cai no fundo (mesma regra de camadaDoShape)', () => {
    expect(indiceDaCamada(undefined, pilha)).toBe(0)
  })

  it('camada órfã (id que não existe mais) cai no fundo', () => {
    expect(indiceDaCamada('camada-excluida', pilha)).toBe(0)
  })

  it('sem pilha nenhuma, tudo cai no fundo', () => {
    expect(indiceDaCamada('terreo', [])).toBe(0)
  })
})

describe('rankDeEmpilhamento', () => {
  const pilha = ['base', 'terreo']

  it('a CAMADA manda: a banda mais baixa da camada de cima ainda vence a mais alta da de baixo', () => {
    const cardDoFundo = rankDeEmpilhamento({ banda: 'card', camada: 'base' }, pilha)
    const muralhaDeCima = rankDeEmpilhamento({ banda: 'muralha', camada: 'terreo' }, pilha)
    expect(muralhaDeCima).toBeGreaterThan(cardDoFundo)
  })

  it('dentro da MESMA camada, a banda decide', () => {
    const sala = rankDeEmpilhamento({ banda: 'estrutura', camada: 'terreo' }, pilha)
    const porta = rankDeEmpilhamento({ banda: 'abertura', camada: 'terreo' }, pilha)
    expect(porta).toBeGreaterThan(sala)
  })

  it('sem camadas, o rank degenera na ordem de banda de antes', () => {
    expect(rankDeEmpilhamento({ banda: 'muralha' }, [])).toBeLessThan(rankDeEmpilhamento({ banda: 'estrutura' }, []))
    expect(rankDeEmpilhamento({ banda: 'rotulo' }, [])).toBeLessThan(rankDeEmpilhamento({ banda: 'card' }, []))
  })
})

describe('limitesParaNovaForma', () => {
  it('página vazia: sem irmãos, sem limite nenhum', () => {
    expect(limitesParaNovaForma([], { banda: 'estrutura' })).toEqual({ abaixo: undefined, acima: undefined })
  })

  it('o bug relatado: porta já existe, sala nasce DEPOIS mas entra ABAIXO da porta', () => {
    const irmaos: IrmaoOrdenado[] = [{ index: 'a1', banda: 'abertura' }] // a porta, criada primeiro
    const r = limitesParaNovaForma(irmaos, { banda: 'estrutura' }) // a sala, criada depois
    expect(r.abaixo).toBeUndefined()
    expect(r.acima).toBe('a1') // sala fica abaixo da porta, não acima
  })

  it('inverso: sala já existe, porta nasce depois e entra ACIMA da sala', () => {
    const irmaos: IrmaoOrdenado[] = [{ index: 'a1', banda: 'estrutura' }]
    const r = limitesParaNovaForma(irmaos, { banda: 'abertura' })
    expect(r.abaixo).toBe('a1')
    expect(r.acima).toBeUndefined()
  })

  it('muralha nasce abaixo de tudo, mesmo com salas e portas já no mapa', () => {
    const irmaos: IrmaoOrdenado[] = [
      { index: 'a1', banda: 'estrutura' },
      { index: 'a2', banda: 'abertura' },
      { index: 'a3', banda: 'peca' },
    ]
    const r = limitesParaNovaForma(irmaos, { banda: 'muralha' })
    expect(r.abaixo).toBeUndefined()
    expect(r.acima).toBe('a1') // primeiro irmão de banda mais alta
  })

  it('card nasce acima de tudo, mesmo com card já existente', () => {
    const irmaos: IrmaoOrdenado[] = [
      { index: 'a1', banda: 'estrutura' },
      { index: 'a2', banda: 'rotulo' },
      { index: 'a3', banda: 'card' },
    ]
    const r = limitesParaNovaForma(irmaos, { banda: 'card' })
    expect(r.abaixo).toBe('a3')
    expect(r.acima).toBeUndefined()
  })

  it('mesma banda: entra acima do último irmão da própria banda (comportamento normal de criação)', () => {
    const irmaos: IrmaoOrdenado[] = [
      { index: 'a1', banda: 'abertura' },
      { index: 'a2', banda: 'abertura' },
    ]
    const r = limitesParaNovaForma(irmaos, { banda: 'abertura' })
    expect(r.abaixo).toBe('a2')
    expect(r.acima).toBeUndefined()
  })

  it('entra entre duas bandas vizinhas quando as duas já existem', () => {
    const irmaos: IrmaoOrdenado[] = [
      { index: 'a1', banda: 'estrutura' },
      { index: 'a2', banda: 'peca' },
    ]
    const r = limitesParaNovaForma(irmaos, { banda: 'abertura' })
    expect(r.abaixo).toBe('a1')
    expect(r.acima).toBe('a2')
  })

  it('sala numa camada superior nasce ACIMA de uma porta da camada de baixo', () => {
    const pilha = ['subsolo', 'terreo']
    const irmaos: IrmaoOrdenado[] = [{ index: 'a1', banda: 'abertura', camada: 'subsolo' }]
    const r = limitesParaNovaForma(irmaos, { banda: 'estrutura', camada: 'terreo' }, pilha)
    expect(r.abaixo).toBe('a1')
    expect(r.acima).toBeUndefined()
  })

  it('peça de camada inferior nasce ABAIXO de tudo que está na camada de cima', () => {
    const pilha = ['subsolo', 'terreo']
    const irmaos: IrmaoOrdenado[] = [
      { index: 'a1', banda: 'muralha', camada: 'terreo' },
      { index: 'a2', banda: 'estrutura', camada: 'terreo' },
    ]
    const r = limitesParaNovaForma(irmaos, { banda: 'card', camada: 'subsolo' }, pilha)
    expect(r.abaixo).toBeUndefined()
    expect(r.acima).toBe('a1')
  })
})

describe('ordenarPorEmpilhamento', () => {
  function forma(id: string, banda: FormaParaOrdenar['banda'], camada?: string, decorativo = false): FormaParaOrdenar {
    return { id, banda, camada, decorativo }
  }

  it('já na ordem certa: devolve a mesma sequência de ids', () => {
    const formas = [forma('muralha', 'muralha'), forma('sala', 'estrutura'), forma('porta', 'abertura')]
    expect(ordenarPorEmpilhamento(formas)).toEqual(['muralha', 'sala', 'porta'])
  })

  it('corrige o caso do relato: porta criada antes da sala (fora de ordem) volta pra cima', () => {
    const formas = [forma('porta', 'abertura'), forma('sala', 'estrutura')]
    expect(ordenarPorEmpilhamento(formas)).toEqual(['sala', 'porta'])
  })

  it('dentro do MESMO rank preserva a ordem relativa (controle manual do usuário)', () => {
    const formas = [forma('porta-b', 'abertura'), forma('porta-a', 'abertura')]
    expect(ordenarPorEmpilhamento(formas)).toEqual(['porta-b', 'porta-a'])
  })

  it('reordena várias bandas fora de ordem de uma vez', () => {
    const formas = [
      forma('card', 'card'),
      forma('porta', 'abertura'),
      forma('muralha', 'muralha'),
      forma('rotulo', 'rotulo'),
      forma('sala', 'estrutura'),
    ]
    expect(ordenarPorEmpilhamento(formas)).toEqual(['muralha', 'sala', 'porta', 'rotulo', 'card'])
  })

  it('a queixa do usuário: porta na camada de cima sobe acima da sala da camada de baixo', () => {
    const pilha = ['subsolo', 'terreo']
    const formas = [forma('porta-terreo', 'abertura', 'terreo'), forma('sala-subsolo', 'estrutura', 'subsolo')]
    expect(ordenarPorEmpilhamento(formas, pilha)).toEqual(['sala-subsolo', 'porta-terreo'])
  })

  it('camada manda mesmo contra a banda: sala do térreo cobre porta do subsolo', () => {
    const pilha = ['subsolo', 'terreo']
    const formas = [forma('sala-terreo', 'estrutura', 'terreo'), forma('porta-subsolo', 'abertura', 'subsolo')]
    expect(ordenarPorEmpilhamento(formas, pilha)).toEqual(['porta-subsolo', 'sala-terreo'])
  })

  it('dentro de cada camada a banda continua valendo', () => {
    const pilha = ['subsolo', 'terreo']
    const formas = [
      forma('porta-terreo', 'abertura', 'terreo'),
      forma('sala-terreo', 'estrutura', 'terreo'),
      forma('porta-subsolo', 'abertura', 'subsolo'),
      forma('sala-subsolo', 'estrutura', 'subsolo'),
    ]
    expect(ordenarPorEmpilhamento(formas, pilha)).toEqual([
      'sala-subsolo',
      'porta-subsolo',
      'sala-terreo',
      'porta-terreo',
    ])
  })

  it('peça sem camada e peça de camada excluída ficam no fundo, junto com a camada base', () => {
    const pilha = ['base', 'teto']
    const formas = [
      forma('do-teto', 'muralha', 'teto'),
      forma('sem-camada', 'card'),
      forma('orfa', 'card', 'camada-que-sumiu'),
    ]
    expect(ordenarPorEmpilhamento(formas, pilha)).toEqual(['sem-camada', 'orfa', 'do-teto'])
  })

  it('grupo decorativo (legenda) sai intocado, mesmo fora de ordem', () => {
    const formas = [
      forma('texto', 'rotulo', undefined, true),
      forma('icone', 'peca', undefined, true),
      forma('moldura', 'estrutura', undefined, true),
    ]
    expect(ordenarPorEmpilhamento(formas)).toEqual(['texto', 'icone', 'moldura'])
  })
})

describe('precisaReordenar', () => {
  function forma(id: string, banda: FormaParaOrdenar['banda'], camada?: string, decorativo = false): FormaParaOrdenar {
    return { id, banda, camada, decorativo }
  }

  it('ordem já correta: false', () => {
    expect(precisaReordenar([forma('sala', 'estrutura'), forma('porta', 'abertura')])).toBe(false)
  })

  it('ordem incorreta: true', () => {
    expect(precisaReordenar([forma('porta', 'abertura'), forma('sala', 'estrutura')])).toBe(true)
  })

  it('lista vazia: false', () => {
    expect(precisaReordenar([])).toBe(false)
  })

  it('ordem certa por banda mas errada por camada: true', () => {
    const pilha = ['subsolo', 'terreo']
    const formas = [forma('sala-terreo', 'estrutura', 'terreo'), forma('porta-subsolo', 'abertura', 'subsolo')]
    expect(precisaReordenar(formas, pilha)).toBe(true)
  })

  it('a MESMA lista, sem a pilha de camadas, já está em ordem: só a camada tornou errada', () => {
    const formas = [forma('sala-terreo', 'estrutura', 'terreo'), forma('porta-subsolo', 'abertura', 'subsolo')]
    expect(precisaReordenar(formas)).toBe(false)
  })

  it('grupo decorativo fora de ordem: false (não mexe)', () => {
    expect(precisaReordenar([forma('a', 'rotulo', undefined, true), forma('b', 'muralha', undefined, true)])).toBe(false)
  })
})
