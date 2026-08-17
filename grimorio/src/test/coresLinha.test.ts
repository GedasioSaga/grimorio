import { describe, it, expect } from 'vitest'
import { COR_LINHA_PADRAO, CORES_LINHA, corDeForma } from '../lib/coresLinha'
import { CORES_SALA } from '../lib/salaMapa'

describe('CORES_LINHA', () => {
  it('começa pela cor padrão (o cinza-azulado que a divisória sempre teve)', () => {
    expect(CORES_LINHA[0]).toEqual({ id: 'padrao', nome: 'Padrão', valor: COR_LINHA_PADRAO })
  })

  it('reaproveita CORES_SALA inteira, sem duplicar a paleta', () => {
    expect(CORES_LINHA.slice(1)).toEqual(CORES_SALA)
  })
})

describe('corDeForma', () => {
  it('sala com cor escolhida à mão devolve essa cor', () => {
    expect(corDeForma({ type: 'sala-mapa', props: { cor: '#8a4340', estado: 'pendente' } })).toBe('#8a4340')
  })

  it('sala sem cor à mão devolve a cor do estado', () => {
    expect(corDeForma({ type: 'sala-mapa', props: { cor: '', estado: 'limpa' } })).toBe('#3f5568')
  })

  it('sala sem props devolve a cor de sem-info (estado padrão)', () => {
    expect(corDeForma({ type: 'sala-mapa' })).toBe('#3d3d3d')
  })

  it('linha com corPersonalizada devolve a cor gravada em meta', () => {
    expect(corDeForma({ type: 'line', meta: { corPersonalizada: '#3f6d86' } })).toBe('#3f6d86')
  })

  it('linha sem corPersonalizada devolve a cor padrão', () => {
    expect(corDeForma({ type: 'line', meta: {} })).toBe(COR_LINHA_PADRAO)
    expect(corDeForma({ type: 'line' })).toBe(COR_LINHA_PADRAO)
  })

  it('peça sem cor própria (porta, símbolo, muralha) devolve null', () => {
    expect(corDeForma({ type: 'porta-mapa', props: { estado: 'livre' } })).toBeNull()
    expect(corDeForma({ type: 'simbolo-mapa', props: { simbolo: 'bau' } })).toBeNull()
    expect(corDeForma({ type: 'muralha-mapa' })).toBeNull()
    expect(corDeForma({ type: 'geo' })).toBeNull()
  })
})
