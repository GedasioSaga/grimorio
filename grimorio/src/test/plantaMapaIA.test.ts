import { describe, expect, it } from 'vitest'
import {
  bboxDaPlantaEmQuadrados,
  contarSalasSobrepostas,
  formatarResumoInsercao,
  parsearPlantaIA,
  plantaParaEspecificacoes,
  proximaAreaLivre,
  type PlantaIA,
} from '../lib/plantaMapaIA'

const salaValida = { x: 0, y: 0, w: 4, h: 3, rotulo: 'Salão', estado: 'pendente' as const }

describe('parsearPlantaIA', () => {
  it('rejeita JSON inválido', () => {
    const r = parsearPlantaIA('{ isso não é json')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.erro).toMatch(/JSON válido/)
  })

  it('aceita JSON cercado em ```json ... ```', () => {
    const texto = '```json\n' + JSON.stringify({ salas: [salaValida] }) + '\n```'
    const r = parsearPlantaIA(texto)
    expect(r.ok).toBe(true)
  })

  it('rejeita resposta que não é objeto', () => {
    const r = parsearPlantaIA('[1,2,3]')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.erro).toMatch(/objeto JSON/)
  })

  it('rejeita planta vazia (sem salas, portas nem símbolos)', () => {
    const r = parsearPlantaIA(JSON.stringify({ salas: [], portas: [], simbolos: [] }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.erro).toMatch(/nenhuma peça/)
  })

  it('rejeita sala com campo ausente', () => {
    const r = parsearPlantaIA(JSON.stringify({ salas: [{ y: 0, w: 4, h: 3, rotulo: '', estado: 'pendente' }] }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.erro).toMatch(/Sala 1/)
  })

  it('rejeita sala com tipo errado (x como string)', () => {
    const r = parsearPlantaIA(
      JSON.stringify({ salas: [{ x: '0', y: 0, w: 4, h: 3, rotulo: '', estado: 'pendente' }] }),
    )
    expect(r.ok).toBe(false)
  })

  it('rejeita sala com w/h zero', () => {
    const r = parsearPlantaIA(JSON.stringify({ salas: [{ ...salaValida, w: 0 }] }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.erro).toMatch(/maior que zero/)
  })

  it('rejeita sala com w/h negativo', () => {
    const r = parsearPlantaIA(JSON.stringify({ salas: [{ ...salaValida, h: -2 }] }))
    expect(r.ok).toBe(false)
  })

  it('rejeita coordenada absurda', () => {
    const r = parsearPlantaIA(JSON.stringify({ salas: [{ ...salaValida, x: 999999999 }] }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.erro).toMatch(/absurda/)
  })

  it('rejeita estado de sala desconhecido', () => {
    const r = parsearPlantaIA(JSON.stringify({ salas: [{ ...salaValida, estado: 'radioativa' }] }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.erro).toMatch(/desconhecido/)
  })

  it('rejeita orientação de porta inválida', () => {
    const r = parsearPlantaIA(
      JSON.stringify({ salas: [salaValida], portas: [{ x: 1, y: 1, orientacao: 'diagonal', estado: 'livre' }] }),
    )
    expect(r.ok).toBe(false)
  })

  it('rejeita estado de porta desconhecido', () => {
    const r = parsearPlantaIA(
      JSON.stringify({ salas: [salaValida], portas: [{ x: 1, y: 1, orientacao: 'horizontal', estado: 'aberta' }] }),
    )
    expect(r.ok).toBe(false)
  })

  it('rejeita símbolo desconhecido', () => {
    const r = parsearPlantaIA(
      JSON.stringify({ salas: [salaValida], simbolos: [{ x: 1, y: 1, simbolo: 'catapulta' }] }),
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.erro).toMatch(/não é um símbolo conhecido/)
  })

  it('caminho feliz: salas, portas e símbolos válidos', () => {
    const planta = {
      salas: [salaValida, { x: 5, y: 0, w: 3, h: 3, rotulo: 'Corredor', estado: 'sem-info' }],
      portas: [{ x: 4, y: 1, orientacao: 'vertical', estado: 'trancada' }],
      simbolos: [{ x: 1, y: 1, simbolo: 'armadilha' }, { x: 6, y: 1, simbolo: 'marcador', rotulo: '3' }],
    }
    const r = parsearPlantaIA(JSON.stringify(planta))
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.planta.salas).toHaveLength(2)
      expect(r.planta.portas).toHaveLength(1)
      expect(r.planta.simbolos).toHaveLength(2)
      expect(r.planta.simbolos[1].rotulo).toBe('3')
      // símbolo sem rotulo explícito vira string vazia, não undefined
      expect(r.planta.simbolos[0].rotulo).toBe('')
    }
  })
})

describe('contarSalasSobrepostas', () => {
  it('nenhuma sobreposição', () => {
    expect(contarSalasSobrepostas([{ ...salaValida }, { ...salaValida, x: 10 }])).toBe(0)
  })

  it('sobreposição parcial entre duas salas conta as duas', () => {
    const a = { ...salaValida, x: 0, y: 0, w: 4, h: 4 }
    const b = { ...salaValida, x: 2, y: 2, w: 4, h: 4 }
    expect(contarSalasSobrepostas([a, b])).toBe(2)
  })

  it('sobreposição total (uma sala dentro da outra) também conta', () => {
    const a = { ...salaValida, x: 0, y: 0, w: 10, h: 10 }
    const b = { ...salaValida, x: 2, y: 2, w: 2, h: 2 }
    expect(contarSalasSobrepostas([a, b])).toBe(2)
  })

  it('encostar pela borda não é sobreposição', () => {
    const a = { ...salaValida, x: 0, y: 0, w: 4, h: 4 }
    const b = { ...salaValida, x: 4, y: 0, w: 4, h: 4 }
    expect(contarSalasSobrepostas([a, b])).toBe(0)
  })

  it('três salas: só o par que se toca conta (a terceira fica isolada)', () => {
    const a = { ...salaValida, x: 0, y: 0, w: 4, h: 4 }
    const b = { ...salaValida, x: 2, y: 2, w: 4, h: 4 }
    const c = { ...salaValida, x: 100, y: 100, w: 2, h: 2 }
    expect(contarSalasSobrepostas([a, b, c])).toBe(2)
  })
})

describe('bboxDaPlantaEmQuadrados', () => {
  it('envolve salas, portas e símbolos', () => {
    const planta: PlantaIA = {
      salas: [{ ...salaValida, x: 0, y: 0, w: 4, h: 3, estado: 'pendente' }],
      portas: [{ x: 10, y: 10, orientacao: 'horizontal', estado: 'livre' }],
      simbolos: [{ x: -1, y: -1, simbolo: 'armadilha', rotulo: '' }] as never, // x negativo só pra testar o min
    }
    const bbox = bboxDaPlantaEmQuadrados(planta)
    expect(bbox.x).toBeLessThanOrEqual(0)
    expect(bbox.w).toBeGreaterThan(0)
  })
})

describe('proximaAreaLivre', () => {
  it('sem obstáculos, usa o ponto preferido', () => {
    const r = proximaAreaLivre([], { w: 4, h: 3 }, { x: 10, y: 10 }, 1)
    expect(r).toEqual({ x: 10, y: 10 })
  })

  it('ponto preferido livre continua sendo usado', () => {
    const obstaculo = { x: 100, y: 100, w: 4, h: 4 }
    const r = proximaAreaLivre([obstaculo], { w: 4, h: 3 }, { x: 0, y: 0 }, 1)
    expect(r).toEqual({ x: 0, y: 0 })
  })

  it('ponto preferido colidindo empurra para a direita de tudo, sem sobrepor', () => {
    const obstaculo = { x: 0, y: 0, w: 10, h: 10 }
    const r = proximaAreaLivre([obstaculo], { w: 4, h: 3 }, { x: 2, y: 2 }, 1)
    expect(r.x).toBeGreaterThanOrEqual(obstaculo.x + obstaculo.w)
  })
})

describe('plantaParaEspecificacoes', () => {
  it('desloca a planta inteira para nascer na origem pedida', () => {
    const planta: PlantaIA = {
      salas: [{ x: 5, y: 5, w: 2, h: 2, rotulo: 'A', estado: 'pendente' }],
      portas: [],
      simbolos: [],
    }
    const specs = plantaParaEspecificacoes(planta, { xQuad: 0, yQuad: 0 })
    expect(specs).toHaveLength(1)
    expect(specs[0]).toMatchObject({ tipo: 'sala', xQuad: 0, yQuad: 0, wQuad: 2, hQuad: 2 })
  })

  it('marcador sem rotulo é numerado a partir do próximo número, na ordem da planta', () => {
    const planta: PlantaIA = {
      salas: [],
      portas: [],
      simbolos: [
        { x: 0, y: 0, simbolo: 'marcador', rotulo: '' },
        { x: 1, y: 0, simbolo: 'marcador', rotulo: '' },
      ],
    }
    const specs = plantaParaEspecificacoes(planta, { xQuad: 0, yQuad: 0 }, 5)
    expect(specs.map((s) => (s.tipo === 'simbolo' ? s.props.rotulo : null))).toEqual(['5', '6'])
  })

  it('marcador com rotulo explícito não é renumerado', () => {
    const planta: PlantaIA = {
      salas: [],
      portas: [],
      simbolos: [{ x: 0, y: 0, simbolo: 'marcador', rotulo: '9' }],
    }
    const specs = plantaParaEspecificacoes(planta, { xQuad: 0, yQuad: 0 }, 1)
    expect(specs[0]).toMatchObject({ props: { rotulo: '9' } })
  })

  it('porta preserva orientação e estado', () => {
    const planta: PlantaIA = {
      salas: [],
      portas: [{ x: 3, y: 3, orientacao: 'vertical', estado: 'trancada' }],
      simbolos: [],
    }
    const specs = plantaParaEspecificacoes(planta, { xQuad: 0, yQuad: 0 })
    expect(specs[0]).toMatchObject({ tipo: 'porta', orientacao: 'vertical', props: { estado: 'trancada' } })
  })
})

/**
 * Volume, não forma. Estes casos passam por TODA a validação de tipo — campo certo, estado na
 * lista certa, coordenada dentro do limite — e mesmo assim travariam o editor. Foram medidos numa
 * revisão adversarial: 1 MB de rótulo vira 41.667 linhas de `<text>` numa sala só, e 20.000 salas
 * custam 367 ms em `contarSalasSobrepostas`, que é O(n²) e roda síncrona na thread da interface.
 */
describe('parsearPlantaIA — tetos de volume', () => {
  it('recusa rótulo de sala quilométrico', () => {
    const r = parsearPlantaIA(JSON.stringify({ salas: [{ ...salaValida, rotulo: 'a '.repeat(500_000) }] }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.erro).toMatch(/caracteres/)
  })

  it('recusa rótulo de símbolo quilométrico', () => {
    const simbolo = { x: 1, y: 1, simbolo: 'marcador', rotulo: 'x'.repeat(5000) }
    const r = parsearPlantaIA(JSON.stringify({ salas: [salaValida], simbolos: [simbolo] }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.erro).toMatch(/caracteres/)
  })

  it('recusa planta com peças demais, e diz o que fazer', () => {
    const muitas = Array.from({ length: 5000 }, (_, i) => ({ ...salaValida, x: i % 400, y: (i * 7) % 400 }))
    const r = parsearPlantaIA(JSON.stringify({ salas: muitas }))
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.erro).toMatch(/5000 peças/)
      expect(r.erro).toMatch(/andares/) // a mensagem tem de sugerir a saída, não só recusar
    }
  })

  it('uma planta de tamanho normal continua passando', () => {
    const salas = Array.from({ length: 40 }, (_, i) => ({ ...salaValida, x: (i % 8) * 5, y: Math.floor(i / 8) * 4 }))
    expect(parsearPlantaIA(JSON.stringify({ salas })).ok).toBe(true)
  })
})

/**
 * O modelo padrão do app é barato (`flash-lite`), então prosa em volta do JSON é resposta
 * ESPERADA. A versão anterior exigia que a cerca envolvesse a resposta inteira e rejeitava um
 * JSON perfeito por causa de um "Claro! Aqui está:" na frente.
 */
describe('parsearPlantaIA — resposta suja de modelo barato', () => {
  const corpo = JSON.stringify({ salas: [salaValida] })

  it('aceita cerca com preâmbulo antes', () => {
    expect(parsearPlantaIA(`Claro! Aqui está o mapa que você pediu:\n\`\`\`json\n${corpo}\n\`\`\``).ok).toBe(true)
  })

  it('aceita cerca com texto depois', () => {
    expect(parsearPlantaIA(`\`\`\`json\n${corpo}\n\`\`\`\n\nEspero que ajude!`).ok).toBe(true)
  })

  it('aceita JSON cru cercado de prosa, sem cerca nenhuma', () => {
    expect(parsearPlantaIA(`Segue a planta: ${corpo} Qualquer coisa é só pedir.`).ok).toBe(true)
  })

  it('aceita cerca aberta e nunca fechada', () => {
    expect(parsearPlantaIA(`\`\`\`json\n${corpo}`).ok).toBe(true)
  })

  it('continua recusando resposta que não tem JSON nenhum', () => {
    expect(parsearPlantaIA('Desculpe, não consegui gerar esse mapa.').ok).toBe(false)
  })
})

describe('formatarResumoInsercao', () => {
  it('caminho feliz sem sobreposição', () => {
    const planta: PlantaIA = { salas: [salaValida as never], portas: [], simbolos: [] }
    expect(formatarResumoInsercao(planta, 0)).toBe('Inserido: 1 sala.')
  })

  it('avisa quando há sobreposição', () => {
    const planta: PlantaIA = {
      salas: [salaValida as never, salaValida as never],
      portas: [{ x: 0, y: 0, orientacao: 'horizontal', estado: 'livre' }],
      simbolos: [],
    }
    const resumo = formatarResumoInsercao(planta, 2)
    expect(resumo).toMatch(/2 salas, 1 porta/)
    expect(resumo).toMatch(/2 sala\(s\) ficaram sobrepostas/)
  })
})
