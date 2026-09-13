import { afterEach, beforeEach, describe, expect, it } from 'vitest'
// Sem @types/node neste projeto (frontend puro) — mesma supressão que `amostraMapa.test.ts`
// e `vite.config.ts` já usam. Os módulos existem em tempo de execução: o vitest roda em Node.
// @ts-expect-error node builtin sem @types/node
import { copyFile as copiarArquivo, mkdir, mkdtemp, readFile, readdir, rename as renomearCaminho, rm, stat, writeFile } from 'node:fs/promises'
// @ts-expect-error node builtin sem @types/node
import { tmpdir } from 'node:os'
// @ts-expect-error node builtin sem @types/node
import { dirname, join } from 'node:path'
import type { EntradaDeDiretorio, FsBridge } from '../lib/fsBridge'
import { ehPastaInternaDaArvore } from '../lib/pastasInternas'
import { slugify } from '../lib/slug'
import { VaultRepo } from '../lib/vaultRepo'

/**
 * Portão no SISTEMA DE ARQUIVOS DE VERDADE.
 *
 * Toda a suíte de árvore roda em cima de `src/test/fakeFs` — um Map em memória. O fake é
 * rápido e determinístico, mas ele é escrito pela mesma pessoa que escreve a regra: se o
 * fake e a regra combinarem o mesmo engano (separador de caminho, acento normalizado
 * diferente, diretório vazio que o fake nem lista), o portão fica verde e o cofre do usuário
 * é que paga. Aqui a árvore é montada sobre um cofre real em `os.tmpdir()`, pelo mesmo
 * `VaultRepo` que o app usa.
 *
 * O que se prova aqui é o invariante mais caro do recorte: NADA que o usuário criou some da
 * árvore, e o que o app esconde continua no disco.
 */

/** `FsBridge` sobre `node:fs` — o mesmo contrato que o lado Rust implementa em produção. */
function fsDoDisco(): FsBridge {
  return {
    async readText(caminho) {
      return await readFile(caminho, 'utf8')
    },
    async writeTextAtomic(caminho, conteudo) {
      await mkdir(dirname(caminho), { recursive: true })
      await writeFile(caminho, conteudo, 'utf8')
    },
    async writeBinaryBase64(caminho, base64) {
      await mkdir(dirname(caminho), { recursive: true })
      await writeFile(caminho, Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)))
    },
    async listDir(caminho) {
      const entradas = await readdir(caminho, { withFileTypes: true })
      const saida: EntradaDeDiretorio[] = []
      for (const e of entradas) {
        const alvo = join(caminho, e.name)
        const meta = await stat(alvo).catch(() => null)
        saida.push({
          name: e.name,
          isDir: e.isDirectory(),
          size: meta && !e.isDirectory() ? meta.size : null,
          mtime: meta ? Math.round(meta.mtimeMs) : null,
        })
      }
      return saida
    },
    async mkdirAll(caminho) {
      await mkdir(caminho, { recursive: true })
    },
    async removePath(caminho) {
      await rm(caminho, { recursive: true, force: true })
    },
    async copyFile(de, para) {
      await copiarArquivo(de, para)
    },
    async rename(de, para) {
      await renomearCaminho(de, para)
    },
    async exists(caminho) {
      return await stat(caminho).then(
        () => true,
        () => false,
      )
    },
  }
}

let raiz: string
let repo: VaultRepo

/** Slugs ordenados: a ordem do disco é do sistema operacional, não é o que se prova aqui. */
const slugsDe = (nos: { slug: string }[]): string[] => nos.map((n) => n.slug).sort()

async function escrever(rel: string, conteudo: string): Promise<void> {
  const alvo = join(raiz, rel)
  await mkdir(dirname(alvo), { recursive: true })
  await writeFile(alvo, conteudo, 'utf8')
}

async function existe(rel: string): Promise<boolean> {
  return await stat(join(raiz, rel)).then(
    () => true,
    () => false,
  )
}

beforeEach(async () => {
  raiz = await mkdtemp(join(tmpdir(), 'grimorio-portao-'))
  repo = new VaultRepo(raiz.replace(/\\/g, '/'), fsDoDisco())
  await repo.inicializar()
})

afterEach(async () => {
  await rm(raiz, { recursive: true, force: true })
})

