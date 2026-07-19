import { beforeEach, describe, expect, it } from 'vitest'
import { useApp } from '../state/store'
import type { Personagem } from '../lib/types'

function pers(): Personagem {
  return {
    id: 'p1', nome: 'Bruce',
    versoes: [{ id: 'v1', nome: 'Bruce', retrato: null, resumo: 'humano', descricao: '', informacao: '', historia: '', extras: '', anotacoes: '', imagens: [] }],
    versaoAtivaId: 'v1', criadoEm: 'x', modificadoEm: 'y',
  }
}

beforeEach(() => {
  useApp.setState({ repo: null, caminhoPorId: {}, personagens: { p1: pers() } })
})

describe('ações de versão de personagem no store', () => {
  it('adicionarVersaoPersonagem clona e ativa; espelha o nome', () => {
    useApp.getState().adicionarVersaoPersonagem('p1', 'Hulk')
    const p = useApp.getState().personagens.p1
    expect(p.versoes).toHaveLength(2)
    expect(p.versoes[1].nome).toBe('Hulk')
    expect(p.versoes[1].resumo).toBe('humano')
    expect(p.versoes[1].id).not.toBe('v1')
    expect(p.versaoAtivaId).toBe(p.versoes[1].id)
    expect(p.nome).toBe('Hulk')
  })
  it('definirVersaoAtivaPersonagem troca e re-espelha; ignora id inexistente', () => {
    useApp.getState().adicionarVersaoPersonagem('p1', 'Hulk')
    useApp.getState().definirVersaoAtivaPersonagem('p1', 'v1')
    expect(useApp.getState().personagens.p1.versaoAtivaId).toBe('v1')
    expect(useApp.getState().personagens.p1.nome).toBe('Bruce')
    useApp.getState().definirVersaoAtivaPersonagem('p1', 'inexistente')
    expect(useApp.getState().personagens.p1.versaoAtivaId).toBe('v1')
  })
  it('salvarPersonagemParcial roteia conteúdo pra versão ativa', () => {
    useApp.getState().salvarPersonagemParcial('p1', { descricao: '<p>x</p>' })
    expect(useApp.getState().personagens.p1.versoes[0].descricao).toBe('<p>x</p>')
  })
  it('renomearVersaoPersonagem renomeia a versão e espelha se for a ativa', () => {
    useApp.getState().renomearVersaoPersonagem('p1', 'v1', 'Robert Bruce')
    expect(useApp.getState().personagens.p1.versoes[0].nome).toBe('Robert Bruce')
    expect(useApp.getState().personagens.p1.nome).toBe('Robert Bruce')
  })
  it('renomearPersonagemAtivo renomeia a forma ativa e espelha (repo null = só cache)', async () => {
    await useApp.getState().renomearPersonagemAtivo('p1', 'Robertão')
    const p = useApp.getState().personagens.p1
    expect(p.versoes[0].nome).toBe('Robertão')
    expect(p.nome).toBe('Robertão')
  })
  it('removerVersaoPersonagem guarda a última e re-espelha', () => {
    useApp.getState().removerVersaoPersonagem('p1', 'v1')
    expect(useApp.getState().personagens.p1.versoes).toHaveLength(1)
    useApp.getState().adicionarVersaoPersonagem('p1', 'Hulk')
    const hulkId = useApp.getState().personagens.p1.versoes[1].id
    useApp.getState().removerVersaoPersonagem('p1', hulkId)
    expect(useApp.getState().personagens.p1.versoes).toHaveLength(1)
    expect(useApp.getState().personagens.p1.nome).toBe('Bruce')
  })
})
