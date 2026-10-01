import { describe, expect, it } from 'vitest'
import { planejarOrganizacao } from '../lib/organizarImagens/planejar'
import {
  ErroOrganizar, abandonarOrganizacao, desfazerOrganizacao, executarPlano, situacaoDoDiario,
} from '../lib/organizarImagens/executar'
import { paraCadaString, relsEmHtml } from '../lib/organizarImagens/referencias'
import { lerUltima, registrarUltima } from '../lib/organizarImagens/ultima'
import { criarFakeFs } from './fakeFs'
import {
  RAIZ, gravarImagem, gravarJson, lerJson, lista, mapa, montarCofreAmostra, objeto, pagina, personagem, portasDe,
  versaoPersonagem, type FakeFs,
} from './cofreImagens'

/** Fora do cofre, como `%APPDATA%/com.gedasio.grimorio/organizar/<id>` no app. */
const DIR_APP = 'C:/appdata/organizar'

/** Só o que está DENTRO do cofre — o diário mora no mesmo fake, fora da raiz. */
function fotoDoCofre(fs: FakeFs): { arquivos: [string, string][]; binarios: string[] } {
  const dentro = (k: string) => k.startsWith(`${RAIZ}/`)
  return {
    arquivos: [...fs.arquivos].filter(([k]) => dentro(k)).sort(([a], [b]) => (a < b ? -1 : 1)),
    binarios: [...fs.binarios].filter(dentro).sort(),
  }
}

/** A recusa tem de ser `ErroOrganizar` — qualquer outra coisa é o teste falhando, não um `undefined` passando. */
function comoErro(e: unknown): ErroOrganizar {
  if (e instanceof ErroOrganizar) return e
  throw new Error(`esperava ErroOrganizar, veio: ${String(e)}`)
}

async function organizar(fs: FakeFs) {
  const plano = await planejarOrganizacao(RAIZ, portasDe(fs))
  const dirDiario = `${DIR_APP}/${plano.id}`
  const resultado = await executarPlano(plano, { raiz: RAIZ, dirDiario, portas: portasDe(fs) })
  return { plano, dirDiario, resultado }
}

/** O retrato do Gandalf no endereço novo — o que a ficha dele passa a citar depois de organizar. */
const RETRATO_ORGANIZADO = `${RAIZ}/imagens/personagens/Gandalf, o Cinzento/retrato.png`

/**
 * O fake com `rel` travado para gravação (antivírus, OneDrive segurando o arquivo): falha toda cópia
 * que cai nele — direto ou no temporário ao lado — e todo rename para ele. Organizar nunca grava num
 * original (só copia DELE e o tira no fim), então só a volta esbarra na trava.
 */
function comTravado(fs: FakeFs, rel: string): FakeFs {
  const alvo = `${RAIZ}/${rel}`
  return {
    ...fs,
    copyFile: async (de: string, para: string) => {
      if (para.startsWith(alvo)) throw new Error('EBUSY: arquivo em uso')
      return fs.copyFile(de, para)
    },
    rename: async (de: string, para: string) => {
      if (para === alvo) throw new Error('EBUSY: arquivo em uso')
      return fs.rename(de, para)
    },
  }
}

/** A ficha do Gandalf travada: a volta não consegue devolvê-la. */
function comFichaTravada(fs: FakeFs): FakeFs {
  return comTravado(fs, 'personagens-soltos/gandalf.json')
}

type Fase = 'movendo' | 'reescrevendo' | 'removendo'

/**
 * O app "cai" na 3ª operação da fase: dali em diante nada mais chega ao disco — nem a volta
 * automática, nem o registro dela. O que sobra no fake é o que o disco teria depois da queda. Na
 * cópia, a queda deixa um pedaço no destino, como um `std::fs::copy` interrompido deixa. O hash
 * também cai: `portasDe` passa pelo `sha256` deste fake.
 */
function caiNo(fs: FakeFs, fase: Fase): FakeFs {
  let caiu = false
  let vezes = 0
  const queda = () => new Error('o app caiu')
  const vivo = () => {
    if (caiu) throw queda()
  }
  const noCofre = (p: string) => p.startsWith(`${RAIZ}/`)
  return {
    ...fs,
    sha256: async (p) => { vivo(); return fs.sha256(p) },
    readText: async (p) => { vivo(); return fs.readText(p) },
    writeTextAtomic: async (p, conteudo) => {
      vivo()
      await fs.writeTextAtomic(p, conteudo)
      if (fase === 'reescrevendo' && noCofre(p) && ++vezes === 3) {
        caiu = true
        throw queda()
      }
    },
    writeBinaryBase64: async (p, base64) => { vivo(); return fs.writeBinaryBase64(p, base64) },
    listDir: async (p) => { vivo(); return fs.listDir(p) },
    mkdirAll: async (p) => { vivo(); return fs.mkdirAll(p) },
    removePath: async (p) => {
      vivo()
      await fs.removePath(p)
      if (fase === 'removendo' && noCofre(p) && ++vezes === 3) {
        caiu = true
        throw queda()
      }
    },
    copyFile: async (de, para) => {
      vivo()
      if (fase === 'movendo' && para.startsWith(`${RAIZ}/imagens/`) && ++vezes === 3) {
        await fs.writeTextAtomic(para, 'pedaço')
        caiu = true
        throw queda()
      }
      return fs.copyFile(de, para)
    },
    rename: async (de, para) => { vivo(); return fs.rename(de, para) },
    exists: async (p) => { vivo(); return fs.exists(p) },
  }
}

async function estadoDoDiario(fs: FakeFs, dirDiario: string): Promise<unknown> {
  return objeto(JSON.parse(await fs.readText(`${dirDiario}/diario.json`)), 'diario.json').estado
}

/** Valor de string que é caminho de imagem do cofre. URL (`props.src` do tldraw) não conta: o app a refaz do `meta.rel`. */
const CAMINHO_DE_IMAGEM = /\.(png|jpe?g|gif|webp)$/i

/**
 * Cada imagem que algum JSON do cofre cita e que não existe no disco — o que o usuário veria como
 * imagem quebrada. A amostra já nasce com uma (o escudo cita `imagens-itens/sumiu.png`), então quem
 * confere compara com o cofre de antes, não com a lista vazia.
 */
