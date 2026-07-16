import { useEffect, useRef, useState } from 'react'
import { convertFileSrc } from '@tauri-apps/api/core'
import { useApp } from '../state/store'
import { gerarConteudo, type ImagemIA } from '../lib/gemini'
import { SYSTEM_MESTRE } from '../lib/chatIA'
import {
  achatarCenarios,
  campanhaDeEntidade,
  frasesDeVinculosNoEscopo,
  montarContextoCampanha,
} from '../lib/contextoIA'
import { filtrarArvoreCenarios } from '../lib/filtroCampanha'
import { idsDaCampanha } from '../lib/vinculos'
import { htmlParaTexto, textoParaHtml } from '../lib/htmlTexto'
import { mimeDaImagem, uint8ParaBase64 } from '../lib/bin'
import { promptMelhorar, promptVersao } from '../lib/promptsIA'

export interface AcaoIA {
  rotulo: string
  prompt: string
  abaDestino: string
  rotuloDestino?: string
  comImagem?: boolean
}

interface Preview {
  rotulo: string
  destino: string
  rotuloDestino: string
  texto: string
}

type ModoInserir = 'substituir' | 'adicionar'

/**
 * Menu ✨ dos modais: ações tab-aware (versão curta/longa/melhorar na aba aberta),
 * pergunta livre, e ações específicas (via `acoes`). Preview antes de gravar; nada
 * é escrito sem clicar Substituir/Adicionar.
 */
