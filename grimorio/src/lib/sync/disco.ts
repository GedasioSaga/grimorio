import { normalizarCaminho } from '../cofres'
import { tauriFs, type EntradaDeDiretorio, type FsBridge } from '../fsBridge'
import { hashArquivo } from '../hashBridge'
import type { EstadoLocal } from './tipos'
import type { DependenciasDaVarredura, ItemNoDisco } from './varrer'

/**
 * As portas do motor que tocam disco de verdade: a varredura do cofre
 * (`DependenciasDaVarredura`) e a sondagem de um arquivo só (`sondarLocal`).
 *
 * Existe como arquivo separado porque `varrer.ts` é puro de propósito — é a peça que decide o
 * que hashear, e ela não pode importar Tauri para continuar testável. Aqui mora a única coisa
 * que sobra: traduzir a entrada do `FsBridge` (que fala a língua do Rust: `name`, `isDir`) para
 * a forma que a varredura consome, e decidir o que fazer com o metadado que o `list_dir` não
 * conseguiu ler.
 *
 * A fábrica recebe as duas dependências em vez de importá-las direto pelo mesmo motivo de
 * sempre neste módulo: com elas injetadas, a tradução é testável contra um `FsBridge` falso.
 */
export function criarVarreduraNoDisco(
  fs: FsBridge,
  hash: (caminhoAbsoluto: string) => Promise<string>,
): DependenciasDaVarredura {
  return {
    async listar(caminhoAbsoluto) {
      return (await fs.listDir(caminhoAbsoluto)).map(itemNoDisco)
    },
    hashArquivo: hash,
  }
}

/**
 * Metadado ilegível vira `0`, e não exceção.
 *
 * O par (tamanho, mtime) serve a UMA coisa: pular o hash de arquivo que não mudou. Zerar os dois
 * faz a comparação com o manifesto falhar e o arquivo ser rehasheado — degradação em custo, não
 * em correção. Derrubar a varredura seria o oposto: um arquivo travado pelo antivírus custaria o
 * ciclo inteiro do cofre. Descartar a entrada seria pior ainda, porque a reconciliação lê
 * ausência como "apagado" e mandaria apagá-lo do Drive.
 *
 * Buraco conhecido, e o motivo de ele ser estreito: se o metadado ficar ilegível em DOIS ciclos
 * seguidos, o manifesto do primeiro já guardou 0/0, o segundo compara 0/0 com 0/0 e o hash é
 * pulado com o valor velho. Fechá-lo exige levar o "não sei" até `EstadoLocal` e, portanto,
 * mudar a forma do manifesto. Nenhum arquivo real tem mtime 0 (1970-01-01), então o caso pede a
 * mesma falha de leitura repetida no mesmo arquivo.
 */
function itemNoDisco(entrada: EntradaDeDiretorio): ItemNoDisco {
  return {
    nome: entrada.name,
    ehDir: entrada.isDir,
    tamanho: entrada.size ?? 0,
    mtime: entrada.mtime ?? 0,
  }
}

/** Nome e pasta-mãe de um caminho absoluto, já em forma canônica. */
function partirCaminho(caminhoAbsoluto: string): { pasta: string; nome: string } {
  const canonico = normalizarCaminho(caminhoAbsoluto)
  const corte = canonico.lastIndexOf('/')
  return { pasta: canonico.slice(0, corte), nome: canonico.slice(corte + 1) }
}

/**
 * A entrada de UM arquivo, achada na listagem da pasta-mãe.
 *
 * Não existe comando para "metadado deste arquivo": `list_dir` é o que há, e listar a pasta-mãe
 * é barato porque a sondagem só acontece depois de um download — não a cada arquivo do cofre.
 *
 * A busca cai para comparação sem caixa quando o nome exato não aparece. O caso é real: o Drive
 * distingue `Gandalf.json` de `gandalf.json` e o Windows não, então um download pode gravar num
 * arquivo que já existia com outra caixa, e o disco mantém a caixa original.
 */
function acharNaListagem(entradas: EntradaDeDiretorio[], nome: string): EntradaDeDiretorio | undefined {
  const exata = entradas.find((e) => e.name === nome)
  if (exata !== undefined) return exata
  const semCaixa = nome.toLowerCase()
  return entradas.find((e) => e.name.toLowerCase() === semCaixa)
}

/**
 * O que REALMENTE ficou no disco depois de um download — a porta `sondarLocal` do ciclo.
 *
 * O hash é relido do arquivo, e não copiado da resposta do Drive, porque o manifesto precisa
 * descrever o disco: o `sha256Checksum` é opcional na API, e o `mtime` do arquivo recém-escrito é
 * do sistema de arquivos, não do HTTP. Um manifesto que guardasse o que o Drive prometeu faria a
 * varredura seguinte ler "local mudou" e baixar o mesmo arquivo para sempre.
 *
 * As duas falhas possíveis têm respostas opostas de propósito:
 *
 * - **Hash que falha PROPAGA.** Arquivo sumido ou travado significa que o download não chegou ao
 *   disco; a ação tem de constar como falha para o manifesto manter a entrada anterior e o ciclo
 *   seguinte tentar de novo.
 * - **Metadado ilegível vira 0**, como em `itemNoDisco`, e pelo mesmo motivo: tamanho e mtime
 *   servem só para pular hash. Com 0/0 gravado, a varredura seguinte não pula — recalcula, acha o
 *   mesmo hash e conclui "igual". Custa uma leitura; não erra uma decisão.
 */
export function criarSondagemNoDisco(
  fs: FsBridge,
  hash: (caminhoAbsoluto: string) => Promise<string>,
): (caminhoAbsoluto: string) => Promise<EstadoLocal> {
  return async function sondarLocal(caminhoAbsoluto) {
    const { pasta, nome } = partirCaminho(caminhoAbsoluto)
    const digest = await hash(caminhoAbsoluto)
    const entrada = await fs
      .listDir(pasta)
      .then((entradas) => acharNaListagem(entradas, nome))
      // pasta ilegível cai no mesmo lugar que metadado ilegível: 0/0, e o hash acima é a verdade
      .catch(() => undefined)
    return { hash: digest, tamanho: entrada?.size ?? 0, mtime: entrada?.mtime ?? 0 }
  }
}

/** A varredura como a produção a usa: `list_dir` e `hash_arquivo` de verdade. */
export const varreduraNoDisco = criarVarreduraNoDisco(tauriFs, hashArquivo)

/** A sondagem como a produção a usa. */
export const sondagemNoDisco = criarSondagemNoDisco(tauriFs, hashArquivo)
