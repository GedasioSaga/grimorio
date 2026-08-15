import { describe, expect, it } from 'vitest'
import { criarFakeFs } from './fakeFs'
import { LixeiraExecutor } from '../lib/lixeiraExecutar'

const RAIZ = 'C:/cofre'

describe('LixeiraExecutor — lixeira vazia', () => {
  it('listar devolve [] quando .lixeira nunca foi criada', async () => {
    const fs = criarFakeFs()
    const lix = new LixeiraExecutor(RAIZ, fs)
    expect(await lix.listar()).toEqual([])
  })

  it('esvaziar uma lixeira vazia é um no-op (não lança)', async () => {
    const fs = criarFakeFs()
    const lix = new LixeiraExecutor(RAIZ, fs)
    await expect(lix.esvaziar()).resolves.toEqual([])
  })
})

describe('LixeiraExecutor — arquivo (personagem/item/canvas)', () => {
  it('move o .json e a pasta .notas irmã; some da origem, aparece listado', async () => {
    const fs = criarFakeFs()
    await fs.writeTextAtomic(`${RAIZ}/personagens-soltos/gandalf.json`, '{"id":"p1","nome":"Gandalf"}')
    await fs.writeTextAtomic(`${RAIZ}/personagens-soltos/gandalf.notas/pagina.json`, '{}')
    const lix = new LixeiraExecutor(RAIZ, fs)

    const id = await lix.moverArquivoParaLixeira({
      tipo: 'personagem', nome: 'Gandalf', origemDir: 'personagens-soltos',
      nomeArquivo: 'gandalf.json', caminhoArquivo: 'personagens-soltos/gandalf.json', entidadeId: 'p1',
    })

    expect(await fs.exists(`${RAIZ}/personagens-soltos/gandalf.json`)).toBe(false)
    expect(await fs.exists(`${RAIZ}/personagens-soltos/gandalf.notas`)).toBe(false)
    expect(await fs.exists(`${RAIZ}/.lixeira/${id}/gandalf.json`)).toBe(true)
    expect(await fs.exists(`${RAIZ}/.lixeira/${id}/gandalf.notas/pagina.json`)).toBe(true)

    const lista = await lix.listar()
    expect(lista).toHaveLength(1)
    expect(lista[0]).toMatchObject({ tipo: 'personagem', nome: 'Gandalf', temNotas: true, entidadeId: 'p1' })
  })

  it('restaura no lugar de origem e sai da lixeira', async () => {
    const fs = criarFakeFs()
    await fs.writeTextAtomic(`${RAIZ}/itens/espada.json`, '{"id":"i1"}')
    const lix = new LixeiraExecutor(RAIZ, fs)
    const id = await lix.moverArquivoParaLixeira({
      tipo: 'item', nome: 'Espada', origemDir: 'itens', nomeArquivo: 'espada.json', caminhoArquivo: 'itens/espada.json',
    })

    await lix.restaurar(id)

    expect(await fs.exists(`${RAIZ}/itens/espada.json`)).toBe(true)
    expect(await fs.exists(`${RAIZ}/.lixeira/${id}`)).toBe(false)
    expect(await lix.listar()).toEqual([])
  })

  it('restaurar quando a pasta de origem já não existe: recria e não lança', async () => {
    const fs = criarFakeFs()
    await fs.writeTextAtomic(`${RAIZ}/personagens-soltos/vilao/gandalf.json`, '{"id":"p1"}')
    const lix = new LixeiraExecutor(RAIZ, fs)
    const id = await lix.moverArquivoParaLixeira({
      tipo: 'personagem', nome: 'Gandalf', origemDir: 'personagens-soltos/vilao',
      nomeArquivo: 'gandalf.json', caminhoArquivo: 'personagens-soltos/vilao/gandalf.json',
    })
    // a pasta "vilao" ficou vazia depois do move e foi apagada por fora (usuário excluiu a pasta)
    await fs.removePath(`${RAIZ}/personagens-soltos/vilao`)

    await expect(lix.restaurar(id)).resolves.toBeDefined()
    expect(await fs.exists(`${RAIZ}/personagens-soltos/vilao/gandalf.json`)).toBe(true)
  })

  it('nome já ocupado no destino: restaura sem sobrescrever, ganha sufixo', async () => {
    const fs = criarFakeFs()
    await fs.writeTextAtomic(`${RAIZ}/itens/espada.json`, '{"id":"i-original"}')
    const lix = new LixeiraExecutor(RAIZ, fs)
    const id = await lix.moverArquivoParaLixeira({
      tipo: 'item', nome: 'Espada', origemDir: 'itens', nomeArquivo: 'espada.json', caminhoArquivo: 'itens/espada.json',
    })
    // um novo item "espada.json" nasceu no mesmo lugar enquanto o velho estava na lixeira
    await fs.writeTextAtomic(`${RAIZ}/itens/espada.json`, '{"id":"i-novo"}')

    await lix.restaurar(id)

    expect(await fs.readText(`${RAIZ}/itens/espada.json`)).toContain('i-novo')
    expect(await fs.readText(`${RAIZ}/itens/espada (2).json`)).toContain('i-original')
  })
})

