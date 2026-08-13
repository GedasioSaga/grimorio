import { markdownParaHtml } from '../lib/markdownHtml'
import type { MensagemChat } from '../lib/chatIA'

/**
 * Uma bolha da conversa.
 *
 * A resposta do modelo vira HTML: as personas mandam a IA usar Markdown (`## títulos`,
 * `**negrito**`, listas — ver SYSTEM_ESCRITOR em promptsIA.ts), então mostrar o texto cru
 * fazia o usuário ler `**Fulano**` na tela.
 *
 * `dangerouslySetInnerHTML` é seguro aqui porque `markdownParaHtml` escapa `&`, `<` e `>`
 * ANTES de aplicar qualquer ênfase: a única marcação que sobrevive é a que ele mesmo
 * gera. Nada que venha do modelo (ou de um texto colado pelo usuário) atravessa como tag.
 *
 * O que o USUÁRIO digitou continua texto puro, de propósito: quem escreve `**` numa
 * pergunta quis os asteriscos, e o bloco do card anexado depende das quebras de linha.
 */
export function BolhaChat({ mensagem }: { mensagem: MensagemChat }) {
  if (mensagem.papel === 'user') {
    return <div className="chat-msg chat-msg-user">{mensagem.texto}</div>
  }
  return (
    <div className="chat-msg chat-msg-model texto-md">
      <span dangerouslySetInnerHTML={{ __html: markdownParaHtml(mensagem.texto) }} />
      {mensagem.interrompida && <div className="chat-msg-interrompida">— resposta interrompida</div>}
    </div>
  )
}

/**
 * Resposta chegando aos poucos. Fica em texto puro enquanto escreve: aplicar Markdown a
 * cada pedaço faria um `**` recém-chegado piscar a linha inteira em negrito e sair de novo
 * quando o fechamento chegasse. Vira Markdown quando termina e vira uma `BolhaChat`.
 */
export function BolhaParcial({ texto }: { texto: string }) {
  return (
    <div className="chat-msg chat-msg-model">
      {texto}
      <span className="chat-cursor" aria-hidden="true" />
    </div>
  )
}

/**
 * Marca onde a janela de contexto corta. Sem isto, o corte é invisível: a IA "esquece" o
 * começo da conversa e parece burrice do modelo, não limite configurado.
 */
export function CorteJanela({ quantas }: { quantas: number }) {
  if (quantas <= 0) return null
  return (
    <div className="chat-corte" title="Ajuste em Opções → IA">
      {quantas === 1
        ? '1 mensagem antiga fora do contexto da IA'
        : `${quantas} mensagens antigas fora do contexto da IA`}
    </div>
  )
}
