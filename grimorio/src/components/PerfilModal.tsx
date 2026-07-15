import { useEffect, useRef, useState } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { convertFileSrc } from '@tauri-apps/api/core'
import { useApp } from '../state/store'
import type { Personagem } from '../lib/types'
import { EditorTexto } from './EditorTexto'
import { GaleriaPersonagem } from './GaleriaPersonagem'
import { AbaVinculos } from './AbaVinculos'

const AUTOSAVE_DEBOUNCE_MS = 800

type Aba = 'descricao' | 'informacao' | 'historia' | 'imagens' | 'extras' | 'anotacoes' | 'vinculos'
type AbaTexto = Exclude<Aba, 'imagens' | 'vinculos'>

const ABAS: { id: Aba; rotulo: string }[] = [
  { id: 'descricao', rotulo: 'Descrição' },
  { id: 'informacao', rotulo: 'Informações' },
  { id: 'historia', rotulo: 'História' },
  { id: 'imagens', rotulo: 'Imagens' },
  { id: 'extras', rotulo: 'Extras' },
  { id: 'anotacoes', rotulo: 'Anotações' },
  { id: 'vinculos', rotulo: 'Vínculos' },
]

export function PerfilModal({ personagemId }: { personagemId: string }) {
  const p = useApp((s) => s.personagens[personagemId])
  const vaultPath = useApp((s) => s.vaultPath)
  const repo = useApp((s) => s.repo)
  const caminhoPorId = useApp((s) => s.caminhoPorId)
  const fecharPerfil = useApp((s) => s.fecharPerfil)
  const recarregarArvore = useApp((s) => s.recarregarArvore)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [salvarErro, setSalvarErro] = useState<string | null>(null)
  const [aba, setAba] = useState<Aba>('descricao')

  // ?v= força refetch quando o retrato é trocado pelo mesmo nome de arquivo (mesma extensão)
  const retratoSrc = p?.retrato && vaultPath
    ? `${convertFileSrc(`${vaultPath}/${p.retrato}`)}?v=${encodeURIComponent(p.modificadoEm)}`
    : null

  // imagem quebrada → volta pro fallback de inicial; reseta se o retrato mudar
  const [erroImg, setErroImg] = useState(false)
  useEffect(() => {
    setErroImg(false)
  }, [retratoSrc])

  // desmontou com gravação pendente: cancela o debounce e grava já (fire-and-forget;
  // VaultRepo serializa escritas por caminho, mesmo padrão do CanvasView)
  useEffect(() => () => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
      void salvar()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!p) return null

  function agendarSalvar(mudancas: Partial<Personagem>) {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      timer.current = null
      void salvar()
    }, AUTOSAVE_DEBOUNCE_MS)
    // atualização otimista no cache (cartões refletem na hora)
    useApp.setState((s) => ({
      personagens: { ...s.personagens, [personagemId]: { ...s.personagens[personagemId], ...mudancas } },
    }))
  }

  async function salvar(): Promise<boolean> {
    const atual = useApp.getState().personagens[personagemId]
    const caminho = caminhoPorId[personagemId]
    if (!repo || !caminho || !atual) return true
    try {
      await repo.salvarPersonagem(caminho, { ...atual })
      setSalvarErro(null)
      await recarregarArvore()
      return true
    } catch (e) {
      // não relança: chamadas debounced são fire-and-forget
      console.error('Falha ao salvar perfil:', e)
      setSalvarErro(String(e))
      return false
    }
  }

  async function trocarRetrato() {
    const caminho = caminhoPorId[personagemId]
    if (!repo || !caminho || !vaultPath) return
    try {
      const arquivo = await open({
        title: 'Escolher retrato',
        filters: [{ name: 'Imagens', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
      })
      if (typeof arquivo !== 'string') return
      const nomeArquivo = arquivo.split(/[\\/]/).pop() ?? ''
      const ext = (nomeArquivo.includes('.') ? nomeArquivo.split('.').pop()! : 'png').toLowerCase()
      // assets/ da mesma campanha do personagem: campanhas/<slug>/personagens/x.json
      const dirCampanha = caminho.split('/').slice(0, 2).join('/')
      const destinoRel = `${dirCampanha}/assets/retrato-${personagemId}.${ext}`
      await repo.copiarParaCofre(arquivo, destinoRel)
      // modificadoEm novo muda o ?v= do retratoSrc na hora (cache-bust otimista)
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
      if (!ok) return // banner explica a falha; segundo ✕ (sem save pendente) ainda fecha
    }
    fecharPerfil()
  }

  return (
    <div className="modal-overlay" onClick={() => void fechar()}>
      <div className="perfil-modal" onClick={(e) => e.stopPropagation()}>
        <div className="perfil-header">
          <div className="perfil-retrato" onClick={() => void trocarRetrato()} title="Clique para trocar o retrato">
            {retratoSrc && !erroImg
              ? <img src={retratoSrc} alt={p.nome} onError={() => setErroImg(true)} />
              : <span>{p.nome.charAt(0).toUpperCase()}</span>}
          </div>
          <div className="perfil-titulos">
            <input className="perfil-nome" value={p.nome}
              onChange={(e) => agendarSalvar({ nome: e.target.value })} />
            <input className="perfil-resumo" placeholder="Resumo curto (aparece no cartão)"
              value={p.resumo}
              onChange={(e) => agendarSalvar({ resumo: e.target.value })} />
          </div>
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
            personagemId={personagemId}
            imagens={p.imagens}
            onImagensChange={(imagens) => agendarSalvar({ imagens })}
          />
        ) : aba === 'vinculos' ? (
          <AbaVinculos entidadeTipo="personagem" entidadeId={personagemId} />
        ) : (
          <EditorTexto
            key={aba}
            value={p[aba as AbaTexto]}
            onChange={(html) => agendarSalvar({ [aba]: html } as Partial<Personagem>)}
          />
        )}
        {salvarErro && (
          <div className="perfil-salvar-erro">Falha ao salvar: {salvarErro}</div>
        )}
      </div>
    </div>
  )
}
