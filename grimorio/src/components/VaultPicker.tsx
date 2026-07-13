import { open } from '@tauri-apps/plugin-dialog'
import { useApp } from '../state/store'

export function VaultPicker() {
  const abrirCofre = useApp((s) => s.abrirCofre)

  async function escolher() {
    const dir = await open({ directory: true, title: 'Escolha a pasta do seu cofre' })
    if (typeof dir === 'string') await abrirCofre(dir)
  }

  return (
    <div className="vault-picker">
      <h1>Grimório</h1>
      <p>Escolha uma pasta para guardar suas campanhas. Pode ser uma pasta nova ou um cofre existente (ex.: dentro do OneDrive para usar em dois computadores).</p>
      <button onClick={escolher}>Escolher pasta do cofre</button>
    </div>
  )
}
