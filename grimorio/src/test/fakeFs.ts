import type { FsBridge } from '../lib/fsBridge'

/**
 * Opções do fake. O default reproduz o comportamento histórico (caixa sensível), que as suítes
 * antigas assumem sem dizer.
 */
export interface OpcoesFakeFs {
  /**
   * `'insensivel'` imita o NTFS, onde o cofre de verdade mora: `Gandalf.png` e `gandalf.png` são o
   * MESMO arquivo, a grafia gravada é preservada, e renomear só a caixa (`a.png` -> `A.png`) é uma
   * renomeação de verdade, não um no-op. Sem isto, teste de colisão por maiúscula/minúscula e de
   * troca só de caixa passa no fake e quebra no disco do usuário.
   *
   * Grafia depois de escrever por cima de um arquivo que já existe com outra caixa, a mesma de
   * `src-tauri/src/lib.rs`: `writeBinaryBase64` e `copyFile` abrem o arquivo existente
   * (`std::fs::write` / `std::fs::copy`) e mantêm a grafia antiga; `writeTextAtomic` e `rename`
   * terminam num `std::fs::rename` e ficam com a grafia pedida. Pastas no meio do caminho sempre
   * herdam a grafia da pasta que já existe.
   */
  caixa?: 'sensivel' | 'insensivel'
}

/**
 * FsBridge em memória. Chaves = caminhos com '/' normalizado.
 *
 * Binário é guardado BYTE A BYTE: `writeBinaryBase64` decodifica o base64 e grava uma string em que
 * cada caractere é um byte (0-255). Comparar `arquivos` antes e depois prova igualdade byte a byte,
 * e `sha256` devolve o mesmo hash que o disco daria. `binarios` diz quais chaves são binárias —
 * texto conta bytes em UTF-8, binário conta caracteres.
 */
