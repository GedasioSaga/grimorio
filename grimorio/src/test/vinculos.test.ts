import { describe, it, expect } from 'vitest'
import {
  TIPO_PARTICIPA,
  adicionarVinculo,
  removerVinculo,
  vinculosDaEntidade,
  campanhasDe,
  idsDaCampanha,
  vinculosEntre,
  participacaoDe,
  normalizarVinculos,
} from '../lib/vinculos'
import type { Vinculo } from '../lib/types'

function v(parcial: Partial<Vinculo>): Vinculo {
  return {
    id: parcial.id ?? 'v1',
    deTipo: parcial.deTipo ?? 'personagem',
    deId: parcial.deId ?? 'a',
    paraTipo: parcial.paraTipo ?? 'personagem',
    paraId: parcial.paraId ?? 'b',
    tipo: parcial.tipo ?? 'conhece',
    notas: parcial.notas ?? '',
    criadoEm: parcial.criadoEm ?? '2026-07-15T00:00:00Z',
  }
}

describe('adicionarVinculo', () => {
  it('adiciona vínculo novo', () => {
    expect(adicionarVinculo([], v({}))).toHaveLength(1)
  })
  it('dedupe por (deId, paraId, tipo): retorna a MESMA lista', () => {
    const lista = [v({})]
    expect(adicionarVinculo(lista, v({ id: 'v2' }))).toBe(lista)
  })
  it('mesmo par com tipo diferente entra', () => {
    expect(adicionarVinculo([v({})], v({ id: 'v2', tipo: 'aliado de' }))).toHaveLength(2)
  })
})

describe('removerVinculo', () => {
  it('remove por id', () => {
    expect(removerVinculo([v({})], 'v1')).toHaveLength(0)
  })
})

describe('vinculosDaEntidade', () => {
  const lista = [
    v({}),                                                          // a → b
    v({ id: 'v2', deId: 'c', paraId: 'a', tipo: 'teme' }),          // c → a
    v({ id: 'v3', paraTipo: 'campanha', paraId: 'camp1', tipo: TIPO_PARTICIPA }), // a participa
  ]
  it('inclui as duas direções e exclui participação', () => {
    const r = vinculosDaEntidade(lista, 'a')
    expect(r.map((x) => x.id)).toEqual(['v1', 'v2'])
  })
})

describe('participação em campanha', () => {
  const lista = [
    v({ id: 'p1', paraTipo: 'campanha', paraId: 'camp1', tipo: TIPO_PARTICIPA }),          // a
    v({ id: 'p2', deTipo: 'cenario', deId: 'cen1', paraTipo: 'campanha', paraId: 'camp1', tipo: TIPO_PARTICIPA }),
    v({ id: 'p3', paraTipo: 'campanha', paraId: 'camp2', tipo: TIPO_PARTICIPA }),          // a em camp2
  ]
  it('campanhasDe lista as campanhas da entidade', () => {
    expect(campanhasDe(lista, 'a')).toEqual(['camp1', 'camp2'])
  })
  it('idsDaCampanha devolve as entidades participantes', () => {
    expect([...idsDaCampanha(lista, 'camp1')].sort()).toEqual(['a', 'cen1'])
  })
  it('participacaoDe acha o vínculo exato', () => {
    expect(participacaoDe(lista, 'a', 'camp1')?.id).toBe('p1')
    expect(participacaoDe(lista, 'a', 'zzz')).toBeUndefined()
  })
})

describe('vinculosEntre', () => {
  const lista = [v({}), v({ id: 'v2', deId: 'b', paraId: 'a', tipo: 'teme' }), v({ id: 'v3', paraId: 'c' })]
  it('acha relações do par nas duas direções', () => {
    expect(vinculosEntre(lista, 'a', 'b').map((x) => x.id)).toEqual(['v1', 'v2'])
  })
})

describe('normalizarVinculos', () => {
  it('aceita formato { vinculos: [...] }', () => {
    expect(normalizarVinculos({ vinculos: [v({})] })).toHaveLength(1)
  })
  it('descarta entradas sem deId/paraId/tipo', () => {
    const suja = { vinculos: [v({}), { id: 'x' }, null] }
    expect(normalizarVinculos(suja)).toHaveLength(1)
  })
  it('lixo total → lista vazia', () => {
    expect(normalizarVinculos(null)).toEqual([])
    expect(normalizarVinculos('oi')).toEqual([])
  })
})
