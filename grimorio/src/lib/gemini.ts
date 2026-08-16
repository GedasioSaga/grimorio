/**
 * Cliente do Gemini (REST v1beta, sem SDK). As chaves são injetadas pelo chamador
 * (a UI as obtém via chavesIA.garantirChaves) e usadas em round-robin; qualquer
 * erro/rede tenta a próxima. As chaves NUNCA aparecem em logs ou mensagens de erro.
 *
 * Usa o `fetch` do plugin HTTP do Tauri (requisição pelo backend Rust): o webview
 * não consegue chamar a API do Google direto (CORS). Sem isso a chamada trava. O
 * plugin devolve um `ReadableStream` de verdade, puxado pedaço a pedaço pelo IPC,
 * que é o que torna o modo `streamGenerateContent` possível aqui.
 *
 * Só existe UM caminho de requisição: tudo passa pelo stream. Quem não quer o texto
 * saindo aos poucos simplesmente não passa `aoReceber` e recebe o texto inteiro no fim.
 */
import { fetch } from '@tauri-apps/plugin-http'
import { MODELO_PADRAO } from './modeloIA'

const URL_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

/**
 * Silêncio máximo tolerado. É de INATIVIDADE, não de duração total: com streaming, um
 * teto absoluto cortaria no meio justamente a resposta longa que o streaming existe para
 * servir. O relógio reinicia a cada pedaço que chega.
 */
const TIMEOUT_MS = 30000

export interface MensagemIA {
  papel: 'user' | 'model'
  texto: string
}

export interface ImagemIA {
  mimeType: string
  base64: string
}

interface ParteIA {
  text?: string
  inline_data?: { mime_type: string; data: string }
}

export interface BodyGemini {
  system_instruction: { parts: { text: string }[] }
  contents: { role: 'user' | 'model'; parts: ParteIA[] }[]
}

export interface PedidoIA {
  system: string
  historico: MensagemIA[]
  imagens?: ImagemIA[]
  /** Chaves da API (a UI obtém via garantirChaves e injeta; a lib não conhece o storage). */
  chaves: string[]
  /**
   * Modelo a usar. A UI injeta o escolhido nas Opções (`modeloSalvo()`), como faz com as
   * chaves — a lib não lê storage, para continuar testável sem DOM.
   */
  modelo?: string
  /**
   * Chamado a cada pedaço, com o texto ACUMULADO até ali (não com o pedaço solto): a UI
   * só precisa jogar o valor num state, sem concatenar nada do lado dela.
   */
  aoReceber?: (parcial: string) => void
}

/** Monta o body do generateContent; imagens entram nas parts da ÚLTIMA mensagem user. */
export function montarBody(
  system: string,
  historico: MensagemIA[],
  imagens: ImagemIA[] = [],
): BodyGemini {
  const ultimaUser = historico.map((m) => m.papel).lastIndexOf('user')
  const contents = historico.map((m, i) => {
    const parts: ParteIA[] = [{ text: m.texto }]
    if (i === ultimaUser) {
      for (const img of imagens) parts.push({ inline_data: { mime_type: img.mimeType, data: img.base64 } })
    }
    return { role: m.papel, parts }
  })
  return { system_instruction: { parts: [{ text: system }] }, contents }
}

/**
 * Texto do primeiro candidato, EXATAMENTE como veio ('' se vazio/bloqueado/malformado).
 *
 * Sem `trim`, e isso é essencial no streaming: o modelo quebra a frase em pedaços cujo
 * espaço de junção vive na borda ("Era uma" + " vez"). Aparar cada pedaço grudaria as
 * palavras. Quem quer o texto inteiro apara uma vez, no fim.
 */
function textoDasPartes(resp: unknown): string {
  const parts = (resp as { candidates?: { content?: { parts?: { text?: string }[] } }[] })
    ?.candidates?.[0]?.content?.parts
  if (!Array.isArray(parts)) return ''
  return parts.map((p) => p?.text ?? '').join('')
}

