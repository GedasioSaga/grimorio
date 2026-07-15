import { describe, it, expect } from 'vitest'
import { extrairTexto, montarBody, parsearChaves } from '../lib/gemini'

describe('parsearChaves', () => {
  it('separa por vírgula e apara espaços', () => {
    expect(parsearChaves(' k1 , k2,k3 ')).toEqual(['k1', 'k2', 'k3'])
  })
  it('vazio/undefined → []', () => {
    expect(parsearChaves(undefined)).toEqual([])
    expect(parsearChaves(' , ,')).toEqual([])
  })
})

describe('montarBody', () => {
  it('mapeia papel→role e injeta system_instruction', () => {
    const body = montarBody('persona', [
      { papel: 'user', texto: 'oi' },
      { papel: 'model', texto: 'olá' },
      { papel: 'user', texto: 'analise' },
    ])
    expect(body.system_instruction.parts[0].text).toBe('persona')
    expect(body.contents.map((c) => c.role)).toEqual(['user', 'model', 'user'])
    expect(body.contents[0].parts).toEqual([{ text: 'oi' }])
  })
  it('anexa imagens só na ÚLTIMA mensagem user', () => {
    const img = { mimeType: 'image/png', base64: 'AAA' }
    const body = montarBody('p', [
      { papel: 'user', texto: 'a' },
      { papel: 'user', texto: 'b' },
    ], [img])
    expect(body.contents[0].parts).toEqual([{ text: 'a' }])
    expect(body.contents[1].parts).toEqual([
      { text: 'b' },
      { inline_data: { mime_type: 'image/png', data: 'AAA' } },
    ])
  })
})

describe('extrairTexto', () => {
  it('junta parts de texto do primeiro candidato', () => {
    const resp = { candidates: [{ content: { parts: [{ text: 'olá ' }, { text: 'mestre' }] } }] }
    expect(extrairTexto(resp)).toBe('olá mestre')
  })
  it('resposta vazia/malformada → string vazia', () => {
    expect(extrairTexto({})).toBe('')
    expect(extrairTexto(null)).toBe('')
    expect(extrairTexto({ candidates: [] })).toBe('')
  })
})