describe('árvore de personagens sobre disco real', () => {
  beforeEach(async () => {
    // conteúdo do mestre
    await escrever('personagens-soltos/vilas/pasta.json', JSON.stringify({ nome: 'Vilas' }))
    await escrever('personagens-soltos/vilas/gandalf.json', JSON.stringify({ id: 'g', nome: 'Gandalf' }))
    await escrever('personagens-soltos/vilas/aldeia/pasta.json', JSON.stringify({ nome: 'Aldeia' }))
    await escrever('personagens-soltos/vilas/aldeia/anao.json', JSON.stringify({ id: 'a', nome: 'Anão' }))
    await escrever('personagens-soltos/assets-magicos/varinha.json', JSON.stringify({ id: 'v', nome: 'Varinha' }))
    // pasta com acento e espaço, criada pelo usuário: o disco real normaliza Unicode do jeito dele
    await escrever('personagens-soltos/Minhas Anotações/pasta.json', JSON.stringify({ nome: 'Minhas Anotações' }))

    // infraestrutura: retrato que o app gera, e sujeira de ferramenta externa
    await mkdir(join(raiz, 'personagens-soltos/vilas/assets'), { recursive: true })
    await writeFile(join(raiz, 'personagens-soltos/vilas/assets/retrato-g-1.png'), Uint8Array.from([137, 80, 78, 71]))
    await escrever('personagens-soltos/vilas/.obsidian/app.json', '{}')
  })

  it('toda pasta e ficha do mestre aparece, em qualquer nível', async () => {
    const arvore = await repo.montarArvorePastas('personagens-soltos')

    expect(slugsDe(arvore.subpastas)).toEqual(['Minhas Anotações', 'assets-magicos', 'vilas'].sort())

    const vilas = arvore.subpastas.find((p) => p.slug === 'vilas')
    if (!vilas) throw new Error('a pasta "vilas" sumiu da árvore')
    expect(slugsDe(vilas.personagens)).toEqual(['gandalf'])
    expect(slugsDe(vilas.subpastas)).toEqual(['aldeia'])

    const aldeia = vilas.subpastas.find((p) => p.slug === 'aldeia')
    if (!aldeia) throw new Error('a subpasta "aldeia" sumiu da árvore')
    expect(slugsDe(aldeia.personagens)).toEqual(['anao'])
  })

  it('o retrato do app e o `.obsidian` saem da árvore e continuam no disco', async () => {
    const arvore = await repo.montarArvorePastas('personagens-soltos')
    const vilas = arvore.subpastas.find((p) => p.slug === 'vilas')
    if (!vilas) throw new Error('a pasta "vilas" sumiu da árvore')

    expect(slugsDe(vilas.subpastas)).not.toContain('assets')
    expect(slugsDe(vilas.subpastas)).not.toContain('.obsidian')

    expect(await existe('personagens-soltos/vilas/assets/retrato-g-1.png')).toBe(true)
    expect(await existe('personagens-soltos/vilas/.obsidian/app.json')).toBe(true)
  })

  /**
   * O caso que o portão precisava vigiar e não vigiava: `slugify('Assets')` é `assets`, o
   * mesmo nome que o app usa para retrato. O que separa os dois é o `pasta.json` que
   * `criarPasta` grava. Num disco Windows de verdade, `Assets` e `assets` seriam ainda por
   * cima o MESMO diretório se dividissem o pai — por isso este caso mora no disco real.
   */
  it('pasta que o mestre batizou de "Assets" não some, e leva a ficha junto', async () => {
    await escrever('personagens-soltos/Assets/pasta.json', JSON.stringify({ nome: 'Assets' }))
    await escrever('personagens-soltos/Assets/ferreiro.json', JSON.stringify({ id: 'f', nome: 'Ferreiro' }))

    const arvore = await repo.montarArvorePastas('personagens-soltos')
    const pasta = arvore.subpastas.find((p) => p.slug === 'Assets')
    if (!pasta) throw new Error('a pasta "Assets" do mestre sumiu da árvore, com a ficha dentro')
    expect(slugsDe(pasta.personagens)).toEqual(['ferreiro'])
  })

  it('montar a árvore não escreve nem apaga nada no cofre', async () => {
    const antes = JSON.stringify(await readdir(join(raiz, 'personagens-soltos/vilas')))
    await repo.montarArvorePastas('personagens-soltos')
    const depois = JSON.stringify(await readdir(join(raiz, 'personagens-soltos/vilas')))
    expect(depois).toBe(antes)
    expect(await readFile(join(raiz, 'personagens-soltos/vilas/gandalf.json'), 'utf8')).toBe(
      JSON.stringify({ id: 'g', nome: 'Gandalf' }),
    )
  })
})

