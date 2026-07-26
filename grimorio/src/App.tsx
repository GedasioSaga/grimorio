import { useEffect, useState } from 'react'
import { useApp } from './state/store'
import { VaultPicker } from './components/VaultPicker'
import { Sidebar } from './components/Sidebar'
import { Workspace } from './components/Workspace'
import { PerfilModal } from './components/PerfilModal'
import { CenarioModal } from './components/CenarioModal'
import { HostDialogos } from './components/dialogos'
import { HostDialogoCampanhas } from './components/dialogoCampanhas'
import { HostOpcoes } from './components/Opcoes'
import { checarAtualizacao } from './lib/atualizador'
import { dirNotasDoMapa } from './lib/caminhos'
import { CHAVE_VAULT, migrarDoLegado, migrarFiltroLegado } from './lib/cofres'
import './theme.css'

export default function App() {
  const vaultPath = useApp((s) => s.vaultPath)
  const aberto = useApp((s) => s.aberto)
  const perfilAbertoId = useApp((s) => s.perfilAbertoId)
  const cenarioAbertoId = useApp((s) => s.cenarioAbertoId)
  const abrirCofre = useApp((s) => s.abrirCofre)
  const [sidebarRecolhida, setSidebarRecolhida] = useState(() => localStorage.getItem('grimorio.sidebar') === '1')

  function alternarSidebar() {
    setSidebarRecolhida((v) => {
      const novo = !v
      localStorage.setItem('grimorio.sidebar', novo ? '1' : '0')
      return novo
    })
  }

  useEffect(() => {
    // ORDEM IMPORTA: migrarFiltroLegado move o filtro da chave global para a chave
    // por-cofre, e carregarVinculos (dentro de abrirCofre) já lê a chave por-cofre.
    // Rodar depois faria todo mundo que já usava o app perder o filtro salvo.
    migrarDoLegado()
    migrarFiltroLegado()
    const salvo = localStorage.getItem(CHAVE_VAULT)
    if (!salvo) return
    abrirCofre(salvo).catch(() => {
      // falha DEPOIS de vaultPath setado (árvore ilegível, disco sumindo) deixaria a
      // sidebar presa em "Carregando…" com o erro inalcançável, porque erroCofre só é
      // renderizado no VaultPicker. Zerar leva de volta pra lá, com a mensagem.
      localStorage.removeItem(CHAVE_VAULT)
      useApp.setState({ vaultPath: null, repo: null })
    })
  }, [abrirCofre])

  // checa por nova versão publicada uma vez ao abrir (silencioso se não houver)
  useEffect(() => {
    checarAtualizacao()
  }, [])

  if (!vaultPath) return <VaultPicker />

  return (
    <div className="app-layout">
      <Sidebar recolhida={sidebarRecolhida} onToggle={alternarSidebar} />
      <main className="app-main">
        {!aberto && <div className="app-empty">Selecione uma sessão, canvas ou a Escrita na barra lateral</div>}

        {aberto?.tipo === 'canvas' && vaultPath && (
          <Workspace
            key={aberto.caminho}
            chaveSplit={aberto.caminho}
            cadernoDirRel={dirNotasDoMapa(aberto.caminho)}
            cadernoDirAbs={`${vaultPath}/${dirNotasDoMapa(aberto.caminho)}`}
            mapa={{ caminho: aberto.caminho, nome: aberto.nome }}
            notasLado="direita"
            notasComecaRecolhida
          />
        )}

        {aberto?.tipo === 'sessao' && vaultPath && (
          <Workspace
            key={aberto.caminho}
            chaveSplit={aberto.caminho}
            cadernoDirRel={dirNotasDoMapa(aberto.caminho)}
            cadernoDirAbs={`${vaultPath}/${dirNotasDoMapa(aberto.caminho)}`}
            mapa={{ caminho: aberto.caminho, nome: aberto.nome }}
            notasLado="direita"
            comChatIA
          />
        )}

        {aberto?.tipo === 'escrita' && vaultPath && (
          <Workspace
            key={aberto.caminho}
            chaveSplit={aberto.caminho}
            cadernoDirRel={dirNotasDoMapa(aberto.caminho)}
            cadernoDirAbs={`${vaultPath}/${dirNotasDoMapa(aberto.caminho)}`}
            titulo={aberto.nome}
            comChatIA
          />
        )}
      </main>
      {perfilAbertoId && <PerfilModal key={perfilAbertoId} personagemId={perfilAbertoId} />}
      {cenarioAbertoId && <CenarioModal key={cenarioAbertoId} cenarioId={cenarioAbertoId} />}
      <HostDialogos />
      <HostDialogoCampanhas />
      <HostOpcoes />
    </div>
  )
}
