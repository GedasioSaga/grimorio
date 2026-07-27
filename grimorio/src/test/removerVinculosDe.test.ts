import { beforeEach, describe, expect, it } from 'vitest'
import { useApp } from '../state/store'
import type { Vinculo } from '../lib/types'

function participa(id: string, deId: string, paraId: string): Vinculo {
  return { id, deTipo: 'pasta', deId, paraTipo: 'campanha', paraId, tipo: 'participa', notas: '', criadoEm: '' }
}

function relacao(id: string, deId: string, paraId: string): Vinculo {
  return { id, deTipo: 'personagem', deId, paraTipo: 'personagem', paraId, tipo: 'conhece', notas: '', criadoEm: '' }
}

beforeEach(() => {
  useApp.setState({ repo: null, vinculos: [] })
})

describe('removerVinculosDe', () => {
  it('tira os vínculos da entidade quando ela é a origem', () => {
    useApp.setState({ vinculos: [participa('v1', 'pasta-1', 'camp-1')] })
    useApp.getState().removerVinculosDe('pasta-1')
    expect(useApp.getState().vinculos).toEqual([])
  })

  it('tira também quando a entidade é o alvo', () => {
    useApp.setState({ vinculos: [relacao('v1', 'p1', 'p2')] })
    useApp.getState().removerVinculosDe('p2')
    expect(useApp.getState().vinculos).toEqual([])
  })

  it('não mexe em vínculo de outra entidade', () => {
    const outros = [participa('v1', 'pasta-1', 'camp-1'), relacao('v2', 'p1', 'p2')]
    useApp.setState({ vinculos: outros })
    useApp.getState().removerVinculosDe('pasta-9')
    expect(useApp.getState().vinculos).toEqual(outros)
  })

  it('remove vários vínculos da mesma entidade de uma vez', () => {
    useApp.setState({
      vinculos: [participa('v1', 'pasta-1', 'camp-1'), participa('v2', 'pasta-1', 'camp-2'), participa('v3', 'pasta-2', 'camp-1')],
    })
    useApp.getState().removerVinculosDe('pasta-1')
    expect(useApp.getState().vinculos.map((v) => v.id)).toEqual(['v3'])
  })

  it('id inexistente não altera a referência do array', () => {
    const antes = [participa('v1', 'pasta-1', 'camp-1')]
    useApp.setState({ vinculos: antes })
    useApp.getState().removerVinculosDe('nao-existe')
    expect(useApp.getState().vinculos).toBe(antes)
  })
})