async function citacoesQuebradas(fs: FakeFs): Promise<string[]> {
  const citadas = new Set<string>()
  for (const [k, conteudo] of fs.arquivos) {
    if (!k.startsWith(`${RAIZ}/`) || !k.toLowerCase().endsWith('.json')) continue
    paraCadaString(JSON.parse(conteudo), (s) => {
      for (const rel of [s, ...relsEmHtml(s)]) if (CAMINHO_DE_IMAGEM.test(rel) && !rel.includes('://')) citadas.add(rel)
    })
  }
  const quebradas: string[] = []
  for (const rel of citadas) if (!(await fs.exists(`${RAIZ}/${rel}`))) quebradas.push(rel)
  return quebradas.sort()
}

/**
 * Organiza com o fim do diário falhando: tudo é feito, mas o `concluido` nunca chega ao disco, que
 * fica com o diário gravado antes de tirar os originais (`aplicando`). `vezesQueFalha` limita a falha
 * às primeiras gravações do fim; sem limite, o disco continua cheio até o fim.
 */
async function organizarSemRegistrarOFim(fs: FakeFs, vezesQueFalha = Infinity) {
  const plano = await planejarOrganizacao(RAIZ, portasDe(fs))
  const dirDiario = `${DIR_APP}/${plano.id}`
  let terminando = false
  const gravacoesDoFim = { tentadas: 0 }
  const fsQueFalha: FakeFs = {
    ...fs,
    writeTextAtomic: async (p: string, conteudo: string) => {
      if (terminando && p === `${dirDiario}/diario.json` && ++gravacoesDoFim.tentadas <= vezesQueFalha) {
        throw new Error('ENOSPC: disco cheio')
      }
      return fs.writeTextAtomic(p, conteudo)
    },
  }
  const resultado = await executarPlano(plano, {
    raiz: RAIZ,
    dirDiario,
    portas: portasDe(fsQueFalha),
    aoProgresso: (_feito, _total, fase) => {
      if (fase === 'verificando') terminando = true
    },
  })
  return { dirDiario, resultado, gravacoesDoFim }
}