describe('LixeiraExecutor — cenário (pasta)', () => {
  it('move a pasta inteira do cenário, com notas e imagens dentro', async () => {
    const fs = criarFakeFs()
    await fs.writeTextAtomic(`${RAIZ}/cenarios/taverna/cenario.json`, '{"id":"c1","nome":"Taverna"}')
    await fs.writeTextAtomic(`${RAIZ}/cenarios/taverna/assets/retrato.png`, '<bin>')
    const lix = new LixeiraExecutor(RAIZ, fs)

    const id = await lix.moverPastaParaLixeira({
      tipo: 'cenario', nome: 'Taverna', origemDirPai: 'cenarios', nomeArquivo: 'taverna',
      caminhoPasta: 'cenarios/taverna', entidadeId: 'c1',
    })

    expect(await fs.exists(`${RAIZ}/cenarios/taverna`)).toBe(false)
    expect(await fs.exists(`${RAIZ}/.lixeira/${id}/taverna/cenario.json`)).toBe(true)
    expect(await fs.exists(`${RAIZ}/.lixeira/${id}/taverna/assets/retrato.png`)).toBe(true)
  })

  it('restaura o cenário-pasta com sub-cenários dentro', async () => {
    const fs = criarFakeFs()
    await fs.writeTextAtomic(`${RAIZ}/cenarios/taverna/cenario.json`, '{"id":"c1"}')
    await fs.writeTextAtomic(`${RAIZ}/cenarios/taverna/porao/cenario.json`, '{"id":"c2"}')
    const lix = new LixeiraExecutor(RAIZ, fs)
    const id = await lix.moverPastaParaLixeira({
      tipo: 'cenario', nome: 'Taverna', origemDirPai: 'cenarios', nomeArquivo: 'taverna', caminhoPasta: 'cenarios/taverna',
    })

    await lix.restaurar(id)

    expect(await fs.exists(`${RAIZ}/cenarios/taverna/cenario.json`)).toBe(true)
    expect(await fs.exists(`${RAIZ}/cenarios/taverna/porao/cenario.json`)).toBe(true)
  })
})

describe('LixeiraExecutor — página', () => {
  it('move a página e as descendentes, preservando o conteúdo (paiId incluso)', async () => {
    const fs = criarFakeFs()
    await fs.writeTextAtomic(`${RAIZ}/canvases-soltos/sessao.notas/raiz.json`, JSON.stringify({ id: 'r', titulo: 'Raiz', paiId: null }))
    await fs.writeTextAtomic(`${RAIZ}/canvases-soltos/sessao.notas/filha.json`, JSON.stringify({ id: 'f', titulo: 'Filha', paiId: 'r' }))
    const lix = new LixeiraExecutor(RAIZ, fs)

    const id = await lix.moverPaginasParaLixeira({
      nome: 'Raiz', docCaminho: 'canvases-soltos/sessao.json', dirNotas: 'canvases-soltos/sessao.notas',
      slugs: ['raiz', 'filha'],
    })

    expect(await fs.exists(`${RAIZ}/canvases-soltos/sessao.notas/raiz.json`)).toBe(false)
    expect(await fs.exists(`${RAIZ}/canvases-soltos/sessao.notas/filha.json`)).toBe(false)
    expect(await fs.readText(`${RAIZ}/.lixeira/${id}/paginas/filha.json`)).toContain('"paiId":"r"')
  })

  it('restaura as páginas de volta ao caderno, evitando colisão de nome de arquivo', async () => {
    const fs = criarFakeFs()
    await fs.writeTextAtomic(`${RAIZ}/canvases-soltos/sessao.notas/raiz.json`, JSON.stringify({ id: 'r', titulo: 'Raiz', paiId: null }))
    const lix = new LixeiraExecutor(RAIZ, fs)
    const id = await lix.moverPaginasParaLixeira({
      nome: 'Raiz', docCaminho: 'canvases-soltos/sessao.json', dirNotas: 'canvases-soltos/sessao.notas', slugs: ['raiz'],
    })
    // uma página nova nasceu com o mesmo slug enquanto a antiga estava na lixeira
    await fs.writeTextAtomic(`${RAIZ}/canvases-soltos/sessao.notas/raiz.json`, JSON.stringify({ id: 'nova', titulo: 'Nova' }))

    await lix.restaurar(id)

    expect(await fs.readText(`${RAIZ}/canvases-soltos/sessao.notas/raiz.json`)).toContain('Nova')
    expect(await fs.readText(`${RAIZ}/canvases-soltos/sessao.notas/raiz (2).json`)).toContain('"id":"r"')
  })
})

