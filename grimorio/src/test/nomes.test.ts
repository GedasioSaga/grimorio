import { describe, expect, it } from 'vitest'
import { destinoDe, ehNomeGenerico, nomeCasa, nomePasta } from '../lib/organizarImagens/nomes'

describe('nomePasta — nome legível que o Windows aceita', () => {
  it('preserva acento, maiúscula, vírgula e espaço', () => {
    expect(nomePasta('Gandalf, o Cinzento')).toBe('Gandalf, o Cinzento')
    expect(nomePasta('Éowyn da Rohan')).toBe('Éowyn da Rohan')
  })

  it('troca só o proibido no Windows por espaço, sem espaço duplo', () => {
    expect(nomePasta('Dia/Noite: "Torre" <velha>?*|\\')).toBe('Dia Noite Torre velha')
  })

  it('tira caractere de controle', () => {
    expect(nomePasta('Linha\u0000um\ttab')).toBe('Linha um tab')
  })

  it('tira ponto e espaço do fim (o Windows os some sozinho e o caminho deixa de bater)', () => {
    expect(nomePasta('Sr. Frodo. . ')).toBe('Sr. Frodo')
  })

  it('nome reservado do Windows ganha sufixo — com ou sem extensão, em qualquer caixa', () => {
    expect(nomePasta('CON')).toBe('CON_')
    expect(nomePasta('lpt1')).toBe('lpt1_')
    expect(nomePasta('Nul.txt')).toBe('Nul_.txt')
    expect(nomePasta('Console')).toBe('Console')
  })

  it('corta em 80 caracteres sem deixar ponto/espaço no fim', () => {
    const longo = 'A'.repeat(79) + ' ' + 'B'.repeat(120)
    const r = nomePasta(longo)
    expect(r).toBe('A'.repeat(79))
    expect(nomePasta('x'.repeat(200))).toHaveLength(80)
  })

  it('não parte emoji (par substituto) no corte', () => {
    const r = nomePasta('a'.repeat(79) + '🐉🐉')
    expect([...r]).toHaveLength(80)
    expect(r.endsWith('🐉')).toBe(true)
  })

  it('tira ponto do começo: pasta com ponto some da varredura (e do sync) como se fosse .git', () => {
    expect(nomePasta('.Sombra')).toBe('Sombra')
    expect(nomePasta('. . .Oculta')).toBe('Oculta')
    expect(nomePasta('...')).toBe('sem nome')
    expect(nomePasta('Sr. Frodo')).toBe('Sr. Frodo')
  })

  it('vazio ou só lixo vira "sem nome"', () => {
    expect(nomePasta('   ')).toBe('sem nome')
    expect(nomePasta('???')).toBe('sem nome')
  })

  it('normaliza para NFC (o JSON do cofre guarda NFC)', () => {
    expect(nomePasta('João')).toBe('João')
  })
})

describe('destinoDe — endereço final da imagem', () => {
  it('retrato de personagem na pasta com o nome dele', () => {
    expect(destinoDe({ tipo: 'personagem', nome: 'Gandalf, o Cinzento' }, { papel: 'retrato' }, 'PNG', []))
      .toBe('imagens/personagens/Gandalf, o Cinzento/retrato.png')
  })

  it('retrato de versão não-ativa leva o nome da versão', () => {
    expect(destinoDe({ tipo: 'personagem', nome: 'Bruce' }, { papel: 'retrato-versao', versao: 'Hulk' }, 'jpg', []))
      .toBe('imagens/personagens/Bruce/retrato-Hulk.jpg')
  })

  it('subcenário fica dentro da pasta do cenário pai', () => {
    expect(destinoDe({ tipo: 'cenario', nomes: ['Reino', 'Cidade Alta'] }, { papel: 'retrato' }, 'png', []))
      .toBe('imagens/cenarios/Reino/Cidade Alta/retrato.png')
  })

  it('item vira arquivo com o nome do item', () => {
    expect(destinoDe({ tipo: 'item', nome: 'Espada Élfica' }, { papel: 'retrato' }, 'webp', []))
      .toBe('imagens/itens/Espada Élfica.webp')
  })

  it('mapa: nome original quando há, número quando não há', () => {
    const dono = { tipo: 'mapa', nome: 'Masmorra' } as const
    expect(destinoDe(dono, { papel: 'nomeada', nome: 'porta secreta' }, 'png', [])).toBe('imagens/mapas/Masmorra/porta secreta.png')
    expect(destinoDe(dono, { papel: 'numerada' }, 'png', [])).toBe('imagens/mapas/Masmorra/01.png')
  })

  it('numerada pula número ocupado', () => {
    expect(destinoDe({ tipo: 'nota', nome: 'Sessão 3' }, { papel: 'numerada' }, 'png', [
      'imagens/notas/Sessão 3/01.png', 'imagens/notas/Sessão 3/02.jpg',
    ])).toBe('imagens/notas/Sessão 3/03.png')
  })

  it('colisão sem distinguir caixa (NTFS): Gandalf e gandalf são o mesmo arquivo', () => {
    expect(destinoDe({ tipo: 'personagem', nome: 'gandalf' }, { papel: 'retrato' }, 'png', [
      'imagens/personagens/Gandalf/retrato.png',
    ])).toBe('imagens/personagens/gandalf/retrato-2.png')
    expect(destinoDe({ tipo: 'item', nome: 'Anel' }, { papel: 'retrato' }, 'png', [
      'imagens/itens/ANEL.png', 'imagens/itens/anel-2.png',
    ])).toBe('imagens/itens/Anel-3.png')
  })

  it('mesma base com extensão diferente não colide (são arquivos diferentes)', () => {
    expect(destinoDe({ tipo: 'item', nome: 'Anel' }, { papel: 'retrato' }, 'png', ['imagens/itens/Anel.jpg']))
      .toBe('imagens/itens/Anel.png')
  })

  it('nome reservado do Windows não vira arquivo de dispositivo', () => {
    expect(destinoDe({ tipo: 'item', nome: 'CON' }, { papel: 'retrato' }, 'png', [])).toBe('imagens/itens/CON_.png')
  })

  it('imagem sem dono vai para soltas com o próprio nome', () => {
    expect(destinoDe({ tipo: 'solta' }, { papel: 'nomeada', nome: 'mapa-mundi' }, 'png', [])).toBe('imagens/soltas/mapa-mundi.png')
  })
})

