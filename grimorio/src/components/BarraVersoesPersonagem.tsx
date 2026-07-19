import { ask } from '@tauri-apps/plugin-dialog'
import { pedirTexto } from './dialogos'
import { useApp } from '../state/store'

/** Barra de formas/versões do personagem (topo do perfil): pills (ativar), duplo-clique renomeia, × exclui, + adiciona. */
export function BarraVersoesPersonagem({ personagemId }: { personagemId: string }) {
  const p = useApp((s) => s.personagens[personagemId])
  const definirVersaoAtivaPersonagem = useApp((s) => s.definirVersaoAtivaPersonagem)
  const adicionarVersaoPersonagem = useApp((s) => s.adicionarVersaoPersonagem)
  const renomearVersaoPersonagem = useApp((s) => s.renomearVersaoPersonagem)
  const removerVersaoPersonagem = useApp((s) => s.removerVersaoPersonagem)
  if (!p) return null

  async function criar() {
    const nome = await pedirTexto('Nome da nova forma', '', 'Criar')
    if (nome) adicionarVersaoPersonagem(personagemId, nome)
  }
  async function renomear(versaoId: string, atual: string) {
    const nome = await pedirTexto('Renomear forma', atual, 'Renomear')
    if (nome) renomearVersaoPersonagem(personagemId, versaoId, nome)
  }
  async function excluir(versaoId: string, nome: string) {
    const ok = await ask(`Excluir a forma "${nome}"? As imagens dela permanecem no cofre.`, { title: 'Grimório', kind: 'warning' })
    if (ok) removerVersaoPersonagem(personagemId, versaoId)
  }

  return (
    <div className="barra-versoes">
      {p.versoes.map((v) => (
        <span key={v.id} className={v.id === p.versaoAtivaId ? 'versao-pill ativa' : 'versao-pill'}>
          <button
            className="versao-pill-nome"
            title="Clique: ativar • Duplo-clique: renomear"
            onClick={() => definirVersaoAtivaPersonagem(personagemId, v.id)}
            onDoubleClick={() => void renomear(v.id, v.nome)}
          >
            {v.nome}
          </button>
          {p.versoes.length > 1 && (
            <button className="versao-pill-x" title="Excluir forma" onClick={() => void excluir(v.id, v.nome)}>×</button>
          )}
        </span>
      ))}
      <button className="versao-add" title="Nova forma (copia a atual)" onClick={() => void criar()}>+ forma</button>
    </div>
  )
}
