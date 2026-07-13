import { useEffect } from 'react'
import { useApp } from './state/store'
import { VaultPicker } from './components/VaultPicker'
import { Sidebar } from './components/Sidebar'
import { CanvasView } from './components/CanvasView'
import { PerfilModal } from './components/PerfilModal'
import './theme.css'

export default function App() {
  const vaultPath = useApp((s) => s.vaultPath)
  const aberto = useApp((s) => s.aberto)
  const perfilAbertoId = useApp((s) => s.perfilAbertoId)
  const abrirCofre = useApp((s) => s.abrirCofre)

  useEffect(() => {
    const salvo = localStorage.getItem('grimorio.vault')
    if (salvo) abrirCofre(salvo).catch(() => localStorage.removeItem('grimorio.vault'))
  }, [abrirCofre])

  if (!vaultPath) return <VaultPicker />

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="app-main">
        {aberto ? (
          <CanvasView key={aberto.caminho} caminho={aberto.caminho} nome={aberto.nome} />
        ) : (
          <div className="app-empty">Selecione uma sessão ou canvas na barra lateral</div>
        )}
      </main>
      {perfilAbertoId && <PerfilModal personagemId={perfilAbertoId} />}
    </div>
  )
}