describe('executarPlano — organizar', () => {
  it('move, reescreve e remove; toda referência passa a resolver', async () => {
    const fs = await montarCofreAmostra()
    const antes = await fs.sha256(`${RAIZ}/personagens-soltos/assets/retrato-p1-v1.png`)
    const { resultado } = await organizar(fs)

    expect(resultado).toEqual({ fase: 'concluido', movidos: 13, reescritos: 6, removidos: 1, problemas: [] })
    const gandalf = objeto(await lerJson(fs, 'personagens-soltos/gandalf.json'), 'gandalf.json')
    const cinzento = objeto(lista(gandalf.versoes, 'versoes')[0], 'versoes[0]')
    expect(cinzento.retrato).toBe('imagens/personagens/Gandalf, o Cinzento/retrato.png')
    expect(lista(cinzento.imagens, 'imagens').map((i) => objeto(i, 'imagem').rel)).toEqual([
      'imagens/personagens/Gandalf, o Cinzento/01.png', 'imagens/personagens/Gandalf, o Cinzento/02.jpg',
      'imagens/personagens/Gandalf, o Cinzento/retrato.png', // a cópia do retrato na galeria virou o próprio retrato
    ])
    expect(await fs.sha256(`${RAIZ}/imagens/personagens/Gandalf, o Cinzento/retrato.png`)).toBe(antes)
    expect(await fs.exists(`${RAIZ}/personagens-soltos/assets/retrato-p1-v1.png`)).toBe(false)
    expect(await fs.exists(`${RAIZ}/personagens-soltos/assets/galeria-ccc.png`)).toBe(false)

    const mapa = await lerJson(fs, 'mapas-soltos/masmorra.json')
    expect(mapa).toHaveProperty(['documento', 'document', 'store', 'asset:a1', 'meta', 'rel'], 'imagens/mapas/Masmorra/porta secreta.png')
    const nota = objeto(await lerJson(fs, 'mapas-soltos/masmorra.notas/sessao-1.json'), 'sessao-1.json')
    expect(nota.corpo).toContain('data-rel="imagens/notas/Sessão 1/02.png"') // cópia do altar, de outro dono: separada
    expect(nota.corpo).toContain('data-rel="imagens/notas/Sessão 1/01.png" data-largura="50"')

    // Replanejar o cofre organizado não acha nada a fazer e nenhuma referência nova quebrada.
    const depois = await planejarOrganizacao(RAIZ, portasDe(fs))
    expect(depois.movimentos).toEqual([])
    expect(depois.reescritas).toEqual([])
    expect(depois.remocoes).toEqual([])
    // só o que já havia antes: a referência que estava quebrada (aviso) e a duplicata entre donos
    // diferentes (grupo), agora nos endereços novos
    expect(depois.avisos).toHaveLength(1)
    expect(depois.repetidasEntreDonos).toEqual([['imagens/mapas/Masmorra/Altar.png', 'imagens/notas/Sessão 1/02.png']])
  })

  it('com a Imagens/ do usuário no cofre (no NTFS, a mesma pasta), organizar de novo não acha nada a fazer', async () => {
    const fs = await montarCofreAmostra()
    // A pasta montada à mão já existe quando o usuário organiza, como no cofre real: as imagens
    // organizadas caem DENTRO dela, com o I maiúsculo, e as fichas passam a citar `imagens/...`.
    await gravarImagem(fs, 'Imagens/Marinha/garp.png', 'do usuário')
    const { resultado } = await organizar(fs)
    expect(resultado.problemas).toEqual([])
    expect(fs.arquivos.has(`${RAIZ}/Imagens/personagens/Gandalf, o Cinzento/retrato.png`)).toBe(true)

    const depois = await planejarOrganizacao(RAIZ, portasDe(fs))
    expect(depois.movimentos).toEqual([])
    expect(depois.reescritas).toEqual([])
    expect(depois.remocoes).toEqual([])
  })

  it('não apaga o original que uma ficha nova (fora da prévia) passou a citar', async () => {
    const fs = await montarCofreAmostra()
    const plano = await planejarOrganizacao(RAIZ, portasDe(fs))
    await gravarJson(fs, 'mapas-soltos/novo.json', mapa('m2', 'Novo', [{ id: 'z', rel: 'imagens-canvas/A1.png', name: 'porta.png' }]))

    const r = await executarPlano(plano, { raiz: RAIZ, dirDiario: `${DIR_APP}/${plano.id}`, portas: portasDe(fs) })
    expect(await fs.exists(`${RAIZ}/imagens-canvas/A1.png`)).toBe(true)
    expect(await fs.exists(`${RAIZ}/imagens/mapas/Masmorra/porta secreta.png`)).toBe(true)
    expect(r.problemas.some((p) => p.includes('imagens-canvas/A1.png') && p.includes('mapas-soltos/novo.json'))).toBe(true)
  })

  it('JSON reescrito mantém a formatação (2 espaços) e só muda o valor citado', async () => {
    const fs = await montarCofreAmostra()
    await organizar(fs)
    const texto = await fs.readText(`${RAIZ}/itens/espada.json`)
    const obj: unknown = JSON.parse(texto)
    expect(obj).toHaveProperty('retrato', 'imagens/itens/Espada Élfica.png')
    expect(texto).toBe(JSON.stringify(obj, null, 2))
  })

  it('nome com & vai escapado no data-rel da nota e continua resolvendo', async () => {
    const fs = criarFakeFs({ caixa: 'insensivel' })
    await gravarImagem(fs, 'imagens-notas/abcdef0123456789.png', 'x')
    await gravarJson(fs, 'escrita/p.json', pagina('n1', 'Dungeons & Dragons', '<img data-rel="imagens-notas/abcdef0123456789.png">'))
    await organizar(fs)
    const nota = objeto(await lerJson(fs, 'escrita/p.json'), 'p.json')
    expect(nota.corpo).toBe('<img data-rel="imagens/notas/Dungeons &amp; Dragons/01.png">')
    expect(await fs.exists(`${RAIZ}/imagens/notas/Dungeons & Dragons/01.png`)).toBe(true)
    expect((await planejarOrganizacao(RAIZ, portasDe(fs))).movimentos).toEqual([])
  })

  it('o diário fica FORA do cofre, com a cópia de cada original', async () => {
    const fs = await montarCofreAmostra()
    const { dirDiario } = await organizar(fs)
    expect(dirDiario.startsWith(RAIZ)).toBe(false)
    const diario = objeto(JSON.parse(await fs.readText(`${dirDiario}/diario.json`)), 'diario.json')
    expect(diario.estado).toBe('concluido')
    expect(diario.raiz).toBe(RAIZ)
    // 13 imagens movidas + 1 removida + 6 textos reescritos
    expect(diario.copias).toHaveLength(20)
  })

  it('avisa o progresso por fase', async () => {
    const fs = await montarCofreAmostra()
    const plano = await planejarOrganizacao(RAIZ, portasDe(fs))
    const fases = new Set<string>()
    await executarPlano(plano, {
      raiz: RAIZ, dirDiario: `${DIR_APP}/${plano.id}`, portas: portasDe(fs),
      aoProgresso: (_feito, _total, fase) => fases.add(fase),
    })
    expect([...fases]).toEqual(expect.arrayContaining(['movendo', 'reescrevendo', 'removendo', 'verificando']))
  })

  it('a conferência final não consegue ler uma imagem: a organização é dada como feita, com o problema', async () => {
    const fs = await montarCofreAmostra()
    const plano = await planejarOrganizacao(RAIZ, portasDe(fs))
    const dirDiario = `${DIR_APP}/${plano.id}`
    let conferindo = false
    const r = await executarPlano(plano, {
      raiz: RAIZ,
      dirDiario,
      portas: {
        fs,
        hash: async (p) => {
          if (conferindo && p.startsWith(`${RAIZ}/imagens/`)) throw new Error('EBUSY: arquivo em uso')
          return fs.sha256(p)
        },
      },
      aoProgresso: (_feito, _total, fase) => {
        if (fase === 'verificando') conferindo = true
      },
    })
    expect(r).toMatchObject({ fase: 'concluido', movidos: 13, reescritos: 6, removidos: 1 })
    expect(r.problemas.some((p) => p.includes('EBUSY'))).toBe(true)
    expect(await estadoDoDiario(fs, dirDiario)).toBe('concluido')
  })

  it('o diário não registrou o fim: a organização é dada como feita, com o problema, e o desfazer continua valendo', async () => {
    const fs = await montarCofreAmostra()
    const foto = fotoDoCofre(fs)
    const { dirDiario, resultado: r } = await organizarSemRegistrarOFim(fs)
    expect(r).toMatchObject({ fase: 'concluido', movidos: 13 })
    expect(r.problemas.some((p) => p.includes('ENOSPC'))).toBe(true)
    expect(await fs.exists(RETRATO_ORGANIZADO)).toBe(true)

    // o diário que ficou — o gravado antes de tirar os originais — ainda desfaz tudo
    const d = await desfazerOrganizacao(dirDiario, portasDe(fs), RAIZ)
    expect(d).toMatchObject({ completo: true, problemas: [] })
    expect(fotoDoCofre(fs)).toEqual(foto)
  })

  it('o fim falha uma vez só (o diário seguro por um instante): a segunda tentativa registra a organização como concluída', async () => {
    const fs = await montarCofreAmostra()
    const { dirDiario, resultado, gravacoesDoFim } = await organizarSemRegistrarOFim(fs, 1)
    expect(resultado).toEqual({ fase: 'concluido', movidos: 13, reescritos: 6, removidos: 1, problemas: [] })
    expect(gravacoesDoFim.tentadas).toBe(2)
    expect(await estadoDoDiario(fs, dirDiario)).toBe('concluido')
    // concluída de fato: o botão desfaz, e nada trava o Organizar
    expect(await situacaoDoDiario(dirDiario, portasDe(fs), RAIZ)).toBe('desfazivel')
  })
})

