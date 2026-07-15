/**
 * Copia a imagem em `src` para o clipboard do SO como PNG.
 *
 * Passa por Blob + createImageBitmap para evitar canvas "tainted" (o bitmap vem
 * de um Blob, sem origem de rede) e converte qualquer formato para PNG (exigência
 * do clipboard). O `ClipboardItem` recebe uma PROMISE de Blob: assim
 * `navigator.clipboard.write` é chamado de forma síncrona dentro do gesto do
 * usuário (Ctrl+C), preservando a user-activation — senão o WebView pode recusar
 * a escrita ("document is not focused") após o await do fetch.
 */
export async function copiarImagemParaClipboard(src: string): Promise<void> {
  const pngBlob = (async (): Promise<Blob> => {
    const resp = await fetch(src)
    if (!resp.ok) throw new Error(`fetch falhou: ${resp.status}`)
    const bitmap = await createImageBitmap(await resp.blob())
    try {
      const canvas = document.createElement('canvas')
      canvas.width = bitmap.width
      canvas.height = bitmap.height
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('sem contexto 2d')
      ctx.drawImage(bitmap, 0, 0)
      return await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob falhou'))), 'image/png'),
      )
    } finally {
      bitmap.close()
    }
  })()
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })])
}
