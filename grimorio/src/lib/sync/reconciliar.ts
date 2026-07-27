import type { Acao, EntradaArquivo, EstadoLocal, EstadoRemoto, Manifesto, Plano } from './tipos'

/**
 * Motor de reconciliação. Função PURA: manifesto + estado local + estado remoto entram, um
 * plano sai. Sem I/O, sem rede, sem Tauri, sem relógio — é isso que torna a lógica mais
 * arriscada do sync testável sem credencial, antes de existir qualquer cliente do Drive.
 *
 * A regra que governa o arquivo inteiro: **cada lado é comparado contra o MANIFESTO, nunca
 * contra o outro lado**. A pergunta é "mudou desde o último sync?" e não "quem tem a data
 * maior?" — e é essa distinção que impede um arquivo apagado de ressuscitar a cada ciclo pelo
 * lado que ainda o tem. Mesmo desenho que o rclone chama de `.lst` e o Unison de archive.
 */

/** Como UM lado está em relação ao manifesto. Nunca em relação ao outro lado. */
type Lado = 'igual' | 'mudou' | 'apagado'

/** Célula da matriz: um tipo de ação, ou a ausência dela. */
type Celula = Acao['tipo'] | 'nada'

/** Acima desta fração de deleções sobre o total conhecido, o motor se recusa a agir. */
const LIMITE_DELECAO = 0.5

/**
 * Vencedor do conflito. **Provisório e deliberado:** `EstadoRemoto` não carrega nada
 * comparável ao `mtimeLocal` do manifesto, então decidir por data aqui dentro exigiria
 * inventar um dado que a função não recebe. Quem vai comparar tempos de modificação de
 * verdade é o executor, que tem o metadado do Drive em mãos. Até lá vence o local, que é o
 * lado cuja edição o usuário acabou de ver na tela.
 */
const VENCEDOR_PROVISORIO = 'local' as const

/**
 * Matriz para arquivos COM entrada no manifesto. Duas células parecem arbitrárias e não são:
 * `mudou × apagado` e `apagado × mudou` resolvem a favor da edição, porque recriar um arquivo
 * que o usuário acabou de editar é recuperável e descartar a edição dele em silêncio não é.
 */
const MATRIZ_CONHECIDO: Record<Lado, Record<Lado, Celula>> = {
  //         remoto igual        remoto mudou       remoto apagado
  igual: { igual: 'nada', mudou: 'baixar', apagado: 'apagarLocal' },
  mudou: { igual: 'subir', mudou: 'conflito', apagado: 'subir' },
  apagado: { igual: 'apagarRemoto', mudou: 'baixar', apagado: 'nada' },
}

/**
 * Estado do lado local contra o manifesto. Recebe só a entrada e o estado local de propósito:
 * não tendo acesso ao remoto, esta função é incapaz de violar a regra de ouro.
 */
function ladoLocal(entrada: EntradaArquivo, atual: EstadoLocal | undefined): Lado {
  if (atual === undefined) return 'apagado'
  return atual.hash === entrada.hash ? 'igual' : 'mudou'
}

/** Idem para o lado remoto. `removido` cobre deleção E perda de acesso — a API não distingue. */
function ladoRemoto(entrada: EntradaArquivo, atual: EstadoRemoto | undefined): Lado {
  if (atual === undefined || atual.removido) return 'apagado'
  // `hash` é opcional no Drive. Quando falta, `versaoRemota` é exatamente o que o manifesto
  // guardou para responder "mudou?" sem hash. Assumir 'mudou' aqui baixaria o arquivo a cada
  // ciclo, para sempre.
  if (atual.hash === undefined) return atual.versao === entrada.versaoRemota ? 'igual' : 'mudou'
  return atual.hash === entrada.hash ? 'igual' : 'mudou'
}

/** Converte a célula da matriz em ação. `'nada'` vira `null` — nunca um `undefined` na lista. */
function montarAcao(celula: Celula, caminho: string): Acao | null {
  if (celula === 'nada') return null
  if (celula === 'conflito') return { tipo: celula, caminho, vencedor: VENCEDOR_PROVISORIO }
  return { tipo: celula, caminho }
}

