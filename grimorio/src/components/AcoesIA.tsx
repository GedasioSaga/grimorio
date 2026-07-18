import { useEffect, useRef, useState } from 'react'
import { ask } from '@tauri-apps/plugin-dialog'
import { gerarConteudo, type ImagemIA } from '../lib/gemini'
import { garantirChaves } from '../lib/chavesIA'
import { pedirTexto } from './dialogos'
import { promptMelhorar, promptVersao } from '../lib/promptsIA'

export interface AcaoIA {
  rotulo: string
  prompt: string
  abaDestino: string
  rotuloDestino?: string
  comImagem?: boolean
}

export type ModoInserir = 'substituir' | 'adicionar'

/** Dados frescos que o pai fornece a cada execução (lido no momento do clique). */
export interface SnapshotIA {
  dadosBase: string // "# Personagem\nNome…" ou "# Página de escrita\nTítulo…"
  textoAtual: string // texto da aba/página (com marcadores {{IMG:n}} na escrita); '' em abas sem texto
  contexto: string // contexto da campanha; '' se nenhum
}

interface Preview {
  rotulo: string
  destino: string
  rotuloDestino: string
  texto: string
}

/**
 * Menu ✨ compartilhado por Personagem/Cenário (modais) e Escrita (página). Ações
 * tab-aware (curta/longa/melhorar), ações específicas (via `acoes`) e pergunta livre;
 * preview antes de gravar. Agnóstico da origem: o pai injeta `system`, `contexto` e
 * `snapshot()`, e recebe o texto CRU em `onInserir` (a conversão para HTML é do pai —
 * `textoParaHtml` nos modais, Markdown + imagens na escrita).
 */
export function AcoesIA({
  system,
  abaAtual,
  rotuloAbaAtual,
  abaEhTexto,
  acoes,
  snapshot,
  imagensParaIA,
  conteudoDoDestino,
  onInserir,
  sufixoPrompt = '',
}: {
  system: string
  abaAtual: string
  rotuloAbaAtual: string
  abaEhTexto: boolean
  acoes: AcaoIA[]
  snapshot: () => SnapshotIA
  imagensParaIA?: (incluirGaleria: boolean) => Promise<ImagemIA[]>
  conteudoDoDestino: (destino: string) => string
  onInserir: (destino: string, textoCru: string, modo: ModoInserir) => void
  /** Anexado a todo prompt (ex.: regra de marcadores de imagem na escrita). */
  sufixoPrompt?: string
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

  async function executar(opts: {
    rotulo: string
    destino: string
    rotuloDestino: string
    prompt: string
    comImagem?: boolean
    anexarImagem?: boolean
  }) {
    setMenuAberto(false)
    setErro(null)
    setRodando(true)
    try {
      const { dadosBase, textoAtual, contexto } = snapshot()
      const dados =
        dadosBase + (abaEhTexto && textoAtual ? `\nTexto atual da seção "${rotuloAbaAtual}":\n${textoAtual}` : '')
      const systemFull = contexto ? `${system}\n\n# Contexto da campanha\n${contexto}` : system
      // comImagem (ação dedicada) = retrato + galeria e exige imagem; anexarImagem (campo livre) = só retrato, opcional
      const querImagem = opts.comImagem || opts.anexarImagem
      const imagens = querImagem && imagensParaIA ? await imagensParaIA(!!opts.comImagem) : []
      if (opts.comImagem && imagens.length === 0) throw new Error('Esta entidade não tem imagem.')
      const instrucao = sufixoPrompt ? `${opts.prompt}\n\n${sufixoPrompt}` : opts.prompt

      const texto = await gerarConteudo({
        system: systemFull,
        historico: [{ papel: 'user', texto: `${dados}\n\n${instrucao}` }],
        imagens,
        chaves: await garantirChaves(pedirTexto),
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
    void executar({ rotulo: 'Resposta da IA', destino, rotuloDestino, prompt: q, anexarImagem: true })
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
                  onInserir(preview.destino, preview.texto, 'adicionar')
                  setPreview(null)
                }}
              >
                Adicionar em {preview.rotuloDestino}
              </button>
              <button
                className="acoes-ia-inserir"
                onClick={async () => {
                  const atual = conteudoDoDestino(preview.destino)
                  if (atual && !(await ask(`Substituir o texto atual de "${preview.rotuloDestino}"? O conteúdo atual será apagado.`, { title: 'Grimório', kind: 'warning' }))) return
                  onInserir(preview.destino, preview.texto, 'substituir')
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
