import type { EntradaArquivo, EstadoLocal, EstadoRemoto, Manifesto } from './tipos'

/**
 * Reconstrução do manifesto ao fim de um ciclo. Função PURA, como `reconciliar`: nada de
 * rede, disco ou relógio entra aqui — o instante do ciclo chega como parâmetro.
 *
 * O contrato (ver "Contrato do manifesto — reconstrução, não edição incremental" no design):
 * o manifesto é REESCRITO INTEIRO a partir do estado pós-ciclo, nunca remendado ação por ação.
 * É o que permite à célula `apagado × apagado` da matriz não emitir ação nenhuma — o caminho
 * simplesmente não aparece no manifesto novo, e `Acao` não precisa de um verbo `esquecer`. Sob
 * edição incremental essa entrada viveria para sempre e inflaria o `total` que é o denominador
 * do freio de deleção em massa: 20 arquivos reais mais 200 fantasmas fariam uma falha
 * sistemática de 20 deleções medir 9%, e o freio nunca dispararia.
 *
 * A regra que governa o arquivo: **só entra no manifesto o que de fato aconteceu.** Uma ação
 * que falhou não pode deixar rastro de sucesso aqui. Se deixasse, o ciclo seguinte compararia
 * os dois lados contra um manifesto que afirma um estado que nunca existiu, concluiria "igual
 * × igual" e a divergência sumiria de vista para sempre — o arquivo ficaria eternamente
 * dessincronizado sem ninguém saber. É o modo de falha mais caro desta camada, e a única
 * defesa é a distinção entre `concluidos` e `falhados` abaixo.
 */

/** Estado de um caminho DEPOIS da ação. `null` = não existe mais em nenhum dos dois lados. */
export type Desfecho = EntradaArquivo | null

export interface EstadoPosCiclo {
  /** Manifesto do último sync. É dele que saem a identidade do cofre e o `startPageToken`. */
  anterior: Manifesto
  /** A varredura local e a listagem do Drive que alimentaram a reconciliação deste ciclo. */
  local: Map<string, EstadoLocal>
  remoto: Map<string, EstadoRemoto>
  /** Caminhos cuja ação chegou ao fim, com o estado resultante. */
  concluidos: Map<string, Desfecho>
  /** Caminhos cuja ação falhou. Nada aqui pode virar entrada nova. */
  falhados: Set<string>
}

/**
 * Entrada de um caminho que o ciclo NÃO tocou.
 *
 * Existe só quando os dois lados estão vivos — que, sem ação emitida, é o caso `igual × igual`.
 * Os outros dois "sem ação" da reconciliação (`apagado × apagado` e a lápide remota de arquivo
 * que este PC nunca teve) caem no `null` e desaparecem do manifesto, que é exatamente o
 * comportamento que a reconstrução existe para dar.
 *
 * `fileId` e `versaoRemota` saem da listagem de AGORA, não da entrada velha: um arquivo
 * recriado no Drive com conteúdo idêntico ganha id novo sem que nada tenha mudado, e é aqui
 * que o id novo entra sem exigir transferência nenhuma.
 */
function entradaEmRepouso(
  local: EstadoLocal | undefined,
  remoto: EstadoRemoto | undefined,
): Desfecho {
  if (local === undefined || remoto === undefined || remoto.removido) return null
  return {
    fileId: remoto.fileId,
    hash: local.hash,
    tamanho: local.tamanho,
    mtimeLocal: local.mtime,
    versaoRemota: remoto.versao,
  }
}

/**
 * A entrada de um caminho, na ordem de precedência que importa.
 *
 * A falha vem PRIMEIRO de propósito. Manter a entrada anterior — a do último sync que deu
 * certo — é o que faz o ciclo seguinte rederivar a mesma divergência e tentar de novo. As duas
 * alternativas são armadilhas: gravar o estado que a ação teria produzido esconderia a
 * divergência para sempre, e remover a entrada faria o próximo ciclo tratar o arquivo como
 * novo dos dois lados, que na matriz sem manifesto vira conflito (e uma cópia de conflito
 * inútil) toda vez que um upload falhar.
 */