describe('executarPlano — o app cai no meio', () => {
  it.each<Fase>(['movendo', 'reescrevendo', 'removendo'])('caiu %s: o diário que ficou desfaz tudo, byte a byte', async (fase) => {
    const fs = await montarCofreAmostra()
    const plano = await planejarOrganizacao(RAIZ, portasDe(fs))
    const dirDiario = `${DIR_APP}/${plano.id}`
    const foto = fotoDoCofre(fs)
    const erro = await executarPlano(plano, { raiz: RAIZ, dirDiario, portas: portasDe(caiNo(fs, fase)) })
      .catch((e: unknown) => e)
    expect(erro).toBeInstanceOf(Error)
    expect(fotoDoCofre(fs)).not.toEqual(foto) // a queda deixou o cofre pela metade

    // o app abriu de novo: o botão de desfazer acha a organização pela metade
    expect(await situacaoDoDiario(dirDiario, portasDe(fs), RAIZ)).toBe('pendente')
    const r = await desfazerOrganizacao(dirDiario, portasDe(fs), RAIZ)
    expect(r).toMatchObject({ completo: true, problemas: [] })
    expect(fotoDoCofre(fs)).toEqual(foto)
    expect(await estadoDoDiario(fs, dirDiario)).toBe('desfeito')
  })
})

describe('executarPlano — recusas', () => {
  it('recusa se o cofre mudou depois da prévia (hashEntrada), sem tocar em nada', async () => {
    const fs = await montarCofreAmostra()
    const plano = await planejarOrganizacao(RAIZ, portasDe(fs))
    const gandalf = objeto(await lerJson(fs, 'personagens-soltos/gandalf.json'), 'gandalf.json')
    await gravarJson(fs, 'personagens-soltos/gandalf.json', { ...gandalf, modificadoEm: 'agora' })
    const foto = fotoDoCofre(fs)

    const erro = await executarPlano(plano, { raiz: RAIZ, dirDiario: `${DIR_APP}/${plano.id}`, portas: portasDe(fs) })
      .catch((e: unknown) => e)
    expect(erro).toBeInstanceOf(ErroOrganizar)
    expect(comoErro(erro).codigo).toBe('cofre-mudou')
    expect(fotoDoCofre(fs)).toEqual(foto)
  })

  it('recusa se alguém criou arquivo no destino depois da prévia', async () => {
    const fs = await montarCofreAmostra()
    const plano = await planejarOrganizacao(RAIZ, portasDe(fs))
    await gravarImagem(fs, 'imagens/itens/Espada Élfica.png', 'intrusa')
    const foto = fotoDoCofre(fs)
    const erro = await executarPlano(plano, { raiz: RAIZ, dirDiario: `${DIR_APP}/${plano.id}`, portas: portasDe(fs) })
      .catch((e: unknown) => e)
    expect(comoErro(erro).codigo).toBe('destino-ocupado')
    expect(fotoDoCofre(fs)).toEqual(foto)
  })

  it('falha no meio (disco recusou uma cópia) volta tudo como estava', async () => {
    const fs = await montarCofreAmostra()
    const plano = await planejarOrganizacao(RAIZ, portasDe(fs))
    const foto = fotoDoCofre(fs)
    let copias = 0
    const fsQueFalha = {
      ...fs,
      copyFile: async (de: string, para: string) => {
        // deixa o diário ser feito (cópias para fora do cofre) e falha na 3ª cópia DENTRO do cofre
        if (para.startsWith(`${RAIZ}/`) && ++copias === 3) throw new Error('disco cheio')
        return fs.copyFile(de, para)
      },
    }
    const erro = await executarPlano(plano, {
      raiz: RAIZ, dirDiario: `${DIR_APP}/${plano.id}`, portas: { fs: fsQueFalha, hash: (p) => fs.sha256(p) },
    }).catch((e: unknown) => e)
    expect(comoErro(erro).codigo).toBe('falhou')
    expect(String(comoErro(erro).message)).toContain('disco cheio')
    expect(fotoDoCofre(fs)).toEqual(foto)
  })

  it('cópia que parou no meio (pedaço no destino) também sai na volta', async () => {
    const fs = await montarCofreAmostra()
    const plano = await planejarOrganizacao(RAIZ, portasDe(fs))
    const foto = fotoDoCofre(fs)
    let copias = 0
    const fsQueFalha: FakeFs = {
      ...fs,
      copyFile: async (de: string, para: string) => {
        // o disco encheu no meio da 2ª imagem: o destino ficou com um pedaço, como o std::fs::copy deixa
        if (para.startsWith(`${RAIZ}/imagens/`) && ++copias === 2) {
          await fs.writeTextAtomic(para, 'pedaço')
          throw new Error('disco cheio')
        }
        return fs.copyFile(de, para)
      },
    }
    const erro = await executarPlano(plano, { raiz: RAIZ, dirDiario: `${DIR_APP}/${plano.id}`, portas: portasDe(fsQueFalha) })
      .catch((e: unknown) => e)
    expect(comoErro(erro).codigo).toBe('falhou')
    expect(fotoDoCofre(fs)).toEqual(foto)
  })

  it('a volta não regrava o que já está igual ao original: original intacto e travado não impede a volta', async () => {
    const fs = await montarCofreAmostra()
    const plano = await planejarOrganizacao(RAIZ, portasDe(fs))
    const foto = fotoDoCofre(fs)
    // a porta do mapa está travada (antivírus) — mas nada a tirou do lugar: a cópia falha antes
    const travado = comTravado(fs, 'imagens-canvas/A1.png')
    let copias = 0
    const fsQueFalha: FakeFs = {
      ...travado,
      copyFile: async (de: string, para: string) => {
        if (para.startsWith(`${RAIZ}/imagens/`) && ++copias === 2) throw new Error('ENOSPC: disco cheio')
        return travado.copyFile(de, para)
      },
    }
    const erro = await executarPlano(plano, { raiz: RAIZ, dirDiario: `${DIR_APP}/${plano.id}`, portas: portasDe(fsQueFalha) })
      .catch((e: unknown) => e)
    expect(comoErro(erro).codigo).toBe('falhou') // a volta terminou: não havia original a devolver
    expect(fotoDoCofre(fs)).toEqual(foto)
  })

  it('volta que falha numa ficha não apaga a imagem nova que ela ainda cita, e fica para tentar de novo', async () => {
    const fs = await montarCofreAmostra()
    const plano = await planejarOrganizacao(RAIZ, portasDe(fs))
    const dirDiario = `${DIR_APP}/${plano.id}`
    const foto = fotoDoCofre(fs)
    let recusou = false
    const fsQueFalha: FakeFs = {
      ...comFichaTravada(fs),
      // a 1ª remoção de original falha — quando as fichas já apontam para o endereço novo
      removePath: async (p: string) => {
        if (!recusou && p.startsWith(`${RAIZ}/`)) {
          recusou = true
          throw new Error('EPERM: sem permissão')
        }
        return fs.removePath(p)
      },
    }
    const erro = await executarPlano(plano, { raiz: RAIZ, dirDiario, portas: portasDe(fsQueFalha) }).catch((e: unknown) => e)

    // a ficha do Gandalf não voltou: ainda cita o retrato no endereço novo, que tem de continuar lá
    expect(await lerJson(fs, 'personagens-soltos/gandalf.json'))
      .toHaveProperty(['versoes', 0, 'retrato'], 'imagens/personagens/Gandalf, o Cinzento/retrato.png')
    expect(await fs.exists(RETRATO_ORGANIZADO)).toBe(true)
    expect(comoErro(erro).codigo).toBe('volta-incompleta')
    expect(comoErro(erro).message).toContain('personagens-soltos/gandalf.json')
    expect(await estadoDoDiario(fs, dirDiario)).toBe('desfazendo')
    expect(await situacaoDoDiario(dirDiario, portasDe(fs), RAIZ)).toBe('pendente')

    // destravou: tentar de novo termina a volta
    const r = await desfazerOrganizacao(dirDiario, portasDe(fs), RAIZ)
    expect(r.problemas).toEqual([])
    expect(fotoDoCofre(fs)).toEqual(foto)
    expect(await estadoDoDiario(fs, dirDiario)).toBe('desfeito')
  })
})

