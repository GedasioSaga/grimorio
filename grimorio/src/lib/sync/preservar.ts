import type { FsBridge } from '../fsBridge'
import {
  ARQUIVO_DE_VINCULOS,
  assinaturaDoPerdedor,
  marcarComoCopia,
  nomeDaCopia,
  politicaDoCaminho,
  unirVinculos,
  type Politica,
} from './conflito'
import type { ClienteDrive } from './driveBridge'
import { candidatosDeCopia, mesmoConteudoEntidade } from './duplicata'
import { caminhoAbsoluto, type AcaoConflito } from './executar'
import type { EstadoRemoto } from './tipos'

/**
 * Execução da política de conflito — a metade que escreve arquivo. `conflito.ts` decide O QUÊ;
 * aqui é onde a decisão vira disco e rede.
 *
 * Isto é a implementação de produção da porta `preservarPerdedor` que `executar.ts` recebe
 * injetada. O executor chama esta função ANTES de convergir para o vencedor, e trata uma rejeição
 * como falha da ação inteira — a transferência não acontece e o perdedor continua de pé. Toda
 * decisão aqui parte disso: **na dúvida, lançar**. Uma preservação que "quase deu certo" e deixa
 * o executor sobrescrever é o único jeito de esta camada destruir o que ela existe para salvar.
 */

/** O que o ciclo fez com um conflito, para a aba Nuvem poder listar e linkar. */
export interface ConflitoResolvido {
  /** Caminho relativo do arquivo que conflitou. */
  caminho: string
  /** Caminho relativo da cópia gravada, ou `null` quando a política não gera cópia. */
  copia: string | null
  politica: Politica
}

export interface DependenciasDePreservacao {
  fs: FsBridge
  drive: ClienteDrive
  /** Raiz do cofre no disco. Os caminhos das ações são relativos a ela. */
  raizLocal: string
  /** Nome deste computador, do manifesto. Assina a cópia quando é o LOCAL que perde. */
  deviceNome: string
  /** Pasta do cofre no Drive. Só a união usa, para regravar `vinculos.json` mesclado. */
  pastaRaizId: string
  /** Id da entidade copiada. Injetado para o teste poder afirmar o valor exato. */
  novoId(): string
  /** Instante do conflito, para carimbar o nome da cópia. Injetado como em `executar.agora`. */
  agora(): Date
  /**
   * SHA-256 de um arquivo no disco, para comparar cópia binária sem carregar a imagem inteira
   * no JavaScript. Mesma porta que a varredura usa (`hashBridge.hashArquivo`, `hash_arquivo` no
   * Rust) — só entra aqui para o Defeito A (preservação repetida do mesmo perdedor).
   */
  hashArquivo(caminhoAbsoluto: string): Promise<string>
}

export interface Preservador {
  /** A porta que `executar.ts` espera em `DependenciasDoCiclo.preservarPerdedor`. */
  preservarPerdedor(acao: AcaoConflito, remoto: EstadoRemoto | undefined): Promise<void>
  /** Conflitos resolvidos até agora, na ordem em que aconteceram. */
  resolvidos(): ConflitoResolvido[]
}

/**
 * Teto de tentativas de nome. Existe para o laço não virar infinito se `exists` mentir (um
 * diretório sem permissão de leitura responde "existe" para tudo). Cem cópias do mesmo arquivo no
 * mesmo minuto não é um cofre com conflito — é um bug, e é melhor a ação falhar e aparecer em
 * `ResultadoCiclo.falhas` do que rodar para sempre.
 */
const MAXIMO_DE_TENTATIVAS = 100

/** JSON de arquivo do cofre. Falha de parse LANÇA: tratar corrompido como vazio apagaria dados. */
function lerJson(texto: string, caminho: string): unknown {
  try {
    return JSON.parse(texto)
  } catch {
    // o SyntaxError do V8 traz posição, nunca o arquivo — sem o caminho aqui a mensagem que chega
    // ao usuário não diz sequer qual arquivo impediu o sync
    throw new Error(`${caminho} não é JSON válido — o conflito não pôde ser resolvido`)
  }
}

