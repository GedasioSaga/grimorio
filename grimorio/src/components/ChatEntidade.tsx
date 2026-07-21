import { useEffect, useRef, useState } from 'react'
import { useApp } from '../state/store'
import { JANELA_HISTORICO, type MensagemChat } from '../lib/chatIA'
import { gerarConteudo } from '../lib/gemini'
import { garantirChaves } from '../lib/chavesIA'
import { pedirTexto } from './dialogos'
import { contextoDeEntidade } from '../lib/contextoIA'
import { SYSTEM_ENTIDADE, textoDaEntidade, type TipoEntidade } from '../lib/contextoEntidade'

/**
 * Chat lateral escopado num personagem/cenário. Efêmero: a conversa vive só em
 * memória enquanto o drawer está aberto (fechar = zerar). O contexto (versão ativa
 * + campanha) é remontado a cada envio, então trocar de forma no meio acompanha.
 */
export function ChatEntidade({ tipo, entidadeId, onFechar }: {
  tipo: TipoEntidade
  entidadeId: string
  onFechar: () => void
}) {
  const nome = useApp((s) =>
    (tipo === 'personagem' ? s.personagens[entidadeId]?.nome : s.cenarios[entidadeId]?.nome) ?? '')

  const [mensagens, setMensagens] = useState<MensagemChat[]>([])
  const [entrada, setEntrada] = useState('')
  const [pensando, setPensando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const fimRef = useRef<HTMLDivElement | null>(null)
  // false após o unmount: descarta a resposta de um enviar() em voo (o drawer é efêmero)
  const montadoRef = useRef(true)

  useEffect(() => {
    montadoRef.current = true
    return () => { montadoRef.current = false }
  }, [])

  // autoscroll para a última mensagem
  useEffect(() => {
    fimRef.current?.scrollIntoView({ block: 'end' })
  }, [mensagens, pensando])

  async function enviar() {
    const pergunta = entrada.trim()
    if (!pergunta || pensando) return
    setErro(null)
    setEntrada('')
    const novas: MensagemChat[] = [...mensagens, { papel: 'user', texto: pergunta, em: new Date().toISOString() }]
    setMensagens(novas)
    setPensando(true)
    try {
      const s = useApp.getState()
      const ent = tipo === 'personagem' ? s.personagens[entidadeId] : s.cenarios[entidadeId]
      if (!ent) throw new Error('Entidade não encontrada.')
      const alvo = tipo === 'personagem' ? 'personagem' : 'cenário'
      let system = `${SYSTEM_ENTIDADE(tipo)}\n\n# Sobre este ${alvo}\n${textoDaEntidade(ent, tipo)}`
      const contexto = s.tree ? contextoDeEntidade(entidadeId, { ...s, tree: s.tree }) : ''
      if (contexto) system += `\n\n# Contexto da campanha\n${contexto}`
      const janela = novas.slice(-JANELA_HISTORICO).map((m) => ({ papel: m.papel, texto: m.texto }))
      const resposta = await gerarConteudo({ system, historico: janela, chaves: await garantirChaves(pedirTexto) })
      if (!montadoRef.current) return
      setMensagens([...novas, { papel: 'model', texto: resposta, em: new Date().toISOString() }])
    } catch (e) {
      if (montadoRef.current) setErro(e instanceof Error ? e.message : String(e))
    } finally {
      if (montadoRef.current) setPensando(false)
    }
  }

  return (
    <div className="chat-drawer" onClick={(e) => e.stopPropagation()}>
      <div className="chat-drawer-header">
        <span className="chat-drawer-titulo">💬 {nome || 'Conversa'}</span>
        <button className="btn-icon" title="Fechar chat" onClick={onFechar}>✕</button>
      </div>
      <div className="chat-ia">
        <div className="chat-ia-mensagens">
          {mensagens.length === 0 && !pensando && (
            <div className="chat-ia-vazio">Converse com a IA sobre {nome || 'esta entidade'}…</div>
          )}
          {mensagens.map((m, i) => (
            <div key={i} className={`chat-msg chat-msg-${m.papel}`}>{m.texto}</div>
          ))}
          {pensando && <div className="chat-msg chat-msg-model chat-ia-pensando">pensando…</div>}
          <div ref={fimRef} />
        </div>
        {erro && <div className="chat-ia-erro">{erro}</div>}
        <div className="chat-ia-entrada">
          <textarea
            placeholder="Pergunte sobre… (Enter envia)"
            value={entrada}
            onChange={(e) => setEntrada(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void enviar()
              }
            }}
          />
          <div className="chat-ia-acoes">
            <button disabled={pensando || !entrada.trim()} onClick={() => void enviar()}>Enviar</button>
          </div>
        </div>
      </div>
    </div>
  )
}