describe('última organização por cofre (o que o botão Desfazer desfaz)', () => {
  it('sem registro, não há o que desfazer', async () => {
    const fs = criarFakeFs({ caixa: 'insensivel' })
    expect(await lerUltima(DIR_APP, RAIZ, fs)).toBeNull()
  })

  it('guarda uma por cofre, e o caminho do cofre vale com barra invertida e outra caixa', async () => {
    const fs = criarFakeFs({ caixa: 'insensivel' })
    await registrarUltima(DIR_APP, 'C:\\Cofre', 'plano-a', fs)
    await registrarUltima(DIR_APP, 'D:/Outro', 'plano-b', fs)
    await registrarUltima(DIR_APP, 'c:/cofre', 'plano-c', fs)
    expect(await lerUltima(DIR_APP, 'C:/Cofre', fs)).toBe(`${DIR_APP}/plano-c`)
    expect(await lerUltima(DIR_APP, 'D:\\Outro', fs)).toBe(`${DIR_APP}/plano-b`)
  })

  it('registro ilegível conta como vazio (não derruba a aba)', async () => {
    const fs = criarFakeFs({ caixa: 'insensivel' })
    await fs.writeTextAtomic(`${DIR_APP}/ultimas.json`, '{ quebrado')
    expect(await lerUltima(DIR_APP, RAIZ, fs)).toBeNull()
    await registrarUltima(DIR_APP, RAIZ, 'plano-novo', fs)
    expect(await lerUltima(DIR_APP, RAIZ, fs)).toBe(`${DIR_APP}/plano-novo`)
  })
})