describe('árvore de cenários sobre disco real', () => {
  it('pasta organizacional e cenário do mestre sobrevivem; infraestrutura não aparece', async () => {
    await escrever('cenarios/regiao/pasta.json', JSON.stringify({ nome: 'Região' }))
    await escrever('cenarios/regiao/taverna/cenario.json', JSON.stringify({ id: 't', nome: 'Taverna' }))
    await escrever('cenarios/regiao/taverna/mapa.notas/nota.md', 'anotação')
    await mkdir(join(raiz, 'cenarios/regiao/assets'), { recursive: true })
    await writeFile(join(raiz, 'cenarios/regiao/assets/retrato-t-1.png'), Uint8Array.from([137, 80, 78, 71]))
    await escrever('cenarios/.trash/lixo.json', '{}')

    const arvore = await repo.montarArvoreCenarios()
    expect(slugsDe(arvore.subpastas)).toEqual(['regiao'])

    const regiao = arvore.subpastas.find((p) => p.slug === 'regiao')
    if (!regiao) throw new Error('a pasta "regiao" sumiu da árvore')
    expect(slugsDe(regiao.cenarios)).toEqual(['taverna'])
    expect(slugsDe(regiao.subpastas)).toEqual([])

    // o que saiu da árvore continua no disco, com o conteúdo intacto
    expect(await existe('cenarios/regiao/assets/retrato-t-1.png')).toBe(true)
    expect(await existe('cenarios/.trash/lixo.json')).toBe(true)
    expect(await existe('cenarios/regiao/taverna/mapa.notas/nota.md')).toBe(true)
  })

  it('cenário que o mestre batizou de "Assets" continua na árvore', async () => {
    await escrever('cenarios/assets/cenario.json', JSON.stringify({ id: 'a', nome: 'Assets' }))

    const arvore = await repo.montarArvoreCenarios()
    expect(slugsDe(arvore.cenarios)).toContain('assets')
  })
})

/**
 * CENSO: nada que o app cria PARA o mestre pode sumir da árvore.
 *
 * Os casos acima nomeiam à mão o nome que já se sabe perigoso ("Assets"). Isso vigia o bug
 * conhecido e mais nada: no dia em que alguém acrescentar um nome novo à regra de ocultar
 * — `temp`, `_arquivo`, `backup` —, todos eles seguem verdes e o conteúdo do mestre some
 * outra vez, exatamente como sumiu da primeira vez.
 *
 * O censo inverte o ônus. Em vez de listar o que deve sumir, ele cria uma bateria de nomes
 * pela MESMA API que a interface usa (`criarPasta`, `criarCenarioEm`, `criarPersonagemEm`,
 * `criarItemEm`) e exige que TODO slug devolvido reapareça na árvore. Qualquer regra de
 * ocultar que passe a engolir um deles quebra aqui, sem ninguém precisar prever o nome.
 *
 * Tudo nasce no MESMO diretório pai de propósito: quatro grafias de "assets" colidem no
 * mesmo slug e passam por `slugUnico`, que é justamente o caminho por onde o conteúdo do
 * mestre acaba dentro de um diretório com cara de infraestrutura.
 */