export function AcoesIA({
  entidadeTipo,
  entidadeId,
  abaAtual,
  rotuloAbaAtual,
  abaEhTexto,
  acoes,
  onInserir,
}: {
  entidadeTipo: 'personagem' | 'cenario'
  entidadeId: string
  abaAtual: string
  rotuloAbaAtual: string
  abaEhTexto: boolean
  acoes: AcaoIA[]
  onInserir: (aba: string, html: string, modo: ModoInserir) => void
}) {
  const [menuAberto, setMenuAberto] = useState(false)
  const [rodando, setRodando] = useState(false)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [pergunta, setPergunta] = useState('')
  const raizRef = useRef<HTMLDivElement | null>(null)
  const montadoRef = useRef(true)

  useEffect(() => {
    // re-arma no setup: o StrictMode (dev) roda cleanup+setup extras mantendo os refs —
    // sem isso montadoRef ficaria false pra sempre e preview/erros seriam descartados
    montadoRef.current = true
    return () => {
      montadoRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!menuAberto) return
    function aoClicarFora(e: MouseEvent) {
      if (!raizRef.current?.contains(e.target as Node)) setMenuAberto(false)
    }
    document.addEventListener('mousedown', aoClicarFora)
    return () => document.removeEventListener('mousedown', aoClicarFora)
  }, [menuAberto])

  /** Contexto: campanha da entidade (vínculo participa ou pasta) + vínculos no escopo. */
  function montarContexto(): string {
    const { tree, personagens, cenarios, vinculos, caminhoPorId } = useApp.getState()
    const camp = tree ? campanhaDeEntidade(tree, vinculos, (id) => caminhoPorId[id], entidadeId) : null
    if (!camp || !tree) return ''
    const ids = idsDaCampanha(vinculos, camp.id)
    const parts = Object.values(personagens).filter((p) => ids.has(p.id)).map((p) => ({ nome: p.nome, resumo: p.resumo }))
    const linhasCen = achatarCenarios(filtrarArvoreCenarios(tree.cenarios, ids), (id) => cenarios[id]?.resumo ?? '')
    const nomeDe = (id: string) => personagens[id]?.nome ?? cenarios[id]?.nome ?? null
    return montarContextoCampanha({
      nomeCampanha: camp.nome,
      personagens: parts,
      cenarios: linhasCen,
      vinculos: frasesDeVinculosNoEscopo(vinculos, ids, nomeDe),
      notas: '',
    })
  }

  async function executar(opts: {
    rotulo: string
    destino: string
    rotuloDestino: string
    prompt: string
    comImagem?: boolean
  }) {
    setMenuAberto(false)
    setErro(null)
    setRodando(true)
    try {
      const { personagens, cenarios, vaultPath } = useApp.getState()
      const ent = entidadeTipo === 'personagem' ? personagens[entidadeId] : cenarios[entidadeId]
      if (!ent) {
        if (montadoRef.current) setErro('Entidade não encontrada.')
        return
      }
      // texto da aba aberta (para melhorar / servir de referência); só em abas de texto
      const textoAba = abaEhTexto ? htmlParaTexto((ent as unknown as Record<string, string>)[abaAtual] ?? '') : ''
      const dados =
        `# Entidade\nNome: ${ent.nome}\nResumo: ${ent.resumo}` +
        (textoAba ? `\nTexto atual da seção "${rotuloAbaAtual}":\n${textoAba}` : '')
      const contexto = montarContexto()
      const system = contexto ? `${SYSTEM_MESTRE}\n\n# Contexto da campanha\n${contexto}` : SYSTEM_MESTRE

      const imagens: ImagemIA[] = []
      if (opts.comImagem) {
        if (!ent.retrato || !vaultPath) throw new Error('Esta entidade não tem imagem.')
        const resp = await fetch(convertFileSrc(`${vaultPath}/${ent.retrato}`))
        if (!resp.ok) throw new Error(`fetch falhou: ${resp.status}`)
        const blob = await resp.blob()
        imagens.push({ mimeType: mimeDaImagem(ent.retrato), base64: uint8ParaBase64(new Uint8Array(await blob.arrayBuffer())) })
      }

      const texto = await gerarConteudo({
        system,
        historico: [{ papel: 'user', texto: `${dados}\n\n${opts.prompt}` }],
        imagens,
      })
      if (!montadoRef.current) return
      setPreview({ rotulo: opts.rotulo, destino: opts.destino, rotuloDestino: opts.rotuloDestino, texto })
    } catch (e) {
      if (montadoRef.current) setErro(e instanceof Error ? e.message : String(e))
    } finally {
      if (montadoRef.current) setRodando(false)
    }
  }

  function enviarPergunta() {
    const q = pergunta.trim()
    if (!q) return
    setPergunta('')
    // resposta vai para a aba atual (se de texto) ou Anotações (abas sem texto)
    const destino = abaEhTexto ? abaAtual : 'anotacoes'
    const rotuloDestino = abaEhTexto ? rotuloAbaAtual : 'Anotações'
    void executar({ rotulo: 'Resposta da IA', destino, rotuloDestino, prompt: q })
  }

  return (
    <div className="acoes-ia" ref={raizRef}>
      <button
        className="btn-icon"
        title="Ações de IA"
        disabled={rodando}
        onClick={() => {
          setErro(null)
          setMenuAberto((v) => !v)
        }}
      >
        {rodando ? '…' : '✨'}
      </button>
      {menuAberto && (
        <div className="acoes-ia-menu">
          {abaEhTexto && (
            <>
              <button onClick={() => void executar({ rotulo: `${rotuloAbaAtual} — curta`, destino: abaAtual, rotuloDestino: rotuloAbaAtual, prompt: promptVersao(rotuloAbaAtual, 'curta') })}>
                Versão curta
              </button>
              <button onClick={() => void executar({ rotulo: `${rotuloAbaAtual} — longa`, destino: abaAtual, rotuloDestino: rotuloAbaAtual, prompt: promptVersao(rotuloAbaAtual, 'longa') })}>
                Versão longa
              </button>
              <button onClick={() => void executar({ rotulo: `Melhorar ${rotuloAbaAtual}`, destino: abaAtual, rotuloDestino: rotuloAbaAtual, prompt: promptMelhorar(rotuloAbaAtual) })}>
                Melhorar
              </button>
            </>
          )}
          {acoes.map((a) => (
            <button
              key={a.rotulo}
              onClick={() =>
                void executar({ rotulo: a.rotulo, destino: a.abaDestino, rotuloDestino: a.rotuloDestino ?? a.abaDestino, prompt: a.prompt, comImagem: a.comImagem })
              }
            >
              {a.rotulo}
            </button>
          ))}
          <div className="acoes-ia-perguntar">
            <textarea
              placeholder="Perguntar / pedir conselho…"
              value={pergunta}
              onChange={(e) => setPergunta(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  enviarPergunta()
                }
              }}
            />
            <button disabled={rodando || !pergunta.trim()} onClick={enviarPergunta}>Enviar</button>
          </div>
        </div>
      )}
      {erro && <div className="acoes-ia-erro">{erro}</div>}
      {preview && (
        <div className="acoes-ia-overlay" onClick={() => setPreview(null)}>
          <div className="acoes-ia-preview" onClick={(e) => e.stopPropagation()}>
            <div className="acoes-ia-preview-titulo">{preview.rotulo}</div>
            <div className="acoes-ia-preview-texto">{preview.texto}</div>
            <div className="acoes-ia-preview-acoes">
              <button onClick={() => setPreview(null)}>Descartar</button>
              <button
                onClick={() => {
                  onInserir(preview.destino, textoParaHtml(preview.texto), 'adicionar')
                  setPreview(null)
                }}
              >
                Adicionar em {preview.rotuloDestino}
              </button>
              <button
                className="acoes-ia-inserir"
                onClick={() => {
                  const { personagens, cenarios } = useApp.getState()
                  const ent = entidadeTipo === 'personagem' ? personagens[entidadeId] : cenarios[entidadeId]
                  const atualDestino = ent ? htmlParaTexto((ent as unknown as Record<string, string>)[preview.destino] ?? '') : ''
                  if (atualDestino && !confirm(`Substituir o texto atual de "${preview.rotuloDestino}"? O conteúdo atual será apagado.`)) return
                  onInserir(preview.destino, textoParaHtml(preview.texto), 'substituir')
                  setPreview(null)
                }}
              >
                Substituir em {preview.rotuloDestino}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
