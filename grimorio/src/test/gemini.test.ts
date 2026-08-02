import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetch as fetchTauri } from '@tauri-apps/plugin-http'
import { consumirSse, extrairTexto, gerarConteudo, montarBody } from '../lib/gemini'

// gemini.ts usa o fetch do plugin HTTP do Tauri (não o global): mocka o módulo.
vi.mock('@tauri-apps/plugin-http', () => ({ fetch: vi.fn() }))
const fetchMock = vi.mocked(fetchTauri)

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

/** Um evento SSE como o Gemini emite com alt=sse. */
function evento(texto: string): string {
  return `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: texto }] } }] })}\n\n`
}

describe('consumirSse', () => {
  it('extrai o texto de eventos completos SEM aparar as bordas', () => {
    // o espaço de junção entre pedaços vive na borda: aparar aqui grudaria as palavras
    const { textos, resto } = consumirSse(`${evento('oi')}${evento(' mestre')}`)
    expect(textos).toEqual(['oi', ' mestre'])
    expect(resto).toBe('')
  })

  it('guarda o evento cortado no meio em vez de tentar parsear', () => {
    const inteiro = evento('completo')
    const cortado = 'data: {"candidates":[{"content":{"par'
    const { textos, resto } = consumirSse(inteiro + cortado)
    expect(textos).toEqual(['completo'])
    expect(resto).toBe(cortado)
  })

  it('junta o evento cortado com a continuação da chamada seguinte', () => {
    const inteiro = evento('final')
    const meio = inteiro.slice(0, 20)
    const primeira = consumirSse(meio)
    expect(primeira.textos).toEqual([])
    const segunda = consumirSse(primeira.resto + inteiro.slice(20))
    expect(segunda.textos).toEqual(['final'])
  })

  it('ignora linhas que não são data, comentários e [DONE]', () => {
    const { textos } = consumirSse(`: keepalive\nevent: message\ndata: [DONE]\n${evento('vale')}`)
    expect(textos).toEqual(['vale'])
  })

  it('evento com JSON quebrado não derruba os outros', () => {
    const { textos } = consumirSse(`data: {isso não é json}\n${evento('sobreviveu')}`)
    expect(textos).toEqual(['sobreviveu'])
  })
})

/** Corpo de resposta que entrega os pedaços na ordem dada, como o ReadableStream do plugin. */
function corpo(...pedacos: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder()
  return new ReadableStream({
    start(controlador) {
      for (const p of pedacos) controlador.enqueue(enc.encode(p))
      controlador.close()
    },
  })
}

const respStream = (...pedacos: string[]) => ({ ok: true, status: 200, body: corpo(...pedacos) })
const respTexto = (texto: string) => respStream(evento(texto))
const respStatus = (status: number) => ({ ok: false, status, body: null })

// 3 chaves fictícias injetadas: cobre rotação/retry sem tocar na rede.
const pedido = { system: 'p', historico: [{ papel: 'user' as const, texto: 'oi' }], chaves: ['k1', 'k2', 'k3'] }

describe('gerarConteudo (round-robin com fetch mockado)', () => {
  beforeEach(() => {
    fetchMock.mockReset()
  })

  it('sucesso na 1ª chave', async () => {
    fetchMock.mockResolvedValue(respTexto('resposta') as never)
    expect(await gerarConteudo(pedido)).toBe('resposta')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('429 na 1ª chave → tenta a próxima e tem sucesso', async () => {
    fetchMock.mockResolvedValueOnce(respStatus(429) as never).mockResolvedValueOnce(respTexto('segunda') as never)
    expect(await gerarConteudo(pedido)).toBe('segunda')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('erro de rede na 1ª chave → tenta a próxima e tem sucesso', async () => {
    fetchMock.mockRejectedValueOnce(new Error('falha de rede')).mockResolvedValueOnce(respTexto('recuperou') as never)
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

  it('resposta vazia/bloqueada não gasta as outras chaves', async () => {
    fetchMock.mockResolvedValue(respStream('data: {"candidates":[]}\n\n') as never)
    await expect(gerarConteudo(pedido)).rejects.toThrow('A IA não retornou conteúdo.')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('gerarConteudo (streaming)', () => {
  beforeEach(() => {
    fetchMock.mockReset()
  })

  it('chama streamGenerateContent com alt=sse e o modelo pedido', async () => {
    fetchMock.mockResolvedValue(respTexto('ok') as never)
    await gerarConteudo({ ...pedido, modelo: 'gemini-3-pro' })
    expect(fetchMock.mock.calls[0][0]).toContain('/gemini-3-pro:streamGenerateContent?alt=sse')
  })

  it('avisa o texto ACUMULADO a cada pedaço e devolve o total', async () => {
    fetchMock.mockResolvedValue(respStream(evento('Era uma'), evento(' vez'), evento(' um dragão')) as never)
    const parciais: string[] = []
    const total = await gerarConteudo({ ...pedido, aoReceber: (p) => parciais.push(p) })
    expect(parciais).toEqual(['Era uma', 'Era uma vez', 'Era uma vez um dragão'])
    expect(total).toBe('Era uma vez um dragão')
  })

  it('evento partido entre dois pedaços da rede vira um texto só', async () => {
    const e = evento('inteiro')
    fetchMock.mockResolvedValue(respStream(e.slice(0, 15), e.slice(15)) as never)
    expect(await gerarConteudo(pedido)).toBe('inteiro')
  })

  it('falha DEPOIS do primeiro pedaço não repete a resposta em outra chave', async () => {
    const enc = new TextEncoder()
    let leituras = 0
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      // entrega no 1º read e só quebra no 2º: `error()` esvazia a fila, então enfileirar
      // e quebrar no mesmo tique perderia o pedaço antes de alguém lê-lo
      body: new ReadableStream({
        pull(c) {
          if (leituras++ === 0) c.enqueue(enc.encode(evento('começou')))
          else c.error(new Error('conexão caiu'))
        },
      }),
    } as never)
    await expect(gerarConteudo(pedido)).rejects.toThrow(/interrompida no meio/)
    expect(fetchMock).toHaveBeenCalledTimes(1) // não tentou k2/k3
  })
})
