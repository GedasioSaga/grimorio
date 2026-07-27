import { describe, expect, it } from 'vitest'
import { filtrarArvoreCenarios, filtrarPastaPersonagens } from '../lib/filtroCampanha'
import type { CenarioNode, ItemRef, PastaCenarioNode, PastaNode } from '../lib/types'

function item(nome: string, caminho: string): ItemRef {
  return { slug: nome, nome, caminho }
}
function pasta(caminho: string, id: string | undefined, personagens: ItemRef[] = [], subpastas: PastaNode[] = []): PastaNode {
  const slug = caminho.split('/').pop()!
  return { slug, nome: slug, caminho, id, subpastas, personagens }
}
function cen(id: string, caminho: string, filhos: CenarioNode[] = []): CenarioNode {
  const slug = caminho.split('/').pop()!
  return { id, slug, nome: slug, caminho, filhos }
}
function pastaCen(caminho: string, id: string | undefined, cenarios: CenarioNode[] = [], subpastas: PastaCenarioNode[] = []): PastaCenarioNode {
  const slug = caminho.split('/').pop()!
  return { slug, nome: slug, caminho, id, subpastas, cenarios }
}

describe('filtro de personagens com pasta etiquetada', () => {
  it('pasta VAZIA da campanha aparece', () => {
    const raiz = pasta('personagens-soltos', undefined, [], [pasta('personagens-soltos/viloes', 'pasta-viloes')])
    const out = filtrarPastaPersonagens(raiz, new Set(), new Set(['pasta-viloes']))
    expect(out.subpastas).toHaveLength(1)
  })

  it('pasta da campanha arrasta os filhos não etiquetados', () => {
    const raiz = pasta('personagens-soltos', undefined, [], [
      pasta('personagens-soltos/viloes', 'pasta-viloes', [item('Sauron', 'personagens-soltos/viloes/sauron.json')]),
    ])
    const out = filtrarPastaPersonagens(raiz, new Set(), new Set(['pasta-viloes']))
    expect(out.subpastas[0].personagens.map((p) => p.nome)).toEqual(['Sauron'])
  })

  it('pasta de OUTRA campanha some quando está vazia', () => {
    const raiz = pasta('personagens-soltos', undefined, [], [pasta('personagens-soltos/viloes', 'pasta-viloes')])
    const out = filtrarPastaPersonagens(raiz, new Set(), new Set(['pasta-outra']))
    expect(out.subpastas).toHaveLength(0)
  })

  it('pasta de OUTRA campanha ainda mostra o item que casa com o filtro', () => {
    const raiz = pasta('personagens-soltos', undefined, [], [
      pasta('personagens-soltos/viloes', 'pasta-viloes', [item('Sauron', 'personagens-soltos/viloes/sauron.json')]),
    ])
    const out = filtrarPastaPersonagens(
      raiz,
      new Set(['personagens-soltos/viloes/sauron.json']),
      new Set(['pasta-outra']),
    )
    expect(out.subpastas[0].personagens.map((p) => p.nome)).toEqual(['Sauron'])
  })

  it('pasta SEM id mantém o comportamento antigo (podada quando vazia)', () => {
    const raiz = pasta('personagens-soltos', undefined, [], [pasta('personagens-soltos/legada', undefined)])
    const out = filtrarPastaPersonagens(raiz, new Set(), new Set(['pasta-viloes']))
    expect(out.subpastas).toHaveLength(0)
  })

  it('RAIZ etiquetada não desliga o filtro da seção', () => {
    const raiz = pasta('personagens-soltos', 'pasta-raiz', [
      item('Frodo', 'personagens-soltos/frodo.json'),
      item('Sauron', 'personagens-soltos/sauron.json'),
    ])
    const out = filtrarPastaPersonagens(
      raiz,
      new Set(['personagens-soltos/frodo.json']),
      new Set(['pasta-raiz']),
    )
    expect(out.personagens.map((p) => p.nome)).toEqual(['Frodo'])
  })
})

describe('filtro de cenários com pasta etiquetada', () => {
  it('pasta VAZIA da campanha aparece', () => {
    const raiz = pastaCen('cenarios', undefined, [], [pastaCen('cenarios/reinos', 'pasta-reinos')])
    const out = filtrarArvoreCenarios(raiz, new Set(['pasta-reinos']))
    expect(out.subpastas).toHaveLength(1)
  })

  it('pasta da campanha arrasta os cenários não etiquetados', () => {
    const raiz = pastaCen('cenarios', undefined, [], [
      pastaCen('cenarios/reinos', 'pasta-reinos', [cen('c1', 'cenarios/reinos/gondor')]),
    ])
    const out = filtrarArvoreCenarios(raiz, new Set(['pasta-reinos']))
    expect(out.subpastas[0].cenarios.map((c) => c.id)).toEqual(['c1'])
  })

  it('cenário etiquetado continua aparecendo dentro de pasta não etiquetada', () => {
    const raiz = pastaCen('cenarios', undefined, [], [
      pastaCen('cenarios/reinos', 'pasta-reinos', [cen('c1', 'cenarios/reinos/gondor')]),
    ])
    const out = filtrarArvoreCenarios(raiz, new Set(['c1']))
    expect(out.subpastas[0].cenarios.map((c) => c.id)).toEqual(['c1'])
  })

  it('RAIZ etiquetada não desliga o filtro da seção', () => {
    const raiz = pastaCen('cenarios', 'pasta-raiz', [
      cen('c1', 'cenarios/gondor'),
      cen('c2', 'cenarios/mordor'),
    ])
    const out = filtrarArvoreCenarios(raiz, new Set(['pasta-raiz', 'c1']))
    expect(out.cenarios.map((c) => c.id)).toEqual(['c1'])
  })
})
