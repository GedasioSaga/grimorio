import { tauriFs, type EntradaDeDiretorio, type FsBridge } from '../fsBridge'
import { hashArquivo } from '../hashBridge'
import type { DependenciasDaVarredura, ItemNoDisco } from './varrer'

/**
 * A porta da varredura (`DependenciasDaVarredura`) ligada no disco de verdade.
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

/** A varredura como a produção a usa: `list_dir` e `hash_arquivo` de verdade. */
export const varreduraNoDisco = criarVarreduraNoDisco(tauriFs, hashArquivo)
