import { describe, expect, it } from 'vitest'
import {
  alternarOculta,
  alternarTravada,
  camadaDoShape,
  camadasDoDoc,
  criarCamada,
  moverCamada,
  migrarOrdemCamadas,
  ordemDasCamadas,
  VERSAO_CAMADAS,
  removerCamada,
  reordenarCamadaSoltando,
  renomearCamada,
  shapeOculto,
  shapeTravado,
  type CamadaMapa,
} from '../lib/camadasMapa'

const base: CamadaMapa = { id: 'base', nome: 'Base', oculta: false, travada: false }

describe('camadasDoDoc', () => {
  it('undefined vira uma camada Base implícita', () => {
    expect(camadasDoDoc(undefined)).toEqual([base])
  })

  it('array vazio vira uma camada Base implícita', () => {
    expect(camadasDoDoc([])).toEqual([base])
  })

  it('array com camadas passa direto', () => {
    const camadas: CamadaMapa[] = [base, { id: 'paredes', nome: 'Paredes', oculta: false, travada: false }]
    expect(camadasDoDoc(camadas)).toEqual(camadas)
  })
})

describe('camadaDoShape', () => {
  const camadas: CamadaMapa[] = [
    base,
    { id: 'rotulos', nome: 'Rótulos', oculta: true, travada: false },
  ]

  it('meta.camada existente devolve a camada correspondente', () => {
    expect(camadaDoShape({ camada: 'rotulos' }, camadas)).toEqual(camadas[1])
  })

  it('meta sem camada devolve a primeira', () => {
    expect(camadaDoShape({}, camadas)).toEqual(camadas[0])
  })

  it('meta undefined devolve a primeira', () => {
    expect(camadaDoShape(undefined, camadas)).toEqual(camadas[0])
  })

  it('meta.camada órfã (id que não existe mais) devolve a primeira', () => {
    expect(camadaDoShape({ camada: 'fantasma' }, camadas)).toEqual(camadas[0])
  })

  it('meta não-objeto devolve a primeira', () => {
    expect(camadaDoShape('lixo', camadas)).toEqual(camadas[0])
  })
})

describe('shapeOculto / shapeTravado', () => {
  const camadas: CamadaMapa[] = [
    base,
    { id: 'rotulos', nome: 'Rótulos', oculta: true, travada: false },
    { id: 'paredes', nome: 'Paredes', oculta: false, travada: true },
  ]

  it('shapeOculto reflete a camada oculta', () => {
    expect(shapeOculto({ camada: 'rotulos' }, camadas)).toBe(true)
    expect(shapeOculto({ camada: 'base' }, camadas)).toBe(false)
  })

  it('shapeTravado reflete a camada travada', () => {
    expect(shapeTravado({ camada: 'paredes' }, camadas)).toBe(true)
    expect(shapeTravado({ camada: 'base' }, camadas)).toBe(false)
  })
})

describe('criarCamada', () => {
  it('adiciona camada nova ao fim, visível e destravada', () => {
    const r = criarCamada([base], 'Rótulos')
    expect(r.camadas).toHaveLength(2)
    expect(r.camadas[1]).toMatchObject({ nome: 'Rótulos', oculta: false, travada: false })
    expect(r.camadas[1].id).toBeTruthy()
    expect(r.novaId).toBe(r.camadas[1].id)
  })

  it('não muta o array original', () => {
    const original = [base]
    criarCamada(original, 'Rótulos')
    expect(original).toEqual([base])
  })
})

describe('renomearCamada', () => {
  it('troca o nome da camada com o id dado', () => {
    const r = renomearCamada([base], 'base', 'Chão')
    expect(r[0].nome).toBe('Chão')
  })

  it('id inexistente não altera nada', () => {
    const r = renomearCamada([base], 'fantasma', 'Chão')
    expect(r).toEqual([base])
  })
})

describe('removerCamada', () => {
  const duas: CamadaMapa[] = [base, { id: 'paredes', nome: 'Paredes', oculta: false, travada: false }]

  it('remove a camada e devolve a herdeira (a vizinha seguinte)', () => {
    const r = removerCamada(duas, 'base')
    expect(r.camadas).toEqual([{ id: 'paredes', nome: 'Paredes', oculta: false, travada: false }])
    expect(r.idHerdeira).toBe('paredes')
  })

  it('removendo a última da lista, herdeira é a anterior', () => {
    const r = removerCamada(duas, 'paredes')
    expect(r.camadas).toEqual([base])
    expect(r.idHerdeira).toBe('base')
  })

  it('nunca remove a última camada restante', () => {
    const r = removerCamada([base], 'base')
    expect(r.camadas).toEqual([base])
    expect(r.idHerdeira).toBe('base')
  })

  it('id inexistente é no-op (lista intacta, herdeira é a primeira)', () => {
    const r = removerCamada(duas, 'fantasma')
    expect(r.camadas).toEqual(duas)
    expect(r.idHerdeira).toBe('base')
  })
})

