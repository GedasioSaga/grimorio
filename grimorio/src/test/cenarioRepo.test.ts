import { beforeEach, describe, expect, it } from 'vitest'
import { criarFakeFs } from './fakeFs'
import { VaultRepo } from '../lib/vaultRepo'

let fs: ReturnType<typeof criarFakeFs>
let repo: VaultRepo

beforeEach(() => {
  fs = criarFakeFs()
  repo = new VaultRepo('C:/Cofre', fs)
})

describe('fakeFs.rename', () => {
  it('move um arquivo', async () => {
    await fs.writeTextAtomic('C:/Cofre/a/x.json', '1')
    await fs.rename('C:/Cofre/a/x.json', 'C:/Cofre/b/x.json')
    expect(await fs.readText('C:/Cofre/b/x.json')).toBe('1')
    expect(await fs.exists('C:/Cofre/a/x.json')).toBe(false)
  })

  it('move um diretório com toda a subárvore', async () => {
    await fs.writeTextAtomic('C:/Cofre/a/cidade/cenario.json', 'c')
    await fs.writeTextAtomic('C:/Cofre/a/cidade/bairro/cenario.json', 'b')
    await fs.mkdirAll('C:/Cofre/a/cidade/vazio')
    await fs.rename('C:/Cofre/a/cidade', 'C:/Cofre/b/cidade')
    expect(await fs.readText('C:/Cofre/b/cidade/cenario.json')).toBe('c')
    expect(await fs.readText('C:/Cofre/b/cidade/bairro/cenario.json')).toBe('b')
    expect(await fs.exists('C:/Cofre/b/cidade/vazio')).toBe(true)
    expect(await fs.exists('C:/Cofre/a/cidade')).toBe(false)
  })

  it('origem inexistente dá erro', async () => {
    await expect(fs.rename('C:/Cofre/nada', 'C:/Cofre/x')).rejects.toThrow()
  })

  it('rename para o mesmo caminho é no-op (não perde o arquivo)', async () => {
    await fs.writeTextAtomic('C:/Cofre/a/x.json', '1')
    await fs.rename('C:/Cofre/a/x.json', 'C:/Cofre/a/x.json')
    expect(await fs.readText('C:/Cofre/a/x.json')).toBe('1')
  })

  it('não arrasta sibling com prefixo compartilhado', async () => {
    await fs.writeTextAtomic('C:/Cofre/a/cidade/cenario.json', 'c')
    await fs.writeTextAtomic('C:/Cofre/a/cidadela/cenario.json', 'ela')
    await fs.rename('C:/Cofre/a/cidade', 'C:/Cofre/b/cidade')
    expect(await fs.readText('C:/Cofre/a/cidadela/cenario.json')).toBe('ela')
  })
})

describe('VaultRepo — cenários CRUD', () => {
  it('cria cenário com dir + cenario.json no formato completo', async () => {
    const ref = await repo.criarCenarioEm('cenarios', 'Cidade Alta')
    expect(ref.slug).toBe('cidade-alta')
    expect(ref.caminho).toBe('cenarios/cidade-alta')
    const cru = JSON.parse(await fs.readText('C:/Cofre/cenarios/cidade-alta/cenario.json'))
    expect(cru.nome).toBe('Cidade Alta')
    expect(cru.id).toBe(ref.id)
    expect(cru.personagens).toEqual([])
    expect(cru.imagens).toEqual([])
    expect(cru.eventos).toBe('')
  })

  it('nomes duplicados no mesmo nível ganham sufixo', async () => {
    const a = await repo.criarCenarioEm('cenarios', 'Taverna')
    const b = await repo.criarCenarioEm('cenarios', 'Taverna')
    expect(a.slug).toBe('taverna')
    expect(b.slug).toBe('taverna-2')
  })

  it('cria sub-cenário dentro de cenário', async () => {
    const cidade = await repo.criarCenarioEm('cenarios', 'Cidade')
    const bairro = await repo.criarCenarioEm(cidade.caminho, 'Bairro do Porto')
    expect(bairro.caminho).toBe('cenarios/cidade/bairro-do-porto')
  })

  it('lê de volta normalizado e salva injetando modificadoEm', async () => {
    const ref = await repo.criarCenarioEm('cenarios', 'Cidade')
    const c = await repo.lerCenario(ref.caminho)
    expect(c.nome).toBe('Cidade')
    await repo.salvarCenario(ref.caminho, { ...c, resumo: 'capital', modificadoEm: '2000-01-01T00:00:00.000Z' })
    const relido = await repo.lerCenario(ref.caminho)
    expect(relido.resumo).toBe('capital')
    expect(relido.modificadoEm).not.toBe('2000-01-01T00:00:00.000Z')
  })

  it('renomeia só o campo nome (dir/slug intactos)', async () => {
    const ref = await repo.criarCenarioEm('cenarios', 'Cidade')
    await repo.renomearCenario(ref.caminho, 'Cidade Baixa')
    const c = await repo.lerCenario(ref.caminho)
    expect(c.nome).toBe('Cidade Baixa')
    expect(await fs.exists('C:/Cofre/cenarios/cidade')).toBe(true)
  })

  it('exclui cenário levando sub-cenários junto', async () => {
    const cidade = await repo.criarCenarioEm('cenarios', 'Cidade')
    await repo.criarCenarioEm(cidade.caminho, 'Bairro')
    await repo.excluirCenario(cidade.caminho)
    expect(await fs.exists('C:/Cofre/cenarios/cidade')).toBe(false)
  })
})

