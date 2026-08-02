// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import {
  MODELOS_CONHECIDOS,
  MODELO_PADRAO,
  modeloSalvo,
  montarOpcoes,
  rotuloDoModelo,
  salvarModelo,
} from '../lib/modeloIA'

describe('modeloSalvo / salvarModelo', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('sem escolha → o padrão de sempre', () => {
    expect(modeloSalvo()).toBe(MODELO_PADRAO)
  })

  it('guarda e devolve a escolha', () => {
    salvarModelo('gemini-3-pro')
    expect(modeloSalvo()).toBe('gemini-3-pro')
  })

  it('escolher o padrão limpa a chave em vez de gravar', () => {
    salvarModelo('gemini-3-pro')
    salvarModelo(MODELO_PADRAO)
    expect(localStorage.getItem('grimorio.modeloIA')).toBeNull()
    expect(modeloSalvo()).toBe(MODELO_PADRAO)
  })

  it('vazio ou só espaço volta ao padrão', () => {
    salvarModelo('   ')
    expect(modeloSalvo()).toBe(MODELO_PADRAO)
  })
})

describe('montarOpcoes', () => {
  it('sem resposta da API → lista curada inteira (tela vazia seria pior)', () => {
    const opcoes = montarOpcoes([])
    expect(opcoes.map((o) => o.id)).toEqual(MODELOS_CONHECIDOS.map((m) => m.id))
    expect(opcoes.every((o) => o.conhecido)).toBe(true)
  })

  it('mostra só o que a chave enxerga, na ordem do mais barato ao mais caro', () => {
    const ids = montarOpcoes(['gemini-3-pro', 'gemini-3.1-flash-lite']).map((o) => o.id)
    expect(ids).toEqual(['gemini-3.1-flash-lite', 'gemini-3-pro'])
  })

  it('modelo aposentado pela Google some da lista', () => {
    const ids = montarOpcoes(['gemini-3.1-flash-lite']).map((o) => o.id)
    expect(ids).not.toContain('gemini-3-pro')
  })

  it('modelo novo entra no fim, marcado como desconhecido', () => {
    const opcoes = montarOpcoes(['gemini-3.1-flash-lite', 'gemini-9-ultra'])
    expect(opcoes.map((o) => o.id)).toEqual(['gemini-3.1-flash-lite', 'gemini-9-ultra'])
    expect(opcoes[1].conhecido).toBe(false)
  })

  it('descarta variantes que não conversam (embedding, imagem, áudio)', () => {
    const ids = montarOpcoes(['gemini-3.1-flash-lite', 'text-embedding-004', 'imagen-4', 'veo-3']).map((o) => o.id)
    expect(ids).toEqual(['gemini-3.1-flash-lite'])
  })
})

describe('rotuloDoModelo', () => {
  it('nome legível para conhecido, o próprio id para o resto', () => {
    expect(rotuloDoModelo('gemini-3.1-flash-lite')).toBe('Gemini 3.1 Flash-Lite')
    expect(rotuloDoModelo('gemini-9-ultra')).toBe('gemini-9-ultra')
  })
})