export function criarPreservador(deps: DependenciasDePreservacao): Preservador {
  const resolvidos: ConflitoResolvido[] = []

  function abs(caminho: string): string {
    return caminhoAbsoluto(deps.raizLocal, caminho)
  }

  function registrar(caminho: string, copia: string | null, politica: Politica): void {
    resolvidos.push({ caminho, copia, politica })
  }

  /**
   * Primeiro nome de cópia que ainda não existe no disco.
   *
   * A numeração vem de `nomeDaCopia` e não de um sufixo aleatório porque o nome precisa continuar
   * legível: o usuário acha a cópia pelo nome dela na sidebar, e `gandalf (conflito — PC Casa
   * 26-07 14h32) (2)` diz o que aconteceu — `gandalf-a7f3e1` não diz.
   */
  async function caminhoLivreParaCopia(caminho: string, assinatura: string): Promise<string> {
    const quando = deps.agora()
    for (let tentativa = 0; tentativa < MAXIMO_DE_TENTATIVAS; tentativa++) {
      const candidato = nomeDaCopia(caminho, assinatura, quando, tentativa)
      if (!(await deps.fs.exists(abs(candidato)))) return candidato
    }
    throw new Error(`não há nome livre para a cópia de conflito de ${caminho}`)
  }

  /**
   * Põe o conteúdo do perdedor no caminho da cópia.
   *
   * Os dois lados chegam ao mesmo lugar por caminhos diferentes: o perdedor local ainda está no
   * disco e é copiado; o perdedor remoto só existe no Drive e é BAIXADO para o caminho da cópia —
   * é a última chance de lê-lo, porque o passo seguinte do executor grava por cima dele lá.
   */
  async function trazerPerdedor(
    acao: AcaoConflito,
    remoto: EstadoRemoto,
    copia: string,
  ): Promise<void> {
    await deps.fs.mkdirAll(pastaDe(abs(copia)))
    if (acao.vencedor === 'local') {
      await deps.drive.baixar(remoto.fileId, abs(copia))
    } else {
      await deps.fs.copyFile(abs(acao.caminho), abs(copia))
    }
  }

  /**
   * Acha, entre `candidatos`, o primeiro cuja comparação com o perdedor dá "igual" — a defesa do
   * Defeito A (preservação repetida do mesmo perdedor entre ciclos, ver `duplicata.ts`).
   *
   * Candidato ilegível ou que sumiu entre o `listDir` e agora não deve travar uma preservação
   * NOVA e legítima: conta como "não é duplicata" e o laço segue para o próximo, em vez de
   * lançar e derrubar a ação inteira.
   */
  async function acharDuplicata(
    candidatos: string[],
    comparar: (candidato: string) => Promise<boolean>,
  ): Promise<string | null> {
    for (const candidato of candidatos) {
      try {
        if (await comparar(candidato)) return candidato
      } catch {
        continue
      }
    }
    return null
  }

  /**
   * Cópia de entidade: mesmo conteúdo, identidade nova.
   *
   * O perdedor chega primeiro num arquivo TEMPORÁRIO — não direto em `copia` — porque antes de
   * decidir se ele é cópia nova ou duplicata do que já existe, o conteúdo cru precisa ser lido e
   * comparado. Só quando não há duplicata o temporário vira a cópia de verdade (`rename`); achada
   * a duplicata, ele é descartado e a preservação aponta para a cópia ANTIGA.
   *
   * Se o conteúdo não puder ser marcado (JSON ilegível, ou sem `id`), a cópia fica como veio.
   * Não é atalho: um arquivo que o `JSON.parse` recusa também é recusado por `montarArvorePastas`
   * e `listaComSlug`, que o marcam como `erro` e nunca o põem no índice por id — o estrago que o
   * id novo previne não existe nesse caso.
   */
  async function preservarEntidade(
    acao: AcaoConflito,
    remoto: EstadoRemoto,
    copia: string,
    candidatos: string[],
  ): Promise<void> {
    const temporario = `${copia}.tmp-conflito`
    await trazerPerdedor(acao, remoto, temporario)
    const bruto = await deps.fs.readText(abs(temporario))

    const duplicata = await acharDuplicata(candidatos, async (candidato) =>
      mesmoConteudoEntidade(bruto, await deps.fs.readText(abs(candidato))),
    )
    if (duplicata !== null) {
      await deps.fs.removePath(abs(temporario))
      registrar(acao.caminho, duplicata, 'entidade')
      return
    }

    const marcado = marcarComoCopia(bruto, deps.novoId())
    await deps.fs.rename(abs(temporario), abs(copia))
    if (marcado !== null) await deps.fs.writeTextAtomic(abs(copia), marcado)
    registrar(acao.caminho, copia, 'entidade')
  }

  /**
   * Cópia binária: mesmo raciocínio de `preservarEntidade`, mas a comparação é por HASH do
   * arquivo (`deps.hashArquivo`, o mesmo `hash_arquivo` do Rust que a varredura usa) — o
   * conteúdo não tem `id` nem `nome` para normalizar, então bytes crus é a comparação certa.
   */
  async function preservarBinario(
    acao: AcaoConflito,
    remoto: EstadoRemoto,
    copia: string,
    candidatos: string[],
  ): Promise<void> {
    const temporario = `${copia}.tmp-conflito`
    await trazerPerdedor(acao, remoto, temporario)
    const hashNovo = await deps.hashArquivo(abs(temporario))

    const duplicata = await acharDuplicata(
      candidatos,
      async (candidato) => (await deps.hashArquivo(abs(candidato))) === hashNovo,
    )
    if (duplicata !== null) {
      await deps.fs.removePath(abs(temporario))
      registrar(acao.caminho, duplicata, 'binario')
      return
    }

    await deps.fs.rename(abs(temporario), abs(copia))
    registrar(acao.caminho, copia, 'binario')
  }

  /**
   * `vinculos.json`: mescla os dois lados e grava o resultado nas DUAS pontas.
   *
   * Gravar só localmente não bastaria. O executor converge logo em seguida, e quando o vencedor é
   * o remoto ele BAIXA por cima do que acabamos de mesclar — os vínculos criados neste computador
   * morreriam ali. Subindo o mesclado antes, o download seguinte devolve a própria união, e o
   * resultado é o mesmo com qualquer vencedor.
   *
   * A cópia baixada do Drive é temporária e some no fim: `vinculos.json` é índice, e um
   * `vinculos (conflito …).json` largado na raiz do cofre não é lido por nada — seria lixo, não
   * salvaguarda. Se o processo morrer no meio, o que fica é um arquivo com nome autoexplicativo
   * em vez de um `.tmp` escondido.
   */
  async function preservarUniao(acao: AcaoConflito, remoto: EstadoRemoto, temporario: string): Promise<void> {
    await deps.drive.baixar(remoto.fileId, abs(temporario))
    const doDrive = lerJson(await deps.fs.readText(abs(temporario)), 'vinculos.json (do Drive)')
    // ausente é diferente de corrompido: sem arquivo local não há vínculo daqui a perder, e a
    // união vira a lista remota. Corrompido lança, lá em cima.
    const daqui = (await deps.fs.exists(abs(acao.caminho)))
      ? lerJson(await deps.fs.readText(abs(acao.caminho)), acao.caminho)
      : null

    const unido = JSON.stringify(unirVinculos(daqui, doDrive), null, 2)
    await deps.fs.writeTextAtomic(abs(acao.caminho), unido)
    await deps.fs.removePath(abs(temporario))
    await deps.drive.enviar({
      pastaId: deps.pastaRaizId,
      nome: ARQUIVO_DE_VINCULOS,
      caminhoLocal: abs(acao.caminho),
      fileId: remoto.fileId,
      deviceNome: deps.deviceNome,
    })
    registrar(acao.caminho, null, 'uniao')
  }

  async function preservarPerdedor(acao: AcaoConflito, remoto: EstadoRemoto | undefined): Promise<void> {
    const politica = politicaDoCaminho(acao.caminho)
    if (politica === 'metadado') {
      registrar(acao.caminho, null, politica)
      return
    }
    // `reconciliar` só emite conflito com os dois lados vivos, mas o estado pode ter envelhecido
    // entre o plano e a execução. Sem remoto vivo não há o que baixar nem com o que mesclar.
    if (remoto === undefined || remoto.removido) {
      if (politica === 'uniao') throw new Error(`${acao.caminho} não está mais no Google Drive`)
      // o perdedor era o remoto e ele já não existe: nada a preservar, e o local segue intacto
      if (acao.vencedor === 'local') {
        registrar(acao.caminho, null, politica)
        return
      }
      throw new Error(`${acao.caminho} não está mais no Google Drive`)
    }

    const assinatura = assinaturaDoPerdedor(acao.vencedor, deps.deviceNome, remoto.deviceNome)
    if (politica === 'uniao') {
      const copia = await caminhoLivreParaCopia(acao.caminho, assinatura)
      return preservarUniao(acao, remoto, copia)
    }

    // só entidade e binário criam cópia de verdade no disco, e só essas duas podem duplicar
    // entre ciclos — a busca por candidato fica de fora do caminho de união de propósito.
    // Sem filtrar por assinatura: cópia de mesmo conteúdo vinda de outro computador também é
    // duplicata, e quem decide isso é a comparação de conteúdo, não o nome do arquivo.
    const candidatos = await candidatosDeCopia({ fs: deps.fs, abs }, acao.caminho)
    const copia = await caminhoLivreParaCopia(acao.caminho, assinatura)
    if (politica === 'entidade') return preservarEntidade(acao, remoto, copia, candidatos)
    return preservarBinario(acao, remoto, copia, candidatos)
  }

  return { preservarPerdedor, resolvidos: () => [...resolvidos] }
}

/** Pasta-mãe de um caminho ABSOLUTO já normalizado com `/`. */
function pastaDe(caminho: string): string {
  return caminho.slice(0, caminho.lastIndexOf('/'))
}