/** Texto do primeiro candidato, aparado ('' se vazio/bloqueado/malformado). */
export function extrairTexto(resp: unknown): string {
  return textoDasPartes(resp).trim()
}

/**
 * Fatia um buffer SSE nos eventos COMPLETOS que ele já contém e devolve o resto.
 *
 * Um pedaço da rede não respeita fronteira de evento: pode trazer meio JSON. Processar só
 * o que termina em '\n' e guardar a sobra é o que impede um `JSON.parse` em texto cortado.
 * Só a linha `data:` interessa; `event:`, `id:` e comentários (`:`) são ignorados.
 */
export function consumirSse(buffer: string): { textos: string[]; resto: string } {
  const corte = buffer.lastIndexOf('\n')
  if (corte < 0) return { textos: [], resto: buffer }
  const textos: string[] = []
  for (const linha of buffer.slice(0, corte).split('\n')) {
    if (!linha.startsWith('data:')) continue
    const carga = linha.slice(5).trim()
    if (!carga || carga === '[DONE]') continue
    try {
      // pedaço malformado é pedaço perdido, não conversa perdida: seguir é melhor que
      // derrubar uma resposta que já veio quase inteira
      const texto = textoDasPartes(JSON.parse(carga))
      if (texto) textos.push(texto)
    } catch {
      // ignora evento ilegível
    }
  }
  return { textos, resto: buffer.slice(corte + 1) }
}

// round-robin em nível de módulo: cada chamada começa numa chave diferente
let indiceChave = 0

/** Erro de conteúdo vazio/bloqueado: é definitivo, trocar de chave não muda nada. */
const SEM_CONTEUDO = 'A IA não retornou conteúdo.'

/**
 * O modelo pedido não existe para esta conta (HTTP 404).
 *
 * Classe própria, e não uma string de erro, porque quem chama PRECISA distinguir isto de
 * "a IA falhou": a lista de modelos do app é curada à mão e envelhece — o Google publica e
 * aposenta nomes sem avisar —, então cair para um modelo que a conta comprovadamente tem é
 * recuperação legítima, não remendo. Ver `gerarPlantaIA`.
 */
export class ErroModeloInexistente extends Error {
  constructor(readonly modelo: string) {
    super(`O modelo "${modelo}" não existe ou sua conta não tem acesso a ele.`)
    this.name = 'ErroModeloInexistente'
  }
}

export async function gerarConteudo(opts: PedidoIA): Promise<string> {
  const chaves = opts.chaves
  if (chaves.length === 0) {
    throw new Error('IA não configurada. Cole sua chave da API do Gemini quando solicitado.')
  }
  const modelo = opts.modelo ?? MODELO_PADRAO
  const body = JSON.stringify(montarBody(opts.system, opts.historico, opts.imagens ?? []))
  const url = `${URL_BASE}/${modelo}:streamGenerateContent?alt=sse`

  const inicio = indiceChave++ // reserva o ponto de partida desta chamada (síncrono, sem corrida entre chamadas concorrentes)
  let ultimoStatus = 0 // 0 = nenhuma resposta HTTP (só erro de rede)
  let ultimoDetalhe = '' // motivo real da última falha (para diagnóstico; sempre sanitizado)
  for (let tentativa = 0; tentativa < chaves.length; tentativa++) {
    const chave = chaves[(inicio + tentativa) % chaves.length]
    // texto já entregue à UI nesta tentativa. Depois do primeiro pedaço a troca de chave
    // deixa de ser possível: recomeçar duplicaria na tela o que o usuário já leu.
    let entregue = 0
    try {
      const texto = await lerStream(url, chave, body, (parcial) => {
        entregue = parcial.length
        opts.aoReceber?.(parcial)
      })
      if (!texto) throw new Error(SEM_CONTEUDO)
      return texto
    } catch (e) {
      if (e instanceof Error && e.message === SEM_CONTEUDO) throw e
      if (entregue > 0) throw new Error(`A resposta foi interrompida no meio (${sanitizarErro(String(e), chaves)}).`)
      const status = (e as { statusHttp?: number }).statusHttp
      if (status) ultimoStatus = status
      ultimoDetalhe = status ? `HTTP ${status}` : sanitizarErro(String(e), chaves)
      /**
       * 404 é o MODELO que não existe para esta conta, não a chave que falhou. Trocar de
       * chave não muda nada: o laço percorre todas, todas devolvem 404, e o usuário recebe
       * "IA indisponível após tentar todas as chaves" — que aponta para o lugar errado e
       * esconde a causa. Falha na hora, dizendo qual modelo o servidor não conhece.
       */
      if (status === 404) throw new ErroModeloInexistente(modelo)
      continue // erro antes de qualquer texto: tenta a próxima chave
    }
  }
  throw new Error(
    `IA indisponível após tentar todas as chaves (último HTTP ${ultimoStatus}${ultimoDetalhe ? `; ${ultimoDetalhe}` : ''}).`,
  )
}

