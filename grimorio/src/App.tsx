import { useEffect, useState } from 'react'
import { useApp } from './state/store'
import { VaultPicker } from './components/VaultPicker'
import { Sidebar } from './components/Sidebar'
import { Workspace } from './components/Workspace'
import { PerfilModal } from './components/PerfilModal'
import { CenarioModal } from './components/CenarioModal'
import { dirNotasDoMapa } from './lib/caminhos'
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
    const salvo = localStorage.getItem('grimorio.vault')
    if (salvo) abrirCofre(salvo).catch(() => localStorage.removeItem('grimorio.vault'))
  }, [abrirCofre])

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
          />
        )}

        {aberto?.tipo === 'escrita' && vaultPath && (
          <Workspace
            key={aberto.caminho}
            chaveSplit={aberto.caminho}
            cadernoDirRel={dirNotasDoMapa(aberto.caminho)}
            cadernoDirAbs={`${vaultPath}/${dirNotasDoMapa(aberto.caminho)}`}
            titulo={aberto.nome}
          />
        )}
      </main>
      {perfilAbertoId && <PerfilModal key={perfilAbertoId} personagemId={perfilAbertoId} />}
      {cenarioAbertoId && <CenarioModal key={cenarioAbertoId} cenarioId={cenarioAbertoId} />}
    </div>
  )
}
