// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'

/**
 * Teste de fumaça dos componentes do Mapa.
 *
 * Existe por causa de um sumiço real: a toolbar do mapa desapareceu da tela sem erro
 * nenhum no console. Quando um componente React vira `undefined` — ciclo de import, export
 * renomeado, arquivo movido —, o React não renderiza nada e não reclama; a peça só some.
 * `tsc` também não pega ciclo de import, porque os tipos continuam existindo.
 *
 * Importar de verdade cada módulo e conferir que o export é uma função cobre essa classe
 * inteira: se qualquer import circular aparecer, o valor chega `undefined` aqui e o teste
 * quebra no CI em vez de sumir na cara do usuário.
 */

describe('componentes do Mapa carregam e exportam função', () => {
  it('MapaToolbar', async () => {
    const { MapaToolbar } = await import('../components/MapaToolbar')
    expect(typeof MapaToolbar).toBe('function')
  })

  it('GavetaPecas', async () => {
    const { GavetaPecas } = await import('../components/GavetaPecas')
    expect(typeof GavetaPecas).toBe('function')
  })

  it('ComandosMapa', async () => {
    const { ComandosMapa } = await import('../components/ComandosMapa')
    expect(typeof ComandosMapa).toBe('function')
  })

  it('AcoesMapaIA', async () => {
    const { AcoesMapaIA } = await import('../components/AcoesMapaIA')
    expect(typeof AcoesMapaIA).toBe('function')
  })

  it('ControleZoom', async () => {
    const { ControleZoom } = await import('../components/ControleZoom')
    expect(typeof ControleZoom).toBe('function')
  })

  it('PainelPropriedades e a ponte de seleção', async () => {
    const modulo = await import('../components/PainelPropriedades')
    expect(typeof modulo.PainelPropriedades).toBe('function')
    expect(typeof modulo.SelecaoPropriedadesBridge).toBe('function')
  })

  it('PainelCamadas', async () => {
    const { PainelCamadas } = await import('../components/PainelCamadas')
    expect(typeof PainelCamadas).toBe('function')
  })

  it('ReguasMapa e MedidasMapa', async () => {
    expect(typeof (await import('../components/ReguasMapa')).ReguasMapa).toBe('function')
    expect(typeof (await import('../components/MedidasMapa')).MedidasMapa).toBe('function')
  })
})

describe('shapes próprios do Mapa registram tipo e props', () => {
  it('SalaMapaShapeUtil', async () => {
    const { SalaMapaShapeUtil } = await import('../components/SalaMapaShape')
    expect(SalaMapaShapeUtil.type).toBe('sala-mapa')
    // props precisam existir, senão o tldraw rejeita o shape ao carregar o arquivo
    expect(Object.keys(SalaMapaShapeUtil.props)).toEqual(['w', 'h', 'estado', 'rotulo', 'cor', 'cenarioId'])
  })

  it('PortaShapeUtil', async () => {
    const { PortaShapeUtil } = await import('../components/PortaShape')
    expect(PortaShapeUtil.type).toBe('porta-mapa')
    expect(Object.keys(PortaShapeUtil.props)).toEqual(['w', 'h', 'estado'])
  })

  it('LinhaMapaShapeUtil', async () => {
    const { LinhaMapaShapeUtil } = await import('../components/LinhaMapaShape')
    expect(LinhaMapaShapeUtil.type).toBe('linha-mapa')
    expect(Object.keys(LinhaMapaShapeUtil.props)).toEqual(['dx', 'dy'])
  })

  it('SimboloMapaShapeUtil', async () => {
    const { SimboloMapaShapeUtil } = await import('../components/SimboloMapaShape')
    expect(SimboloMapaShapeUtil.type).toBe('simbolo-mapa')
    expect(Object.keys(SimboloMapaShapeUtil.props)).toEqual(['w', 'h', 'simbolo', 'rotulo'])
  })

  it('SalaPoligonoMapaShapeUtil', async () => {
    const { SalaPoligonoMapaShapeUtil } = await import('../components/SalaPoligonoMapaShape')
    expect(SalaPoligonoMapaShapeUtil.type).toBe('sala-poligono-mapa')
    expect(Object.keys(SalaPoligonoMapaShapeUtil.props)).toEqual(['pontos', 'estado', 'rotulo', 'cor'])
  })

  it('CorredorMapaShapeUtil', async () => {
    const { CorredorMapaShapeUtil } = await import('../components/CorredorMapaShape')
    expect(CorredorMapaShapeUtil.type).toBe('corredor-mapa')
    expect(Object.keys(CorredorMapaShapeUtil.props)).toEqual(['w', 'h'])
  })

  it('EscadaMapaShapeUtil', async () => {
    const { EscadaMapaShapeUtil } = await import('../components/EscadaMapaShape')
    expect(EscadaMapaShapeUtil.type).toBe('escada-mapa')
    expect(Object.keys(EscadaMapaShapeUtil.props)).toEqual(['w', 'h'])
  })

  it('MuralhaMapaShapeUtil', async () => {
    const { MuralhaMapaShapeUtil } = await import('../components/MuralhaMapaShape')
    expect(MuralhaMapaShapeUtil.type).toBe('muralha-mapa')
    expect(Object.keys(MuralhaMapaShapeUtil.props)).toEqual(['w', 'h'])
  })

  it('TorreMapaShapeUtil', async () => {
    const { TorreMapaShapeUtil } = await import('../components/TorreMapaShape')
    expect(TorreMapaShapeUtil.type).toBe('torre-mapa')
    expect(Object.keys(TorreMapaShapeUtil.props)).toEqual(['w', 'h'])
  })

  it('cada shape próprio tem um tipo distinto — tipo repetido derruba o editor inteiro', async () => {
    const tipos = [
      (await import('../components/SalaMapaShape')).SalaMapaShapeUtil.type,
      (await import('../components/SalaPoligonoMapaShape')).SalaPoligonoMapaShapeUtil.type,
      (await import('../components/CorredorMapaShape')).CorredorMapaShapeUtil.type,
      (await import('../components/EscadaMapaShape')).EscadaMapaShapeUtil.type,
      (await import('../components/MuralhaMapaShape')).MuralhaMapaShapeUtil.type,
      (await import('../components/TorreMapaShape')).TorreMapaShapeUtil.type,
      (await import('../components/LinhaMapaShape')).LinhaMapaShapeUtil.type,
      (await import('../components/PortaShape')).PortaShapeUtil.type,
      (await import('../components/SimboloMapaShape')).SimboloMapaShapeUtil.type,
      (await import('../components/CharacterCardShape')).CharacterCardShapeUtil.type,
      (await import('../components/CenarioCardShape')).CenarioCardShapeUtil.type,
      (await import('../components/ItemCardShape')).ItemCardShapeUtil.type,
    ]
    expect(new Set(tipos).size).toBe(tipos.length)
  })
})
