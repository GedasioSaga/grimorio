import { beforeEach, describe, expect, it } from 'vitest'
import { criarFakeFs } from './fakeFs'
import { VaultRepo } from '../lib/vaultRepo'
import { campanhasHerdadas, idsDePastas } from '../lib/herancaCampanha'
import type { VaultTree, Vinculo } from '../lib/types'

let fs: ReturnType<typeof criarFakeFs>
let repo: VaultRepo

beforeEach(() => {
  fs = criarFakeFs()
  repo = new VaultRepo('C:/Cofre', fs)
})

/**
 * Passa a contar escritas a partir de agora. Contar chamadas (e não comparar bytes)
 * é o que pega uma regravação com conteúdo idêntico.
 */
function contarEscritas(alvo: ReturnType<typeof criarFakeFs>): { total: number } {
  const contador = { total: 0 }
  const original = alvo.writeTextAtomic
  alvo.writeTextAtomic = async (caminho, conteudo) => {
    contador.total++
    await original(caminho, conteudo)
  }
  return contador
}

describe('VaultRepo', () => {
  it('inicializa estrutura do cofre', async () => {
    await repo.inicializar()
    expect(await fs.exists('C:/Cofre/campanhas')).toBe(true)
    expect(await fs.exists('C:/Cofre/canvases-soltos')).toBe(true)
  })

  it('cria campanha com estrutura e meta', async () => {
    await repo.inicializar()
    const slug = await repo.criarCampanha('A Maldição de Strahd')
    expect(slug).toBe('a-maldicao-de-strahd')
    const meta = JSON.parse(await fs.readText('C:/Cofre/campanhas/a-maldicao-de-strahd/campanha.json'))
    expect(meta.nome).toBe('A Maldição de Strahd')
  })

  it('cria personagem e lê de volta', async () => {
    await repo.inicializar()
    const camp = await repo.criarCampanha('Teste')
    const ref = await repo.criarPersonagem(camp, 'Baldur')
    const p = await repo.lerPersonagem(ref.caminho)
    expect(p.nome).toBe('Baldur')
    expect(p.id).toBeTruthy()
  })

  it('cria personagem já no formato de seções (sem corpo)', async () => {
    await repo.inicializar()
    const camp = await repo.criarCampanha('Teste')
    const ref = await repo.criarPersonagem(camp, 'Baldur')
    const p = await repo.lerPersonagem(ref.caminho)
    expect(p.versoes[0].descricao).toBe('')
    expect(p.versoes[0].informacao).toBe('')
    expect(p.versoes[0].historia).toBe('')
    expect(p.versoes[0].extras).toBe('')
    expect(p.versoes[0].anotacoes).toBe('')
    expect(p.versoes[0].imagens).toEqual([])
    expect((p as unknown as { corpo?: string }).corpo).toBeUndefined()
  })

  it('migra arquivo legado: abrir e salvar remove `corpo` do disco', async () => {
    await repo.inicializar()
    const camp = await repo.criarCampanha('Teste')
    const caminho = `campanhas/${camp}/personagens/legado.json`
    // grava um personagem no formato legado (com corpo, sem os campos de seção)
    await fs.writeTextAtomic(`C:/Cofre/${caminho}`, JSON.stringify({
      id: 'x', nome: 'Legado', retrato: null, resumo: 'r',
      corpo: '<p>antigo</p>',
      criadoEm: '2020-01-01T00:00:00.000Z', modificadoEm: '2020-01-01T00:00:00.000Z',
    }))
    const p = await repo.lerPersonagem(caminho)
    expect(p.versoes[0].descricao).toBe('<p>antigo</p>')
    await repo.salvarPersonagem(caminho, p)
    const cru = JSON.parse(await fs.readText(`C:/Cofre/${caminho}`))
    expect(cru.corpo).toBeUndefined()
    expect(cru.versoes[0].descricao).toBe('<p>antigo</p>')
  })

  it('salva e recarrega personagem preservando id', async () => {
    await repo.inicializar()
    const camp = await repo.criarCampanha('Teste')
    const ref = await repo.criarPersonagem(camp, 'Baldur')
    const p = await repo.lerPersonagem(ref.caminho)
    const comResumo = { ...p, versoes: p.versoes.map((v) => ({ ...v, resumo: 'taverneiro' })) }
    await repo.salvarPersonagem(ref.caminho, comResumo)
    const p2 = await repo.lerPersonagem(ref.caminho)
    expect(p2.versoes[0].resumo).toBe('taverneiro')
    expect(p2.id).toBe(p.id)
  })

  it('cria sessão e canvas solto', async () => {
    await repo.inicializar()
    const camp = await repo.criarCampanha('Teste')
    const s = await repo.criarCanvasDoc(`campanhas/${camp}/sessoes`, 'Sessão 01')
    const c = await repo.criarCanvasDoc('canvases-soltos', 'Rabisco')
    expect(s.caminho).toBe('campanhas/teste/sessoes/sessao-01.json')
    expect(c.caminho).toBe('canvases-soltos/rabisco.json')
  })

  it('monta árvore do cofre', async () => {
    await repo.inicializar()
    const camp = await repo.criarCampanha('Teste')
    await repo.criarPersonagem(camp, 'Baldur')
    await repo.criarCanvasDoc(`campanhas/${camp}/sessoes`, 'Sessão 01')
    await repo.criarCanvasDoc('canvases-soltos', 'Rabisco')
    const tree = await repo.montarArvore()
    expect(tree.campanhas).toHaveLength(1)
    expect(tree.campanhas[0].personagens[0].nome).toBe('Baldur')
    expect(tree.campanhas[0].sessoes[0].nome).toBe('Sessão 01')
    expect(tree.canvasesSoltos[0].nome).toBe('Rabisco')
  })

  it('arquivo corrompido vira item com erro, sem derrubar a árvore', async () => {
    await repo.inicializar()
    const camp = await repo.criarCampanha('Teste')
    await fs.writeTextAtomic(`C:/Cofre/campanhas/${camp}/personagens/quebrado.json`, '{nao é json')
    const tree = await repo.montarArvore()
    const quebrado = tree.campanhas[0].personagens.find((p) => p.slug === 'quebrado')
    expect(quebrado?.erro).toBe(true)
  })

  it('nomes duplicados ganham sufixo', async () => {
    await repo.inicializar()
    const camp = await repo.criarCampanha('Teste')
    const a = await repo.criarPersonagem(camp, 'Baldur')
    const b = await repo.criarPersonagem(camp, 'Baldur')
    expect(a.slug).toBe('baldur')
    expect(b.slug).toBe('baldur-2')
  })

  it('renomeia item (muda campo nome, mantém arquivo)', async () => {
    // usa um CanvasDoc (nome plano, não por-versão) — personagem tem nome espelhado
    // da versão ativa e não é mais renomeável pelo caminho genérico (ver normalizarPersonagem)
    await repo.inicializar()
    const ref = await repo.criarCanvasDoc('canvases-soltos', 'Rabisco')
    await repo.renomearItem(ref.caminho, 'Rabisco Final')
    const doc = await repo.lerCanvasDoc(ref.caminho)
    expect(doc.nome).toBe('Rabisco Final')
  })

  it('exclui item', async () => {
    await repo.inicializar()
    const camp = await repo.criarCampanha('Teste')
    const ref = await repo.criarPersonagem(camp, 'Baldur')
    await repo.excluirItem(ref.caminho)
    expect(await fs.exists(`C:/Cofre/${ref.caminho}`)).toBe(false)
  })

  it('salvar não muta o objeto passado', async () => {
    await repo.inicializar()
    const camp = await repo.criarCampanha('Teste')
    const ref = await repo.criarPersonagem(camp, 'Baldur')
    const p = await repo.lerPersonagem(ref.caminho)
    const antes = p.modificadoEm
    await repo.salvarPersonagem(ref.caminho, p)
    expect(p.modificadoEm).toBe(antes)
  })

  it('salvarDocumentoCanvas preserva nome renomeado concorrentemente', async () => {
    await repo.inicializar()
    const camp = await repo.criarCampanha('Teste')
    const ref = await repo.criarCanvasDoc(`campanhas/${camp}/sessoes`, 'Sessão 01')
    await repo.renomearItem(ref.caminho, 'Sessão 01 — Renomeada')
    await repo.salvarDocumentoCanvas(ref.caminho, { document: {}, session: {} })
    const doc = await repo.lerCanvasDoc(ref.caminho)
    expect(doc.nome).toBe('Sessão 01 — Renomeada')
    expect(doc.documento).toEqual({ document: {}, session: {} })
  })

  it('copia arquivo externo para dentro do cofre', async () => {
    await repo.inicializar()
    fs.arquivos.set('C:/Downloads/foto.png', '<bin>')
    await repo.copiarParaCofre('C:/Downloads/foto.png', 'campanhas/teste/assets/retrato.png')
    expect(await fs.exists('C:/Cofre/campanhas/teste/assets/retrato.png')).toBe(true)
  })

  it('remove arquivo do cofre por caminho relativo', async () => {
    await repo.inicializar()
    fs.arquivos.set('C:/Downloads/foto.png', '<bin>')
    await repo.copiarParaCofre('C:/Downloads/foto.png', 'campanhas/teste/assets/galeria-1.png')
    expect(await fs.exists('C:/Cofre/campanhas/teste/assets/galeria-1.png')).toBe(true)
    await repo.removerArquivoCofre('campanhas/teste/assets/galeria-1.png')
    expect(await fs.exists('C:/Cofre/campanhas/teste/assets/galeria-1.png')).toBe(false)
  })

  it('escreve binário base64 em caminho relativo', async () => {
    await repo.inicializar()
    await repo.escreverBinario('imagens-canvas/a.png', 'aGVsbG8=')
    expect(await fs.exists('C:/Cofre/imagens-canvas/a.png')).toBe(true)
  })

  it('escritas concorrentes no mesmo caminho são serializadas (última vence)', async () => {
    await repo.inicializar()
    const camp = await repo.criarCampanha('Teste')
    const ref = await repo.criarPersonagem(camp, 'Baldur')
    const p = await repo.lerPersonagem(ref.caminho)
    await Promise.all([
      repo.salvarPersonagem(ref.caminho, { ...p, versoes: p.versoes.map((v) => ({ ...v, resumo: 'primeiro' })) }),
      repo.salvarPersonagem(ref.caminho, { ...p, versoes: p.versoes.map((v) => ({ ...v, resumo: 'segundo' })) }),
    ])
    const final = await repo.lerPersonagem(ref.caminho)
    expect(final.versoes[0].resumo).toBe('segundo')
  })

  it('escreve texto e binário em caminho absoluto (export)', async () => {
    await repo.escreverTextoAbsoluto('C:/Saida/canvas.svg', '<svg/>')
    await repo.escreverBinarioAbsoluto('C:/Saida/canvas.png', 'aGVsbG8=')
    expect(await fs.exists('C:/Saida/canvas.svg')).toBe(true)
    expect(await fs.exists('C:/Saida/canvas.png')).toBe(true)
  })

  // ---- personagens fora da campanha (pastas aninhadas) ----

  it('cria pasta com metadados e personagem dentro dela', async () => {
    const { caminho: dir } = await repo.criarPasta('personagens-soltos', 'Vilões')
    expect(dir).toBe('personagens-soltos/viloes')
    expect(await fs.exists('C:/Cofre/personagens-soltos/viloes/pasta.json')).toBe(true)
    const ref = await repo.criarPersonagemEm(dir, 'Strahd')
    expect(ref.caminho).toBe('personagens-soltos/viloes/strahd.json')
    expect((await repo.lerPersonagem(ref.caminho)).nome).toBe('Strahd')
  })

  it('monta a árvore de pastas aninhadas com nome vindo do pasta.json', async () => {
    const { caminho: vil } = await repo.criarPasta('personagens-soltos', 'Vilões')
    await repo.criarPasta(vil, 'Chefes')
    await repo.criarPersonagemEm(vil, 'Strahd')
    await repo.criarPersonagemEm('personagens-soltos', 'Andarilho')
    const raiz = await repo.montarArvorePastas('personagens-soltos')
    expect(raiz.personagens.map((p) => p.nome)).toEqual(['Andarilho'])
    const noVil = raiz.subpastas.find((s) => s.nome === 'Vilões')!
    expect(noVil.personagens.map((p) => p.nome)).toEqual(['Strahd'])
    expect(noVil.subpastas.map((s) => s.nome)).toEqual(['Chefes'])
  })

  it('move personagem de uma campanha para uma pasta solta', async () => {
    await repo.inicializar()
    const camp = await repo.criarCampanha('Teste')
    const ref = await repo.criarPersonagem(camp, 'Baldur')
    const idAntes = (await repo.lerPersonagem(ref.caminho)).id
    const { caminho: dir } = await repo.criarPasta('personagens-soltos', 'Aliados')
    await repo.moverPersonagem(ref.caminho, dir)
    expect(await fs.exists(`C:/Cofre/${ref.caminho}`)).toBe(false)
    const p = await repo.lerPersonagem(`${dir}/baldur.json`)
    expect(p.nome).toBe('Baldur')
    expect(p.id).toBe(idAntes)
  })

  it('mover para o mesmo diretório é no-op', async () => {
    const ref = await repo.criarPersonagemEm('personagens-soltos', 'Solo')
    await repo.moverPersonagem(ref.caminho, 'personagens-soltos')
    expect(await fs.exists(`C:/Cofre/${ref.caminho}`)).toBe(true)
  })

  // ---- id na criação e na árvore (etiqueta de campanha) ----

  it('criarCanvasDoc retorna o id do doc (p/ etiquetar em campanha)', async () => {
    await repo.inicializar()
    const ref = await repo.criarCanvasDoc('canvases-soltos', 'Mapa')
    expect(ref.id).toBeTruthy()
    expect((await repo.lerCanvasDoc(ref.caminho)).id).toBe(ref.id)
  })

  it('a árvore traz o id dos canvases soltos (usado pelo filtro de campanha)', async () => {
    await repo.inicializar()
    const ref = await repo.criarCanvasDoc('canvases-soltos', 'Rabisco')
    const tree = await repo.montarArvore()
    expect(tree.canvasesSoltos[0].id).toBe(ref.id)
  })

  it('a árvore de pastas traz o id dos personagens', async () => {
    const ref = await repo.criarPersonagemEm('personagens-soltos', 'Solo')
    const raiz = await repo.montarArvorePastas('personagens-soltos')
    expect(raiz.personagens[0].id).toBe(ref.id)
  })
})

