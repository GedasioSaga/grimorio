import { describe, expect, it } from 'vitest'
import { versaoAtivaPersonagem, versaoVizinhaPersonagem, aplicarPatchPersonagem, resumoAtivoPersonagem, retratoAtivoPersonagem, comNomeEspelho } from '../lib/personagemVersao'
import type { Personagem, VersaoPersonagem } from '../lib/types'

function v(id: string, nome: string, over: Partial<VersaoPersonagem> = {}): VersaoPersonagem {
  return { id, nome, retrato: null, resumo: '', descricao: '', informacao: '', historia: '', extras: '', anotacoes: '', imagens: [], ...over }
}
function p(over: Partial<Personagem> = {}): Personagem {
  const vs = over.versoes ?? [v('v1', 'Bruce'), v('v2', 'Hulk')]
  return { id: 'p1', nome: vs[0].nome, versoes: vs, versaoAtivaId: over.versaoAtivaId ?? vs[0].id, criadoEm: 'x', modificadoEm: 'y', ...over }
}

describe('versaoAtivaPersonagem / vizinha', () => {
  it('ativa pelo id, fallback na primeira', () => {
    expect(versaoAtivaPersonagem(p({ versaoAtivaId: 'v2' })).nome).toBe('Hulk')
    expect(versaoAtivaPersonagem(p({ versaoAtivaId: 'x' })).id).toBe('v1')
  })
  it('vizinha cíclica', () => {
    expect(versaoVizinhaPersonagem(p({ versaoAtivaId: 'v2' }), 1)).toBe('v1')
    expect(versaoVizinhaPersonagem(p({ versaoAtivaId: 'v1' }), -1)).toBe('v2')
  })
})

describe('aplicarPatchPersonagem', () => {
  it('roteia conteúdo pra versão ativa E atualiza o espelho do nome', () => {
    const r = aplicarPatchPersonagem(p({ versaoAtivaId: 'v2' }), { nome: 'Hulk Cinza', descricao: '<p>x</p>' })
    expect(r.versoes[1].nome).toBe('Hulk Cinza')
    expect(r.versoes[1].descricao).toBe('<p>x</p>')
    expect(r.versoes[0].nome).toBe('Bruce')
    expect(r.nome).toBe('Hulk Cinza')
  })
  it('trocar versaoAtivaId recomputa o espelho', () => {
    const r = aplicarPatchPersonagem(p({ versaoAtivaId: 'v1' }), { versaoAtivaId: 'v2' })
    expect(r.versaoAtivaId).toBe('v2')
    expect(r.nome).toBe('Hulk')
    expect(r.versoes).toEqual(p().versoes)
  })
  it('não muta o original', () => {
    const orig = p()
    aplicarPatchPersonagem(orig, { resumo: 'z' })
    expect(orig.versoes[0].resumo).toBe('')
  })
})

describe('helpers undefined-safe + comNomeEspelho', () => {
  it('resumo/retrato ativos', () => {
    const x = p({ versaoAtivaId: 'v2', versoes: [v('v1', 'Bruce', { resumo: 'a', retrato: 'a.png' }), v('v2', 'Hulk', { resumo: 'b', retrato: 'b.png' })] })
    expect(resumoAtivoPersonagem(x)).toBe('b')
    expect(retratoAtivoPersonagem(x)).toBe('b.png')
    expect(resumoAtivoPersonagem(undefined)).toBe('')
    expect(retratoAtivoPersonagem(undefined)).toBeNull()
  })
  it('comNomeEspelho força nome = versão ativa', () => {
    const x = comNomeEspelho({ ...p({ versaoAtivaId: 'v2' }), nome: 'errado' })
    expect(x.nome).toBe('Hulk')
  })
})
