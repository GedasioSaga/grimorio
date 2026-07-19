import { beforeEach, describe, expect, it } from 'vitest'
import { useApp } from '../state/store'
import type { Cenario } from '../lib/types'

function cen(): Cenario {
  return {
    id: 'c1', nome: 'Cidade', personagens: [],
    versoes: [{ id: 'v1', nome: 'Base', retrato: null, resumo: 'dia', descricao: '', informacao: '', historia: '', eventos: '', itens: '', anotacoes: '', imagens: [] }],
    versaoAtivaId: 'v1', criadoEm: 'x', modificadoEm: 'y',
  }
}

beforeEach(() => {
  useApp.setState({ repo: null, caminhoCenarioPorId: {}, cenarios: { c1: cen() } })
})

describe('ações de versão no store', () => {
  it('adicionarVersao clona a ativa e ativa a nova', () => {
    useApp.getState().adicionarVersao('c1', 'Noite')
    const c = useApp.getState().cenarios.c1
    expect(c.versoes).toHaveLength(2)
    expect(c.versoes[1].nome).toBe('Noite')
    expect(c.versoes[1].resumo).toBe('dia')   // clonou o conteúdo da ativa
    expect(c.versoes[1].id).not.toBe('v1')
    expect(c.versaoAtivaId).toBe(c.versoes[1].id)
  })

  it('definirVersaoAtiva troca só se o id existir', () => {
    useApp.getState().adicionarVersao('c1', 'Noite')
    const novaId = useApp.getState().cenarios.c1.versoes[1].id
    useApp.getState().definirVersaoAtiva('c1', 'v1')
    expect(useApp.getState().cenarios.c1.versaoAtivaId).toBe('v1')
    useApp.getState().definirVersaoAtiva('c1', 'inexistente')
    expect(useApp.getState().cenarios.c1.versaoAtivaId).toBe('v1')  // inalterado
    useApp.getState().definirVersaoAtiva('c1', novaId)
    expect(useApp.getState().cenarios.c1.versaoAtivaId).toBe(novaId)
  })

  it('salvarCenarioParcial roteia conteúdo pra versão ativa', () => {
    useApp.getState().salvarCenarioParcial('c1', { descricao: '<p>x</p>' })
    expect(useApp.getState().cenarios.c1.versoes[0].descricao).toBe('<p>x</p>')
  })

  it('removerVersao respeita a guarda da última e recua a ativa', () => {
    useApp.getState().removerVersao('c1', 'v1')
    expect(useApp.getState().cenarios.c1.versoes).toHaveLength(1) // não removeu a última
    useApp.getState().adicionarVersao('c1', 'Noite')
    const novaId = useApp.getState().cenarios.c1.versoes[1].id
    useApp.getState().removerVersao('c1', novaId)   // remove a ativa
    expect(useApp.getState().cenarios.c1.versoes).toHaveLength(1)
    expect(useApp.getState().cenarios.c1.versaoAtivaId).toBe('v1')
  })
})