describe('desfazerOrganizacao', () => {
  it('volta o cofre byte a byte ao que era', async () => {
    const fs = await montarCofreAmostra()
    const foto = fotoDoCofre(fs)
    const { dirDiario } = await organizar(fs)
    expect(fotoDoCofre(fs)).not.toEqual(foto)

    const r = await desfazerOrganizacao(dirDiario, portasDe(fs), RAIZ)
    expect(r.problemas).toEqual([])
    expect(fotoDoCofre(fs)).toEqual(foto)
    expect(await estadoDoDiario(fs, dirDiario)).toBe('desfeito')
  })

  it('não desfaz duas vezes', async () => {
    const fs = await montarCofreAmostra()
    const { dirDiario } = await organizar(fs)
    await desfazerOrganizacao(dirDiario, portasDe(fs), RAIZ)
    const erro = await desfazerOrganizacao(dirDiario, portasDe(fs), RAIZ).catch((e: unknown) => e)
    expect(comoErro(erro).codigo).toBe('nada-a-desfazer')
  })

  it('recusa se uma ficha foi editada depois de organizar (desfazer apagaria a edição)', async () => {
    const fs = await montarCofreAmostra()
    const { dirDiario } = await organizar(fs)
    const gandalf = objeto(await lerJson(fs, 'personagens-soltos/gandalf.json'), 'gandalf.json')
    const [cinzento, branco] = lista(gandalf.versoes, 'versoes')
    await gravarJson(fs, 'personagens-soltos/gandalf.json', {
      ...gandalf, versoes: [{ ...objeto(cinzento, 'versoes[0]'), resumo: 'editado' }, branco],
    })
    const foto = fotoDoCofre(fs)
    const erro = await desfazerOrganizacao(dirDiario, portasDe(fs), RAIZ).catch((e: unknown) => e)
    expect(comoErro(erro).codigo).toBe('mudou-depois')
    expect(String(comoErro(erro).message)).toContain('personagens-soltos/gandalf.json')
    expect(fotoDoCofre(fs)).toEqual(foto)
  })

  it('não grava por cima de um arquivo NOVO que apareceu no caminho original', async () => {
    const fs = await montarCofreAmostra()
    const { dirDiario } = await organizar(fs)
    await gravarImagem(fs, 'imagens-canvas/A1.png', 'outra imagem, criada depois')
    const foto = fotoDoCofre(fs)

    const erro = await desfazerOrganizacao(dirDiario, portasDe(fs), RAIZ).catch((e: unknown) => e)
    expect(comoErro(erro).codigo).toBe('mudou-depois')
    expect(comoErro(erro).message).toContain('imagens-canvas/A1.png')
    expect(fotoDoCofre(fs)).toEqual(foto)
  })

  it('mantém a imagem organizada que outra ficha passou a citar depois (e devolve o resto)', async () => {
    const fs = await montarCofreAmostra()
    const original = await fs.sha256(`${RAIZ}/imagens-canvas/A1.png`)
    const { dirDiario } = await organizar(fs)
    await gravarJson(fs, 'mapas-soltos/novo.json',
      mapa('m2', 'Novo', [{ id: 'z', rel: 'imagens/mapas/Masmorra/porta secreta.png', name: 'porta.png' }]))

    const r = await desfazerOrganizacao(dirDiario, portasDe(fs), RAIZ)
    expect(r.problemas.some((p) => p.includes('imagens/mapas/Masmorra/porta secreta.png') && p.includes('mapas-soltos/novo.json'))).toBe(true)
    expect(await fs.exists(`${RAIZ}/imagens/mapas/Masmorra/porta secreta.png`)).toBe(true)
    expect(await fs.sha256(`${RAIZ}/imagens-canvas/A1.png`)).toBe(original)
    expect(await lerJson(fs, 'mapas-soltos/masmorra.json'))
      .toHaveProperty(['documento', 'document', 'store', 'asset:a1', 'meta', 'rel'], 'imagens-canvas/A1.png')
    // o que ninguém mais cita volta a sumir, como antes
    expect(await fs.exists(`${RAIZ}/imagens/itens/Espada Élfica.png`)).toBe(false)
  })

  it('volta que falha numa ficha não apaga a imagem que ela cita, e o desfazer continua disponível', async () => {
    const fs = await montarCofreAmostra()
    const foto = fotoDoCofre(fs)
    const { dirDiario } = await organizar(fs)

    const r = await desfazerOrganizacao(dirDiario, portasDe(comFichaTravada(fs)), RAIZ)
    expect(await fs.exists(RETRATO_ORGANIZADO)).toBe(true)
    expect(r.completo).toBe(false)
    expect(r.problemas.some((p) => p.includes('personagens-soltos/gandalf.json'))).toBe(true)
    expect(await estadoDoDiario(fs, dirDiario)).toBe('desfazendo')
    expect(await situacaoDoDiario(dirDiario, portasDe(fs), RAIZ)).toBe('pendente')

    // destravou: tentar de novo termina
    const denovo = await desfazerOrganizacao(dirDiario, portasDe(fs), RAIZ)
    expect(denovo.problemas).toEqual([])
    expect(denovo.completo).toBe(true)
    expect(fotoDoCofre(fs)).toEqual(foto)
    expect(await estadoDoDiario(fs, dirDiario)).toBe('desfeito')
  })

  it('o disco enche no meio de devolver uma ficha: ela não fica pela metade, e tentar de novo termina', async () => {
    const fs = await montarCofreAmostra()
    const foto = fotoDoCofre(fs)
    const { dirDiario } = await organizar(fs)
    const alvo = `${RAIZ}/personagens-soltos/gandalf.json`
    const fsQueEnche: FakeFs = {
      ...fs,
      copyFile: async (de: string, para: string) => {
        // `std::fs::copy` abre o destino truncando; o disco encheu no meio e ficou só o começo
        if (para.startsWith(alvo)) {
          await fs.writeTextAtomic(para, '{ "id": "p1", "ver')
          throw new Error('ENOSPC: disco cheio')
        }
        return fs.copyFile(de, para)
      },
    }
    const r = await desfazerOrganizacao(dirDiario, portasDe(fsQueEnche), RAIZ)
    expect(r.completo).toBe(false)
    // a ficha continua inteira: a organizada, citando o endereço novo, que segue no cofre
    expect(await lerJson(fs, 'personagens-soltos/gandalf.json'))
      .toHaveProperty(['versoes', 0, 'retrato'], 'imagens/personagens/Gandalf, o Cinzento/retrato.png')
    expect(await fs.exists(RETRATO_ORGANIZADO)).toBe(true)

    // liberou espaço: tentar de novo termina, sem pedaço esquecido no cofre
    const denovo = await desfazerOrganizacao(dirDiario, portasDe(fs), RAIZ)
    expect(denovo).toMatchObject({ completo: true, problemas: [] })
    expect(fotoDoCofre(fs)).toEqual(foto)
  })

  it('ficha que já voltou e foi editada não trava a retomada, e a edição fica', async () => {
    const fs = await montarCofreAmostra()
    const foto = fotoDoCofre(fs)
    const { dirDiario } = await organizar(fs)
    // 1ª tentativa: a ficha do Gandalf está travada; a da espada volta
    expect((await desfazerOrganizacao(dirDiario, portasDe(comFichaTravada(fs)), RAIZ)).completo).toBe(false)
    const espada = objeto(await lerJson(fs, 'itens/espada.json'), 'espada.json')
    expect(espada.retrato).toBe('imagens-itens/retrato-i1.png')
    // o app releu o cofre e o usuário editou a espada, já devolvida
    await gravarJson(fs, 'itens/espada.json', { ...espada, efeito: 'corta pedra' })

    const r = await desfazerOrganizacao(dirDiario, portasDe(fs), RAIZ)
    expect(r).toMatchObject({ completo: true, problemas: [] })
    expect(await lerJson(fs, 'itens/espada.json')).toHaveProperty('efeito', 'corta pedra')
    expect(await lerJson(fs, 'personagens-soltos/gandalf.json'))
      .toHaveProperty(['versoes', 0, 'retrato'], 'personagens-soltos/assets/retrato-p1-v1.png')
    expect(await estadoDoDiario(fs, dirDiario)).toBe('desfeito')
    const semEspada = (f: ReturnType<typeof fotoDoCofre>) => f.arquivos.filter(([k]) => !k.endsWith('/itens/espada.json'))
    expect(semEspada(fotoDoCofre(fs))).toEqual(semEspada(foto))
    expect(fotoDoCofre(fs).binarios).toEqual(foto.binarios)
  })

  it('imagem que não voltou segura as fichas no endereço novo: nenhuma volta citando imagem que não está lá', async () => {
    const fs = await montarCofreAmostra()
    const foto = fotoDoCofre(fs)
    const { dirDiario } = await organizar(fs)
    const r = await desfazerOrganizacao(dirDiario, portasDe(comTravado(fs, 'imagens-canvas/A1.png')), RAIZ)
    expect(r.completo).toBe(false)
    expect(r.problemas.some((p) => p.includes('imagens-canvas/A1.png'))).toBe(true)
    expect(r.problemas.some((p) => p.includes('mapas-soltos/masmorra.json'))).toBe(true)
    // o mapa que cita a porta continua apontando para um arquivo que existe
    const mapaNoDisco = objeto(await lerJson(fs, 'mapas-soltos/masmorra.json'), 'masmorra.json')
    const porta = objeto(objeto(objeto(objeto(objeto(mapaNoDisco.documento, 'documento').document, 'document').store, 'store')['asset:a1'], 'asset:a1').meta, 'meta')
    expect(typeof porta.rel).toBe('string')
    expect(await fs.exists(`${RAIZ}/${String(porta.rel)}`)).toBe(true)
    // quem não cita a porta já voltou, com a imagem dele de volta no endereço antigo
    expect(await lerJson(fs, 'itens/espada.json')).toHaveProperty('retrato', 'imagens-itens/retrato-i1.png')
    expect(await fs.exists(`${RAIZ}/imagens-itens/retrato-i1.png`)).toBe(true)

    // destravou: termina
    const denovo = await desfazerOrganizacao(dirDiario, portasDe(fs), RAIZ)
    expect(denovo).toMatchObject({ completo: true, problemas: [] })
    expect(fotoDoCofre(fs)).toEqual(foto)
  })

  it('duas cópias idênticas do cofre não dividem o mesmo diário', async () => {
    const fs = await montarCofreAmostra()
    const COPIA = 'D:/copia do cofre'
    for (const k of [...fs.arquivos.keys()]) {
      if (k.startsWith(`${RAIZ}/`)) await fs.copyFile(k, `${COPIA}/${k.slice(RAIZ.length + 1)}`)
    }
    const a = await planejarOrganizacao(RAIZ, portasDe(fs))
    const b = await planejarOrganizacao(COPIA, portasDe(fs))
    expect(b.movimentos).toEqual(a.movimentos) // o mesmo plano...
    expect(b.id).not.toBe(a.id) // ...em outro cofre: outro diário
  })

  it('recusa desfazer com outro cofre aberto; o mesmo cofre vale com barra invertida e outra caixa', async () => {
    const fs = await montarCofreAmostra()
    const foto = fotoDoCofre(fs)
    const { dirDiario } = await organizar(fs)
    const organizado = fotoDoCofre(fs)

    const erro = await desfazerOrganizacao(dirDiario, portasDe(fs), 'D:/copia do cofre').catch((e: unknown) => e)
    expect(comoErro(erro).codigo).toBe('outro-cofre')
    expect(fotoDoCofre(fs)).toEqual(organizado)
    expect(await situacaoDoDiario(dirDiario, portasDe(fs), 'D:/copia do cofre')).toBe('nada')

    expect(await situacaoDoDiario(dirDiario, portasDe(fs), 'c:\\COFRE\\')).toBe('desfazivel')
    expect((await desfazerOrganizacao(dirDiario, portasDe(fs), 'c:\\COFRE\\')).problemas).toEqual([])
    expect(fotoDoCofre(fs)).toEqual(foto)
  })

  it('cofre sem nenhuma imagem: plano vazio executa e desfaz sem erro', async () => {
    const fs = criarFakeFs({ caixa: 'insensivel' })
    await gravarJson(fs, 'personagens-soltos/x.json', personagem('p1', [versaoPersonagem('v1', 'X', null)], 'v1'))
    const foto = fotoDoCofre(fs)
    const { dirDiario, resultado } = await organizar(fs)
    expect(resultado).toEqual({ fase: 'concluido', movidos: 0, reescritos: 0, removidos: 0, problemas: [] })
    await desfazerOrganizacao(dirDiario, portasDe(fs), RAIZ)
    expect(fotoDoCofre(fs)).toEqual(foto)
  })
})

