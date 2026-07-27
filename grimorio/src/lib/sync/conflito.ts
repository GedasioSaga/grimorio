import type { Vinculo } from '../types'
import { adicionarVinculo, normalizarVinculos } from '../vinculos'

/**
 * Política de conflito — a metade PURA. Decide, sem tocar disco nem rede: que tratamento cada
 * arquivo merece, como a cópia perdedora se chama, quem a assina e como o conteúdo dela é
 * transformado. Quem executa é `preservar.ts`, do mesmo jeito que `reconciliar` decide e
 * `executar` faz.
 *
 * O motor escolhe um vencedor e converge — mas o perdedor precisa sobreviver ANTES disso. A API
 * v3 do Drive não tem escrita condicional (sem ETag, sem If-Match), então perda de escrita é
 * estruturalmente possível: a cópia de conflito não é um mimo, é a única rede de proteção. E o
 * conteúdo aqui é a campanha que o usuário escreveu à mão.
 */

/**
 * O que fazer com o lado perdedor, por tipo de arquivo. Vem da tabela "Política de conflito por
 * tipo de arquivo" do design.
 *
 * - `entidade` — personagem, cenário, canvas, página de caderno. A cópia ganha **id novo**, senão
 *   o app passa a ter duas entidades com o mesmo id e uma some da sidebar sem explicação
 *   (`store.ts` indexa `personagens[id]`).
 * - `uniao` — só `vinculos.json`. É um índice, não conteúdo autoral: duplicá-lo não ajuda
 *   ninguém, e vínculo é conjunto — união é a semântica certa.
 * - `metadado` — `campanha.json`, `pasta.json`, `cofre.json`. Vence a mais recente, sem cópia:
 *   não há texto do usuário a perder, e uma cópia aqui só geraria lixo invisível (nada no app lê
 *   um `pasta (conflito …).json`).
 * - `binario` — imagem e qualquer não-JSON. Cópia com sufixo, sem mexer no conteúdo. Ela nasce
 *   ÓRFÃ: o JSON da entidade aponta para um caminho só, e esse caminho é o do vencedor.
 */
export type Politica = 'entidade' | 'uniao' | 'metadado' | 'binario'

/** Único arquivo do cofre que resolve por união. Mora na raiz (`vaultRepo.lerVinculos`). */
export const ARQUIVO_DE_VINCULOS = 'vinculos.json'

/** Arquivos que só carregam metadado — vencem por data e não deixam cópia. */
const METADADOS = new Set(['campanha.json', 'pasta.json', 'cofre.json'])

/**
 * Cenário é o único caso em que a entidade é um DIRETÓRIO: `montarArvoreCenarios` reconhece um
 * cenário pela presença deste arquivo dentro da pasta. Uma cópia irmã (`cenario (conflito …).json`)
 * não seria lida por ninguém — a cópia tem de ser uma pasta irmã.
 */
const ARQUIVO_DE_CENARIO = 'cenario.json'

/**
 * Prefixo do nome da entidade copiada, para o usuário reconhecer a cópia dentro do app.
 *
 * Exportado porque a aba Nuvem lista as cópias procurando por ele. Enquanto estava privado,
 * o texto vivia escrito em dois lugares, e mudá-lo aqui faria a lista parar de encontrar as
 * cópias sem nenhum erro — elas ficariam no disco, invisíveis para quem precisa achá-las.
 */
export const PREFIXO_DE_NOME = '(conflito)'

/** Assinatura de quando o Drive não disse de que computador veio a versão que perdeu. */
export const AUTOR_DESCONHECIDO = 'outro computador'

function nomeDeArquivo(caminho: string): string {
  return caminho.slice(caminho.lastIndexOf('/') + 1)
}

/** Pasta-mãe de um caminho relativo canônico; `''` para arquivo na raiz do cofre. */
function pastaDe(caminho: string): string {
  const corte = caminho.lastIndexOf('/')
  return corte < 0 ? '' : caminho.slice(0, corte)
}

function juntar(pasta: string, nome: string): string {
  return pasta === '' ? nome : `${pasta}/${nome}`
}

