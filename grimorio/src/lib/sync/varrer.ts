import { normalizarCaminho } from '../cofres'
import type { EntradaArquivo, EstadoLocal } from './tipos'

/**
 * Varredura do cofre no disco — a metade LOCAL da entrada de `reconciliar`.
 *
 * Três decisões carregam o arquivo:
 *
 * 1. **A chave é o caminho relativo canônico**, montada segmento a segmento com `/`. A
 *    pré-condição de `reconciliar` é que manifesto, varredura e listagem do Drive concordem na
 *    forma da chave; montar por concatenação de segmentos é o que garante isso aqui, sem depender
 *    do separador que o sistema de arquivos devolveu.
 * 2. **Falha ao listar uma pasta PROPAGA.** Engolir o erro e seguir com menos arquivos é
 *    exatamente a "pasta que não montou" contra a qual o freio de deleção em massa existe: os
 *    arquivos de dentro dela apareceriam como apagados e virariam `apagarRemoto`. Num cofre com
 *    poucos arquivos o freio nem engata, e o sync apagaria a pasta inteira no Drive em silêncio.
 * 3. **O hash é pulado quando `tamanho` e `mtime` batem com o manifesto.** Sem isso toda varredura
 *    releria dezenas de MB de imagem. O risco aceito é o arquivo que muda mantendo tamanho E mtime
 *    exatos — o que exige uma edição que preserve o tamanho e um utilitário que restaure o mtime.
 *
 * **Depende de um comando Rust que ainda não existe.** `list_dir` (`src-tauri/src/lib.rs`) hoje
 * devolve só `{ name, is_dir }`; `EstadoLocal` precisa de `tamanho` e `mtime`. Por isso a listagem
 * entra INJETADA como `ItemNoDisco[]` em vez de sair do `FsBridge`: a peça fica testável hoje e
 * ligar na produção é acrescentar dois campos no Rust e uma linha na ponte — sem um método
 * quebrado no `FsBridge`, que o app inteiro usa.
 */

/** Uma entrada de diretório com o que a varredura precisa. */
export interface ItemNoDisco {
  nome: string
  ehDir: boolean
  /** Em bytes. */
  tamanho: number
  /** Epoch em milissegundos, na mesma unidade de `EntradaArquivo.mtimeLocal`. */
  mtime: number
}

export interface DependenciasDaVarredura {
  listar(caminhoAbsoluto: string): Promise<ItemNoDisco[]>
  /** SHA-256 hex. Em produção é o comando Rust `hash_arquivo`. */
  hashArquivo(caminhoAbsoluto: string): Promise<string>
}

/**
 * Todo arquivo do cofre, por caminho relativo canônico.
 *
 * `conhecidos` é o mapa de arquivos do manifesto e serve SÓ para pular hash. Ele não decide nada:
 * um caminho que não está lá é hasheado e entra igual, porque quem compara contra o manifesto é
 * `reconciliar`.
 */
export async function varrerCofre(
  raiz: string,
  conhecidos: Record<string, EntradaArquivo>,
  deps: DependenciasDaVarredura,
): Promise<Map<string, EstadoLocal>> {
  // Map e não índice no objeto, pela mesma convenção de `reconciliar` e `reconstruir`: nenhum
  // caminho pode achar o protótipo. Aqui isso ainda não muda o resultado — o `constructor` que
  // viria de lá não tem `tamanho` nem `mtimeLocal`, então a comparação abaixo já falharia e o
  // arquivo seria hasheado do mesmo jeito. É consistência de leitura, não correção de bug.
  const anteriores = new Map(Object.entries(conhecidos))
  const encontrados = new Map<string, EstadoLocal>()

  async function estadoDe(caminho: string, absoluto: string, item: ItemNoDisco): Promise<EstadoLocal> {
    const anterior = anteriores.get(caminho)
    const inalterado = anterior !== undefined
      && anterior.tamanho === item.tamanho
      && anterior.mtimeLocal === item.mtime
    return {
      hash: inalterado ? anterior.hash : await deps.hashArquivo(absoluto),
      tamanho: item.tamanho,
      mtime: item.mtime,
    }
  }

  async function descer(relativo: string, absoluto: string): Promise<void> {
    for (const item of await deps.listar(absoluto)) {
      const caminho = relativo === '' ? item.nome : `${relativo}/${item.nome}`
      const filho = `${absoluto}/${item.nome}`
      if (item.ehDir) {
        await descer(caminho, filho)
        continue
      }
      encontrados.set(caminho, await estadoDe(caminho, filho, item))
    }
  }

  await descer('', normalizarCaminho(raiz).replace(/\/+$/, ''))
  return encontrados
}
