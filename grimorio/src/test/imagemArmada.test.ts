import { describe, it, expect, beforeEach } from 'vitest'
import { armarImagem, imagemArmadaSrc, assinarImagemArmada } from '../lib/imagemArmada'

describe('imagemArmada', () => {
  beforeEach(() => armarImagem(null))

  it('guarda o src armado', () => {
    armarImagem('a.png')
    expect(imagemArmadaSrc()).toBe('a.png')
  })
  it('desarma com null', () => {
    armarImagem('a.png')
    armarImagem(null)
    expect(imagemArmadaSrc()).toBeNull()
  })
  it('notifica assinantes na mudança', () => {
    let n = 0
    const desassinar = assinarImagemArmada(() => { n += 1 })
    armarImagem('a.png')
    armarImagem(null)
    desassinar()
    armarImagem('b.png')
    expect(n).toBe(2)
  })
  it('não notifica quando o valor não muda (no-op)', () => {
    let n = 0
    const desassinar = assinarImagemArmada(() => { n += 1 })
    armarImagem('a.png')
    armarImagem('a.png')
    desassinar()
    expect(n).toBe(1)
  })
})
