import { describe, expect, it } from 'vitest'
import { TECLA_PARA_FERRAMENTA, ferramentaDaTecla } from '../lib/atalhosPecasMapa'

const tecla = (key: string, extra: Partial<Record<'shiftKey' | 'ctrlKey' | 'metaKey' | 'altKey', boolean>> = {}) => ({
  key,
  shiftKey: false,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  ...extra,
})

/** Atalhos que o tldraw já ocupa (tldraw/src/lib/ui/hooks/useTools.tsx). */
const NATIVOS = ['v', 'h', 'e', 'd', 'b', 'x', 'o', 'a', 'l', 'f', 't', 'n', 'k']

describe('teclas das peças de construção', () => {
  it('as quatro mais usadas têm a inicial em português', () => {
    expect(ferramentaDaTecla(tecla('s'))).toBe('sala-mapa')
    expect(ferramentaDaTecla(tecla('c'))).toBe('corredor-mapa')
    expect(ferramentaDaTecla(tecla('m'))).toBe('muralha-mapa')
    expect(ferramentaDaTecla(tecla('p'))).toBe('porta-mapa')
  })

  it('as raras entram como shift da PARCEIRA de uso', () => {
    // torre só existe encostada no canto da muralha; escada, como o corredor, é passagem
    expect(ferramentaDaTecla(tecla('m', { shiftKey: true }))).toBe('torre-mapa')
    expect(ferramentaDaTecla(tecla('c', { shiftKey: true }))).toBe('escada-mapa')
    expect(ferramentaDaTecla(tecla('s', { shiftKey: true }))).toBe('sala-poligono-mapa')
  })

  it('`r` arma o retângulo DO MAPA, não o geo nativo', () => {
    // o nativo não tem canto arredondado, não entra na banda de empilhamento e não aparece
    // na legenda: sai parecido e se comporta diferente
    expect(ferramentaDaTecla(tecla('r'))).toBe('retangulo-mapa')
  })

  it('não pisa em NENHUM atalho nativo do tldraw', () => {
    for (const nativo of NATIVOS) {
      expect(ferramentaDaTecla(tecla(nativo)), `tecla ${nativo}`).toBeNull()
    }
  })

  it('modificador de sistema derruba o atalho', () => {
    // Ctrl+S é salvar e Ctrl+P é imprimir em qualquer programa
    for (const mod of ['ctrlKey', 'metaKey', 'altKey'] as const) {
      expect(ferramentaDaTecla(tecla('s', { [mod]: true })), mod).toBeNull()
      expect(ferramentaDaTecla(tecla('p', { [mod]: true })), mod).toBeNull()
    }
  })

  it('maiúscula chega como shift, não como outra tecla', () => {
    expect(ferramentaDaTecla(tecla('S', { shiftKey: true }))).toBe('sala-poligono-mapa')
  })

  it('tecla sem peça devolve null', () => {
    for (const k of ['z', 'q', 'Enter', 'ArrowUp', ' ']) {
      expect(ferramentaDaTecla(tecla(k)), k).toBeNull()
    }
  })

  it('nenhuma combinação está duplicada', () => {
    const chaves = TECLA_PARA_FERRAMENTA.map((a) => `${a.shift ? 'shift+' : ''}${a.tecla}`)
    expect(new Set(chaves).size).toBe(chaves.length)
  })
})
