import { useEffect, useRef, useState } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { convertFileSrc } from '@tauri-apps/api/core'
import { useApp } from '../state/store'
import type { Personagem } from '../lib/types'
import { EditorTexto } from './EditorTexto'

const AUTOSAVE_DEBOUNCE_MS = 800

export function PerfilModal({ personagemId }: { personagemId: string }) {
  const p = useApp((s) => s.personagens[personagemId])
  const vaultPath = useApp((s) => s.vaultPath)
  const repo = useApp((s) => s.repo)
  const caminhoPorId = useApp((s) => s.caminhoPorId)
  const fecharPerfil = useApp((s) => s.fecharPerfil)
  const recarregarArvore = useApp((s) => s.recarregarArvore)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [salvarErro, setSalvarErro] = useState<string | null>(null)

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
        <EditorTexto value={p.descricao} onChange={(html) => agendarSalvar({ descricao: html })} />
        {salvarErro && (
          <div className="perfil-salvar-erro">Falha ao salvar: {salvarErro}</div>
        )}
      </div>
    </div>
  )
}