export function criarFakeFs(opcoes: OpcoesFakeFs = {}): FsBridge & {
  arquivos: Map<string, string>
  binarios: Set<string>
  atrasoEscritaMs: number
  /** SHA-256 hex minúsculo do conteúdo no caminho, com a mesma assinatura de `PortasOrganizar.hash`. */
  sha256(path: string): Promise<string>
} {
  const arquivos = new Map<string, string>()
  const binarios = new Set<string>()
  const dirs = new Set<string>()
  const estado = { atrasoEscritaMs: 0 } // latência de escrita opt-in (0 = sem timer real)
  const insensivel = opcoes.caixa === 'insensivel'
  const norm = (p: string) => p.replace(/\\/g, '/')
  /** Forma de COMPARAÇÃO de um caminho. Nunca é gravada: a grafia gravada é sempre a original. */
  const chave = (p: string) => (insensivel ? p.toLowerCase() : p)
  const mesmo = (a: string, b: string) => chave(a) === chave(b)
  const dentro = (k: string, pasta: string) => chave(k).startsWith(chave(pasta) + '/')
  const todas = () => [...arquivos.keys(), ...dirs]

  /** Chave gravada do arquivo que responde por `p`, ou `undefined`. */
  function acharArquivo(p: string): string | undefined {
    if (!insensivel) return arquivos.has(p) ? p : undefined
    for (const k of arquivos.keys()) if (mesmo(k, p)) return k
    return undefined
  }

  /**
   * Grafia com que `p` existiria no disco: cada segmento que já existe (como arquivo, pasta ou
   * prefixo de algum) herda a grafia gravada. Em caixa sensível é a identidade.
   */
  function grafiaExistente(p: string): string {
    if (!insensivel) return p
    const segs = p.split('/')
    const feitos: string[] = []
    for (let i = 0; i < segs.length; i++) {
      const candidato = [...feitos, segs[i]].join('/')
      const achado = todas().find((k) => mesmo(k, candidato) || dentro(k, candidato))
      feitos.push(achado === undefined ? segs[i] : achado.split('/')[i])
    }
    return feitos.join('/')
  }

  /** Pastas herdam a grafia existente; o último segmento fica como foi pedido. */
  function grafiaPedida(p: string): string {
    const corte = p.lastIndexOf('/')
    return corte < 0 ? p : grafiaExistente(p.slice(0, corte)) + p.slice(corte)
  }

  function gravar(p: string, conteudo: string, binario: boolean, manterGrafiaAntiga: boolean): void {
    const existente = acharArquivo(p)
    const alvo = existente !== undefined && manterGrafiaAntiga ? existente : grafiaPedida(p)
    if (existente !== undefined && existente !== alvo) {
      arquivos.delete(existente)
      binarios.delete(existente)
    }
    arquivos.set(alvo, conteudo)
    if (binario) binarios.add(alvo)
    else binarios.delete(alvo)
  }

  /**
   * Conteúdo gravado na chave `k`. Quem chama já achou a chave; se ela sumiu no meio (ex.: `rename`
   * de uma pasta para dentro dela mesma, que o disco também recusa), falha alto em vez de gravar
   * `undefined` como conteúdo.
   */
  function conteudoDe(k: string): string {
    const c = arquivos.get(k)
    if (c === undefined) throw new Error(`não existe: ${k}`)
    return c
  }

  function bytesDe(k: string): Uint8Array {
    const c = conteudoDe(k)
    if (!binarios.has(k)) return new TextEncoder().encode(c)
    const bytes = new Uint8Array(c.length)
    for (let i = 0; i < c.length; i++) bytes[i] = c.charCodeAt(i)
    return bytes
  }

  return {
    arquivos,
    binarios,
    get atrasoEscritaMs() {
      return estado.atrasoEscritaMs
    },
    set atrasoEscritaMs(ms: number) {
      estado.atrasoEscritaMs = ms
    },
    async sha256(path) {
      const k = acharArquivo(norm(path))
      if (k === undefined) throw new Error(`não existe: ${path}`)
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytesDe(k)))
      return [...digest].map((b) => b.toString(16).padStart(2, '0')).join('')
    },
    async readText(path) {
      const k = acharArquivo(norm(path))
      if (k === undefined) throw new Error(`não existe: ${path}`)
      return conteudoDe(k)
    },
    async writeTextAtomic(path, content) {
      // latência real (opt-in) para expor corridas de escrita em testes de serialização
      if (estado.atrasoEscritaMs > 0) await new Promise((r) => setTimeout(r, estado.atrasoEscritaMs))
      gravar(norm(path), content, false, false)
    },
    async writeBinaryBase64(path, base64) {
      // `atob` recusa base64 inválido, como o decode do Rust recusa.
      gravar(norm(path), atob(base64), true, true)
    },
    async listDir(path) {
      const base = norm(path).replace(/\/$/, '') + '/'
      const nomes = new Map<string, { name: string; isDir: boolean; k: string }>() // chave(nome) -> entrada
      for (const k of todas()) {
        if (!chave(k).startsWith(chave(base))) continue
        const resto = k.slice(base.length)
        const primeiro = resto.split('/')[0]
        if (!primeiro) continue
        const anterior = nomes.get(chave(primeiro))
        const isDir = resto.includes('/') || dirs.has(base + primeiro) || (anterior?.isDir ?? false)
        nomes.set(chave(primeiro), { name: anterior?.name ?? primeiro, isDir, k: base + primeiro })
      }
      // O fake não tem relógio: `mtime` sai `null`, que é exatamente o que o `list_dir` devolve
      // quando não consegue ler o metadado. Teste que depende de tamanho ou data injeta a
      // listagem direto, como `varrerCofre.test.ts` faz.
      return [...nomes.values()].map(({ name, isDir, k }) => {
        const arq = isDir ? undefined : acharArquivo(k)
        return { name, isDir, size: arq === undefined ? null : bytesDe(arq).length, mtime: null }
      })
    },
    async mkdirAll(path) {
      dirs.add(grafiaExistente(norm(path)))
    },
    async removePath(path) {
      const p = norm(path)
      for (const k of [...arquivos.keys()]) {
        if (mesmo(k, p) || dentro(k, p)) {
          arquivos.delete(k)
          binarios.delete(k)
        }
      }
      for (const d of [...dirs]) if (mesmo(d, p) || dentro(d, p)) dirs.delete(d)
    },
    async copyFile(from, to) {
      const origem = acharArquivo(norm(from))
      if (origem === undefined) throw new Error(`não existe: ${from}`)
      gravar(norm(to), conteudoDe(origem), binarios.has(origem), true)
    },
    async rename(from, to) {
      const f = norm(from)
      const t = norm(to)
      // rename(x, x) no fs real é no-op de sucesso; sem a guarda o delete apagaria o set.
      // Em caixa insensível, `a.png` -> `A.png` NÃO é o mesmo pedido: é troca de grafia e segue.
      if (t === f) return
      const movidos = [...arquivos.keys()].filter((k) => mesmo(k, f) || dentro(k, f))
      const pastas = [...dirs].filter((d) => mesmo(d, f) || dentro(d, f))
      if (movidos.length === 0 && pastas.length === 0) throw new Error(`não existe: ${from}`)
      // `std::fs::rename` no Windows substitui o arquivo de destino. Quem não pode sobrescrever
      // (o executor do organizador) tem de perguntar `exists` antes — e é isso que o teste prova.
      const destinoAntigo = acharArquivo(t)
      if (destinoAntigo !== undefined && !mesmo(destinoAntigo, f)) {
        arquivos.delete(destinoAntigo)
        binarios.delete(destinoAntigo)
      }
      const novo = grafiaPedida(t)
      const conteudos = movidos.map((k) => [k, conteudoDe(k), binarios.has(k)] as const)
      for (const [k] of conteudos) {
        arquivos.delete(k)
        binarios.delete(k)
      }
      for (const [k, c, bin] of conteudos) {
        const nk = novo + k.slice(f.length)
        arquivos.set(nk, c)
        if (bin) binarios.add(nk)
      }
      for (const d of pastas) dirs.delete(d)
      for (const d of pastas) dirs.add(novo + d.slice(f.length))
    },
    async exists(path) {
      const p = norm(path)
      return todas().some((k) => mesmo(k, p) || dentro(k, p))
    },
  }
}
