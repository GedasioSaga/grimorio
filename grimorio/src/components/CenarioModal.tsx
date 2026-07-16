import { useEffect, useRef, useState } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { convertFileSrc } from '@tauri-apps/api/core'
import { useApp } from '../state/store'
import type { Cenario } from '../lib/types'
import { encontrarCenarioNode } from '../lib/cenarioArvore'
import { desvincularPersonagem, personagensVivos, vincularPersonagem } from '../lib/cenarioVinculo'
import { EditorTexto } from './EditorTexto'
import { GaleriaPersonagem } from './GaleriaPersonagem'
import { AbaVinculos } from './AbaVinculos'
import { AcoesIA, type AcaoIA } from './AcoesIA'

const AUTOSAVE_DEBOUNCE_MS = 800

type Aba = 'descricao' | 'conteudo' | 'informacao' | 'historia' | 'eventos' | 'itens' | 'imagens' | 'anotacoes' | 'vinculos'
type AbaTexto = Exclude<Aba, 'imagens' | 'conteudo' | 'vinculos'>

const ABAS: { id: Aba; rotulo: string }[] = [
  { id: 'descricao', rotulo: 'Descrição' },
  { id: 'conteudo', rotulo: 'Conteúdo' },
  { id: 'informacao', rotulo: 'Informações' },
  { id: 'historia', rotulo: 'História' },
  { id: 'eventos', rotulo: 'Eventos' },
  { id: 'itens', rotulo: 'Itens' },
  { id: 'imagens', rotulo: 'Imagens' },
  { id: 'anotacoes', rotulo: 'Anotações' },
  { id: 'vinculos', rotulo: 'Vínculos' },
]

const ACOES_IA_CENARIO: AcaoIA[] = [
  {
    rotulo: 'Gerar/melhorar descrição',
    prompt: 'Escreva (ou melhore) a descrição deste cenário em 2-3 parágrafos evocativos, coerentes com o contexto.',
    abaDestino: 'descricao',
    rotuloDestino: 'Descrição',
  },
  {
    rotulo: 'Sugerir eventos',
    prompt: 'Sugira 3 eventos que podem acontecer neste cenário (lista curta, um por linha, com gatilho e consequência).',
    abaDestino: 'eventos',
    rotuloDestino: 'Eventos',
  },
  {
    rotulo: 'Analisar imagem',
    prompt: 'Analise a imagem deste cenário: descreva o que se vê e sugira 3 pontos de interesse para os jogadores explorarem.',
    abaDestino: 'anotacoes',
    rotuloDestino: 'Anotações',
    comImagem: true,
  },
]

export function CenarioModal({ cenarioId }: { cenarioId: string }) {
  const c = useApp((s) => s.cenarios[cenarioId])
  const vaultPath = useApp((s) => s.vaultPath)
  const repo = useApp((s) => s.repo)
  const caminhoCenarioPorId = useApp((s) => s.caminhoCenarioPorId)
  const fecharCenario = useApp((s) => s.fecharCenario)
  const recarregarArvore = useApp((s) => s.recarregarArvore)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [salvarErro, setSalvarErro] = useState<string | null>(null)
  const [aba, setAba] = useState<Aba>('descricao')

  // ?v= força refetch quando o retrato troca mantendo o mesmo nome de arquivo
  const retratoSrc = c?.retrato && vaultPath
    ? `${convertFileSrc(`${vaultPath}/${c.retrato}`)}?v=${encodeURIComponent(c.modificadoEm)}`
    : null

  const [erroImg, setErroImg] = useState(false)
  useEffect(() => {
    setErroImg(false)
  }, [retratoSrc])

  // desmontou com gravação pendente: cancela o debounce e grava já (fire-and-forget;
  // VaultRepo serializa escritas por caminho, mesmo padrão do PerfilModal)
  useEffect(() => () => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
      void salvar()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!c) return null

  function agendarSalvar(mudancas: Partial<Cenario>) {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      timer.current = null
      void salvar()
    }, AUTOSAVE_DEBOUNCE_MS)
    // atualização otimista no cache (sidebar e cards refletem na hora)
    useApp.setState((s) => ({
      cenarios: { ...s.cenarios, [cenarioId]: { ...s.cenarios[cenarioId], ...mudancas } },
    }))
  }

  async function salvar(): Promise<boolean> {
    const atual = useApp.getState().cenarios[cenarioId]
    const caminho = caminhoCenarioPorId[cenarioId]
    if (!repo || !caminho || !atual) return true
    try {
      await repo.salvarCenario(caminho, { ...atual })
      setSalvarErro(null)
      await recarregarArvore()
      return true
    } catch (e) {
      // não relança: chamadas debounced são fire-and-forget
      console.error('Falha ao salvar cenário:', e)
      setSalvarErro(String(e))
      return false
    }
  }

  async function trocarRetrato() {
    if (!repo || !vaultPath) return
    try {
      const arquivo = await open({
        title: 'Escolher retrato',
        filters: [{ name: 'Imagens', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
      })
      if (typeof arquivo !== 'string') return
      const nomeArquivo = arquivo.split(/[\\/]/).pop() ?? ''
      const ext = (nomeArquivo.includes('.') ? nomeArquivo.split('.').pop()! : 'png').toLowerCase()
      // central e estável: mover o cenário não quebra o rel
      const destinoRel = `imagens-cenarios/retrato-${cenarioId}.${ext}`
      await repo.copiarParaCofre(arquivo, destinoRel)
      agendarSalvar({ retrato: destinoRel, modificadoEm: new Date().toISOString() })
    } catch (e) {
      alert(`Falha ao trocar retrato: ${e}`)
    }
  }

  async function fechar() {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
      const ok = await salvar()
      if (!ok) return
    }
    fecharCenario()
  }

  return (
    <div className="modal-overlay" onClick={() => void fechar()}>
      <div className="perfil-modal" onClick={(e) => e.stopPropagation()}>
        <div className="perfil-header">
          <div className="perfil-retrato" onClick={() => void trocarRetrato()} title="Clique para trocar o retrato">
            {retratoSrc && !erroImg
              ? <img src={retratoSrc} alt={c.nome} onError={() => setErroImg(true)} />
              : <span>{c.nome.charAt(0).toUpperCase()}</span>}
          </div>
          <div className="perfil-titulos">
            <input className="perfil-nome" value={c.nome}
              onChange={(e) => agendarSalvar({ nome: e.target.value })} />
            <input className="perfil-resumo" placeholder="Resumo curto (aparece no cartão)"
              value={c.resumo}
              onChange={(e) => agendarSalvar({ resumo: e.target.value })} />
          </div>
          <AcoesIA
            entidadeTipo="cenario"
            entidadeId={cenarioId}
            acoes={ACOES_IA_CENARIO}
            onInserir={(abaDestino, html) => {
              const atual = useApp.getState().cenarios[cenarioId]
              const base = atual ? (atual[abaDestino as 'descricao' | 'eventos' | 'anotacoes'] ?? '') : ''
              agendarSalvar({ [abaDestino]: base + html } as Partial<Cenario>)
              setAba(abaDestino as Aba)
            }}
          />
          <button className="btn-icon perfil-fechar" onClick={() => void fechar()}>✕</button>
        </div>
        <div className="perfil-abas">
          {ABAS.map((a) => (
            <button key={a.id} className={aba === a.id ? 'ativo' : ''} onClick={() => setAba(a.id)}>
              {a.rotulo}
            </button>
          ))}
        </div>
        {aba === 'imagens' ? (
          <GaleriaPersonagem
            dirAssets="imagens-cenarios"
            imagens={c.imagens}
            onImagensChange={(imagens) => agendarSalvar({ imagens })}
          />
        ) : aba === 'conteudo' ? (
          <AbaConteudo cenarioId={cenarioId} agendarSalvar={agendarSalvar} />
        ) : aba === 'vinculos' ? (
          <AbaVinculos entidadeTipo="cenario" entidadeId={cenarioId} />
        ) : (
          <EditorTexto
            key={aba}
            value={c[aba as AbaTexto]}
            onChange={(html) => agendarSalvar({ [aba]: html } as Partial<Cenario>)}
          />
        )}
        {salvarErro && (
          <div className="perfil-salvar-erro">Falha ao salvar: {salvarErro}</div>
        )}
      </div>
    </div>
  )
}

