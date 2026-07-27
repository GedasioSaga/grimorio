import { useApp } from '../state/store'
import { useSync } from '../state/syncStore'
import {
  avisosDoSync,
  copiasDeConflito,
  resumirSync,
  type AvisoSync,
  type CopiaDeConflito,
} from '../lib/painelSync'

/**
 * O estado do sync com o Google Drive, dentro da aba Nuvem.
 *
 * Só mostra. Quem age é o sincronizador (`lib/sync/sincronizador.ts`), e ele ainda não é criado
 * em lugar nenhum do app — enquanto essa costura não existir, este painel mostra o retrato
 * inicial do store. Nenhum botão de "sincronizar agora" aqui: botão que não chama nada é pior
 * que aviso nenhum.
 *
 * `useSync()` sem seletor assina o retrato inteiro de propósito: é o store separado justamente
 * para que assinar tudo custe barato, e este painel usa todos os campos.
 */
export function PainelSync({ onFechar }: { onFechar: () => void }) {
  const estado = useSync()
  const personagens = useApp((s) => s.personagens)
  const cenarios = useApp((s) => s.cenarios)
  const campanhaFiltro = useApp((s) => s.campanhaFiltro)
  const abrirPerfil = useApp((s) => s.abrirPerfil)
  const abrirCenario = useApp((s) => s.abrirCenario)

  const resumo = resumirSync(estado, new Date())
  const avisos = avisosDoSync(estado)
  const copias = copiasDeConflito(personagens, cenarios)

  function abrirCopia(copia: CopiaDeConflito) {
    // As Opções são uma `.modal-overlay` com o mesmo z-index do PerfilModal e vêm DEPOIS dele no
    // DOM (App.tsx): sem fechar aqui, a cópia abriria atrás desta janela.
    onFechar()
    if (copia.tipo === 'personagem') abrirPerfil(copia.id)
    else abrirCenario(copia.id)
  }

  return (
    <>
      <h3>Sincronização</h3>
      <p className={`sync-titulo sync-${resumo.tom}`}>{resumo.titulo}</p>
      {resumo.detalhe && <p className="opcoes-vazio">{resumo.detalhe}</p>}

      {avisos.map((aviso) => (
        <Aviso key={aviso.chave} aviso={aviso} />
      ))}

      {copias.length > 0 && (
        <>
          <h3>Cópias criadas por conflito</h3>
          <p className="opcoes-vazio">
            O mesmo item foi editado em dois computadores. Nada se perdeu: a versão que ficou de
            fora virou uma cópia à parte, para você comparar e apagar a que não quiser.
          </p>
          {campanhaFiltro !== null && (
            <p className="opcoes-vazio">
              Uma cópia nasce sem campanha, então com o filtro de campanha ligado ela não aparece
              na barra lateral. Abrir por aqui funciona mesmo assim.
            </p>
          )}
          <ul className="opcoes-lista">
            {copias.map((copia) => (
              <li key={`${copia.tipo}:${copia.id}`} className="sync-copia-item">
                <span className="opcoes-cofre-nome">{copia.nome}</span>
                <span className="opcoes-cofre-caminho">
                  {copia.tipo === 'personagem' ? 'Personagem' : 'Cenário'}
                </span>
                <span className="opcoes-cofre-acoes">
                  <button onClick={() => abrirCopia(copia)}>Abrir</button>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}

/** Um problema de pé: título, explicação e a lista de arquivos ou motivos por trás dele. */
function Aviso({ aviso }: { aviso: AvisoSync }) {
  return (
    <div className={`sync-aviso sync-aviso-${aviso.chave}`}>
      <strong className="sync-aviso-titulo">{aviso.titulo}</strong>
      {aviso.paragrafos.map((texto, i) => (
        // índice como chave: a lista é fixa por aviso e nunca reordena
        <p key={i}>{texto}</p>
      ))}
      {aviso.itens.length > 0 && (
        <ul className="sync-aviso-itens">
          {aviso.itens.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
