import { describe, it, expect } from 'vitest'
import { CORES_SALA, aparenciaDaSala, quebrarRotulo, ESTADOS_SALA } from '../lib/salaMapa'

describe('aparenciaDaSala', () => {
  it('pendente é vermelha e limpa é azul — a cor É a informação', () => {
    expect(aparenciaDaSala('pendente').preenchimento).toBe('#9c4f4a')
    expect(aparenciaDaSala('limpa').preenchimento).toBe('#43698c')
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

describe('cor escolhida à mão', () => {
  it('sobrepõe o preenchimento do estado', () => {
    const a = aparenciaDaSala('pendente', '#3f6b4a')
    expect(a.preenchimento).toBe('#3f6b4a')
  })

  it('não mexe no contorno nem na cor do texto — trocar uma cor não vira trocar três', () => {
    const padrao = aparenciaDaSala('pendente')
    const custom = aparenciaDaSala('pendente', '#3f6b4a')
    expect(custom.contorno).toBe(padrao.contorno)
    expect(custom.texto).toBe(padrao.texto)
  })

  it('sem cor escolhida, manda o estado', () => {
    expect(aparenciaDaSala('limpa', undefined).preenchimento).toBe('#43698c')
    expect(aparenciaDaSala('limpa', '').preenchimento).toBe('#43698c')
  })

  it('o estado continua sendo o estado, mesmo com cor trocada', () => {
    expect(aparenciaDaSala('pendente', '#3f6b4a').estado).toBe('pendente')
  })

  it('toda cor da paleta é hex válido e tem nome', () => {
    for (const cor of CORES_SALA) {
      expect(cor.valor, cor.id).toMatch(/^#[0-9a-f]{6}$/)
      expect(cor.nome.length, cor.id).toBeGreaterThan(0)
    }
  })

  it('cor clara (marfim) vira texto escuro sozinha — senão o rótulo some', () => {
    const marfim = CORES_SALA.find((c) => c.id === 'marfim')!
    const a = aparenciaDaSala('pendente', marfim.valor)
    expect(a.preenchimento).toBe(marfim.valor)
    expect(a.texto).toBe('#1a1a1a')
  })

  it('cor escura continua com texto claro', () => {
    expect(aparenciaDaSala('sem-info').texto).toBe('#efefef')
  })
})
