import { describe, it, expect } from 'vitest'
import { pedirTexto, useDialogo } from '../components/dialogos'

describe('pedirTexto', () => {
  it('resolve com o texto informado ao confirmar', async () => {
    const p = pedirTexto('Nome da pasta:')
    useDialogo.getState().responder('Aventuras')
    expect(await p).toBe('Aventuras')
  })

  it('faz trim do texto', async () => {
    const p = pedirTexto('Nome:')
    useDialogo.getState().responder('  Gandalf  ')
    expect(await p).toBe('Gandalf')
  })

  it('resolve null ao cancelar', async () => {
    const p = pedirTexto('Nome:')
    useDialogo.getState().responder(null)
    expect(await p).toBeNull()
  })

  it('texto vazio ou só espaços vira null (mesma semântica de "if (!nome) return")', async () => {
    const vazio = pedirTexto('Nome:')
    useDialogo.getState().responder('')
    expect(await vazio).toBeNull()

    const espacos = pedirTexto('Nome:')
    useDialogo.getState().responder('   ')
    expect(await espacos).toBeNull()
  })

  it('abrir um novo pedido cancela o anterior pendente (resolve null)', async () => {
    const primeiro = pedirTexto('Primeiro:')
    const segundo = pedirTexto('Segundo:')
    expect(await primeiro).toBeNull()
    useDialogo.getState().responder('ok')
    expect(await segundo).toBe('ok')
  })

  it('usa o valor inicial no pedido (prefill do renomear)', () => {
    pedirTexto('Novo nome:', 'Antigo')
    expect(useDialogo.getState().pedido?.valorInicial).toBe('Antigo')
    useDialogo.getState().responder(null)
  })

  it('leva a sugestão até o pedido (chip do prefixo de sub-cenário)', () => {
    pedirTexto('Nome do sub-cenário:', '', 'OK', 'Reino de Goa: ')
    expect(useDialogo.getState().pedido?.sugestao).toBe('Reino de Goa: ')
    useDialogo.getState().responder(null)
  })

  it('chamada sem sugestão deixa o campo indefinido (os outros call sites não mudam)', () => {
    pedirTexto('Nome da pasta:')
    expect(useDialogo.getState().pedido?.sugestao).toBeUndefined()
    useDialogo.getState().responder(null)
  })
})
