// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  JANELAS,
  JANELA_PADRAO,
  janelaSalva,
  mensagensComParcialInterrompido,
  normalizarChat,
  recortarJanela,
  salvarJanela,
} from '../lib/chatIA'

describe('normalizarChat', () => {
  it('aceita formato { mensagens: [...] }', () => {
    const raw = { mensagens: [{ papel: 'user', texto: 'oi', em: '2026-01-01' }] }
    expect(normalizarChat(raw)).toEqual([{ papel: 'user', texto: 'oi', em: '2026-01-01' }])
  })
  it('descarta entradas inválidas e repara "em" ausente', () => {
    const raw = { mensagens: [{ papel: 'model', texto: 'olá' }, { papel: 'x', texto: 'não' }, null, { texto: 'sem papel' }] }
    expect(normalizarChat(raw)).toEqual([{ papel: 'model', texto: 'olá', em: '' }])
  })
  it('lixo → []', () => {
    expect(normalizarChat(null)).toEqual([])
    expect(normalizarChat('oi')).toEqual([])
  })

  it('preserva a marca de interrompida', () => {
    const raw = { mensagens: [{ papel: 'model', texto: 'cortou', em: '2026-01-01', interrompida: true }] }
    expect(normalizarChat(raw)).toEqual([{ papel: 'model', texto: 'cortou', em: '2026-01-01', interrompida: true }])
  })
})

describe('mensagensComParcialInterrompido', () => {
  const base = [{ papel: 'user' as const, texto: 'oi', em: '2026-01-01' }]

  it('sem isso, o texto que já chegou some da conversa quando a requisição falha no meio', () => {
    // reproduz o bug: nada persiste o `parcial` do state quando o catch é acionado
    const parcialQueChegouAntesDeFalhar = 'Era uma vez um dragão que'
    const conversaPersistidaNoCatchAtual = base // hoje: catch só faz setErro; nada é anexado
    expect(conversaPersistidaNoCatchAtual).toHaveLength(1)
    expect(mensagensComParcialInterrompido(base, parcialQueChegouAntesDeFalhar)).toHaveLength(2)
  })

  it('anexa o parcial como mensagem do modelo marcada como interrompida', () => {
    const out = mensagensComParcialInterrompido(base, 'Era uma vez')
    expect(out).not.toBeNull()
    expect(out![1]).toMatchObject({ papel: 'model', texto: 'Era uma vez', interrompida: true })
    expect(typeof out![1].em).toBe('string')
  })

  it('null ou vazio (nada chegou ainda) não gera mensagem', () => {
    expect(mensagensComParcialInterrompido(base, null)).toBeNull()
    expect(mensagensComParcialInterrompido(base, '')).toBeNull()
    expect(mensagensComParcialInterrompido(base, '   ')).toBeNull()
  })
})

describe('janela de histórico', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('padrão é 20, como sempre foi', () => {
    expect(JANELA_PADRAO).toBe(20)
    expect(janelaSalva()).toBe(20)
  })

  it('guarda a escolha e ignora valor fora da lista', () => {
    salvarJanela(40)
    expect(janelaSalva()).toBe(40)
    localStorage.setItem('grimorio.janelaIA', '7')
    expect(janelaSalva()).toBe(JANELA_PADRAO)
  })

  it('0 ("tudo") é uma escolha válida', () => {
    expect(JANELAS).toContain(0)
    salvarJanela(0)
    expect(janelaSalva()).toBe(0)
  })
})

describe('recortarJanela', () => {
  const conversa = Array.from({ length: 25 }, (_, i) => i)

  it('conversa menor que a janela vai inteira, sem corte', () => {
    expect(recortarJanela([1, 2, 3], 20)).toEqual({ enviadas: [1, 2, 3], cortadas: 0 })
  })

  it('manda as ÚLTIMAS e conta quantas ficaram de fora', () => {
    const { enviadas, cortadas } = recortarJanela(conversa, 20)
    expect(enviadas[0]).toBe(5)
    expect(enviadas).toHaveLength(20)
    expect(cortadas).toBe(5)
  })

  it('janela exatamente do tamanho da conversa não corta nada', () => {
    expect(recortarJanela(conversa, 25).cortadas).toBe(0)
  })

  it('janela 0 manda tudo', () => {
    expect(recortarJanela(conversa, 0)).toEqual({ enviadas: conversa, cortadas: 0 })
  })
})
