/**
 * Ponte entre "criar mapa novo" e a inserção da planta gerada por IA.
 *
 * `AcoesMapaIA` cria o arquivo do mapa (vazio) e manda o app abrir aquele caminho
 * (`abrirDocumento`) — o que DESMONTA o `MapaView` atual e monta um novo, com um editor
 * tldraw novo em folha. Não dá para inserir shapes num editor que ainda não existe, então
 * a planta fica guardada aqui, associada ao `caminho` do mapa recém-criado; o `MapaView`
 * novo confere no `onMount` se há algo pendente para O CAMINHO DELE, insere, e limpa.
 *
 * Módulo, não Zustand: é estado de passagem de UMA navegação, nunca precisa ser lido por
 * dois componentes ao mesmo tempo nem sobreviver a reload — um `Map` comum basta.
 */
import type { Editor } from 'tldraw'

/**
 * Prazo pra uma entrada expirar sozinha. Existe porque o caminho feliz (`MapaView` monta e
 * retira) não é o único: navegação que falha antes de montar, ou o usuário fechando o app
 * no meio, deixariam a entrada presa no `Map` pelo resto da sessão — sem perder dado (não é
 * persistido), mas sem via de limpeza nenhuma. Um TTL curto varrido a cada chamada resolve
 * sem precisar de `setInterval`: ninguém deveria levar minutos entre criar o mapa e montá-lo.
 */
const TTL_MS = 5 * 60 * 1000

interface EntradaPendente {
  formas: Parameters<Editor['createShape']>[0][]
  expiraEm: number
}

const pendentes = new Map<string, EntradaPendente>()

function limparExpiradas(agora: number): void {
  for (const [caminho, entrada] of pendentes) {
    if (entrada.expiraEm <= agora) pendentes.delete(caminho)
  }
}

/** Registra as formas a inserir assim que o mapa em `caminho` terminar de montar. */
export function definirPlantaPendente(caminho: string, formas: Parameters<Editor['createShape']>[0][]): void {
  const agora = Date.now()
  limparExpiradas(agora)
  pendentes.set(caminho, { formas, expiraEm: agora + TTL_MS })
}

/** Retira (e remove) as formas pendentes para `caminho`; `null` se não houver nada (ou expirou). */
export function retirarPlantaPendente(caminho: string): Parameters<Editor['createShape']>[0][] | null {
  limparExpiradas(Date.now())
  const entrada = pendentes.get(caminho)
  if (!entrada) return null
  pendentes.delete(caminho)
  return entrada.formas
}
