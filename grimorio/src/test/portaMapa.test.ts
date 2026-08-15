import { describe, it, expect } from 'vitest'
import { COR_SALA_PADRAO, corDoVao, proximoNumero } from '../lib/portaMapa'

const sala = (color: string) => ({ meta: { peca: 'sala' }, props: { color } })

describe('corDoVao', () => {
  it('sem nada embaixo, usa a cor padrão de sala', () => {
    expect(corDoVao([])).toBe(COR_SALA_PADRAO)
  })

  it('pega a cor da sala embaixo', () => {
    expect(corDoVao([sala('blue')])).toBe('blue')
  })

  it('com várias formas empilhadas, vale a sala mais ao topo', () => {
    // getShapesAtPoint devolve top-most primeiro
    // (node_modules/@tldraw/editor/src/lib/editor/Editor.ts:5498)
    expect(corDoVao([sala('red'), sala('green')])).toBe('red')
  })

  it('ignora forma que não é sala', () => {
    const parede = { meta: { peca: 'parede' }, props: { color: 'white' } }
    expect(corDoVao([parede, sala('green')])).toBe('green')
  })

  it('ignora forma sem identidade de peça (desenho antigo)', () => {
    const solta = { meta: {}, props: { color: 'orange' } }
    expect(corDoVao([solta])).toBe(COR_SALA_PADRAO)
  })

  it('ignora sala sem cor legível', () => {
    const semCor = { meta: { peca: 'sala' }, props: {} }
    expect(corDoVao([semCor])).toBe(COR_SALA_PADRAO)
  })
})

describe('proximoNumero', () => {
  it('começa em 1 quando não há marcador', () => {
    expect(proximoNumero([])).toBe(1)
  })

  it('continua do maior existente', () => {
    expect(proximoNumero(['1', '2', '3'])).toBe(4)
  })

  it('não repete número quando apagam um do meio', () => {
    expect(proximoNumero(['1', '3'])).toBe(4)
  })

  it('ignora rótulo que não é número', () => {
    expect(proximoNumero(['1', 'entrada', '  '])).toBe(2)
  })

  it('ignora número negativo e zero', () => {
    expect(proximoNumero(['-5', '0'])).toBe(1)
  })
})
