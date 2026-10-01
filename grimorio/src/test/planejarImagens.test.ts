import { describe, expect, it } from 'vitest'
import { reservarDestino } from '../lib/organizarImagens/novaImagem'
import { planejarOrganizacao } from '../lib/organizarImagens/planejar'
import { criarFakeFs } from './fakeFs'
import {
  RAIZ, cenario, gravarImagem, gravarJson, item, mapa, montarCofreAmostra, personagem, portasDe, versaoPersonagem,
} from './cofreImagens'

function paraDe(plano: Awaited<ReturnType<typeof planejarOrganizacao>>): Record<string, string> {
  return Object.fromEntries(plano.movimentos.map((m) => [m.de, m.para]))
}

describe('planejarOrganizacao — cofre-amostra', () => {
  it('cada imagem vai para a pasta do dono, com nome legível', async () => {
    const fs = await montarCofreAmostra()
    const plano = await planejarOrganizacao(RAIZ, portasDe(fs))
    expect(paraDe(plano)).toEqual({
      'personagens-soltos/assets/retrato-p1-v1.png': 'imagens/personagens/Gandalf, o Cinzento/retrato.png',
      'personagens-soltos/assets/retrato-p1-v2.png': 'imagens/personagens/Gandalf, o Cinzento/retrato-Gandalf, o Branco.png',
      'personagens-soltos/assets/galeria-aaa.png': 'imagens/personagens/Gandalf, o Cinzento/01.png',
      'personagens-soltos/assets/galeria-bbb.jpg': 'imagens/personagens/Gandalf, o Cinzento/02.jpg',
      'imagens-cenarios/retrato-c1-v1.png': 'imagens/cenarios/Reino/retrato.png',
      'imagens-cenarios/retrato-c2-v1.png': 'imagens/cenarios/Reino/Cidade Alta/retrato.png',
      'imagens-itens/retrato-i1.png': 'imagens/itens/Espada Élfica.png',
      'imagens-canvas/A1.png': 'imagens/mapas/Masmorra/porta secreta.png',
      'imagens-canvas/A2.png': 'imagens/mapas/Masmorra/01.png',
      'imagens-canvas/A3.png': 'imagens/mapas/Masmorra/Altar.png',
      'imagens-notas/0123456789abcdef.png': 'imagens/notas/Sessão 1/01.png',
      'imagens-notas/dup.png': 'imagens/notas/Sessão 1/02.png',
      'imagens-canvas/orfa.png': 'imagens/soltas/orfa.png',
    })
  })

  it('o sha256 de cada movimento é o do conteúdo', async () => {
    const fs = await montarCofreAmostra()
    const plano = await planejarOrganizacao(RAIZ, portasDe(fs))
    for (const m of plano.movimentos) expect(m.sha256).toBe(await fs.sha256(`${RAIZ}/${m.de}`))
  })

  it('duplicata do MESMO dono vira uma só: a cópia sai e quem a citava passa a citar a mantida', async () => {
    const fs = await montarCofreAmostra()
    const plano = await planejarOrganizacao(RAIZ, portasDe(fs))
    expect(plano.remocoes).toEqual([{
      rel: 'personagens-soltos/assets/galeria-ccc.png',
      sha256: await fs.sha256(`${RAIZ}/personagens-soltos/assets/galeria-ccc.png`),
      motivo: 'copia-de-imagem-com-dono',
      mantida: 'imagens/personagens/Gandalf, o Cinzento/retrato.png',
    }])
    const gandalf = plano.reescritas.find((r) => r.arquivo === 'personagens-soltos/gandalf.json')
    expect(gandalf?.pares).toContainEqual({
      de: 'personagens-soltos/assets/galeria-ccc.png', para: 'imagens/personagens/Gandalf, o Cinzento/retrato.png',
    })
  })

  it('duplicata entre donos DIFERENTES fica separada (mexer numa não pode estragar a outra), e vira grupo, não aviso de texto', async () => {
    const fs = await montarCofreAmostra()
    const plano = await planejarOrganizacao(RAIZ, portasDe(fs))
    expect(plano.remocoes.some((r) => r.rel === 'imagens-notas/dup.png')).toBe(false)
    const nota = plano.reescritas.find((r) => r.arquivo === 'mapas-soltos/masmorra.notas/sessao-1.json')
    expect(nota?.pares).toEqual(expect.arrayContaining([
      { de: 'imagens-notas/dup.png', para: 'imagens/notas/Sessão 1/02.png' },
      { de: 'imagens-notas/0123456789abcdef.png', para: 'imagens/notas/Sessão 1/01.png' },
    ]))
    expect(plano.repetidasEntreDonos).toEqual([['imagens-canvas/A3.png', 'imagens-notas/dup.png']])
    // a tela resume os grupos numa linha: o texto de um por grupo enterraria os avisos que pedem ação
    expect(plano.avisos.some((a) => a.includes('imagens-notas/dup.png'))).toBe(false)
  })

  it('cópia que ninguém cita, num lugar onde o app cria imagem, junta com a que tem dono, mesmo num grupo de donos diferentes', async () => {
    const fs = criarFakeFs({ caixa: 'insensivel' })
    await gravarImagem(fs, 'x/a.png', 'igual')
    await gravarImagem(fs, 'x/b.png', 'igual')
    await gravarImagem(fs, 'imagens-canvas/solta.png', 'igual')
    await gravarJson(fs, 'itens/a.json', item('i1', 'A', 'x/a.png'))
    await gravarJson(fs, 'itens/b.json', item('i2', 'B', 'x/b.png'))
    const plano = await planejarOrganizacao(RAIZ, portasDe(fs))
    expect(plano.remocoes.map((r) => r.rel)).toEqual(['imagens-canvas/solta.png'])
    expect(paraDe(plano)).toEqual({ 'x/a.png': 'imagens/itens/A.png', 'x/b.png': 'imagens/itens/B.png' })
    expect(plano.repetidasEntreDonos).toEqual([['x/a.png', 'x/b.png']])
  })

  it('imagem citada por dois donos, com cópia que ninguém cita: a cópia sai e não sobra grupo de um caminho só', async () => {
    const fs = criarFakeFs({ caixa: 'insensivel' })
    await gravarImagem(fs, 'imagens-canvas/K1.png', 'mesma')
    await gravarImagem(fs, 'imagens-canvas/K2.png', 'mesma')
    // a mesma imagem colada em duas sessões (sessão duplicada): dois donos, UMA imagem
    await gravarJson(fs, 'campanhas/c/sessoes/s1.json', mapa('m1', 'Sessão 1', [{ id: 'a', rel: 'imagens-canvas/K1.png', name: 'image.png' }]))
    await gravarJson(fs, 'campanhas/c/sessoes/s2.json', mapa('m2', 'Sessão 2', [{ id: 'a', rel: 'imagens-canvas/K1.png', name: 'image.png' }]))
    const plano = await planejarOrganizacao(RAIZ, portasDe(fs))
    // o sintoma do ensaio: "imagens-canvas/K1.png têm o mesmo conteúdo, mas são de donos diferentes"
    expect(plano.avisos.filter((a) => a.includes('mesmo conteúdo'))).toEqual([])
    expect(plano.remocoes.map((r) => [r.rel, r.motivo])).toEqual([['imagens-canvas/K2.png', 'copia-de-imagem-com-dono']])
    expect(plano.repetidasEntreDonos).toEqual([])
  })

  it('reescreve todo arquivo que cita imagem que se mudou, e só esses', async () => {
    const fs = await montarCofreAmostra()
    const plano = await planejarOrganizacao(RAIZ, portasDe(fs))
    expect(plano.reescritas.map((r) => r.arquivo).sort()).toEqual([
      'cenarios/reino/cenario.json',
      'cenarios/reino/cidade-alta/cenario.json',
      'itens/espada.json',
      'mapas-soltos/masmorra.json',
      'mapas-soltos/masmorra.notas/sessao-1.json',
      'personagens-soltos/gandalf.json',
    ])
    const gandalf = plano.reescritas.find((r) => r.arquivo === 'personagens-soltos/gandalf.json')
    expect(gandalf?.pares).toHaveLength(5)
  })

  it('referência que já estava quebrada vira aviso e não entra no plano', async () => {
    const fs = await montarCofreAmostra()
    const plano = await planejarOrganizacao(RAIZ, portasDe(fs))
    expect(plano.avisos.some((a) => a.includes('imagens-itens/sumiu.png') && a.includes('itens/escudo.json'))).toBe(true)
    expect(plano.reescritas.some((r) => r.arquivo === 'itens/escudo.json')).toBe(false)
  })

  it('é determinístico: o mesmo cofre dá o mesmo plano e o mesmo id', async () => {
    const a = await planejarOrganizacao(RAIZ, portasDe(await montarCofreAmostra()))
    const b = await planejarOrganizacao(RAIZ, portasDe(await montarCofreAmostra()))
    expect(a).toEqual(b)
    expect(a.id).toMatch(/^[0-9a-f]{16}$/)
  })
})

