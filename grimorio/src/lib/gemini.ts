/**
 * Cliente do Gemini (REST v1beta, sem SDK). Chaves em GEMINI_API_KEYS
 * (round-robin; qualquer erro/rede tenta a próxima). As chaves NUNCA aparecem
 * em logs ou mensagens de erro.
 *
 * Usa o `fetch` do plugin HTTP do Tauri (requisição pelo backend Rust): o webview
 * não consegue chamar a API do Google direto (CORS). Sem isso a chamada trava.
 */
import { fetch } from '@tauri-apps/plugin-http'

const URL_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'
const MODELO_PADRAO = 'gemini-3.1-flash-lite'
const TIMEOUT_MS = 30000 // aborta requisição pendurada → vira erro visível, não "pensando" eterno

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

/** "k1, k2,k3" → ['k1','k2','k3'] (vazios fora). */
export function parsearChaves(raw: string | undefined): string[] {
  return (raw ?? '').split(',').map((s) => s.trim()).filter(Boolean)
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

/** Texto do primeiro candidato ('' se vazio/bloqueado/malformado). */
export function extrairTexto(resp: unknown): string {
  const parts = (resp as { candidates?: { content?: { parts?: { text?: string }[] } }[] })
    ?.candidates?.[0]?.content?.parts
  if (!Array.isArray(parts)) return ''
  return parts.map((p) => p?.text ?? '').join('').trim()
}

// round-robin em nível de módulo: cada chamada começa numa chave diferente
let indiceChave = 0

export async function gerarConteudo(opts: {
  system: string
  historico: MensagemIA[]
  imagens?: ImagemIA[]
}): Promise<string> {
  const chaves = parsearChaves(import.meta.env.GEMINI_API_KEYS)
  if (chaves.length === 0) {
    throw new Error('IA não configurada (defina GEMINI_API_KEYS no .env).')
  }
  const modelo = import.meta.env.GEMINI_MODEL || MODELO_PADRAO
  const body = JSON.stringify(montarBody(opts.system, opts.historico, opts.imagens ?? []))

  const inicio = indiceChave++ // reserva o ponto de partida desta chamada (síncrono, sem corrida entre chamadas concorrentes)
  let ultimoStatus = 0 // 0 = nenhuma resposta HTTP (só erro de rede)
  let ultimoDetalhe = '' // motivo real da última falha (para diagnóstico; sempre sanitizado)
  for (let tentativa = 0; tentativa < chaves.length; tentativa++) {
    const chave = chaves[(inicio + tentativa) % chaves.length]
    try {
      const resp = await fetch(`${URL_BASE}/${modelo}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': chave },
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      if (!resp.ok) {
        ultimoStatus = resp.status
        ultimoDetalhe = `HTTP ${resp.status}`
        continue // qualquer erro HTTP (429/503, mas também 400/403 de chave inválida): tenta a próxima chave
      }
      const texto = extrairTexto(await resp.json())
      if (!texto) throw new Error('A IA não retornou conteúdo.')
      return texto
    } catch (e) {
      // conteúdo vazio é definitivo (bloqueio/refusa): não adianta trocar de chave
      if (e instanceof Error && e.message === 'A IA não retornou conteúdo.') throw e
      ultimoDetalhe = sanitizarErro(String(e), chaves)
      continue // erro de rede/plugin/timeout: tenta a próxima chave
    }
  }
  throw new Error(
    `IA indisponível após tentar todas as chaves (último HTTP ${ultimoStatus}${ultimoDetalhe ? `; ${ultimoDetalhe}` : ''}).`,
  )
}

/** Remove qualquer chave que apareça num texto de erro (defesa em profundidade). */
function sanitizarErro(msg: string, chaves: string[]): string {
  let limpo = msg.replace(/\s+/g, ' ').slice(0, 220)
  for (const c of chaves) limpo = limpo.split(c).join('***')
  return limpo
}
