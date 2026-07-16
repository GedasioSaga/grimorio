import { useEffect, useRef, useState } from 'react'
import { convertFileSrc } from '@tauri-apps/api/core'
import { useApp } from '../state/store'
import { gerarConteudo, type ImagemIA } from '../lib/gemini'
import { SYSTEM_MESTRE } from '../lib/chatIA'
import {
  achatarCenarios,
  frasesDeVinculosNoEscopo,
  montarContextoCampanha,
} from '../lib/contextoIA'
import { filtrarArvoreCenarios } from '../lib/filtroCampanha'
import { campanhasDe, idsDaCampanha } from '../lib/vinculos'
import { htmlParaTexto, textoParaHtml } from '../lib/htmlTexto'
import { mimeDaImagem, uint8ParaBase64 } from '../lib/bin'

export interface AcaoIA {
  rotulo: string
  /** Prompt específico da ação (a entidade e o contexto entram automaticamente). */
  prompt: string
  /** Aba que recebe o texto ao Inserir. */
  abaDestino: string
  /** Nome amigável da aba no botão Inserir. */
  rotuloDestino?: string
  /** Anexa o retrato da entidade (análise de imagem). */
  comImagem?: boolean
}

/**
 * Menu ✨ dos modais: roda uma ação de IA sobre a entidade e mostra PREVIEW;
 * nada é gravado sem clicar Inserir (que faz append via onInserir).
 */
export function AcoesIA({
  entidadeTipo,
  entidadeId,
  acoes,
  onInserir,
}: {
  entidadeTipo: 'personagem' | 'cenario'
  entidadeId: string
  acoes: AcaoIA[]
  onInserir: (aba: string, html: string) => void
}) {
  const [menuAberto, setMenuAberto] = useState(false)
  const [rodando, setRodando] = useState(false)
  const [preview, setPreview] = useState<{ acao: AcaoIA; texto: string } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const raizRef = useRef<HTMLDivElement | null>(null)
  // false após o unmount: descarta a resposta de um rodar() em voo se o modal fechar durante o await
  const montadoRef = useRef(true)

  useEffect(() => () => {
    montadoRef.current = false
  }, [])

  // menu aberto: clique fora fecha
  useEffect(() => {
    if (!menuAberto) return
    function aoClicarFora(e: MouseEvent) {
      if (!raizRef.current?.contains(e.target as Node)) setMenuAberto(false)
    }
    document.addEventListener('mousedown', aoClicarFora)
    return () => document.removeEventListener('mousedown', aoClicarFora)
  }, [menuAberto])

  /** Contexto: primeira campanha em que a entidade participa (ou só a entidade). */
  function montarContexto(): string {
    const { tree, personagens, cenarios, vinculos } = useApp.getState()
    const campId = campanhasDe(vinculos, entidadeId)[0] ?? null
    const camp = campId && tree ? tree.campanhas.find((c) => c.id === campId) ?? null : null
    if (!camp || !tree) return ''
    const ids = idsDaCampanha(vinculos, camp.id)
    const parts = Object.values(personagens)
      .filter((p) => ids.has(p.id))
      .map((p) => ({ nome: p.nome, resumo: p.resumo }))
    const linhasCen = achatarCenarios(
      filtrarArvoreCenarios(tree.cenarios, ids),
      (id) => cenarios[id]?.resumo ?? '',
    )
    const nomeDe = (id: string) => personagens[id]?.nome ?? cenarios[id]?.nome ?? null
    return montarContextoCampanha({
      nomeCampanha: camp.nome,
      personagens: parts,
      cenarios: linhasCen,
      vinculos: frasesDeVinculosNoEscopo(vinculos, ids, nomeDe), // só vínculos entre participantes desta campanha
      notas: '',
    })
  }

  async function rodar(acao: AcaoIA) {
    setMenuAberto(false)
    setErro(null)
    setRodando(true)
    try {
      const { personagens, cenarios, vaultPath } = useApp.getState()
      const ent = entidadeTipo === 'personagem' ? personagens[entidadeId] : cenarios[entidadeId]
      if (!ent) { if (montadoRef.current) setErro('Entidade não encontrada.'); return }
      const dados = `# Entidade\nNome: ${ent.nome}\nResumo: ${ent.resumo}\nDescrição atual: ${htmlParaTexto(ent.descricao)}`
      const contexto = montarContexto()
      const system = contexto ? `${SYSTEM_MESTRE}\n\n# Contexto da campanha\n${contexto}` : SYSTEM_MESTRE

      const imagens: ImagemIA[] = []
      if (acao.comImagem) {
        if (!ent.retrato || !vaultPath) throw new Error('Esta entidade não tem imagem.')
        const resp = await fetch(convertFileSrc(`${vaultPath}/${ent.retrato}`))
        if (!resp.ok) throw new Error(`fetch falhou: ${resp.status}`)
        const blob = await resp.blob()
        imagens.push({ mimeType: mimeDaImagem(ent.retrato), base64: uint8ParaBase64(new Uint8Array(await blob.arrayBuffer())) })
      }

      const texto = await gerarConteudo({
        system,
        historico: [{ papel: 'user', texto: `${dados}\n\n${acao.prompt}` }],
        imagens,
      })
      // fechou o modal durante o await: não mexe no estado de um componente desmontado
      if (!montadoRef.current) return
      setPreview({ acao, texto })
    } catch (e) {
      if (montadoRef.current) setErro(e instanceof Error ? e.message : String(e))
    } finally {
      if (montadoRef.current) setRodando(false)
    }
  }

  return (
    <div className="acoes-ia" ref={raizRef}>
      <button
        className="btn-icon"
        title="Ações de IA"
        disabled={rodando}
        onClick={() => { setErro(null); setMenuAberto((v) => !v) }}
      >
        {rodando ? '…' : '✨'}
      </button>
      {menuAberto && (
        <div className="acoes-ia-menu">
          {acoes.map((a) => (
            <button key={a.rotulo} onClick={() => void rodar(a)}>{a.rotulo}</button>
          ))}
        </div>
      )}
      {erro && <div className="acoes-ia-erro">{erro}</div>}
      {preview && (
        <div className="acoes-ia-overlay" onClick={() => setPreview(null)}>
          <div className="acoes-ia-preview" onClick={(e) => e.stopPropagation()}>
            <div className="acoes-ia-preview-titulo">{preview.acao.rotulo}</div>
            <div className="acoes-ia-preview-texto">{preview.texto}</div>
            <div className="acoes-ia-preview-acoes">
              <button onClick={() => setPreview(null)}>Descartar</button>
              <button
                className="acoes-ia-inserir"
                onClick={() => {
                  onInserir(preview.acao.abaDestino, textoParaHtml(preview.texto))
                  setPreview(null)
                }}
              >
                Inserir em {preview.acao.rotuloDestino ?? preview.acao.abaDestino}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
