import { useEffect, useRef, useState } from 'react'
import { convertFileSrc } from '@tauri-apps/api/core'
import { useApp } from '../state/store'
import type { NotebookRepo } from '../lib/notebookRepo'
import type { CenarioCardShapeType } from './CenarioCardShape'
import type { CharacterCardShapeType } from './CharacterCardShape'
import { JANELA_HISTORICO, SYSTEM_MESTRE, type MensagemChat } from '../lib/chatIA'
import { gerarConteudo, type ImagemIA } from '../lib/gemini'
import {
  acharCampanhaDaSessao,
  achatarCenarios,
  frasesDeVinculosNoEscopo,
  montarContextoCampanha,
} from '../lib/contextoIA'
import { filtrarArvoreCenarios } from '../lib/filtroCampanha'
import { idsDaCampanha } from '../lib/vinculos'
import { htmlParaTexto } from '../lib/htmlTexto'
import { editorAtivo } from '../lib/canvasAtivo'

const SALVAR_CHAT_DEBOUNCE_MS = 800

interface Anexo {
  nome: string
  blocoTexto: string
  imagem: ImagemIA | null
}

/** Blob → base64 puro (sem prefixo data:). */
function blobParaBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '')
    r.onerror = () => reject(new Error('falha ao ler imagem'))
    r.readAsDataURL(blob)
  })
}

function mimeDaExtensaoImg(rel: string): string {
  const ext = (rel.split('.').pop() ?? 'png').toLowerCase()
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'gif') return 'image/gif'
  return 'image/png'
}