describe('alternarOculta / alternarTravada', () => {
  it('alternarOculta inverte só a camada do id', () => {
    const camadas: CamadaMapa[] = [base, { id: 'paredes', nome: 'Paredes', oculta: false, travada: false }]
    const r = alternarOculta(camadas, 'paredes')
    expect(r[0].oculta).toBe(false)
    expect(r[1].oculta).toBe(true)
  })

  it('alternarTravada inverte só a camada do id', () => {
    const camadas: CamadaMapa[] = [base, { id: 'paredes', nome: 'Paredes', oculta: false, travada: false }]
    const r = alternarTravada(camadas, 'paredes')
    expect(r[0].travada).toBe(false)
    expect(r[1].travada).toBe(true)
  })
})

describe('moverCamada', () => {
  const tres: CamadaMapa[] = [
    base,
    { id: 'paredes', nome: 'Paredes', oculta: false, travada: false },
    { id: 'rotulos', nome: 'Rótulos', oculta: false, travada: false },
  ]

  // A lista vai do FUNDO pro topo (ver o cabeçalho de `camadasMapa.ts`), então "cima" — no
  // sentido de Z, mais perto do observador — anda para o FIM do array. O painel desenha a
  // lista invertida justamente para o ▲ da tela e o "cima" daqui significarem a mesma coisa.
  it('cima aproxima do observador: troca com a camada da frente', () => {
    const r = moverCamada(tres, 'paredes', 'cima')
    expect(r.map((c) => c.id)).toEqual(['base', 'rotulos', 'paredes'])
  })

  it('baixo afasta: troca com a camada de trás', () => {
    const r = moverCamada(tres, 'paredes', 'baixo')
    expect(r.map((c) => c.id)).toEqual(['paredes', 'base', 'rotulos'])
  })

  it('subir a camada que já está na frente é no-op', () => {
    const r = moverCamada(tres, 'rotulos', 'cima')
    expect(r.map((c) => c.id)).toEqual(['base', 'paredes', 'rotulos'])
  })

  it('descer a camada do fundo é no-op', () => {
    const r = moverCamada(tres, 'base', 'baixo')
    expect(r.map((c) => c.id)).toEqual(['base', 'paredes', 'rotulos'])
  })

  it('id inexistente é no-op (mesma referência de lista)', () => {
    const r = moverCamada(tres, 'fantasma', 'cima')
    expect(r).toBe(tres)
  })
})

describe('ordemDasCamadas', () => {
  const pilha: CamadaMapa[] = [
    base,
    { id: 'terreo', nome: 'Térreo', oculta: false, travada: false },
    { id: 'teto', nome: 'Teto', oculta: false, travada: false },
  ]

  it('devolve os ids na ordem do array, que é do fundo pro topo', () => {
    expect(ordemDasCamadas(pilha)).toEqual(['base', 'terreo', 'teto'])
  })

  it('camada nova entra na FRENTE de todas — é o fim do array', () => {
    const r = criarCamada(pilha, 'Névoa')
    const ordem = ordemDasCamadas(r.camadas)
    expect(ordem[ordem.length - 1]).toBe(r.novaId)
  })

  it('lista vazia devolve lista vazia (mapa sem camadas)', () => {
    expect(ordemDasCamadas([])).toEqual([])
  })
})

/**
 * Até a versão 1 o array só decidia a ordem de EXIBIÇÃO do painel (primeiro item = linha de
 * cima) e não tocava o empilhamento. Na versão 2 ele virou a pilha, do fundo pro topo, e o
 * painel é que inverte. Sem converter no load, o mapa que o usuário já tinha reabriria com
 * as camadas ao contrário — e a camada ativa passaria a ser a que estava no fundo.
 */
