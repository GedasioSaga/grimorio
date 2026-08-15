// Servidor estatico minimo: o Playwright recusa `file:`, entao as paginas de amostra
// do mapa precisam sair por HTTP. Serve a propria pasta do script.
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = fileURLToPath(new URL('../.amostra/', import.meta.url))
const TIPOS = { '.html': 'text/html; charset=utf-8', '.svg': 'image/svg+xml', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png' }

createServer(async (req, res) => {
  const caminho = decodeURIComponent((req.url ?? '/').split('?')[0])
  // normalize + prefixo obrigatorio: sem isso, `../` no pedido sairia da pasta servida
  const alvo = normalize(join(RAIZ, caminho === '/' ? 'index.html' : caminho))
  if (!alvo.startsWith(RAIZ)) {
    res.writeHead(403).end('fora da raiz')
    return
  }
  try {
    const corpo = await readFile(alvo)
    res.writeHead(200, { 'content-type': TIPOS[extname(alvo)] ?? 'application/octet-stream' }).end(corpo)
  } catch {
    res.writeHead(404).end('nao achei')
  }
}).listen(4599, () => console.log('servindo em http://127.0.0.1:4599'))
