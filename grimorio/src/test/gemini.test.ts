import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetch as fetchTauri } from '@tauri-apps/plugin-http'
import { extrairTexto, gerarConteudo, montarBody, parsearChaves } from '../lib/gemini'

// gemini.ts usa o fetch do plugin HTTP do Tauri (não o global): mocka o módulo.
vi.mock('@tauri-apps/plugin-http', () => ({ fetch: vi.fn() }))
const fetchMock = vi.mocked(fetchTauri)

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

// Respostas fake do fetch (nunca batem na API real; chaves são fictícias via stubEnv).
const respOk = (texto: string) => ({
  ok: true,
  status: 200,
  json: async () => ({ candidates: [{ content: { parts: [{ text: texto }] } }] }),
})
const respStatus = (status: number) => ({ ok: false, status })

const pedido = { system: 'p', historico: [{ papel: 'user' as const, texto: 'oi' }] }

describe('gerarConteudo (round-robin com fetch mockado)', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    // 3 chaves fictícias: cobre rotação/retry sem tocar no .env real nem na rede.
    vi.stubEnv('GEMINI_API_KEYS', 'k1,k2,k3')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('sucesso na 1ª chave', async () => {
    fetchMock.mockResolvedValue(respOk('resposta') as never)
    expect(await gerarConteudo(pedido)).toBe('resposta')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('429 na 1ª chave → tenta a próxima e tem sucesso', async () => {
    fetchMock.mockResolvedValueOnce(respStatus(429) as never).mockResolvedValueOnce(respOk('segunda') as never)
    expect(await gerarConteudo(pedido)).toBe('segunda')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('erro de rede na 1ª chave → tenta a próxima e tem sucesso', async () => {
    fetchMock.mockRejectedValueOnce(new Error('falha de rede')).mockResolvedValueOnce(respOk('recuperou') as never)
    expect(await gerarConteudo(pedido)).toBe('recuperou')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('todas as chaves em 429 → lança erro sem vazar a chave', async () => {
    fetchMock.mockResolvedValue(respStatus(429) as never)
    let erro: Error | null = null
    try {
      await gerarConteudo(pedido)
    } catch (e) {
      erro = e as Error
    }
    expect(erro?.message).toMatch(/IA indisponível após tentar todas as chaves/)
    expect(erro?.message).not.toMatch(/k1|k2|k3/) // a chave nunca aparece no erro
    expect(fetchMock).toHaveBeenCalledTimes(3) // uma tentativa por chave
  })
})