describe('abandonarOrganizacao — manter o cofre como está', () => {
  it('o fim não ficou registrado e uma ficha mudou depois: o desfazer recusa, e manter o cofre como está libera sem mexer nele', async () => {
    const fs = await montarCofreAmostra()
    const { dirDiario } = await organizarSemRegistrarOFim(fs)
    expect(await situacaoDoDiario(dirDiario, portasDe(fs), RAIZ)).toBe('pendente')
    // o usuário seguiu usando o app e editou uma ficha que a organização reescreveu
    const espada = objeto(await lerJson(fs, 'itens/espada.json'), 'espada.json')
    await gravarJson(fs, 'itens/espada.json', { ...espada, efeito: 'corta pedra' })
    const recusa = await desfazerOrganizacao(dirDiario, portasDe(fs), RAIZ).catch((e: unknown) => e)
    expect(comoErro(recusa).codigo).toBe('mudou-depois')

    const foto = fotoDoCofre(fs)
    await abandonarOrganizacao(dirDiario, portasDe(fs), RAIZ)
    expect(fotoDoCofre(fs)).toEqual(foto) // nada no cofre se mexeu: a edição e a organização ficam
    expect(await estadoDoDiario(fs, dirDiario)).toBe('abandonado')
    expect(await situacaoDoDiario(dirDiario, portasDe(fs), RAIZ)).toBe('nada') // o Organizar destrava
    const depois = await desfazerOrganizacao(dirDiario, portasDe(fs), RAIZ).catch((e: unknown) => e)
    expect(comoErro(depois).codigo).toBe('nada-a-desfazer')
  })

  it.each<Fase>(['movendo', 'reescrevendo', 'removendo'])(
    'caiu %s: manter o cofre como está não mexe em nada, e nenhuma ficha fica citando imagem que não existe',
    async (fase) => {
      const fs = await montarCofreAmostra()
      const quebradasAntes = await citacoesQuebradas(fs)
      const plano = await planejarOrganizacao(RAIZ, portasDe(fs))
      const dirDiario = `${DIR_APP}/${plano.id}`
      await executarPlano(plano, { raiz: RAIZ, dirDiario, portas: portasDe(caiNo(fs, fase)) }).catch(() => undefined)
      expect(await situacaoDoDiario(dirDiario, portasDe(fs), RAIZ)).toBe('pendente')

      const foto = fotoDoCofre(fs)
      await abandonarOrganizacao(dirDiario, portasDe(fs), RAIZ)
      expect(fotoDoCofre(fs)).toEqual(foto)
      expect(await situacaoDoDiario(dirDiario, portasDe(fs), RAIZ)).toBe('nada')
      // é o que torna seguro ficar com o cofre como a queda o deixou: copiar vem antes de reescrever,
      // e o original só sai quando ninguém mais o cita — pela metade, nenhuma imagem citada falta
      expect(await citacoesQuebradas(fs)).toEqual(quebradasAntes)
    },
  )

  it('a volta parou com uma ficha esperando a imagem, e a ficha foi editada: manter o cofre como está libera, e ela segue citando imagem que existe', async () => {
    const fs = await montarCofreAmostra()
    const quebradasAntes = await citacoesQuebradas(fs)
    const { dirDiario } = await organizar(fs)
    // a porta do mapa não volta: o mapa fica esperando por ela, ainda no endereço novo
    expect((await desfazerOrganizacao(dirDiario, portasDe(comTravado(fs, 'imagens-canvas/A1.png')), RAIZ)).completo).toBe(false)
    const masmorra = objeto(await lerJson(fs, 'mapas-soltos/masmorra.json'), 'masmorra.json')
    await gravarJson(fs, 'mapas-soltos/masmorra.json', { ...masmorra, nome: 'Masmorra do Norte' })
    const recusa = await desfazerOrganizacao(dirDiario, portasDe(fs), RAIZ).catch((e: unknown) => e)
    expect(comoErro(recusa).codigo).toBe('mudou-depois')
    expect(comoErro(recusa).message).toContain('mapas-soltos/masmorra.json')
    expect(await situacaoDoDiario(dirDiario, portasDe(fs), RAIZ)).toBe('pendente')

    const foto = fotoDoCofre(fs)
    await abandonarOrganizacao(dirDiario, portasDe(fs), RAIZ)
    expect(fotoDoCofre(fs)).toEqual(foto)
    expect(await lerJson(fs, 'mapas-soltos/masmorra.json')).toHaveProperty('nome', 'Masmorra do Norte')
    expect(await situacaoDoDiario(dirDiario, portasDe(fs), RAIZ)).toBe('nada')
    expect(await citacoesQuebradas(fs)).toEqual(quebradasAntes)
  })

  it('organização concluída não se abandona: continua desfazível', async () => {
    const fs = await montarCofreAmostra()
    const { dirDiario } = await organizar(fs)
    const recusa = await abandonarOrganizacao(dirDiario, portasDe(fs), RAIZ).catch((e: unknown) => e)
    expect(comoErro(recusa).codigo).toBe('nada-pendente')
    expect(await estadoDoDiario(fs, dirDiario)).toBe('concluido')
    expect(await situacaoDoDiario(dirDiario, portasDe(fs), RAIZ)).toBe('desfazivel')
  })

  it('diário mínimo (sem os campos opcionais, de antes de existirem): manter o cofre como está também vale', async () => {
    const fs = criarFakeFs({ caixa: 'insensivel' })
    const dirDiario = `${DIR_APP}/antigo`
    await fs.writeTextAtomic(`${dirDiario}/diario.json`, JSON.stringify({
      versao: 1, planoId: 'antigo', raiz: RAIZ, estado: 'desfazendo', copias: [], criados: [], reescritos: [],
    }))
    expect(await situacaoDoDiario(dirDiario, portasDe(fs), RAIZ)).toBe('pendente')
    await abandonarOrganizacao(dirDiario, portasDe(fs), RAIZ)
    expect(await estadoDoDiario(fs, dirDiario)).toBe('abandonado')
    expect(await situacaoDoDiario(dirDiario, portasDe(fs), RAIZ)).toBe('nada')
  })

  it('sem diário, não há o que abandonar', async () => {
    const fs = criarFakeFs({ caixa: 'insensivel' })
    const recusa = await abandonarOrganizacao(`${DIR_APP}/nao-existe`, portasDe(fs), RAIZ).catch((e: unknown) => e)
    expect(comoErro(recusa).codigo).toBe('nada-pendente')
  })

  it('não abandona com outro cofre aberto', async () => {
    const fs = await montarCofreAmostra()
    const { dirDiario } = await organizarSemRegistrarOFim(fs)
    const recusa = await abandonarOrganizacao(dirDiario, portasDe(fs), 'D:/copia do cofre').catch((e: unknown) => e)
    expect(comoErro(recusa).codigo).toBe('outro-cofre')
    expect(await situacaoDoDiario(dirDiario, portasDe(fs), RAIZ)).toBe('pendente')
  })

  it('o diário não grava o abandono: recusa, e a organização continua pela metade', async () => {
    const fs = await montarCofreAmostra()
    const { dirDiario } = await organizarSemRegistrarOFim(fs)
    const fsQueFalha: FakeFs = {
      ...fs,
      writeTextAtomic: async (p: string, conteudo: string) => {
        if (p === `${dirDiario}/diario.json`) throw new Error('ENOSPC: disco cheio')
        return fs.writeTextAtomic(p, conteudo)
      },
    }
    const recusa = await abandonarOrganizacao(dirDiario, portasDe(fsQueFalha), RAIZ).catch((e: unknown) => e)
    expect(comoErro(recusa).codigo).toBe('diario')
    expect(comoErro(recusa).message).toContain('ENOSPC')
    expect(await situacaoDoDiario(dirDiario, portasDe(fs), RAIZ)).toBe('pendente')
  })
})