describe('censo: nada que o mestre cria some da árvore', () => {
  /**
   * Nomes que o mestre pode digitar e que exercitam as bordas do slug: as quatro grafias
   * que colidem em `assets`, nomes que viram ponto-inicial se o slug não limpar, nome que
   * colapsa para vazio, reservado do Windows, acento, espaço e caractere fora do latino.
   */
  const NOMES_DO_MESTRE = [
    'Assets',
    'assets',
    'ASSETS',
    '  assets  ',
    'assets-magicos',
    '.git',
    '.obsidian',
    '...',
    'v1.2',
    'CON',
    'Minhas Anotações',
    '🗺 Mapa do Reino',
  ]

  /**
   * O que torna o censo mais do que uma lista: o app NUNCA consegue criar um diretório que
   * a regra de ocultar possa esconder por causa do ponto inicial, porque `slugify` não
   * devolve nome começado em ponto nem nome vazio. Com o marcador de conteúdo presente, a
   * única saída `true` que sobra na regra é a do ponto — e ela é inalcançável por aqui.
   * Se um dos dois lados mudar (slug passando o ponto adiante, ou regra ocultando mais que
   * o ponto), este caso cai antes mesmo de haver cofre em disco.
   */
  it('nenhum nome digitável vira diretório que a regra esconde', () => {
    for (const nome of NOMES_DO_MESTRE) {
      const slug = slugify(nome)
      expect(slug, `slugify(${JSON.stringify(nome)}) devolveu vazio`).not.toBe('')
      expect(slug.startsWith('.'), `slugify(${JSON.stringify(nome)}) = ${slug}`).toBe(false)
      expect(ehPastaInternaDaArvore(slug, true), `a regra esconde "${slug}", criado pelo mestre`).toBe(false)
    }
  })

  it('personagens: toda pasta criada aparece, com a ficha de dentro', async () => {
    const criadas: { slug: string; fichaSlug: string }[] = []
    for (const nome of NOMES_DO_MESTRE) {
      const pasta = await repo.criarPasta('personagens-soltos', nome)
      const ficha = await repo.criarPersonagemEm(pasta.caminho, `Ficha de ${nome}`)
      criadas.push({ slug: pasta.slug, fichaSlug: ficha.slug })
    }

    const arvore = await repo.montarArvorePastas('personagens-soltos')
    expect(slugsDe(arvore.subpastas)).toEqual(criadas.map((c) => c.slug).sort())

    for (const { slug, fichaSlug } of criadas) {
      const pasta = arvore.subpastas.find((p) => p.slug === slug)
      if (!pasta) throw new Error(`a pasta "${slug}" que o mestre criou sumiu da árvore`)
      expect(slugsDe(pasta.personagens), `a ficha dentro de "${slug}" sumiu`).toEqual([fichaSlug])
    }
  })

  it('itens: toda pasta criada aparece, com o item de dentro', async () => {
    const criadas: { slug: string; itemSlug: string }[] = []
    for (const nome of NOMES_DO_MESTRE) {
      const pasta = await repo.criarPasta('itens', nome)
      const item = await repo.criarItemEm(pasta.caminho, `Item de ${nome}`)
      criadas.push({ slug: pasta.slug, itemSlug: item.slug })
    }

    const arvore = await repo.montarArvoreItens()
    expect(slugsDe(arvore.subpastas)).toEqual(criadas.map((c) => c.slug).sort())

    for (const { slug, itemSlug } of criadas) {
      const pasta = arvore.subpastas.find((p) => p.slug === slug)
      if (!pasta) throw new Error(`a pasta de itens "${slug}" que o mestre criou sumiu da árvore`)
      expect(slugsDe(pasta.itens), `o item dentro de "${slug}" sumiu`).toEqual([itemSlug])
    }
  })

  it('cenários: todo cenário criado aparece, com o sub-cenário de dentro', async () => {
    const criados: { slug: string; filhoSlug: string; nome: string }[] = []
    for (const nome of NOMES_DO_MESTRE) {
      const cenario = await repo.criarCenarioEm('cenarios', nome)
      const filho = await repo.criarCenarioEm(cenario.caminho, `Sub de ${nome}`)
      criados.push({ slug: cenario.slug, filhoSlug: filho.slug, nome: cenario.nome })
    }

    const arvore = await repo.montarArvoreCenarios()
    expect(slugsDe(arvore.cenarios)).toEqual(criados.map((c) => c.slug).sort())

    for (const { slug, filhoSlug, nome } of criados) {
      const cenario = arvore.cenarios.find((c) => c.slug === slug)
      if (!cenario) throw new Error(`o cenário "${slug}" que o mestre criou sumiu da árvore`)
      // o nome gravado em cenario.json é o que o mestre digitou, não o slug
      expect(cenario.nome).toBe(nome)
      expect(slugsDe(cenario.filhos), `o sub-cenário de "${slug}" sumiu`).toEqual([filhoSlug])
    }
  })

  it('cenários: toda pasta organizacional criada aparece, com o cenário de dentro', async () => {
    const criadas: { slug: string; cenarioSlug: string }[] = []
    for (const nome of NOMES_DO_MESTRE) {
      const pasta = await repo.criarPasta('cenarios', nome)
      const cenario = await repo.criarCenarioEm(pasta.caminho, `Cenário de ${nome}`)
      criadas.push({ slug: pasta.slug, cenarioSlug: cenario.slug })
    }

    const arvore = await repo.montarArvoreCenarios()
    expect(slugsDe(arvore.subpastas)).toEqual(criadas.map((c) => c.slug).sort())

    for (const { slug, cenarioSlug } of criadas) {
      const pasta = arvore.subpastas.find((p) => p.slug === slug)
      if (!pasta) throw new Error(`a pasta de cenários "${slug}" que o mestre criou sumiu da árvore`)
      expect(slugsDe(pasta.cenarios), `o cenário dentro de "${slug}" sumiu`).toEqual([cenarioSlug])
    }
  })
})
