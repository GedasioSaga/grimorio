import ReactDOM from 'react-dom/client'
import { AmostraApp } from './AmostraApp'
import { aplicarTema, temaSalvo } from '../lib/tema'
import '../theme.css'
import '../estilos/amostra.css'

// mesmo tema do app real (lib/tema.ts) — aplica ANTES do 1º paint, mesmo padrão de main.tsx.
aplicarTema(temaSalvo())

// SEM <React.StrictMode>, de propósito: o double-invoke de efeito do StrictMode rodaria
// `onMount` do <Tldraw> duas vezes em dev, duplicando a planta de exemplo da cena #mapa
// (`CenaMapa.tsx`) — risco que o app real não corre porque nunca cria shapes no onMount
// sem uma fila de "pendente" que se autolimpa (`lib/mapaIAPendente.ts`).
ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(<AmostraApp />)
