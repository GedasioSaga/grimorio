import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../state/store'
import { janelaSalva, mensagensComParcialInterrompido, recortarJanela, type MensagemChat } from '../lib/chatIA'
import { gerarConteudo } from '../lib/gemini'
import { garantirChaves } from '../lib/chavesIA'
import { modeloSalvo } from '../lib/modeloIA'
import { BolhaChat, BolhaParcial, CorteJanela } from './BolhaChat'
import { useOpcoes } from './Opcoes'
import { pedirTexto } from './dialogos'
import { contextoDeEntidade } from '../lib/contextoIA'
import { SYSTEM_ENTIDADE, textoDaEntidade, type TipoEntidade } from '../lib/contextoEntidade'

const ALVO: Record<TipoEntidade, string> = { personagem: 'personagem', cenario: 'cenário', item: 'item' }

/** A entidade no cache do tipo certo (um único ponto a mudar quando nascer um tipo novo). */
function entidadeDe(s: ReturnType<typeof useApp.getState>, tipo: TipoEntidade, id: string) {
  if (tipo === 'personagem') return s.personagens[id]
  if (tipo === 'cenario') return s.cenarios[id]
  return s.itens[id]
}

/**
 * Chat lateral escopado num personagem/cenário/item. Efêmero: a conversa vive só em
 * memória enquanto o drawer está aberto (fechar = zerar). O contexto (versão ativa
 * + campanha) é remontado a cada envio, então trocar de forma no meio acompanha.
 */
export function ChatEntidade({ tipo, entidadeId, onFechar }: {
  tipo: TipoEntidade
  entidadeId: string
  onFechar: () => void
}) {
  const nome = useApp((s) => entidadeDe(s, tipo, entidadeId)?.nome ?? '')

  const [mensagens, setMensagens] = useState<MensagemChat[]>([])
  const [entrada, setEntrada] = useState('')
  const [pensando, setPensando] = useState(false)
  // resposta chegando aos poucos; null = nenhuma em voo
  const [parcial, setParcial] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const opcoesAberto = useOpcoes((s) => s.aberto)
  const janela = useMemo(() => janelaSalva(), [opcoesAberto])
  const { cortadas } = recortarJanela(mensagens, janela)
  const fimRef = useRef<HTMLDivElement | null>(null)
  // false após o unmount: descarta a resposta de um enviar() em voo (o drawer é efêmero)
  const montadoRef = useRef(true)
  // espelha `parcial` fora do fechamento de enviar(): o catch precisa do valor atual, não
  // do que existia quando enviar() foi chamado (aoReceber roda depois, durante o await)
  const parcialRef = useRef<string | null>(null)

  useEffect(() => {
    montadoRef.current = true
    return () => { montadoRef.current = false }
  }, [])

  // autoscroll para a última mensagem (e acompanhando o texto que vai chegando)
  useEffect(() => {
    fimRef.current?.scrollIntoView({ block: 'end' })
  }, [mensagens, pensando, parcial])

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
      const ent = entidadeDe(s, tipo, entidadeId)
      if (!ent) throw new Error('Entidade não encontrada.')
      const alvo = ALVO[tipo]
      let system = `${SYSTEM_ENTIDADE(tipo)}\n\n# Sobre este ${alvo}\n${textoDaEntidade(ent, tipo)}`
      const contexto = s.tree ? contextoDeEntidade(entidadeId, { ...s, tree: s.tree }) : ''
      if (contexto) system += `\n\n# Contexto da campanha\n${contexto}`
      // janela relida AQUI, não do render: vale a configuração do momento do envio
      const { enviadas } = recortarJanela(novas, janelaSalva())
      const resposta = await gerarConteudo({
        system,
        historico: enviadas.map((m) => ({ papel: m.papel, texto: m.texto })),
        chaves: await garantirChaves(pedirTexto),
        modelo: modeloSalvo(),
        aoReceber: (p) => {
          parcialRef.current = p
          if (montadoRef.current) setParcial(p)
        },
      })
      if (!montadoRef.current) return
      setMensagens([...novas, { papel: 'model', texto: resposta, em: new Date().toISOString() }])
    } catch (e) {
      if (!montadoRef.current) return
      setErro(e instanceof Error ? e.message : String(e))
      const comParcial = mensagensComParcialInterrompido(novas, parcialRef.current)
      if (comParcial) setMensagens(comParcial)
    } finally {
      if (montadoRef.current) {
        setPensando(false)
        setParcial(null)
        parcialRef.current = null
      }
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
            <Fragment key={i}>
              {i === cortadas && <CorteJanela quantas={cortadas} />}
              <BolhaChat mensagem={m} />
            </Fragment>
          ))}
          {parcial !== null
            ? <BolhaParcial texto={parcial} />
            : pensando && <div className="chat-msg chat-msg-model chat-ia-pensando">pensando…</div>}
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
