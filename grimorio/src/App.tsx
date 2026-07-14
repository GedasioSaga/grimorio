import { useEffect } from 'react'
import { useApp } from './state/store'
import { VaultPicker } from './components/VaultPicker'
import { Sidebar } from './components/Sidebar'
import { CanvasView } from './components/CanvasView'
import { Workspace } from './components/Workspace'
import { PerfilModal } from './components/PerfilModal'
import { dirNotasDaSessao } from './lib/caminhos'
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
        {!aberto && <div className="app-empty">Selecione uma sessão, canvas ou a Escrita na barra lateral</div>}

        {aberto?.tipo === 'canvas' && (
          <CanvasView key={aberto.caminho} caminho={aberto.caminho} nome={aberto.nome} />
        )}

        {aberto?.tipo === 'sessao' && vaultPath && (
          <Workspace
            key={aberto.caminho}
            chaveSplit={aberto.caminho}
            cadernoDirRel={dirNotasDaSessao(aberto.caminho)}
            cadernoDirAbs={`${vaultPath}/${dirNotasDaSessao(aberto.caminho)}`}
            mapa={{ caminho: aberto.caminho, nome: aberto.nome }}
          />
        )}

        {aberto?.tipo === 'escrita' && vaultPath && (
          <Workspace
            key={aberto.caminho}
            chaveSplit={aberto.caminho}
            cadernoDirRel={aberto.caminho}
            cadernoDirAbs={`${vaultPath}/${aberto.caminho}`}
            titulo={aberto.nome}
          />
        )}
      </main>
      {perfilAbertoId && <PerfilModal key={perfilAbertoId} personagemId={perfilAbertoId} />}
    </div>
  )
}