/** Erro HTTP carregando o status, para o laço de chaves distinguir de falha de rede. */
function erroHttp(status: number): Error {
  return Object.assign(new Error(`HTTP ${status}`), { statusHttp: status })
}

/**
 * Uma tentativa: abre o stream com UMA chave e vai avisando o texto acumulado.
 * O relógio de inatividade é rearmado a cada pedaço e cancelado na saída — inclusive na
 * saída por erro, senão um abort atrasado derrubaria a requisição seguinte.
 */
async function lerStream(
  url: string,
  chave: string,
  body: string,
  aoAcumular: (parcial: string) => void,
): Promise<string> {
  const ctrl = new AbortController()
  let relogio: ReturnType<typeof setTimeout> | null = null
  const rearmar = () => {
    if (relogio) clearTimeout(relogio)
    relogio = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  }
  rearmar()
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': chave },
      body,
      signal: ctrl.signal,
    })
    // qualquer erro HTTP (429/503, mas também 400/403 de chave inválida): o chamador troca de chave
    if (!resp.ok) throw erroHttp(resp.status)
    if (!resp.body) throw new Error('resposta sem corpo')

    const leitor = resp.body.getReader()
    const decodificador = new TextDecoder()
    let buffer = ''
    let acumulado = ''
    for (;;) {
      const { done, value } = await leitor.read()
      if (done) break
      rearmar()
      buffer += decodificador.decode(value, { stream: true })
      const { textos, resto } = consumirSse(buffer)
      buffer = resto
      if (textos.length === 0) continue
      // as partes já vêm separadas pelo modelo; juntar sem espaço preserva o texto original
      acumulado += textos.join('')
      aoAcumular(acumulado)
    }
    return acumulado.trim()
  } finally {
    if (relogio) clearTimeout(relogio)
  }
}

/**
 * IDs de modelo que a chave enxerga, para as Opções montarem a lista. Falha (offline, chave
 * inválida) devolve [] em vez de lançar: a tela cai na lista curada e continua utilizável.
 */
export async function listarModelos(chaves: string[]): Promise<string[]> {
  const chave = chaves[0]
  if (!chave) return []
  try {
    const resp = await fetch(`${URL_BASE}?pageSize=200`, {
      headers: { 'x-goog-api-key': chave },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!resp.ok) return []
    const dados = (await resp.json()) as { models?: { name?: string; supportedGenerationMethods?: string[] }[] }
    return (dados.models ?? [])
      .filter((m) => !m.supportedGenerationMethods || m.supportedGenerationMethods.includes('generateContent'))
      .map((m) => (m.name ?? '').replace(/^models\//, ''))
      .filter(Boolean)
  } catch {
    return []
  }
}

/** Remove qualquer chave que apareça num texto de erro (defesa em profundidade). */
function sanitizarErro(msg: string, chaves: string[]): string {
  let limpo = msg.replace(/\s+/g, ' ').slice(0, 220)
  for (const c of chaves) limpo = limpo.split(c).join('***')
  return limpo
}