/**
 * Como tratar o perdedor deste caminho.
 *
 * A classificação é por NOME DE ARQUIVO, não pela posição na árvore, porque é o nome que
 * determina a forma do conteúdo — e a árvore ainda vai mudar (spec "campanha em pasta"). Um
 * `.json` que não é metadado nem índice é entidade: personagem, cenário, sessão, canvas ou página
 * de caderno, todos `{ id, nome|titulo, … }`.
 */
export function politicaDoCaminho(caminho: string): Politica {
  if (caminho === ARQUIVO_DE_VINCULOS) return 'uniao'
  const nome = nomeDeArquivo(caminho)
  if (METADADOS.has(nome)) return 'metadado'
  return nome.toLowerCase().endsWith('.json') ? 'entidade' : 'binario'
}

/**
 * Quem assina a cópia — o nome do computador de onde veio a edição que PERDEU.
 *
 * O manifesto só conhece o `deviceNome` desta máquina. Quando o local vence, quem perde é a
 * versão remota, e o nome dela vem do `appProperties` que cada upload grava no arquivo do Drive
 * (`EstadoRemoto.deviceNome`). Arquivo enviado por uma versão anterior do app não tem essa
 * propriedade, e aí a assinatura cai no genérico — melhor do que mentir dizendo que a edição veio
 * daqui. `lastModifyingUser` não resolveria: é a mesma conta Google nas duas pontas.
 */
export function assinaturaDoPerdedor(
  vencedor: 'local' | 'remoto',
  deviceLocal: string,
  deviceRemoto: string | undefined,
): string {
  if (vencedor === 'remoto') return deviceLocal
  return deviceRemoto !== undefined && deviceRemoto !== '' ? deviceRemoto : AUTOR_DESCONHECIDO
}

function doisDigitos(n: number): string {
  return String(n).padStart(2, '0')
}

/**
 * `26-07 14h32` — dia-mês e hora, no fuso do computador.
 *
 * Curto de propósito: o carimbo entra num nome de arquivo que o usuário vai ler na sidebar, e
 * ano/segundos não ajudam a distinguir duas cópias que ele acabou de gerar. A desambiguação de
 * verdade é a numeração de `nomeDaCopia`.
 */
function carimbo(quando: Date): string {
  const dia = doisDigitos(quando.getDate())
  const mes = doisDigitos(quando.getMonth() + 1)
  return `${dia}-${mes} ${doisDigitos(quando.getHours())}h${doisDigitos(quando.getMinutes())}`
}

/**
 * Nome da cópia de conflito, na `tentativa`-ésima tentativa (0 = a primeira).
 *
 * Previsível por construção: mesmo caminho, mesma assinatura e mesmo minuto dão sempre o mesmo
 * nome. Isso é o que permite ao chamador procurar um nome livre incrementando `tentativa` em vez
 * de inventar sufixo aleatório — e duas cópias do MESMO arquivo no mesmo minuto é caso real, não
 * hipótese: o executor documenta que uma preservação bem-sucedida seguida de transferência
 * falhada deixa o conflito de pé e o ciclo seguinte gera outra cópia.
 *
 * Cenário é a exceção de forma. Como a entidade é a pasta (é `cenario.json` dentro dela que a
 * define), a cópia é uma PASTA irmã — um arquivo irmão não apareceria na árvore, e cópia que o
 * usuário não vê equivale a dado perdido.
 */
export function nomeDaCopia(
  caminho: string,
  assinatura: string,
  quando: Date,
  tentativa: number,
): string {
  const ordinal = tentativa > 0 ? ` (${tentativa + 1})` : ''
  const marca = `(conflito — ${assinatura} ${carimbo(quando)})${ordinal}`
  const nome = nomeDeArquivo(caminho)
  const pasta = pastaDe(caminho)

  if (nome === ARQUIVO_DE_CENARIO && pasta !== '') {
    return juntar(juntar(pastaDe(pasta), `${nomeDeArquivo(pasta)} ${marca}`), ARQUIVO_DE_CENARIO)
  }
  const corte = nome.lastIndexOf('.')
  const base = corte <= 0 ? nome : nome.slice(0, corte)
  const extensao = corte <= 0 ? '' : nome.slice(corte)
  return juntar(pasta, `${base} ${marca}${extensao}`)
}