/** Sub-cenários (navegação) + personagens vinculados (chips com busca). */
function AbaConteudo({ cenarioId, agendarSalvar }: {
  cenarioId: string
  agendarSalvar: (mudancas: Partial<Cenario>) => void
}) {
  const tree = useApp((s) => s.tree)
  const c = useApp((s) => s.cenarios[cenarioId])
  const personagens = useApp((s) => s.personagens)
  const abrirCenario = useApp((s) => s.abrirCenario)
  const abrirPerfil = useApp((s) => s.abrirPerfil)
  const [busca, setBusca] = useState('')

  if (!c) return null
  const node = tree ? encontrarCenarioNode(tree.cenarios, cenarioId) : null
  const vivos = personagensVivos(c.personagens, personagens)
  const termo = busca.trim().toLowerCase()
  const candidatos = termo
    ? Object.values(personagens)
        .filter((p) => p.nome.toLowerCase().includes(termo) && !c.personagens.includes(p.id))
        .slice(0, 8)
    : []

  return (
    <div className="cenario-conteudo">
      <div className="grupo-titulo">Sub-cenários</div>
      {node && node.filhos.length > 0 ? (
        node.filhos.map((f) => (
          <button key={f.id} className="cenario-sub-item" onClick={() => abrirCenario(f.id)}>
            🗺 {f.nome}
          </button>
        ))
      ) : (
        <p className="galeria-vazia">Nenhum sub-cenário. Crie pela sidebar (+ na linha do cenário).</p>
      )}

      <div className="grupo-titulo">Personagens</div>
      <div className="cenario-chips">
        {vivos.map((pid) => (
          <span key={pid} className="cenario-chip">
            <button className="cenario-chip-nome" onClick={() => abrirPerfil(pid)}>
              👤 {personagens[pid].nome}
            </button>
            <button
              className="cenario-chip-x"
              title="Desvincular (não exclui o personagem)"
              onClick={() => agendarSalvar({ personagens: desvincularPersonagem(c.personagens, pid) })}
            >
              ×
            </button>
          </span>
        ))}
        {vivos.length === 0 && <p className="galeria-vazia">Nenhum personagem vinculado.</p>}
      </div>
      <div className="cenario-vincular">
        <input
          placeholder="+ Vincular personagem (busque pelo nome)…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        {candidatos.map((p) => (
          <button
            key={p.id}
            className="cenario-sub-item"
            onClick={() => {
              agendarSalvar({ personagens: vincularPersonagem(c.personagens, p.id) })
              setBusca('')
            }}
          >
            👤 {p.nome}
          </button>
        ))}
      </div>
    </div>
  )
}