describe('planejarOrganizacao — casos de borda', () => {
  it('dois donos com o mesmo nome (sem distinguir caixa) ganham pastas diferentes', async () => {
    const fs = criarFakeFs({ caixa: 'insensivel' })
    await gravarImagem(fs, 'a/1.png', 'um')
    await gravarImagem(fs, 'a/2.png', 'dois')
    await gravarJson(fs, 'personagens-soltos/gandalf.json', personagem('p1', [versaoPersonagem('v1', 'Gandalf', 'a/1.png')], 'v1'))
    await gravarJson(fs, 'personagens-soltos/gandalf-2.json', personagem('p2', [versaoPersonagem('v1', 'gandalf', 'a/2.png')], 'v1'))
    const para = paraDe(await planejarOrganizacao(RAIZ, portasDe(fs)))
    expect(para['a/1.png']).toBe('imagens/personagens/Gandalf/retrato.png')
    expect(para['a/2.png']).toBe('imagens/personagens/gandalf-2/retrato.png')
  })

  it('a pasta do personagem leva o nome da primeira forma: trocar a ativa não muda a pasta', async () => {
    const fs = criarFakeFs({ caixa: 'insensivel' })
    await gravarImagem(fs, 'x/bruce.png', 'bruce')
    await gravarImagem(fs, 'x/hulk.png', 'hulk')
    await gravarJson(fs, 'personagens-soltos/bruce.json', personagem('p1', [
      versaoPersonagem('v1', 'Bruce Banner', 'x/bruce.png'),
      versaoPersonagem('v2', 'Hulk', 'x/hulk.png'),
    ], 'v2'))
    const para = paraDe(await planejarOrganizacao(RAIZ, portasDe(fs)))
    expect(para['x/hulk.png']).toBe('imagens/personagens/Bruce Banner/retrato.png')
    expect(para['x/bruce.png']).toBe('imagens/personagens/Bruce Banner/retrato-Bruce Banner.png')
  })

  it('subcenário batizado "Pai: Filho" não repete o pai no nome da pasta', async () => {
    const fs = criarFakeFs({ caixa: 'insensivel' })
    await gravarImagem(fs, 'x/torre.png', 'torre')
    await gravarJson(fs, 'cenarios/reino/cenario.json', cenario('c1', 'Reino', null))
    await gravarJson(fs, 'cenarios/reino/torre/cenario.json', cenario('c2', 'Reino: Torre', 'x/torre.png'))
    expect(paraDe(await planejarOrganizacao(RAIZ, portasDe(fs)))['x/torre.png']).toBe('imagens/cenarios/Reino/Torre/retrato.png')
  })

  it('cofre já organizado não gera nada (idempotente)', async () => {
    const fs = criarFakeFs({ caixa: 'insensivel' })
    await gravarImagem(fs, 'imagens/itens/Anel.png', 'anel')
    await gravarImagem(fs, 'imagens/personagens/Frodo/retrato.png', 'frodo')
    await gravarImagem(fs, 'imagens/personagens/Frodo/01.png', 'g1')
    await gravarJson(fs, 'itens/anel.json', item('i1', 'Anel', 'imagens/itens/Anel.png'))
    await gravarJson(fs, 'personagens-soltos/frodo.json', personagem('p1', [
      versaoPersonagem('v1', 'Frodo', 'imagens/personagens/Frodo/retrato.png', ['imagens/personagens/Frodo/01.png']),
    ], 'v1'))
    const plano = await planejarOrganizacao(RAIZ, portasDe(fs))
    expect(plano.movimentos).toEqual([])
    expect(plano.reescritas).toEqual([])
    expect(plano.remocoes).toEqual([])
  })

  it('só a caixa diferente do destino não é movimento (no NTFS é o mesmo arquivo)', async () => {
    const fs = criarFakeFs({ caixa: 'insensivel' })
    await gravarImagem(fs, 'imagens/itens/anel.PNG', 'anel')
    await gravarJson(fs, 'itens/anel.json', item('i1', 'Anel', 'imagens/itens/anel.PNG'))
    const plano = await planejarOrganizacao(RAIZ, portasDe(fs))
    expect(plano.movimentos).toEqual([])
  })

  it('na imagem que fica, citação que só muda a caixa não é reescrita; com o acento composto de outro jeito (NFD), é', async () => {
    const fs = criarFakeFs({ caixa: 'insensivel' })
    const nfc = 'imagens/itens/Poção.png'.normalize('NFC')
    const nfd = nfc.normalize('NFD')
    await gravarImagem(fs, nfc, 'poção')
    // NFD é outro nome no NTFS: esta ficha não abre a imagem, e volta a abrir com a grafia do disco
    await gravarJson(fs, 'itens/pocao.json', item('i1', 'Poção', nfd))
    // só a caixa: no NTFS abre o mesmo arquivo, então não há o que reescrever
    await gravarJson(fs, 'mapas-soltos/m.json', mapa('m1', 'Mapa', [{ id: 'a', rel: nfc.toUpperCase(), name: 'x.png' }]))
    const plano = await planejarOrganizacao(RAIZ, portasDe(fs))
    expect(plano.movimentos).toEqual([])
    expect(plano.reescritas).toEqual([{ arquivo: 'itens/pocao.json', pares: [{ de: nfd, para: nfc }] }])
  })

  it('NFC e NFD do mesmo nome são arquivos distintos no NTFS: os dois ficam fora do plano, e só eles', async () => {
    const fs = criarFakeFs({ caixa: 'insensivel' })
    const nfc = 'x/Ação.png'.normalize('NFC')
    const nfd = 'x/Ação.png'.normalize('NFD')
    await gravarImagem(fs, nfc, 'uma imagem')
    await gravarImagem(fs, nfd, 'outra imagem')
    await gravarImagem(fs, 'y/b.png', 'b')
    await gravarJson(fs, 'itens/anel.json', item('i1', 'Anel', nfd))
    await gravarJson(fs, 'mapas-soltos/m.json', mapa('m1', 'Mapa', [
      { id: 'a', rel: nfc, name: 'a.png' },
      { id: 'b', rel: 'y/b.png', name: 'b.png' },
    ]))
    const plano = await planejarOrganizacao(RAIZ, portasDe(fs))
    // sem saber qual citação é de qual arquivo, nenhum dos dois se mexe e ninguém passa a citar outro
    expect(plano.movimentos.map((m) => m.de)).toEqual(['y/b.png'])
    expect(plano.reescritas.flatMap((r) => r.pares.map((p) => `${r.arquivo}:${p.de}`))).toEqual(['mapas-soltos/m.json:y/b.png'])
    expect(plano.remocoes).toEqual([])
    expect(plano.avisos.filter((a) => a.includes(nfc) && a.includes(nfd))).toHaveLength(1)
    expect(plano.avisos.some((a) => a.includes('quebrada'))).toBe(false)
  })

  it('não toma o lugar de um arquivo que já existe: ganha -2', async () => {
    const fs = criarFakeFs({ caixa: 'insensivel' })
    await gravarImagem(fs, 'x/anel.png', 'anel novo')
    await fs.writeTextAtomic(`${RAIZ}/imagens/itens/Anel.png`, 'não é imagem de ninguém, mas existe')
    await gravarJson(fs, 'itens/anel.json', item('i1', 'Anel', 'x/anel.png'))
    const para = paraDe(await planejarOrganizacao(RAIZ, portasDe(fs)))
    expect(para['x/anel.png']).toBe('imagens/itens/Anel-2.png')
  })

  it('imagem citada por dois donos fica com o de maior prioridade (retrato ganha do mapa)', async () => {
    const fs = criarFakeFs({ caixa: 'insensivel' })
    await gravarImagem(fs, 'x/r.png', 'retrato')
    await gravarJson(fs, 'mapas-soltos/m.json', mapa('m1', 'Mapa', [{ id: 'a', rel: 'x/r.png', name: 'r.png' }]))
    await gravarJson(fs, 'itens/anel.json', item('i1', 'Anel', 'x/r.png'))
    const plano = await planejarOrganizacao(RAIZ, portasDe(fs))
    expect(paraDe(plano)['x/r.png']).toBe('imagens/itens/Anel.png')
    expect(plano.reescritas.map((r) => r.arquivo).sort()).toEqual(['itens/anel.json', 'mapas-soltos/m.json'])
  })

  it('imagem na lixeira sem ninguém citando fica onde está', async () => {
    const fs = criarFakeFs({ caixa: 'insensivel' })
    await gravarImagem(fs, '.lixeira/e1/reino/assets/x.png', 'lixo')
    const plano = await planejarOrganizacao(RAIZ, portasDe(fs))
    expect(plano.movimentos).toEqual([])
  })

  it('ficha na lixeira continua citando certo: é reescrita junto', async () => {
    const fs = criarFakeFs({ caixa: 'insensivel' })
    await gravarImagem(fs, 'x/r.png', 'retrato')
    await gravarJson(fs, '.lixeira/e1/entrada.json', { id: 'e1', tipo: 'item', nome: 'Anel', excluidoEm: '', origemDir: 'itens', nomeArquivo: 'anel.json', ehPasta: false })
    await gravarJson(fs, '.lixeira/e1/anel.json', item('i1', 'Anel', 'x/r.png'))
    const plano = await planejarOrganizacao(RAIZ, portasDe(fs))
    expect(paraDe(plano)['x/r.png']).toBe('imagens/itens/Anel.png')
    expect(plano.reescritas.map((r) => r.arquivo)).toEqual(['.lixeira/e1/anel.json'])
  })

  it('pasta com ponto (.git, .obsidian) nem é olhada', async () => {
    const fs = criarFakeFs({ caixa: 'insensivel' })
    await gravarImagem(fs, '.git/objetos/x.png', 'git')
    const plano = await planejarOrganizacao(RAIZ, portasDe(fs))
    expect(plano.movimentos).toEqual([])
  })

  it('imagem de mapa com o nome que o tldraw dá à colada (tldrawFile) ganha número, não "tldrawFile-5"', async () => {
    const fs = criarFakeFs({ caixa: 'insensivel' })
    await gravarImagem(fs, 'imagens-canvas/K1.png', 'um')
    await gravarImagem(fs, 'imagens-canvas/K2.png', 'dois')
    await gravarImagem(fs, 'imagens-canvas/K3.png', 'três')
    await gravarJson(fs, 'mapas-soltos/goa.json', mapa('m1', 'Sessão 3 Reino de Goa', [
      { id: 'a', rel: 'imagens-canvas/K1.png', name: 'tldrawFile', nomeOriginal: 'tldrawFile' },
      { id: 'b', rel: 'imagens-canvas/K2.png', name: 'tldrawFile-5' },
      { id: 'c', rel: 'imagens-canvas/K3.png', name: 'tldrawfile 3.png' },
    ]))
    expect(paraDe(await planejarOrganizacao(RAIZ, portasDe(fs)))).toEqual({
      'imagens-canvas/K1.png': 'imagens/mapas/Sessão 3 Reino de Goa/01.png',
      'imagens-canvas/K2.png': 'imagens/mapas/Sessão 3 Reino de Goa/02.png',
      'imagens-canvas/K3.png': 'imagens/mapas/Sessão 3 Reino de Goa/03.png',
    })
  })

  it('personagem sem nenhuma imagem e campos opcionais ausentes não quebra', async () => {
    const fs = criarFakeFs({ caixa: 'insensivel' })
    await gravarJson(fs, 'personagens-soltos/vazio.json', { id: 'p9' })
    await gravarJson(fs, 'mapas-soltos/vazio.json', { id: 'm9', nome: 'Vazio', documento: null })
    await gravarJson(fs, 'mapas-soltos/vazio.notas/p.json', { id: 'n9', titulo: 'x', corpo: '' })
    await fs.writeTextAtomic(`${RAIZ}/quebrado.json`, '{ isto não é json')
    const plano = await planejarOrganizacao(RAIZ, portasDe(fs))
    expect(plano.movimentos).toEqual([])
    expect(plano.avisos.some((a) => a.includes('quebrado.json'))).toBe(true)
  })
})