describe('id de pasta', () => {
  it('criarPasta grava um id e devolve caminho + id', async () => {
    const { caminho, id } = await repo.criarPasta('personagens-soltos', 'Vilões')
    expect(caminho).toBe('personagens-soltos/viloes')
    expect(id).toBeTruthy()
    const meta = JSON.parse(fs.arquivos.get(`C:/Cofre/${caminho}/pasta.json`)!)
    expect(meta.id).toBe(id)
    expect(meta.nome).toBe('Vilões')
  })

  it('renomearItem preserva o id da pasta', async () => {
    const { caminho, id } = await repo.criarPasta('personagens-soltos', 'Vilões')
    await repo.renomearItem(`${caminho}/pasta.json`, 'Heróis')
    const meta = JSON.parse(fs.arquivos.get(`C:/Cofre/${caminho}/pasta.json`)!)
    expect(meta.id).toBe(id)
    expect(meta.nome).toBe('Heróis')
  })

  it('garantirIdDePasta gera uma vez e depois devolve o mesmo, sem regravar', async () => {
    // pasta legada: pasta.json sem id, com um campo que o app não conhece
    await fs.writeTextAtomic('C:/Cofre/personagens-soltos/antiga/pasta.json', JSON.stringify({ nome: 'Antiga', criadoEm: 'x', campoLegado: 'preservar-me' }))
    const primeiro = await repo.garantirIdDePasta('personagens-soltos/antiga')
    // com o id já no disco, a 2ª chamada não pode escrever (é o que mantém a migração lazy)
    const escritas = contarEscritas(fs)
    const segundo = await repo.garantirIdDePasta('personagens-soltos/antiga')
    expect(escritas.total).toBe(0)
    expect(primeiro).toBeTruthy()
    expect(segundo).toBe(primeiro)
    const meta = JSON.parse(fs.arquivos.get('C:/Cofre/personagens-soltos/antiga/pasta.json')!)
    expect(meta.nome).toBe('Antiga')
    expect(meta.campoLegado).toBe('preservar-me')
  })

  it('garantirIdDePasta não regrava pasta recém-criada (já tem id)', async () => {
    const { caminho, id } = await repo.criarPasta('personagens-soltos', 'Vilões')
    const escritas = contarEscritas(fs)
    expect(await repo.garantirIdDePasta(caminho)).toBe(id)
    expect(escritas.total).toBe(0)
  })

  it('garantirIdDePasta não sobrescreve pasta.json ilegível', async () => {
    // truncado por conflito de sync: o nome ainda é recuperável à mão, não pode ser destruído
    const arquivo = 'C:/Cofre/personagens-soltos/corrompida/pasta.json'
    const truncado = '{"nome": "Vilões Importantes", "criadoEm": "2020-01-0'
    await fs.writeTextAtomic(arquivo, truncado)
    await expect(repo.garantirIdDePasta('personagens-soltos/corrompida')).rejects.toThrow(SyntaxError)
    expect(fs.arquivos.get(arquivo)).toBe(truncado)
  })

  it('garantirIdDePasta recusa pasta.json que não é objeto', async () => {
    // array aceita `obj.id = x` calado, mas o stringify descarta: id devolvido não existiria no disco
    const arquivo = 'C:/Cofre/personagens-soltos/array/pasta.json'
    await fs.writeTextAtomic(arquivo, '[]')
    await expect(repo.garantirIdDePasta('personagens-soltos/array')).rejects.toThrow(/pasta\.json inválido/)
    expect(fs.arquivos.get(arquivo)).toBe('[]')
  })

  it('garantirIdDePasta sintetiza quando pasta.json está vazio (0 byte)', async () => {
    // arquivo zerado por sync interrompido: não há nome a preservar, então nasce metadado novo
    const arquivo = 'C:/Cofre/personagens-soltos/zerada/pasta.json'
    await fs.writeTextAtomic(arquivo, '')
    const id = await repo.garantirIdDePasta('personagens-soltos/zerada')
    expect(id).toBeTruthy()
    const meta = JSON.parse(fs.arquivos.get(arquivo)!)
    expect(meta.id).toBe(id)
    expect(meta.nome).toBe('zerada')
  })

  it('duas chamadas concorrentes de garantirIdDePasta cunham um id só', async () => {
    await fs.writeTextAtomic('C:/Cofre/personagens-soltos/antiga/pasta.json', JSON.stringify({ nome: 'Antiga' }))
    const escritas = contarEscritas(fs)
    fs.atrasoEscritaMs = 20 // sem a fila, as duas leriam "sem id" antes de qualquer escrita
    const [a, b] = await Promise.all([
      repo.garantirIdDePasta('personagens-soltos/antiga'),
      repo.garantirIdDePasta('personagens-soltos/antiga'),
    ])
    fs.atrasoEscritaMs = 0
    expect(a).toBe(b)
    expect(escritas.total).toBe(1)
    expect(JSON.parse(fs.arquivos.get('C:/Cofre/personagens-soltos/antiga/pasta.json')!).id).toBe(a)
  })

  it('garantirIdDePasta e renomearItem concorrentes na mesma pasta não se sobrescrevem', async () => {
    const arquivo = 'C:/Cofre/personagens-soltos/antiga/pasta.json'
    await fs.writeTextAtomic(arquivo, JSON.stringify({ nome: 'Antiga' }))
    fs.atrasoEscritaMs = 20 // compartilham a chave da fila: um relê o que o outro gravou
    const [id] = await Promise.all([
      repo.garantirIdDePasta('personagens-soltos/antiga'),
      repo.renomearItem('personagens-soltos/antiga/pasta.json', 'Renomeada'),
    ])
    fs.atrasoEscritaMs = 0
    const meta = JSON.parse(fs.arquivos.get(arquivo)!)
    expect(meta.id).toBe(id)            // o id sobreviveu ao rename
    expect(meta.nome).toBe('Renomeada') // o rename sobreviveu ao id
  })

  it('garantirIdDePasta funciona em pasta sem pasta.json', async () => {
    const id = await repo.garantirIdDePasta('personagens-soltos/solta')
    expect(id).toBeTruthy()
    const meta = JSON.parse(fs.arquivos.get('C:/Cofre/personagens-soltos/solta/pasta.json')!)
    expect(meta.nome).toBe('solta')
  })

  it('a árvore de personagens expõe o id da pasta', async () => {
    const { id } = await repo.criarPasta('personagens-soltos', 'Vilões')
    const raiz = await repo.montarArvorePastas('personagens-soltos')
    expect(raiz.subpastas[0].id).toBe(id)
    expect(raiz.id).toBeUndefined() // a raiz não tem pasta.json
  })

  it('a árvore de cenários expõe o id da pasta', async () => {
    const { id } = await repo.criarPasta('cenarios', 'Reinos')
    const raiz = await repo.montarArvoreCenarios()
    expect(raiz.subpastas[0].id).toBe(id)
  })

  it('pasta legada sem id aparece na árvore com id undefined', async () => {
    await fs.writeTextAtomic('C:/Cofre/personagens-soltos/legada/pasta.json', JSON.stringify({ nome: 'Legada', criadoEm: 'x' }))
    const raiz = await repo.montarArvorePastas('personagens-soltos')
    const legada = raiz.subpastas.find((s) => s.nome === 'Legada')
    expect(legada).toBeDefined()
    expect(legada!.id).toBeUndefined()
  })

  it('pasta com pasta.json corrompido (JSON inválido) ainda aparece na árvore, com nome do diretório e sem id', async () => {
    // truncado por conflito de sync — mesmo cenário de garantirIdDePasta, mas aqui o read deve engolir o erro, não propagar
    await fs.writeTextAtomic('C:/Cofre/personagens-soltos/corrompida/pasta.json', '{"nome": "Vilões Importantes", "criadoEm": "2020-01-0')
    const raiz = await repo.montarArvorePastas('personagens-soltos')
    const corrompida = raiz.subpastas.find((s) => s.slug === 'corrompida')
    expect(corrompida).toBeDefined()
    expect(corrompida!.nome).toBe('corrompida') // fallback pro nome do diretório
    expect(corrompida!.id).toBeUndefined()
  })
})

