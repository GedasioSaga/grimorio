import { describe, expect, it } from 'vitest'
import { versaoAtiva, versaoVizinha, aplicarPatchCenario, resumoAtivo, retratoAtivo } from '../lib/cenarioVersao'
import type { Cenario, VersaoCenario } from '../lib/types'

function versao(id: string, nome: string, over: Partial<VersaoCenario> = {}): VersaoCenario {
  return { id, nome, retrato: null, resumo: '', descricao: '', informacao: '', historia: '', eventos: '', itens: '', anotacoes: '', imagens: [], ...over }
}
function cenario(over: Partial<Cenario> = {}): Cenario {
  const vs = over.versoes ?? [versao('v1', 'Base'), versao('v2', 'Noite')]
  return { id: 'c1', nome: 'Cidade', personagens: [], versoes: vs, versaoAtivaId: over.versaoAtivaId ?? vs[0].id, criadoEm: 'x', modificadoEm: 'y', ...over }
}

describe('versaoAtiva', () => {
  it('retorna a versão do id ativo', () => {
    expect(versaoAtiva(cenario({ versaoAtivaId: 'v2' })).nome).toBe('Noite')
  })
  it('cai na primeira quando o id ativo não existe', () => {
    expect(versaoAtiva(cenario({ versaoAtivaId: 'sumiu' })).id).toBe('v1')
  })
})

describe('versaoVizinha', () => {
  it('próxima é cíclica (última volta pra primeira)', () => {
    expect(versaoVizinha(cenario({ versaoAtivaId: 'v2' }), 1)).toBe('v1')
  })
  it('anterior é cíclica (primeira volta pra última)', () => {
    expect(versaoVizinha(cenario({ versaoAtivaId: 'v1' }), -1)).toBe('v2')
  })
})

describe('aplicarPatchCenario', () => {
  it('roteia campo de conteúdo só pra versão ativa', () => {
    const r = aplicarPatchCenario(cenario({ versaoAtivaId: 'v2' }), { descricao: '<p>noite</p>' })
    expect(r.versoes[1].descricao).toBe('<p>noite</p>')
    expect(r.versoes[0].descricao).toBe('')
  })
  it('roteia campo compartilhado pro topo, sem tocar versões', () => {
    const c = cenario()
    const r = aplicarPatchCenario(c, { nome: 'Nova', versaoAtivaId: 'v2' })
    expect(r.nome).toBe('Nova')
    expect(r.versaoAtivaId).toBe('v2')
    expect(r.versoes).toBe(c.versoes)
  })
  it('não muta o original', () => {
    const c = cenario()
    aplicarPatchCenario(c, { resumo: 'x' })
    expect(c.versoes[0].resumo).toBe('')
  })
})

describe('resumoAtivo / retratoAtivo', () => {
  it('undefined vira vazio/null', () => {
    expect(resumoAtivo(undefined)).toBe('')
    expect(retratoAtivo(undefined)).toBeNull()
  })
})
