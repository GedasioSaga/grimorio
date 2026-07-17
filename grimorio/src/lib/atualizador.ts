/**
 * Auto-atualização via GitHub Releases. No start, pergunta ao backend se há uma
 * versão publicada mais nova (endpoint em tauri.conf.json > plugins.updater);
 * se houver e o usuário aceitar, baixa, instala e reinicia.
 *
 * check() só funciona no app empacotado com updater configurado — em dev, sem
 * rede ou sem release publicada ele lança. Tratamos como "nada a fazer": a falha
 * é silenciosa (nunca um erro na cara do usuário por não haver atualização).
 */
import { check } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { ask, message } from '@tauri-apps/plugin-dialog'

export async function checarAtualizacao(): Promise<void> {
  let atualizacao
  try {
    atualizacao = await check()
  } catch {
    return // updater indisponível (dev/sem rede/sem release): silencioso
  }
  if (!atualizacao) return

  const notas = atualizacao.body ? `\n\n${atualizacao.body}` : ''
  const querAtualizar = await ask(
    `Versão ${atualizacao.version} do Grimório disponível. Baixar e instalar agora?${notas}`,
    { title: 'Atualização disponível', kind: 'info' },
  )
  if (!querAtualizar) return

  try {
    await atualizacao.downloadAndInstall()
    await relaunch()
  } catch (e) {
    await message(`Não foi possível concluir a atualização: ${e}`, {
      title: 'Grimório',
      kind: 'error',
    })
  }
}