// ---- idsDePastas / campanhasHerdadas contra a árvore REAL (não montada à mão) ----
// herancaCampanha.test.ts cobre idsDePastas com árvores montadas à mão (id setado direto
// no fixture) — isso não pega o builder esquecendo de propagar `id`. Foi exatamente o que
// aconteceu: montarArvorePastas/montarArvoreCenarios pararam de ler `id` do pasta.json e
// idsDePastas(árvore real) virava {} silenciosamente, sem nenhum teste vermelho. Estes
// testes ligam os builders de verdade ao consumidor de verdade.
describe('idsDePastas + campanhasHerdadas ligados à árvore real do VaultRepo', () => {
  it('idsDePastas lê os ids que os builders reais escrevem na árvore', async () => {
    const pastaPersonagens = await repo.criarPasta('personagens-soltos', 'Vilões')
    const pastaCenarios = await repo.criarPasta('cenarios', 'Reinos')

    const personagensSoltos = await repo.montarArvorePastas('personagens-soltos')
    const cenarios = await repo.montarArvoreCenarios()
    const tree: VaultTree = { campanhas: [], canvasesSoltos: [], personagensSoltos, cenarios }

    const mapa = idsDePastas(tree)

    expect(mapa[pastaPersonagens.caminho]).toBe(pastaPersonagens.id)
    expect(mapa[pastaCenarios.caminho]).toBe(pastaCenarios.id)
  })

  it('campanhasHerdadas encontra a campanha vinculada a uma pasta real (prova a feature, não só o mapa)', async () => {
    const { caminho: dirPasta, id: idPasta } = await repo.criarPasta('personagens-soltos', 'Vilões')
    const item = await repo.criarPersonagemEm(dirPasta, 'Strahd')

    const personagensSoltos = await repo.montarArvorePastas('personagens-soltos')
    const cenarios = await repo.montarArvoreCenarios()
    const tree: VaultTree = { campanhas: [], canvasesSoltos: [], personagensSoltos, cenarios }
    const mapa = idsDePastas(tree)

    const vinculo: Vinculo = {
      id: 'v-1', deTipo: 'pasta', deId: idPasta, paraTipo: 'campanha', paraId: 'camp-real',
      tipo: 'participa', notas: '', criadoEm: '',
    }

    expect(campanhasHerdadas(item.caminho, mapa, [vinculo])).toEqual(['camp-real'])
  })
})
