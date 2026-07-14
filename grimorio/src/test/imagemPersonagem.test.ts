import { describe, expect, it } from 'vitest'
import { adicionarImagem, removerImagem } from '../lib/imagemPersonagem'

describe('imagemPersonagem', () => {
  it('adiciona uma imagem nova ao fim da lista', () => {
    expect(adicionarImagem([], 'a/x.png')).toEqual([{ rel: 'a/x.png' }])
  })

  it('não duplica imagem com o mesmo rel', () => {
    const lista = [{ rel: 'a/x.png' }]
    expect(adicionarImagem(lista, 'a/x.png')).toBe(lista) // mesma referência: no-op
  })

  it('remove imagem por rel', () => {
    const lista = [{ rel: 'a/x.png' }, { rel: 'a/y.png' }]
    expect(removerImagem(lista, 'a/x.png')).toEqual([{ rel: 'a/y.png' }])
  })

  it('remover rel inexistente devolve lista equivalente', () => {
    const lista = [{ rel: 'a/x.png' }]
    expect(removerImagem(lista, 'nao/existe.png')).toEqual([{ rel: 'a/x.png' }])
  })

  it('preserva legenda existente ao remover outra imagem', () => {
    const lista = [{ rel: 'a/x.png', legenda: 'oi' }, { rel: 'a/y.png' }]
    expect(removerImagem(lista, 'a/y.png')).toEqual([{ rel: 'a/x.png', legenda: 'oi' }])
  })
})