describe('destinoDe com sufixo de conteúdo — dois PCs offline não colidem', () => {
  it('retrato e número levam o sufixo; nome original do usuário não', () => {
    expect(destinoDe({ tipo: 'personagem', nome: 'Aragorn' }, { papel: 'retrato' }, 'png', [], 'a3f9'))
      .toBe('imagens/personagens/Aragorn/retrato-a3f9.png')
    expect(destinoDe({ tipo: 'item', nome: 'Anel' }, { papel: 'retrato' }, 'png', [], 'a3f9')).toBe('imagens/itens/Anel-a3f9.png')
    expect(destinoDe({ tipo: 'mapa', nome: 'M' }, { papel: 'nomeada', nome: 'porta' }, 'png', [], 'a3f9')).toBe('imagens/mapas/M/porta.png')
  })

  it('a mesma pasta vazia em dois PCs, com imagens diferentes, dá nomes diferentes', () => {
    const dono = { tipo: 'nota', nome: 'Sessão 1' } as const
    const pc1 = destinoDe(dono, { papel: 'numerada' }, 'png', [], 'a3f9')
    const pc2 = destinoDe(dono, { papel: 'numerada' }, 'png', [], 'b7c1')
    expect(pc1).toBe('imagens/notas/Sessão 1/01-a3f9.png')
    expect(pc2).toBe('imagens/notas/Sessão 1/01-b7c1.png')
  })

  it('número já usado (com ou sem sufixo) não se repete; nome com sufixo ocupado ganha -2', () => {
    expect(destinoDe({ tipo: 'nota', nome: 'S' }, { papel: 'numerada' }, 'png', ['imagens/notas/S/01-b2c4.jpg', 'imagens/notas/S/02.png'], 'a3f9'))
      .toBe('imagens/notas/S/03-a3f9.png')
    expect(destinoDe({ tipo: 'personagem', nome: 'A' }, { papel: 'retrato' }, 'png', ['imagens/personagens/A/retrato-a3f9.png'], 'a3f9'))
      .toBe('imagens/personagens/A/retrato-a3f9-2.png')
  })
})

describe('nomeCasa — quem já está no lugar certo fica (inclusive com sufixo de conteúdo)', () => {
  it('aceita o nome, a variante -N e o sufixo de 4 hex', () => {
    expect(nomeCasa('retrato', 'retrato')).toBe(true)
    expect(nomeCasa('Retrato-2', 'retrato')).toBe(true)
    expect(nomeCasa('retrato-a3f9', 'retrato')).toBe(true)
    expect(nomeCasa('retrato-a3f9-2', 'retrato')).toBe(true)
    expect(nomeCasa('01-a3f9', null)).toBe(true)
    expect(nomeCasa('07', null)).toBe(true)
  })

  it('recusa outro nome que só começa igual', () => {
    expect(nomeCasa('retrato-Hulk', 'retrato')).toBe(false)
    expect(nomeCasa('retrato-Cafe', 'retrato')).toBe(false) // parece hex, mas a versão "Cafe" tem maiúscula
    expect(nomeCasa('retratos', 'retrato')).toBe(false)
    expect(nomeCasa('capa', null)).toBe(false)
  })
})

describe('ehNomeGenerico — nome que o sistema inventou, não o usuário', () => {
  it('reconhece o nome do clipboard e de captura', () => {
    expect(ehNomeGenerico('image.png')).toBe(true)
    expect(ehNomeGenerico('image (3).png')).toBe(true)
    expect(ehNomeGenerico('')).toBe(true)
    expect(ehNomeGenerico('a1b2c3d4e5f6a7b8.png')).toBe(true)
    expect(ehNomeGenerico('8f14e45f-ceea-467a-9575-8ca5f5e7b3a1.png')).toBe(true)
  })

  it('reconhece o nome que o tldraw dá à imagem colada sem arquivo (tldrawFile), com ou sem número', () => {
    expect(ehNomeGenerico('tldrawFile')).toBe(true)
    expect(ehNomeGenerico('tldrawFile-118')).toBe(true)
    expect(ehNomeGenerico('tldrawfile 3')).toBe(true)
    expect(ehNomeGenerico('tldrawFile.png')).toBe(true)
    expect(ehNomeGenerico('TLDRAWFILE (2).png')).toBe(true)
  })

  it('nome escolhido pelo usuário não é genérico', () => {
    expect(ehNomeGenerico('porta secreta.png')).toBe(false)
    expect(ehNomeGenerico('Mapa da Cidade.jpg')).toBe(false)
    expect(ehNomeGenerico('tldraw logo.png')).toBe(false)
    expect(ehNomeGenerico('tldrawFiles do Goa.png')).toBe(false)
  })
})