/**
 * Arquivos SEM entrada no manifesto: primeiro sync, ou criados depois do último ciclo.
 *
 * Aqui — e só aqui — os dois lados se comparam diretamente, porque não existe manifesto contra
 * o qual comparar. Não é a mesma pergunta da matriz de cima: não há "mudou" a detectar, só
 * "são o mesmo arquivo?".
 */
function acaoSemManifesto(
  caminho: string,
  atualLocal: EstadoLocal | undefined,
  atualRemoto: EstadoRemoto | undefined,
): Acao | null {
  const vivoRemoto = atualRemoto !== undefined && !atualRemoto.removido ? atualRemoto : undefined
  if (atualLocal === undefined) {
    // Sem local e sem remoto só acontece com lápide (`removido`) de arquivo que este PC nunca
    // teve. Nada a fazer — nem sequer registrar.
    return vivoRemoto === undefined ? null : { tipo: 'baixar', caminho }
  }
  if (vivoRemoto === undefined) return { tipo: 'subir', caminho }
  // Sem `hash` do Drive não dá para PROVAR que os dois lados são iguais, e supor que são
  // sobrescreveria uma das versões em silêncio. Conflito é a suposição recuperável.
  if (vivoRemoto.hash === undefined) return { tipo: 'conflito', caminho, vencedor: VENCEDOR_PROVISORIO }
  // Hash igual é o caso que impede um cofre inteiro de subir de novo quando o usuário pareia um
  // segundo PC que já tem uma cópia idêntica: só adota no manifesto, sem subir nem baixar.
  return vivoRemoto.hash === atualLocal.hash
    ? { tipo: 'registrar', caminho }
    : { tipo: 'conflito', caminho, vencedor: VENCEDOR_PROVISORIO }
}

/**
 * Decide o que sobe, o que desce, o que some e o que é conflito.
 *
 * Devolve um plano ou uma recusa. A recusa é valor de retorno e não exceção porque o freio de
 * deleção em massa é decisão de produto (perguntar ao usuário), não erro de programa.
 */
export function reconciliar(
  manifesto: Manifesto,
  local: Map<string, EstadoLocal>,
  remoto: Map<string, EstadoRemoto>,
): Plano {
  // Map em vez de índice no objeto para que um arquivo chamado `constructor` ou `toString`
  // não caia no protótipo e vire uma entrada de manifesto fantasma.
  const conhecidos = new Map(Object.entries(manifesto.arquivos))

  // União ordenada por caminho: a ordem do plano não depende da ordem de inserção dos Maps,
  // então a mesma entrada produz sempre exatamente o mesmo plano. Um executor que se comporta
  // diferente a cada rodada é intestável.
  const caminhos = [...new Set([...conhecidos.keys(), ...local.keys(), ...remoto.keys()])].sort()

  const acoes: Acao[] = []
  for (const caminho of caminhos) {
    const entrada = conhecidos.get(caminho)
    const atualLocal = local.get(caminho)
    const atualRemoto = remoto.get(caminho)
    const acao = entrada === undefined
      ? acaoSemManifesto(caminho, atualLocal, atualRemoto)
      : montarAcao(MATRIZ_CONHECIDO[ladoLocal(entrada, atualLocal)][ladoRemoto(entrada, atualRemoto)], caminho)
    if (acao !== null) acoes.push(acao)
  }

  // Freio de deleção em massa. É o default do rclone e do remotely-save, e existe porque é
  // exatamente assim que um sync perde um cofre inteiro: uma pasta que não montou, um caminho
  // que mudou, e o motor conclui que tudo foi apagado.
  const total = conhecidos.size
  const apagaria = acoes.filter((a) => a.tipo === 'apagarLocal' || a.tipo === 'apagarRemoto').length
  // Manifesto vazio é primeiro sync: não há base contra a qual medir "metade".
  if (total > 0 && apagaria > total * LIMITE_DELECAO) {
    return { ok: false, motivo: 'delecao-em-massa', apagaria, total }
  }
  return { ok: true, acoes }
}
