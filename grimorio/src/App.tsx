import { useEffect, useState } from 'react'
import { estadoLimpoDeCofre, useApp } from './state/store'
import { observarCofreAberto } from './state/sync'
import { VaultPicker } from './components/VaultPicker'
import { Sidebar } from './components/Sidebar'
import { Workspace } from './components/Workspace'
import { PerfilModal } from './components/PerfilModal'
import { CenarioModal } from './components/CenarioModal'
import { ItemModal } from './components/ItemModal'
import { GrafoVinculos } from './components/GrafoVinculos'
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
  const itemAbertoId = useApp((s) => s.itemAbertoId)
  const grafoAberto = useApp((s) => s.grafoAberto)
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
    abrirCofre(salvo).catch((e) => {
      // falha DEPOIS de vaultPath setado (árvore ilegível, disco sumindo) deixaria a
      // sidebar presa em "Carregando…" com o erro inalcançável, porque erroCofre só é
      // renderizado no VaultPicker. Zerar leva de volta pra lá, com a mensagem.
      // CHAVE_VAULT fica de propósito: este efeito roda uma vez, não há laço de boot a
      // quebrar, e esquecer o cofre condenaria falha transitória (OneDrive ainda
      // sincronizando, drive de rede não montado) a nunca mais ser tentada — o
      // VaultPicker não lista recentes e as Opções só existem com um cofre aberto.
      // estadoLimpoDeCofre: setState é merge raso, então tree/personagens/vinculos do
      // cofre meio-carregado sobreviveriam ao vaultPath que os justificava.
      const erro = useApp.getState().erroCofre ?? `Não foi possível abrir o cofre: ${e}`
      useApp.setState({ ...estadoLimpoDeCofre(), vaultPath: null, repo: null, erroCofre: erro })
    })
  }, [abrirCofre])

  // checa por nova versão publicada uma vez ao abrir (silencioso se não houver)
  useEffect(() => {
    checarAtualizacao()
  }, [])

  // Liga a sincronização com o Drive ao cofre aberto, e a religa a cada troca de cofre. Fica
  // FORA do efeito de boot acima de propósito: o sync não pode atrasar nem derrubar a abertura
  // do cofre, e ele mesmo espera o `vaultPath` aparecer. Sem conta conectada ou sem pareamento,
  // não sobe sincronizador nenhum — o app segue exatamente como sempre foi.
  useEffect(() => observarCofreAberto(), [])

  if (!vaultPath) return <VaultPicker />

  return (
    <div className="app-layout">
      <Sidebar recolhida={sidebarRecolhida} onToggle={alternarSidebar} />
      {/* a teia ocupa a área principal inteira: ela é uma leitura do cofre todo, não de
          um documento, e conviver com o workspace no mesmo espaço só disputaria pixels */}
      <main className="app-main">
        {grafoAberto && <GrafoVinculos />}
        {!grafoAberto && !aberto && <div className="app-empty">Selecione uma sessão, canvas ou a Escrita na barra lateral</div>}

        {!grafoAberto && aberto?.tipo === 'canvas' && vaultPath && (
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

        {!grafoAberto && aberto?.tipo === 'sessao' && vaultPath && (
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

        {!grafoAberto && aberto?.tipo === 'escrita' && vaultPath && (
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
      {itemAbertoId && <ItemModal key={itemAbertoId} itemId={itemAbertoId} />}
      {/* ORDEM IMPORTA: todo host aqui é uma .modal-overlay com o MESMO z-index (1000),
          então quem vem depois no DOM pinta por cima. HostDialogos fica por último
          porque qualquer um dos outros abre um pedirTexto em cima de si (Opções →
          "Renomear rótulo" / "Alterar chaves"); invertido, o prompt some atrás do
          modal que o chamou, ainda focado — o usuário digita no escuro. */}
      <HostOpcoes />
      <HostDialogoCampanhas />
      <HostDialogos />
    </div>
  )
}
