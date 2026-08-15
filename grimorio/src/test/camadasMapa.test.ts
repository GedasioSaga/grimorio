import { describe, expect, it } from 'vitest'
import {
  alternarOculta,
  alternarTravada,
  camadaDoShape,
  camadasDoDoc,
  criarCamada,
  moverCamada,
  removerCamada,
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

  it('move para cima troca de posição com a anterior', () => {
    const r = moverCamada(tres, 'paredes', 'cima')
    expect(r.map((c) => c.id)).toEqual(['paredes', 'base', 'rotulos'])
  })

  it('move para baixo troca de posição com a seguinte', () => {
    const r = moverCamada(tres, 'paredes', 'baixo')
    expect(r.map((c) => c.id)).toEqual(['base', 'rotulos', 'paredes'])
  })

  it('mover a primeira para cima é no-op', () => {
    const r = moverCamada(tres, 'base', 'cima')
    expect(r.map((c) => c.id)).toEqual(['base', 'paredes', 'rotulos'])
  })

  it('mover a última para baixo é no-op', () => {
    const r = moverCamada(tres, 'rotulos', 'baixo')
    expect(r.map((c) => c.id)).toEqual(['base', 'paredes', 'rotulos'])
  })

  it('id inexistente é no-op (mesma referência de lista)', () => {
    const r = moverCamada(tres, 'fantasma', 'cima')
    expect(r).toBe(tres)
  })
})