describe('planejarOrganizacao — imagem do usuário fica onde está', () => {
  it('imagem que ninguém cita, fora dos lugares onde o app cria imagem, não se mexe', async () => {
    const fs = criarFakeFs({ caixa: 'insensivel' })
    await gravarImagem(fs, 'Imagens/Marinha/Cavaleiro Sagrado.jpg', 'cavaleiro')
    await gravarImagem(fs, 'Imagens/Pasted Image 20250302080802_585.png', 'colada no obsidian')
    await gravarImagem(fs, 'fotos/mapa-mundi.jpg', 'mundo')
    await gravarImagem(fs, 'capa.png', 'capa')
    await gravarImagem(fs, 'campanhas/c/referencias/navio.webp', 'navio')
    const plano = await planejarOrganizacao(RAIZ, portasDe(fs))
    expect(plano.movimentos).toEqual([])
    expect(plano.remocoes).toEqual([])
  })

  it('sem citação dentro de imagens/ (em qualquer caixa) também fica: já organizada, ou posta ali pelo usuário', async () => {
    const fs = criarFakeFs({ caixa: 'insensivel' })
    // a `Imagens/` do usuário vem primeiro: no NTFS as outras duas caem DENTRO dela
    await gravarImagem(fs, 'Imagens/Outros/Fruta Estrela.png', 'fruta')
    await gravarImagem(fs, 'imagens/soltas/orfa.png', 'órfã')
    await gravarImagem(fs, 'imagens/personagens/Frodo/07.png', 'tirada da galeria')
    const plano = await planejarOrganizacao(RAIZ, portasDe(fs))
    expect(plano.movimentos).toEqual([])
    expect(plano.remocoes).toEqual([])
  })

  it('sem citação num lugar onde o app cria (ou criava) imagem continua indo para imagens/soltas/', async () => {
    const fs = criarFakeFs({ caixa: 'insensivel' })
    await gravarImagem(fs, 'imagens-canvas/x7MuxxLE9MpDIouuQEI1h.png', 'colada no mapa')
    await gravarImagem(fs, 'imagens-notas/0123456789abcdef.png', 'colada na nota')
    await gravarImagem(fs, 'imagens-cenarios/retrato-c9-v9.png', 'retrato de cenário')
    await gravarImagem(fs, 'imagens-itens/retrato-i9.png', 'retrato de item')
    await gravarImagem(fs, 'personagens-soltos/npcs/assets/galeria-u1.png', 'galeria')
    await gravarImagem(fs, 'campanhas/c/Assets/foto antiga.png', 'retrato de versão antiga')
    expect(paraDe(await planejarOrganizacao(RAIZ, portasDe(fs)))).toEqual({
      'imagens-canvas/x7MuxxLE9MpDIouuQEI1h.png': 'imagens/soltas/x7MuxxLE9MpDIouuQEI1h.png',
      'imagens-notas/0123456789abcdef.png': 'imagens/soltas/0123456789abcdef.png',
      'imagens-cenarios/retrato-c9-v9.png': 'imagens/soltas/retrato-c9-v9.png',
      'imagens-itens/retrato-i9.png': 'imagens/soltas/retrato-i9.png',
      'personagens-soltos/npcs/assets/galeria-u1.png': 'imagens/soltas/galeria-u1.png',
      'campanhas/c/Assets/foto antiga.png': 'imagens/soltas/foto antiga.png',
    })
  })

  it('subpasta que o usuário criou dentro de um lugar do app é dele: a imagem sem citação fica', async () => {
    const fs = criarFakeFs({ caixa: 'insensivel' })
    await gravarImagem(fs, 'imagens-canvas/favoritas/dragao.png', 'dragão')
    expect((await planejarOrganizacao(RAIZ, portasDe(fs))).movimentos).toEqual([])
  })

  it('pasta "assets" com ficha ou cenário dentro é conteúdo do mestre: a imagem sem citação ali fica', async () => {
    const fs = criarFakeFs({ caixa: 'insensivel' })
    await gravarJson(fs, 'cenarios/assets/cenario.json', cenario('c1', 'Assets', null))
    await gravarImagem(fs, 'cenarios/assets/vista.png', 'vista do cenário Assets')
    await gravarImagem(fs, 'personagens-soltos/assets/galeria-z.png', 'galeria sem dono')
    expect(paraDe(await planejarOrganizacao(RAIZ, portasDe(fs)))).toEqual({
      'personagens-soltos/assets/galeria-z.png': 'imagens/soltas/galeria-z.png',
    })
  })

  it('imagem citada vai para a pasta do dono mesmo saindo da pasta do usuário', async () => {
    const fs = criarFakeFs({ caixa: 'insensivel' })
    await gravarImagem(fs, 'Imagens/Marinha/garp.png', 'garp')
    await gravarJson(fs, 'personagens-soltos/marinha/garp.json', personagem('p1', [versaoPersonagem('v1', 'Garp', 'Imagens/Marinha/garp.png')], 'v1'))
    expect(paraDe(await planejarOrganizacao(RAIZ, portasDe(fs)))).toEqual({
      'Imagens/Marinha/garp.png': 'imagens/personagens/Garp/retrato.png',
    })
  })

  it('cópia idêntica sem citação na pasta do usuário fica; a do lugar do app sai como cópia', async () => {
    const fs = criarFakeFs({ caixa: 'insensivel' })
    await gravarImagem(fs, 'imagens-itens/retrato-i1.png', 'espada')
    await gravarImagem(fs, 'Imagens/espada.png', 'espada')
    await gravarImagem(fs, 'imagens-canvas/copia.png', 'espada')
    await gravarJson(fs, 'itens/espada.json', item('i1', 'Espada', 'imagens-itens/retrato-i1.png'))
    const plano = await planejarOrganizacao(RAIZ, portasDe(fs))
    expect(paraDe(plano)).toEqual({ 'imagens-itens/retrato-i1.png': 'imagens/itens/Espada.png' })
    expect(plano.remocoes.map((r) => [r.rel, r.motivo, r.mantida])).toEqual([
      ['imagens-canvas/copia.png', 'copia-de-imagem-com-dono', 'imagens/itens/Espada.png'],
    ])
    expect(plano.repetidasEntreDonos).toEqual([])
  })

  it('cópia do usuário não serve de "mantida": o órfão do lugar do app vai para soltas, e a do usuário fica', async () => {
    const fs = criarFakeFs({ caixa: 'insensivel' })
    await gravarImagem(fs, 'Imagens/foto.png', 'igual')
    await gravarImagem(fs, 'imagens-canvas/abc.png', 'igual')
    const plano = await planejarOrganizacao(RAIZ, portasDe(fs))
    expect(paraDe(plano)).toEqual({ 'imagens-canvas/abc.png': 'imagens/soltas/abc.png' })
    expect(plano.remocoes).toEqual([])
  })

  it('organizar o que sobrou não mexe em nada (idempotente com a imagem do usuário no cofre)', async () => {
    const fs = criarFakeFs({ caixa: 'insensivel' })
    // A `Imagens/` do usuário vem primeiro, como no cofre real: no NTFS as organizadas caem DENTRO
    // dela, com o I maiúsculo, enquanto a ficha cita `imagens/...`. Na ordem inversa a pasta nasce
    // minúscula e o caso não é exercitado.
    await gravarImagem(fs, 'Imagens/foto.png', 'do usuário')
    await gravarImagem(fs, 'imagens/itens/Espada.png', 'espada')
    await gravarImagem(fs, 'imagens/soltas/abc.png', 'órfã já organizada')
    await gravarJson(fs, 'itens/espada.json', item('i1', 'Espada', 'imagens/itens/Espada.png'))
    expect(fs.arquivos.has(`${RAIZ}/Imagens/itens/Espada.png`)).toBe(true)
    const plano = await planejarOrganizacao(RAIZ, portasDe(fs))
    expect(plano.movimentos).toEqual([])
    expect(plano.remocoes).toEqual([])
    expect(plano.reescritas).toEqual([])
  })

  it('imagem nova, que o app cita como imagens/... e o disco grava dentro da Imagens/ do usuário, não vira reescrita', async () => {
    const fs = criarFakeFs({ caixa: 'insensivel' })
    await gravarImagem(fs, 'Imagens/foto.png', 'do usuário')
    // o endereço que o app dá à imagem nova (`destinoImagemNova` -> `reservarDestino`), com o sufixo do conteúdo
    const rel = await reservarDestino(async () => [], { tipo: 'personagem', nome: 'Garp' }, { papel: 'retrato' }, 'png', { sufixo: 'a3f9' })
    await gravarImagem(fs, rel, 'garp')
    await gravarJson(fs, 'personagens-soltos/garp.json', personagem('p1', [versaoPersonagem('v1', 'Garp', rel)], 'v1'))
    expect(rel).toBe('imagens/personagens/Garp/retrato-a3f9.png')
    expect(fs.arquivos.has(`${RAIZ}/Imagens/personagens/Garp/retrato-a3f9.png`)).toBe(true)
    const plano = await planejarOrganizacao(RAIZ, portasDe(fs))
    expect(plano.movimentos).toEqual([])
    expect(plano.reescritas).toEqual([])
  })
})