describe('migrarOrdemCamadas', () => {
  const duas: CamadaMapa[] = [
    { id: 'detalhes', nome: 'Detalhes', oculta: false, travada: false },
    { id: 'planta', nome: 'Planta', oculta: false, travada: false },
  ]

  it('doc SEM versão veio da convenção antiga: inverte para preservar o arranjo visual', () => {
    expect(migrarOrdemCamadas(duas, undefined)!.map((c) => c.id)).toEqual(['planta', 'detalhes'])
  })

  it('doc na versão atual passa direto', () => {
    expect(migrarOrdemCamadas(duas, VERSAO_CAMADAS)).toBe(duas)
  })

  it('versão futura também passa direto (nunca desfaz o que não conhece)', () => {
    expect(migrarOrdemCamadas(duas, VERSAO_CAMADAS + 1)).toBe(duas)
  })

  it('uma camada só, lista vazia ou ausente: nada a inverter', () => {
    expect(migrarOrdemCamadas([base], undefined)).toEqual([base])
    expect(migrarOrdemCamadas([], undefined)).toEqual([])
    expect(migrarOrdemCamadas(undefined, undefined)).toBeUndefined()
  })

  it('não muta a lista original', () => {
    const original = [...duas]
    migrarOrdemCamadas(duas, undefined)
    expect(duas).toEqual(original)
  })
})

/**
 * Arrasto no painel. Os nomes dos testes falam na ordem que a TELA mostra (topo → fundo),
 * que é a inversa do array — é assim que o usuário descreve o gesto, e é onde o erro mora.
 *
 * Pilha do array: [fundo, meio, topo]. Na tela, de cima para baixo: topo, meio, fundo.
 */
describe('reordenarCamadaSoltando', () => {
  const fundo: CamadaMapa = { id: 'fundo', nome: 'Fundo', oculta: false, travada: false }
  const meio: CamadaMapa = { id: 'meio', nome: 'Meio', oculta: false, travada: false }
  const topo: CamadaMapa = { id: 'topo', nome: 'Topo', oculta: false, travada: false }
  const tres = [fundo, meio, topo]
  const naTela = (r: CamadaMapa[]) => [...r].reverse().map((c) => c.id)

  it('arrastar a de baixo e soltar ACIMA da primeira linha manda ela para a frente', () => {
    expect(naTela(reordenarCamadaSoltando(tres, 'fundo', 'topo', 'antes'))).toEqual(['fundo', 'topo', 'meio'])
  })

  it('arrastar a de cima e soltar ABAIXO da última linha manda ela para o fundo', () => {
    expect(naTela(reordenarCamadaSoltando(tres, 'topo', 'fundo', 'depois'))).toEqual(['meio', 'fundo', 'topo'])
  })

  /**
   * O erro clássico de lista reordenável: sem recalcular o índice do alvo na lista JÁ SEM a
   * peça arrastada, quem arrasta para baixo sempre para uma posição antes do que mirou.
   */
  it('arrastar de cima para baixo para exatamente onde mirou, sem errar uma posição', () => {
    expect(naTela(reordenarCamadaSoltando(tres, 'topo', 'fundo', 'antes'))).toEqual(['meio', 'topo', 'fundo'])
  })

  it('arrastar de baixo para cima também acerta o alvo', () => {
    expect(naTela(reordenarCamadaSoltando(tres, 'fundo', 'meio', 'depois'))).toEqual(['topo', 'meio', 'fundo'])
  })

  it('soltar em cima de si mesma é no-op (mesma referência)', () => {
    expect(reordenarCamadaSoltando(tres, 'meio', 'meio', 'antes')).toBe(tres)
  })

  it('soltar exatamente onde já estava é no-op (mesma referência)', () => {
    // "meio" já fica logo abaixo de "topo" na tela
    expect(reordenarCamadaSoltando(tres, 'meio', 'topo', 'depois')).toBe(tres)
  })

  it('id desconhecido, dos dois lados, é no-op', () => {
    expect(reordenarCamadaSoltando(tres, 'fantasma', 'meio', 'antes')).toBe(tres)
    expect(reordenarCamadaSoltando(tres, 'meio', 'fantasma', 'antes')).toBe(tres)
  })

  it('não muta a lista original', () => {
    const original = [...tres]
    reordenarCamadaSoltando(tres, 'fundo', 'topo', 'antes')
    expect(tres).toEqual(original)
  })

  it('chega ao mesmo lugar que dois cliques em ▲, quando o gesto é equivalente', () => {
    const porArrasto = reordenarCamadaSoltando(tres, 'fundo', 'topo', 'antes')
    const porBotao = moverCamada(moverCamada(tres, 'fundo', 'cima'), 'fundo', 'cima')
    expect(porArrasto.map((c) => c.id)).toEqual(porBotao.map((c) => c.id))
  })
})