function entradaDe(
  caminho: string,
  estado: EstadoPosCiclo,
  anteriores: Map<string, EntradaArquivo>,
): Desfecho {
  if (estado.falhados.has(caminho)) return anteriores.get(caminho) ?? null
  const concluido = estado.concluidos.get(caminho)
  if (concluido !== undefined) return concluido
  return entradaEmRepouso(estado.local.get(caminho), estado.remoto.get(caminho))
}

/**
 * Todo caminho que ESTE ciclo viu — os dois lados mais o que foi executado.
 *
 * As chaves do manifesto velho ficam de fora de propósito: um caminho que só ele conhece é
 * justamente o `apagado × apagado`, o que sumiu dos dois lados, e é essa ausência que a
 * reconstrução existe para transformar em esquecimento.
 */
function caminhosDoCiclo(estado: EstadoPosCiclo): Set<string> {
  return new Set([
    ...estado.local.keys(),
    ...estado.remoto.keys(),
    ...estado.concluidos.keys(),
    ...estado.falhados,
  ])
}

function arquivosPosCiclo(estado: EstadoPosCiclo): Map<string, EntradaArquivo> {
  // Map, e não índice em objeto, pelo mesmo motivo de `reconciliar`: um arquivo chamado
  // `constructor` ou `toString` cairia no protótipo e viraria uma entrada fantasma.
  const anteriores = new Map(Object.entries(estado.anterior.arquivos))
  const caminhos = caminhosDoCiclo(estado)

  const arquivos = new Map<string, EntradaArquivo>()
  for (const caminho of caminhos) {
    const entrada = entradaDe(caminho, estado, anteriores)
    if (entrada !== null) arquivos.set(caminho, entrada)
  }
  return arquivos
}

/** Comparação por unidade de código UTF-16 — a mesma ordem que `reconciliar` usa no plano. */
function porCaminho(a: [string, unknown], b: [string, unknown]): number {
  return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0
}

/**
 * Map → objeto com as chaves ordenadas, para que o mesmo estado gere sempre o mesmo JSON.
 *
 * `Object.fromEntries`, e não atribuição por índice: a atribuição dispara o setter de
 * `__proto__` num cofre que tenha um arquivo com esse nome, e a entrada some do manifesto sem
 * erro nenhum — o que o próximo ciclo lê como "arquivo novo".
 */
function ordenarPorCaminho<T>(mapa: Map<string, T>): Record<string, T> {
  return Object.fromEntries([...mapa].sort(porCaminho))
}

/**
 * O manifesto do próximo ciclo.
 *
 * `startPageToken`, `cofreId`, `pastaRaizId`, `deviceId` e `deviceNome` atravessam intactos: o
 * executor não fala com `changes.list` (é a fatia seguinte) nem troca a identidade do cofre.
 * `ultimoSync` chega pronto para que esta função continue sem relógio.
 *
 * `pastas` é reescrito com o que se sabe AGORA — a listagem do Drive mais as pastas criadas
 * durante o ciclo. Herdar as do manifesto velho traria de volta ids de pastas que podem já ter
 * sido apagadas no Drive, e enviar um arquivo para uma pasta na lixeira o deposita na lixeira
 * junto, sem erro nenhum: o upload "dá certo" e o arquivo nunca mais aparece na listagem.
 */
export function reconstruirManifesto(
  estado: EstadoPosCiclo,
  pastas: Map<string, string>,
  ultimoSync: string,
): Manifesto {
  return {
    ...estado.anterior,
    ultimoSync,
    pastas: ordenarPorCaminho(pastas),
    arquivos: ordenarPorCaminho(arquivosPosCiclo(estado)),
  }
}
