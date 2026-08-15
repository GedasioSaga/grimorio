import { describe, expect, it } from 'vitest'
import {
  atualizarLayoutSalvo,
  chaveDoEscopo,
  normalizarLayoutSalvo,
  normalizarLayoutTeia,
  paraFracao,
  podarLayout,
  posicoesEfetivas,
  type LayoutSalvo,
} from '../lib/grafoLayoutPersistido'

describe('normalizarLayoutSalvo', () => {
  it('arquivo vazio/ausente vira objeto vazio', () => {
    expect(normalizarLayoutSalvo(undefined)).toEqual({})
    expect(normalizarLayoutSalvo(null)).toEqual({})
    expect(normalizarLayoutSalvo({})).toEqual({})
  })

  it('mantém posições válidas', () => {
    expect(normalizarLayoutSalvo({ a: { x: 0.5, y: 0.25 } })).toEqual({ a: { x: 0.5, y: 0.25 } })
  })

  it('arquivo corrompido (JSON não é o objeto esperado) cai no automático em vez de quebrar', () => {
    expect(normalizarLayoutSalvo([1, 2, 3])).toEqual({})
    expect(normalizarLayoutSalvo('texto solto')).toEqual({})
    expect(normalizarLayoutSalvo(42)).toEqual({})
  })

  it('descarta só a entrada com campo de tipo errado, preserva as outras', () => {
    expect(normalizarLayoutSalvo({
      a: { x: 1, y: 2 },
      b: { x: 'não é número', y: 2 },
      c: { x: 1 }, // falta y
      d: null,
      e: 'string',
    })).toEqual({ a: { x: 1, y: 2 } })
  })

  it('NaN e Infinity não são posição válida', () => {
    expect(normalizarLayoutSalvo({ a: { x: NaN, y: 1 }, b: { x: Infinity, y: 1 } })).toEqual({})
  })
})

describe('normalizarLayoutTeia', () => {
  it('arquivo ausente/corrompido vira objeto vazio', () => {
    expect(normalizarLayoutTeia(undefined)).toEqual({})
    expect(normalizarLayoutTeia('lixo')).toEqual({})
    expect(normalizarLayoutTeia([1, 2])).toEqual({})
  })

  it('normaliza cada escopo independentemente', () => {
    expect(normalizarLayoutTeia({
      cofre: { a: { x: 0.1, y: 0.2 } },
      'campanha:x': { b: { x: 'errado', y: 1 } },
    })).toEqual({ cofre: { a: { x: 0.1, y: 0.2 } }, 'campanha:x': {} })
  })
})

describe('chaveDoEscopo', () => {
  it('cofre inteiro é "cofre"; campanha é prefixada', () => {
    expect(chaveDoEscopo(null)).toBe('cofre')
    expect(chaveDoEscopo('camp1')).toBe('campanha:camp1')
  })
})

describe('posicoesEfetivas — troca de escopo', () => {
  const automatico = { a: { x: 100, y: 200 }, b: { x: 300, y: 400 } }
  const tamanho = { largura: 1000, altura: 500 }

  it('nó novo (sem posição salva) usa o automático', () => {
    const out = posicoesEfetivas({}, automatico, tamanho)
    expect(out).toEqual(automatico)
  })

  it('nó com posição salva usa a fração convertida para pixel da moldura atual', () => {
    const salvo: LayoutSalvo = { a: { x: 0.5, y: 0.5 } }
    const out = posicoesEfetivas(salvo, automatico, tamanho)
    expect(out.a).toEqual({ x: 500, y: 250 })
    expect(out.b).toEqual({ x: 300, y: 400 }) // b não foi arrumado, cai no automático
  })

  it('nó removido (salvo mas fora do automático) não aparece no resultado', () => {
    const salvo: LayoutSalvo = { a: { x: 0.1, y: 0.1 }, fantasma: { x: 0.9, y: 0.9 } }
    const out = posicoesEfetivas(salvo, automatico, tamanho)
    expect(out.fantasma).toBeUndefined()
    expect(Object.keys(out).sort()).toEqual(['a', 'b'])
  })

  it('escopos diferentes dão desenhos diferentes para o mesmo automático', () => {
    const escopoA = posicoesEfetivas({ a: { x: 0, y: 0 } }, automatico, tamanho)
    const escopoB = posicoesEfetivas({ a: { x: 1, y: 1 } }, automatico, tamanho)
    expect(escopoA.a).not.toEqual(escopoB.a)
  })
})

describe('paraFracao', () => {
  it('converte pixel para fração da moldura', () => {
    expect(paraFracao({ x: 250, y: 100 }, { largura: 1000, altura: 500 })).toEqual({ x: 0.25, y: 0.2 })
  })

  it('moldura com dimensão zero não divide por zero', () => {
    expect(paraFracao({ x: 10, y: 10 }, { largura: 0, altura: 0 })).toEqual({ x: 0, y: 0 })
  })
})

describe('podarLayout', () => {
  it('remove ids que não estão mais na teia', () => {
    const salvo: LayoutSalvo = { a: { x: 0, y: 0 }, b: { x: 1, y: 1 } }
    expect(podarLayout(salvo, new Set(['a']))).toEqual({ a: { x: 0, y: 0 } })
  })
})

describe('atualizarLayoutSalvo', () => {
  it('grava a nova posição e poda quem saiu da teia', () => {
    const salvo: LayoutSalvo = { a: { x: 0, y: 0 }, removido: { x: 1, y: 1 } }
    const out = atualizarLayoutSalvo(salvo, new Set(['a', 'b']), 'b', { x: 0.7, y: 0.3 })
    expect(out).toEqual({ a: { x: 0, y: 0 }, b: { x: 0.7, y: 0.3 } })
  })
})