describe('VaultRepo — árvore de cenários', () => {
  it('raiz ausente vira raiz vazia', async () => {
    const raiz = await repo.montarArvoreCenarios()
    expect(raiz.caminho).toBe('cenarios')
    expect(raiz.subpastas).toEqual([])
    expect(raiz.cenarios).toEqual([])
  })

  it('monta pastas + cenários aninhados em profundidade', async () => {
    const pasta = await repo.criarPasta('cenarios', 'Reino do Norte')
    const cidade = await repo.criarCenarioEm(pasta, 'Cidade Alta')
    const bairro = await repo.criarCenarioEm(cidade.caminho, 'Bairro do Porto')
    await repo.criarCenarioEm(bairro.caminho, 'Casa do Ferreiro')
    const raiz = await repo.montarArvoreCenarios()
    expect(raiz.subpastas).toHaveLength(1)
    expect(raiz.subpastas[0].nome).toBe('Reino do Norte')
    const noCidade = raiz.subpastas[0].cenarios[0]
    expect(noCidade.nome).toBe('Cidade Alta')
    expect(noCidade.id).toBe(cidade.id)
    expect(noCidade.filhos[0].nome).toBe('Bairro do Porto')
    expect(noCidade.filhos[0].filhos[0].nome).toBe('Casa do Ferreiro')
  })

  it('cenário raiz fora de pasta aparece na raiz', async () => {
    await repo.criarCenarioEm('cenarios', 'Floresta')
    const raiz = await repo.montarArvoreCenarios()
    expect(raiz.cenarios[0].nome).toBe('Floresta')
  })

  it('cenario.json corrompido vira nó com erro, filhos ainda varridos', async () => {
    const cidade = await repo.criarCenarioEm('cenarios', 'Cidade')
    await repo.criarCenarioEm(cidade.caminho, 'Bairro')
    await fs.writeTextAtomic('C:/Cofre/cenarios/cidade/cenario.json', '{nao é json')
    const raiz = await repo.montarArvoreCenarios()
    expect(raiz.cenarios[0].erro).toBe(true)
    expect(raiz.cenarios[0].filhos).toHaveLength(1)
  })

  it('ignora dirs .notas e dirs sem cenario.json dentro de cenário', async () => {
    const cidade = await repo.criarCenarioEm('cenarios', 'Cidade')
    await fs.mkdirAll(`C:/Cofre/${cidade.caminho}/mapa.notas`)
    await fs.mkdirAll(`C:/Cofre/${cidade.caminho}/assets`)
    const raiz = await repo.montarArvoreCenarios()
    expect(raiz.cenarios[0].filhos).toEqual([])
  })

  it('montarArvore inclui a raiz de cenários', async () => {
    await repo.inicializar()
    await repo.criarCenarioEm('cenarios', 'Floresta')
    const tree = await repo.montarArvore()
    expect(tree.cenarios.cenarios[0].nome).toBe('Floresta')
  })
})
