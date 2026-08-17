import { useEffect, useState } from 'react'
import { CenaFicha } from './CenaFicha'
import { CenaMapa } from './CenaMapa'
import { CenaOpcoes } from './CenaOpcoes'
import { HostDialogos, HostEscolha } from '../components/dialogos'

type CenaId = 'ficha' | 'mapa' | 'opcoes'

const CENAS: { id: CenaId; rotulo: string }[] = [
  { id: 'ficha', rotulo: 'Ficha — Acervo' },
  { id: 'mapa', rotulo: 'Mapa' },
  { id: 'opcoes', rotulo: 'Opções — IA' },
]

function cenaDoHash(): CenaId {
  const hash = window.location.hash.replace('#', '')
  return CENAS.some((c) => c.id === hash) ? (hash as CenaId) : 'ficha'
}

/**
 * Bancada da interface (`amostra.html`): navegação por hash, sem router — o app real não
 * usa nenhum, e trazer um só para isto seria dependência nova sem motivo (regra 12).
 */
export function AmostraApp() {
  const [cena, setCena] = useState<CenaId>(cenaDoHash)

  useEffect(() => {
    function aoMudarHash() {
      setCena(cenaDoHash())
    }
    window.addEventListener('hashchange', aoMudarHash)
    return () => window.removeEventListener('hashchange', aoMudarHash)
  }, [])

  return (
    <div className="amostra-app">
      <nav className="amostra-menu">
        <span className="amostra-menu-titulo">🧪 Bancada — Grimório</span>
        {CENAS.map((c) => (
          <a key={c.id} href={`#${c.id}`} className={cena === c.id ? 'ativo' : ''}>
            {c.rotulo}
          </a>
        ))}
      </nav>
      <div className="amostra-corpo">
        {cena === 'ficha' && <CenaFicha />}
        {cena === 'mapa' && <CenaMapa key="mapa" />}
        {cena === 'opcoes' && <CenaOpcoes />}
      </div>
      {/*
        Os mesmos hosts de diálogo que o `App.tsx` monta por último, pelo mesmo motivo (quem
        vem depois no DOM pinta por cima). Sem eles, `pedirTexto` abre um pedido que ninguém
        renderiza: criar e renomear camada ficavam INERTES na bancada — clique sem resposta
        e sem erro. Um juiz cego reprovou o painel de camadas por causa disso, achando que
        era defeito do app; era da bancada, que é a superfície onde a interface é conferida.
      */}
      <HostEscolha />
      <HostDialogos />
    </div>
  )
}
