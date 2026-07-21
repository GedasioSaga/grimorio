import { describe, expect, it } from 'vitest'
import type { Cenario, Personagem, VersaoCenario, VersaoPersonagem } from '../lib/types'
import { SYSTEM_ENTIDADE, textoDaEntidade } from '../lib/contextoEntidade'

function versaoP(over: Partial<VersaoPersonagem> = {}): VersaoPersonagem {
  return {
    id: 'v1', nome: 'Sem nome', retrato: null, resumo: '',
    descricao: '', informacao: '', historia: '', extras: '', anotacoes: '',
    imagens: [], ...over,
  }
}
function personagem(versoes: VersaoPersonagem[], versaoAtivaId = versoes[0].id): Personagem {
  const ativa = versoes.find((v) => v.id === versaoAtivaId) ?? versoes[0]
  return { id: 'p1', nome: ativa.nome, versoes, versaoAtivaId, criadoEm: '', modificadoEm: '' }
}
function versaoC(over: Partial<VersaoCenario> = {}): VersaoCenario {
  return {
    id: 'v1', nome: 'Base', retrato: null, resumo: '',
    descricao: '', informacao: '', historia: '', eventos: '', itens: '', anotacoes: '',
    imagens: [], ...over,
  }
}
function cenario(versoes: VersaoCenario[], nome = 'Cidade', versaoAtivaId = versoes[0].id): Cenario {
  return { id: 'c1', nome, personagens: [], versoes, versaoAtivaId, criadoEm: '', modificadoEm: '' }
}

describe('textoDaEntidade — personagem', () => {
  it('inclui nome + resumo da versão ativa e converte o HTML das abas', () => {
    const p = personagem([versaoP({
      nome: 'Hulk', resumo: 'gigante verde', descricao: '<p>Forte</p>', historia: '<p>Nasceu</p>',
    })])
    const txt = textoDaEntidade(p, 'personagem')
    expect(txt).toContain('# Personagem: Hulk')
    expect(txt).toContain('Resumo: gigante verde')
    expect(txt).toContain('## Descrição\nForte')
    expect(txt).toContain('## História\nNasceu')
  })

  it('pula abas vazias e omite resumo vazio', () => {
    const p = personagem([versaoP({ nome: 'Bob', descricao: '<p>oi</p>' })])
    const txt = textoDaEntidade(p, 'personagem')
    expect(txt).toContain('## Descrição\noi')
    expect(txt).not.toContain('## Informações')
    expect(txt).not.toContain('## Anotações')
    expect(txt).not.toContain('Resumo:')
  })

  it('usa a VERSÃO ATIVA quando há várias formas', () => {
    const p = personagem([
      versaoP({ id: 'a', nome: 'Bruce', descricao: '<p>humano</p>' }),
      versaoP({ id: 'b', nome: 'Hulk', descricao: '<p>monstro</p>' }),
    ], 'b')
    const txt = textoDaEntidade(p, 'personagem')
    expect(txt).toContain('# Personagem: Hulk')
    expect(txt).toContain('monstro')
    expect(txt).not.toContain('humano')
  })
})

describe('textoDaEntidade — cenário', () => {
  it('inclui nome do cenário + versão e as abas próprias (eventos, itens)', () => {
    const c = cenario(
      [versaoC({ nome: 'Noite', resumo: 'escura', eventos: '<p>ataque</p>', itens: '<p>tocha</p>' })],
      'Cidade Alta',
    )
    const txt = textoDaEntidade(c, 'cenario')
    expect(txt).toContain('# Cenário: Cidade Alta — versão Noite')
    expect(txt).toContain('Resumo: escura')
    expect(txt).toContain('## Eventos\nataque')
    expect(txt).toContain('## Itens\ntocha')
  })
})

describe('SYSTEM_ENTIDADE', () => {
  it('muda o alvo conforme o tipo', () => {
    expect(SYSTEM_ENTIDADE('personagem')).toContain('personagem')
    expect(SYSTEM_ENTIDADE('cenario')).toContain('cenário')
  })
})