/** Painel de chat com o assistente de mestre (Gemini) — só em sessões. */
export function ChatIA({
  caminhoSessao,
  cadernoDirRel,
  repoNotas,
}: {
  caminhoSessao: string
  cadernoDirRel: string
  repoNotas: NotebookRepo
}) {
  const repo = useApp((s) => s.repo)
  const vaultPath = useApp((s) => s.vaultPath)
  const slugAtivo = useApp((s) => s.paginaAtivaPorCaderno[cadernoDirRel] ?? null)

  const [mensagens, setMensagens] = useState<MensagemChat[]>([])
  const [texto, setTexto] = useState('')
  const [pensando, setPensando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [anexo, setAnexo] = useState<Anexo | null>(null)
  const timerSalvar = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fimRef = useRef<HTMLDivElement | null>(null)

  // carrega o histórico salvo da sessão
  useEffect(() => {
    let ativo = true
    if (!repo) return
    repo.lerChatIA(cadernoDirRel).then((m) => {
      if (ativo) {
        setMensagens(m)
        mensagensRef.current = m
      }
    }).catch(() => {})
    return () => {
      ativo = false
    }
  }, [repo, cadernoDirRel])

  // autoscroll para a última mensagem
  useEffect(() => {
    fimRef.current?.scrollIntoView({ block: 'end' })
  }, [mensagens, pensando])

  // salva com debounce; ref espelho permite o flush no unmount (padrão dos modais)
  const mensagensRef = useRef<MensagemChat[]>([])
  function agendarSalvar(novas: MensagemChat[]) {
    setMensagens(novas)
    mensagensRef.current = novas
    if (timerSalvar.current) clearTimeout(timerSalvar.current)
    timerSalvar.current = setTimeout(() => {
      timerSalvar.current = null
      repo?.salvarChatIA(cadernoDirRel, novas).catch((e) => console.error('Falha ao salvar chat:', e))
    }, SALVAR_CHAT_DEBOUNCE_MS)
  }
  useEffect(() => () => {
    // desmontou com gravação pendente: cancela o debounce e grava já (fire-and-forget)
    if (timerSalvar.current) {
      clearTimeout(timerSalvar.current)
      timerSalvar.current = null
      const { repo: r } = useApp.getState()
      r?.salvarChatIA(cadernoDirRel, mensagensRef.current)
        .catch((e) => console.error('Falha no save final do chat:', e))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Monta o contexto da campanha desta sessão (participantes + notas ativas). */
  async function montarContexto(): Promise<string> {
    const { tree, personagens, cenarios, vinculos, caminhoPorId } = useApp.getState()
    if (!tree) return ''
    const camp = acharCampanhaDaSessao(tree, caminhoSessao)
    const ids = camp?.id ? idsDaCampanha(vinculos, camp.id) : new Set<string>()

    // personagens: participantes (vínculo) + os da pasta da campanha (match por CAMINHO)
    const caminhosDaCampanha = new Set((camp?.personagens ?? []).map((ref) => ref.caminho))
    const doElenco = new Map<string, { nome: string; resumo: string }>()
    for (const p of Object.values(personagens)) {
      const daCampanha = caminhosDaCampanha.has(caminhoPorId[p.id] ?? '')
      if (ids.has(p.id) || daCampanha) doElenco.set(p.id, { nome: p.nome, resumo: p.resumo })
    }

    const arvoreCen = ids.size > 0 ? filtrarArvoreCenarios(tree.cenarios, ids) : { ...tree.cenarios, cenarios: [], subpastas: [] }
    const linhasCen = achatarCenarios(arvoreCen, (id) => cenarios[id]?.resumo ?? '')

    // vínculos só do escopo da campanha (participantes + elenco da pasta): sem campanha → nenhum
    const idsCtx = new Set<string>([...ids, ...doElenco.keys()])
    const nomeDe = (id: string) => personagens[id]?.nome ?? cenarios[id]?.nome ?? null
    const frases = frasesDeVinculosNoEscopo(vinculos, idsCtx, nomeDe)

    let notas = ''
    if (slugAtivo) {
      try {
        notas = htmlParaTexto((await repoNotas.lerPagina(slugAtivo)).corpo)
      } catch {
        // página ilegível: segue sem notas
      }
    }

    return montarContextoCampanha({
      nomeCampanha: camp?.nome ?? '',
      personagens: [...doElenco.values()],
      cenarios: linhasCen,
      vinculos: frases,
      notas,
    })
  }

  /** Anexa o card selecionado no canvas (retrato + dados em texto). */
  async function anexarCardSelecionado() {
    const editor = editorAtivo()
    const shape = editor?.getOnlySelectedShape()
    if (!shape) {
      setErro('Selecione um card no canvas primeiro.')
      return
    }
    const { personagens, cenarios } = useApp.getState()
    let nome = ''
    let bloco = ''
    let retratoRel: string | null = null
    if (shape.type === 'character-card') {
      const p = personagens[(shape as CharacterCardShapeType).props.personagemId]
      if (!p) return
      nome = p.nome
      retratoRel = p.retrato
      bloco = `Card anexado — Personagem: ${p.nome}\nResumo: ${p.resumo}\nDescrição: ${htmlParaTexto(p.descricao)}`
    } else if (shape.type === 'cenario-card') {
      const c = cenarios[(shape as CenarioCardShapeType).props.cenarioId]
      if (!c) return
      nome = c.nome
      retratoRel = c.retrato
      bloco = `Card anexado — Cenário: ${c.nome}\nResumo: ${c.resumo}\nDescrição: ${htmlParaTexto(c.descricao)}`
    } else {
      setErro('Selecione um card de personagem ou cenário.')
      return
    }
    let imagem: ImagemIA | null = null
    if (retratoRel && vaultPath) {
      try {
        const blob = await (await fetch(convertFileSrc(`${vaultPath}/${retratoRel}`))).blob()
        imagem = { mimeType: mimeDaExtensaoImg(retratoRel), base64: await blobParaBase64(blob) }
      } catch {
        // sem imagem: só o texto (o chip avisa)
      }
    }
    setErro(null)
    setAnexo({ nome: imagem ? nome : `${nome} (sem imagem)`, blocoTexto: bloco, imagem })
  }

  async function enviar() {
    const pergunta = texto.trim()
    if (!pergunta || pensando) return
    setErro(null)
    setTexto('')
    const agora = new Date().toISOString()
    const textoUser = anexo ? `${anexo.blocoTexto}\n\n${pergunta}` : pergunta
    const novas: MensagemChat[] = [...mensagens, { papel: 'user', texto: textoUser, em: agora }]
    agendarSalvar(novas)
    setPensando(true)
    try {
      const contexto = await montarContexto()
      const system = contexto ? `${SYSTEM_MESTRE}\n\n# Contexto da campanha\n${contexto}` : SYSTEM_MESTRE
      const janela = novas.slice(-JANELA_HISTORICO).map((m) => ({ papel: m.papel, texto: m.texto }))
      const resposta = await gerarConteudo({
        system,
        historico: janela,
        imagens: anexo?.imagem ? [anexo.imagem] : [],
      })
      agendarSalvar([...novas, { papel: 'model', texto: resposta, em: new Date().toISOString() }])
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setAnexo(null)
      setPensando(false)
    }
  }

  function limpar() {
    if (!confirm('Limpar a conversa desta sessão?')) return
    agendarSalvar([])
  }

  return (
    <div className="chat-ia">
      <div className="chat-ia-mensagens">
        {mensagens.length === 0 && !pensando && (
          <div className="chat-ia-vazio">
            Pergunte sobre a campanha, peça descrições de cena, reviravoltas…
          </div>
        )}
        {mensagens.map((m, i) => (
          <div key={i} className={`chat-msg chat-msg-${m.papel}`}>
            {m.texto}
          </div>
        ))}
        {pensando && <div className="chat-msg chat-msg-model chat-ia-pensando">pensando…</div>}
        <div ref={fimRef} />
      </div>
      {erro && <div className="chat-ia-erro">{erro}</div>}
      {anexo && (
        <div className="chat-ia-anexo">
          📎 {anexo.nome}
          <button className="btn-icon" title="Remover anexo" onClick={() => setAnexo(null)}>✕</button>
        </div>
      )}
      <div className="chat-ia-entrada">
        <textarea
          placeholder="Pergunte ao assistente… (Enter envia)"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void enviar()
            }
          }}
        />
        <div className="chat-ia-acoes">
          <button title="Anexar card selecionado no canvas" onClick={() => void anexarCardSelecionado()}>📎 card</button>
          <button title="Limpar conversa" onClick={limpar}>🗑</button>
          <button disabled={pensando || !texto.trim()} onClick={() => void enviar()}>Enviar</button>
        </div>
      </div>
    </div>
  )
}
