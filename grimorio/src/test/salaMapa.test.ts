import { describe, it, expect } from 'vitest'
import { aparenciaDaSala, quebrarRotulo, ESTADOS_SALA } from '../lib/salaMapa'

describe('aparenciaDaSala', () => {
  it('pendente é vermelha e limpa é azul — a cor É a informação', () => {
    expect(aparenciaDaSala('pendente').preenchimento).toBe('#7d3b3b')
    expect(aparenciaDaSala('limpa').preenchimento).toBe('#40596b')
  })

  it('todos os estados têm contorno e cor de texto', () => {
    for (const estado of ESTADOS_SALA) {
      const a = aparenciaDaSala(estado)
      expect(a.contorno).toBeTruthy()
      expect(a.texto).toBeTruthy()
      expect(a.estado).toBe(estado)
    }
  })

  it('estado desconhecido vira sem-info em vez de sala invisível', () => {
    expect(aparenciaDaSala('trono').estado).toBe('sem-info')
    expect(aparenciaDaSala('').estado).toBe('sem-info')
  })
})

describe('quebrarRotulo', () => {
  it('nome vazio não gera linha', () => {
    expect(quebrarRotulo('', 100, 11)).toEqual([])
    expect(quebrarRotulo('   ', 100, 11)).toEqual([])
  })

  it('nome curto cabe numa linha', () => {
    expect(quebrarRotulo('Salão', 200, 11)).toEqual(['Salão'])
  })

  it('quebra nome longo em sala estreita', () => {
    const linhas = quebrarRotulo('Sala do Depósito Seguro', 70, 11)
    expect(linhas.length).toBeGreaterThan(1)
    expect(linhas.join(' ')).toBe('Sala do Depósito Seguro')
  })

  it('palavra maior que a largura não some — fica sozinha na linha', () => {
    const linhas = quebrarRotulo('Contrarrevolucionário', 40, 11)
    expect(linhas).toEqual(['Contrarrevolucionário'])
  })

  it('espaços extras não viram linha vazia', () => {
    expect(quebrarRotulo('  Sala   dos   Guardas  ', 200, 11)).toEqual(['Sala dos Guardas'])
  })
})