/** Só prefixa uma vez: reconflitar a cópia não produz "(conflito) (conflito) Gandalf". */
function prefixar(nome: unknown): string | null {
  if (typeof nome !== 'string') return null
  return nome.startsWith(PREFIXO_DE_NOME) ? nome : `${PREFIXO_DE_NOME} ${nome}`
}

/**
 * Transforma o JSON do perdedor na cópia: **id novo** e nome prefixado.
 *
 * Devolve `null` quando o conteúdo não é um objeto JSON com `id` de texto — aí não há identidade
 * a trocar, e quem chama grava o perdedor tal e qual. Preservar vem antes de embelezar.
 *
 * O id novo é a razão de ser desta função. `carregarPersonagens` monta `personagens[id]` e
 * `caminhoPorId[id]`: duas entidades com o mesmo id fariam uma delas sumir da sidebar em
 * silêncio — o conteúdo estaria no disco e invisível, que é o mesmo que perdido.
 *
 * O nome da versão ativa é prefixado JUNTO quando ele espelha o nome de topo. Personagem guarda o
 * nome na forma ativa e o replica no topo, e `salvarPersonagem` reescreve o topo a partir dela em
 * TODA gravação: prefixar só o topo daria um rótulo que some no primeiro autosave da cópia.
 * Cenário não cai nesse caso — as versões dele se chamam "Base", "Dia", "Noite".
 */
export function marcarComoCopia(conteudo: string, novoId: string): string | null {
  let lido: unknown
  try {
    lido = JSON.parse(conteudo)
  } catch {
    return null
  }
  if (typeof lido !== 'object' || lido === null || Array.isArray(lido)) return null
  const obj = lido as Record<string, unknown>
  if (typeof obj.id !== 'string' || obj.id === '') return null

  const nomeOriginal = obj.nome
  const copia: Record<string, unknown> = { ...obj, id: novoId }
  const nome = prefixar(obj.nome)
  if (nome !== null) copia.nome = nome
  // página de caderno chama de `titulo` o que o resto do cofre chama de `nome`
  const titulo = prefixar(obj.titulo)
  if (titulo !== null) copia.titulo = titulo

  if (Array.isArray(obj.versoes) && typeof obj.versaoAtivaId === 'string') {
    copia.versoes = obj.versoes.map((v: unknown) => {
      if (typeof v !== 'object' || v === null) return v
      const versao = v as Record<string, unknown>
      if (versao.id !== obj.versaoAtivaId || versao.nome !== nomeOriginal) return versao
      const nomeDaVersao = prefixar(versao.nome)
      return nomeDaVersao === null ? versao : { ...versao, nome: nomeDaVersao }
    })
  }
  return JSON.stringify(copia, null, 2)
}

/**
 * União dos vínculos dos dois lados, com dedupe por `(deId, paraId, tipo)`.
 *
 * `vinculos.json` é um índice de um conjunto, e conjunto se resolve por união: escolher um lado
 * jogaria fora relações que o usuário criou no outro. O preço é que **remoção de vínculo não
 * atravessa um conflito** — se um PC apagou um vínculo e o outro não, a união o traz de volta.
 * É a troca que o design escolheu, e é a barata das duas: refazer uma remoção custa um clique,
 * refazer vinte relações não.
 *
 * Os dois lados passam por `normalizarVinculos`, que DESCARTA em silêncio tipo de vínculo que não
 * conhece. Um cofre escrito por uma versão mais nova do app perderia relações aqui — é para isso
 * que existe o `versaoMinima` do `cofre.json`, e é ele que tem de barrar antes de chegar aqui.
 */
export function unirVinculos(local: unknown, remoto: unknown): { vinculos: Vinculo[] } {
  const daqui = normalizarVinculos(local)
  return { vinculos: normalizarVinculos(remoto).reduce(adicionarVinculo, daqui) }
}
