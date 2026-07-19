import { open } from '@tauri-apps/plugin-dialog'
import { useApp } from '../state/store'
import grimoireIcon from '../assets/grimoire.png'

export function VaultPicker() {
  const abrirCofre = useApp((s) => s.abrirCofre)
  const carregando = useApp((s) => s.carregando)
  const erroCofre = useApp((s) => s.erroCofre)

  async function escolher() {
    const dir = await open({ directory: true, title: 'Escolha a pasta do seu cofre' })
    if (typeof dir === 'string') await abrirCofre(dir).catch(() => {})
  }

  return (
    <div className="vault-picker">
      <img className="vault-logo" src={grimoireIcon} alt="" draggable={false} />
      <h1>Grimório</h1>
      <p>Escolha uma pasta para guardar suas campanhas. Pode ser uma pasta nova ou um cofre existente (ex.: dentro do OneDrive para usar em dois computadores).</p>
      <button onClick={escolher} disabled={carregando}>
        {carregando ? 'Abrindo…' : 'Escolher pasta do cofre'}
      </button>
      {erroCofre && <p className="vault-erro">{erroCofre}</p>}
    </div>
  )
}