describe('LixeiraExecutor — campanha (pasta)', () => {
  it('move a campanha inteira — sessões, personagens, canvases e assets juntos', async () => {
    const fs = criarFakeFs()
    await fs.writeTextAtomic(`${RAIZ}/campanhas/reino/campanha.json`, '{"id":"camp1","nome":"Reino"}')
    await fs.writeTextAtomic(`${RAIZ}/campanhas/reino/personagens/gandalf.json`, '{"id":"p1","nome":"Gandalf"}')
    await fs.writeTextAtomic(`${RAIZ}/campanhas/reino/sessoes/sessao-01.json`, '{"id":"s1"}')
    await fs.writeTextAtomic(`${RAIZ}/campanhas/reino/sessoes/sessao-01.notas/pagina.json`, '{}')
    await fs.writeTextAtomic(`${RAIZ}/campanhas/reino/canvases/mapa.json`, '{"id":"cv1"}')
    await fs.writeTextAtomic(`${RAIZ}/campanhas/reino/assets/retrato.png`, '<bin>')
    const lix = new LixeiraExecutor(RAIZ, fs)

    const id = await lix.moverPastaParaLixeira({
      tipo: 'campanha', nome: 'Reino', origemDirPai: 'campanhas', nomeArquivo: 'reino',
      caminhoPasta: 'campanhas/reino', entidadeId: 'camp1',
    })

    // nada sobra na origem
    expect(await fs.exists(`${RAIZ}/campanhas/reino`)).toBe(false)
    // tudo chegou junto do outro lado, com a estrutura interna intacta
    expect(await fs.exists(`${RAIZ}/.lixeira/${id}/reino/campanha.json`)).toBe(true)
    expect(await fs.exists(`${RAIZ}/.lixeira/${id}/reino/personagens/gandalf.json`)).toBe(true)
    expect(await fs.exists(`${RAIZ}/.lixeira/${id}/reino/sessoes/sessao-01.json`)).toBe(true)
    expect(await fs.exists(`${RAIZ}/.lixeira/${id}/reino/sessoes/sessao-01.notas/pagina.json`)).toBe(true)
    expect(await fs.exists(`${RAIZ}/.lixeira/${id}/reino/canvases/mapa.json`)).toBe(true)
    expect(await fs.exists(`${RAIZ}/.lixeira/${id}/reino/assets/retrato.png`)).toBe(true)
  })

  it('restaura a campanha com a estrutura interna inteira no lugar — nada fica pela metade', async () => {
    const fs = criarFakeFs()
    await fs.writeTextAtomic(`${RAIZ}/campanhas/reino/campanha.json`, '{"id":"camp1","nome":"Reino"}')
    await fs.writeTextAtomic(`${RAIZ}/campanhas/reino/personagens/gandalf.json`, '{"id":"p1","nome":"Gandalf"}')
    await fs.writeTextAtomic(`${RAIZ}/campanhas/reino/sessoes/sessao-01.json`, '{"id":"s1"}')
    await fs.writeTextAtomic(`${RAIZ}/campanhas/reino/sessoes/sessao-01.notas/pagina.json`, '{}')
    const lix = new LixeiraExecutor(RAIZ, fs)
    const id = await lix.moverPastaParaLixeira({
      tipo: 'campanha', nome: 'Reino', origemDirPai: 'campanhas', nomeArquivo: 'reino',
      caminhoPasta: 'campanhas/reino', entidadeId: 'camp1',
    })

    await lix.restaurar(id)

    expect(await fs.exists(`${RAIZ}/campanhas/reino/campanha.json`)).toBe(true)
    expect(await fs.exists(`${RAIZ}/campanhas/reino/personagens/gandalf.json`)).toBe(true)
    expect(await fs.exists(`${RAIZ}/campanhas/reino/sessoes/sessao-01.json`)).toBe(true)
    expect(await fs.exists(`${RAIZ}/campanhas/reino/sessoes/sessao-01.notas/pagina.json`)).toBe(true)
    expect(await fs.exists(`${RAIZ}/.lixeira/${id}`)).toBe(false)
  })
})

