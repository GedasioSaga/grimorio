import { OpcoesIA } from '../components/OpcoesIA'
import { HostDialogos, HostEscolha } from '../components/dialogos'

/**
 * IDs que a chave falsa "enxerga" na API do Gemini. Um deles (`gemini-4.0-nebula-preview`)
 * de propósito NÃO está em `MODELOS_CONHECIDOS` (lib/modeloIA.ts) — exercita o caminho
 * "modelo não catalogado" (bloco `!o.conhecido`, que mostra o id cru embaixo do rótulo).
 * O de embedding testa o filtro `ehConversavel`: não deve aparecer na lista final.
 */
const RESPOSTA_MODELOS_FALSA = {
  models: [
    { name: 'models/gemini-3.1-flash-lite', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/gemini-3.5-flash-lite', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/gemini-3-flash', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/gemini-3.6-flash', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/gemini-3-pro', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/gemini-4.0-nebula-preview', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] },
  ],
}

declare global {
  interface Window {
    /** Só existe dentro do Tauri de verdade; a bancada finge que existe (ver abaixo). */
    __TAURI_INTERNALS__?: { invoke: (cmd: string, args?: unknown) => Promise<unknown> }
  }
}

/**
 * Shim MÍNIMO do protocolo IPC que `@tauri-apps/plugin-http` usa por baixo
 * (`node_modules/@tauri-apps/plugin-http/dist-js/index.js`: `invoke('plugin:http|fetch', …)`
 * → `fetch_send` → `fetch_read_body` em pedaços, o último com um byte de fechamento).
 * Fora do Tauri, `window.__TAURI_INTERNALS__` não existe e `lib/gemini.ts` nunca resolveria
 * — por isso a chamada de rede não pode acontecer nesta bancada (regra da tarefa). Em vez
 * de reescrever `listarModelos`/`gemini.ts` (proibido) para aceitar uma lista injetada,
 * interceptamos só o transporte: `listarModelos` roda o código de VERDADE, só que a
 * "rede" devolve `RESPOSTA_MODELOS_FALSA` acima. Mesmo espírito do `window.__editorMapa`
 * em `CenaMapa.tsx` — um gancho que só existe aqui, para o driver de teste.
 */
function instalarRedeFalsa() {
  if (window.__TAURI_INTERNALS__) return // hot reload: não reinstala
  let proximoRid = 1
  const corpos = new Map<number, boolean>() // rid → já entregue?

  window.__TAURI_INTERNALS__ = {
    invoke: async (cmd: string, args?: unknown) => {
      if (cmd === 'plugin:http|fetch') {
        return proximoRid++
      }
      if (cmd === 'plugin:http|fetch_send') {
        const rid = proximoRid++
        corpos.set(rid, false)
        return { status: 200, statusText: 'OK', url: 'https://bancada.local/fake-models', headers: [], rid }
      }
      if (cmd === 'plugin:http|fetch_read_body') {
        const { rid } = (args ?? {}) as { rid: number }
        if (corpos.get(rid)) return [1] // já entregue: byte de fechamento, sem dado
        corpos.set(rid, true)
        const bytes = new TextEncoder().encode(JSON.stringify(RESPOSTA_MODELOS_FALSA))
        return [...bytes, 0] // último byte 0 = "tem dado, ainda não fechou"
      }
      if (cmd === 'plugin:http|fetch_cancel_body' || cmd === 'plugin:http|fetch_cancel') {
        return null
      }
      /**
       * Diálogos nativos (`ask`/`confirm`/`message` do `@tauri-apps/plugin-dialog`), usados
       * por confirmações destrutivas — excluir camada, excluir peça. Fora do Tauri o plugin
       * estoura, e o botão vira INERTE: clique sem resposta e sem erro visível. Foi o que
       * fez um juiz cego reprovar o painel de camadas por "excluir não funciona", quando o
       * que não funcionava era a bancada.
       *
       * Responde SIM sem abrir caixa nenhuma, de propósito: `window.confirm` bloqueia a
       * fila de eventos do navegador e trava qualquer driver de automação (que é o único
       * jeito de dirigir o canvas do tldraw — ver `window.__editorMapa` em `CenaMapa.tsx`).
       * A bancada não tem dado de verdade para perder, e o que se quer conferir aqui é o
       * EFEITO da confirmação, não o texto dela. O caminho de "cancelar" continua coberto
       * pelos testes das libs puras, que não passam por diálogo.
       */
      if (cmd === 'plugin:dialog|message') {
        const { message, title, buttons } = (args ?? {}) as {
          message?: string
          title?: string
          buttons?: unknown
        }
        console.info('[bancada] diálogo nativo respondido automaticamente com SIM:', title, message)
        /**
         * O `ask()` do plugin NÃO devolve booleano: ele chama `plugin:dialog|message` e
         * compara o RÓTULO devolvido com o do botão de confirmação
         * (`node_modules/@tauri-apps/plugin-dialog/dist-js/index.js:168-179`). Devolver
         * `true` — ou `null` — aqui é lido como CANCELAR, e o botão de excluir continuava
         * inerte na bancada mesmo com o shim instalado. Tem que devolver o rótulo.
         */
        // formatos que `buttonsToRust` produz (mesmo arquivo, linhas 9-28)
        if (buttons && typeof buttons === 'object') {
          const b = buttons as Record<string, unknown>
          const primeiro = (b.OkCancelCustom ?? b.YesNoCancelCustom) as unknown[] | undefined
          if (Array.isArray(primeiro) && typeof primeiro[0] === 'string') return primeiro[0]
          if (typeof b.OkCustom === 'string') return b.OkCustom
        }
        return buttons === 'YesNo' ? 'Yes' : 'Ok'
      }
      throw new Error(`Bancada: comando Tauri não simulado (${cmd}).`)
    },
  }
}

/** Chave falsa: só precisa existir para `OpcoesIA` disparar `listarModelos` no mount. */
const CHAVE_GEMINI_FALSA = 'grimorio.geminiKeys'

instalarRedeFalsa()
if (localStorage.getItem(CHAVE_GEMINI_FALSA) === null) {
  localStorage.setItem(CHAVE_GEMINI_FALSA, 'bancada-chave-falsa-nao-e-de-verdade')
}

/**
 * Cena #opcoes: aba "IA" das Opções (`OpcoesIA.tsx`) montada de verdade, sem cofre e sem
 * Tauri — a única ponte com o mundo real é o shim de rede acima, que faz `listarModelos`
 * (gemini.ts) rodar o código de produção contra uma resposta fake. `HostDialogos`/
 * `HostEscolha` entram junto para o botão "Alterar chaves" abrir modal de verdade (não
 * grava nada fora do localStorage desta aba).
 */
export function CenaOpcoes() {
  return (
    <div className="amostra-cena amostra-cena-opcoes">
      <h1>Opções — aba IA</h1>
      <p className="amostra-legenda">
        Bancada: componente real <code>OpcoesIA.tsx</code>, sem cofre e sem Tauri de verdade.
        A chamada à API do Gemini (<code>listarModelos</code>) é interceptada no transporte —
        veja o comentário de <code>instalarRedeFalsa</code> em <code>CenaOpcoes.tsx</code> — e
        devolve uma lista fake com um modelo <em>não catalogado</em> (
        <code>gemini-4.0-nebula-preview</code>) para exercitar esse caminho.
      </p>
      <div className="amostra-caixa amostra-caixa-opcoes">
        <div className="opcoes-conteudo">
          <OpcoesIA />
        </div>
      </div>
      <HostEscolha />
      <HostDialogos />
    </div>
  )
}
