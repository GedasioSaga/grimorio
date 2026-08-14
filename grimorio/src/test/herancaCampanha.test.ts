import { describe, expect, it } from 'vitest'
import { campanhasHerdadas, idsDePastas } from '../lib/herancaCampanha'
import type { PastaCenarioNode, PastaNode, VaultTree, Vinculo } from '../lib/types'

function pasta(caminho: string, id: string | undefined, subpastas: PastaNode[] = []): PastaNode {
  const slug = caminho.split('/').pop()!
  return { slug, nome: slug, caminho, id, subpastas, personagens: [] }
}

function pastaCen(caminho: string, id: string | undefined, subpastas: PastaCenarioNode[] = []): PastaCenarioNode {
  const slug = caminho.split('/').pop()!
  return { slug, nome: slug, caminho, id, subpastas, cenarios: [] }
}

function participa(deId: string, paraId: string): Vinculo {
  return { id: `v-${deId}-${paraId}`, deTipo: 'pasta', deId, paraTipo: 'campanha', paraId, tipo: 'participa', notas: '', criadoEm: '' }
}

const tree: VaultTree = {
  campanhas: [],
  canvasesSoltos: [],
  mapasSoltos: [],
  personagensSoltos: pasta('personagens-soltos', undefined, [
    pasta('personagens-soltos/viloes', 'pasta-viloes', [
      pasta('personagens-soltos/viloes/chefes', 'pasta-chefes'),
    ]),
    pasta('personagens-soltos/sem-id', undefined),
  ]),
  cenarios: pastaCen('cenarios', undefined, [pastaCen('cenarios/reinos', 'pasta-reinos')]),
  itens: { slug: 'itens', nome: 'itens', caminho: 'itens', subpastas: [], itens: [] },
}

describe('idsDePastas', () => {
  it('mapeia dir → id das duas árvores, pulando pasta sem id', () => {
    expect(idsDePastas(tree)).toEqual({
      'personagens-soltos/viloes': 'pasta-viloes',
      'personagens-soltos/viloes/chefes': 'pasta-chefes',
      'cenarios/reinos': 'pasta-reinos',
    })
  })
  it('árvore nula devolve mapa vazio', () => {
    expect(idsDePastas(null)).toEqual({})
  })
})

describe('campanhasHerdadas', () => {
  const mapa = idsDePastas(tree)

  it('pega a campanha da própria pasta', () => {
    const v = [participa('pasta-viloes', 'camp-1')]
    expect(campanhasHerdadas('personagens-soltos/viloes', mapa, v)).toEqual(['camp-1'])
  })
  it('sobe até a pasta com campanha mais próxima', () => {
    const v = [participa('pasta-viloes', 'camp-1')]
    expect(campanhasHerdadas('personagens-soltos/viloes/chefes', mapa, v)).toEqual(['camp-1'])
  })
  it('a pasta mais próxima vence — não acumula níveis', () => {
    const v = [participa('pasta-viloes', 'camp-1'), participa('pasta-chefes', 'camp-2')]
    expect(campanhasHerdadas('personagens-soltos/viloes/chefes', mapa, v)).toEqual(['camp-2'])
  })
  it('pasta com id mas sem campanha não interrompe a subida', () => {
    const v = [participa('pasta-viloes', 'camp-1')]
    // 'chefes' tem id e nenhuma campanha → continua subindo até 'viloes'
    expect(campanhasHerdadas('personagens-soltos/viloes/chefes', mapa, v)).toEqual(['camp-1'])
  })
  it('cadeia sem campanha nenhuma devolve []', () => {
    expect(campanhasHerdadas('personagens-soltos/sem-id', mapa, [])).toEqual([])
  })
  it('funciona para cenários', () => {
    const v = [participa('pasta-reinos', 'camp-3')]
    expect(campanhasHerdadas('cenarios/reinos/cidade-alta', mapa, v)).toEqual(['camp-3'])
  })
})
