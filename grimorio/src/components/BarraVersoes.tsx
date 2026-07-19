import { ask } from '@tauri-apps/plugin-dialog'
import { pedirTexto } from './dialogos'
import { useApp } from '../state/store'

/** Barra de versões do cenário (topo do modal): pills clicáveis (ativar), duplo-clique renomeia, × exclui, + adiciona. */
export function BarraVersoes({ cenarioId }: { cenarioId: string }) {
  const c = useApp((s) => s.cenarios[cenarioId])
  const definirVersaoAtiva = useApp((s) => s.definirVersaoAtiva)
  const adicionarVersao = useApp((s) => s.adicionarVersao)
  const renomearVersao = useApp((s) => s.renomearVersao)
  const removerVersao = useApp((s) => s.removerVersao)
  if (!c) return null

  async function criar() {
    const nome = await pedirTexto('Nome da nova versão', '', 'Criar')
    if (nome) adicionarVersao(cenarioId, nome)
  }
  async function renomear(versaoId: string, atual: string) {
    const nome = await pedirTexto('Renomear versão', atual, 'Renomear')
    if (nome) renomearVersao(cenarioId, versaoId, nome)
  }
  async function excluir(versaoId: string, nome: string) {
    const ok = await ask(`Excluir a versão "${nome}"? As imagens dela permanecem no cofre.`, { title: 'Grimório', kind: 'warning' })
    if (ok) removerVersao(cenarioId, versaoId)
  }

  return (
    <div className="barra-versoes">
      {c.versoes.map((v) => (
        <span key={v.id} className={v.id === c.versaoAtivaId ? 'versao-pill ativa' : 'versao-pill'}>
          <button
            className="versao-pill-nome"
            title="Clique: ativar • Duplo-clique: renomear"
            onClick={() => definirVersaoAtiva(cenarioId, v.id)}
            onDoubleClick={() => void renomear(v.id, v.nome)}
          >
            {v.nome}
          </button>
          {c.versoes.length > 1 && (
            <button className="versao-pill-x" title="Excluir versão" onClick={() => void excluir(v.id, v.nome)}>×</button>
          )}
        </span>
      ))}
      <button className="versao-add" title="Nova versão (copia a atual)" onClick={() => void criar()}>+ versão</button>
    </div>
  )
}