describe('LixeiraExecutor — listar a partir do disco (sync entre computadores)', () => {
  it('lista uma entrada cuja pasta este computador nunca criou (chegou pelo sync)', async () => {
    const fs = criarFakeFs()
    // ninguém aqui chamou moverXParaLixeira — a pasta e o entrada.json "chegaram" prontos,
    // como aconteceria depois de um ciclo de sync trazendo a exclusão de outro PC
    await fs.writeTextAtomic(
      `${RAIZ}/.lixeira/id-do-outro-pc/entrada.json`,
      JSON.stringify({ tipo: 'item', nome: 'Poção', excluidoEm: '2026-01-01T00:00:00.000Z', origemDir: 'itens', nomeArquivo: 'pocao.json', ehPasta: false }),
    )
    await fs.writeTextAtomic(`${RAIZ}/.lixeira/id-do-outro-pc/pocao.json`, '{"id":"i9"}')
    const lix = new LixeiraExecutor(RAIZ, fs)

    const lista = await lix.listar()

    expect(lista).toHaveLength(1)
    expect(lista[0]).toMatchObject({ id: 'id-do-outro-pc', tipo: 'item', nome: 'Poção' })
  })

  it('entrada.json corrompido é pulada; as outras entradas continuam listadas', async () => {
    const fs = criarFakeFs()
    await fs.writeTextAtomic(`${RAIZ}/.lixeira/boa/entrada.json`,
      JSON.stringify({ tipo: 'item', nome: 'Espada', origemDir: 'itens', nomeArquivo: 'espada.json', ehPasta: false }))
    await fs.writeTextAtomic(`${RAIZ}/.lixeira/corrompida/entrada.json`, '{ isso não é json válido')
    const lix = new LixeiraExecutor(RAIZ, fs)

    const lista = await lix.listar()

    expect(lista).toHaveLength(1)
    expect(lista[0].id).toBe('boa')
  })

  it('pasta dentro de .lixeira sem entrada.json nenhum também é pulada, não lança', async () => {
    const fs = criarFakeFs()
    await fs.mkdirAll(`${RAIZ}/.lixeira/orfa-sem-registro`)
    await fs.writeTextAtomic(`${RAIZ}/.lixeira/boa/entrada.json`,
      JSON.stringify({ tipo: 'personagem', nome: 'Gandalf', origemDir: 'personagens-soltos', nomeArquivo: 'gandalf.json', ehPasta: false }))
    const lix = new LixeiraExecutor(RAIZ, fs)

    const lista = await lix.listar()

    expect(lista).toHaveLength(1)
    expect(lista[0].id).toBe('boa')
  })
})

describe('LixeiraExecutor — esvaziar', () => {
  it('apaga tudo de vez e devolve os entidadeId das entradas removidas', async () => {
    const fs = criarFakeFs()
    await fs.writeTextAtomic(`${RAIZ}/itens/espada.json`, '{"id":"i1"}')
    await fs.writeTextAtomic(`${RAIZ}/cenarios/taverna/cenario.json`, '{"id":"c1"}')
    const lix = new LixeiraExecutor(RAIZ, fs)
    await lix.moverArquivoParaLixeira({
      tipo: 'item', nome: 'Espada', origemDir: 'itens', nomeArquivo: 'espada.json',
      caminhoArquivo: 'itens/espada.json', entidadeId: 'i1',
    })
    await lix.moverPastaParaLixeira({
      tipo: 'cenario', nome: 'Taverna', origemDirPai: 'cenarios', nomeArquivo: 'taverna',
      caminhoPasta: 'cenarios/taverna', entidadeId: 'c1',
    })

    const idsLimpar = await lix.esvaziar()

    expect(idsLimpar.sort()).toEqual(['c1', 'i1'])
    expect(await lix.listar()).toEqual([])
    expect(await fs.exists(`${RAIZ}/.lixeira`)).toBe(false)
  })
})
