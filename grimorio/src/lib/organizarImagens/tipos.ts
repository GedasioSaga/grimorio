import type { FsBridge } from '../fsBridge'

/**
 * Contrato do motor que organiza as imagens do cofre.
 *
 * O motor tem duas metades que não se conhecem: quem PLANEJA (lê o cofre e decide para onde
 * cada imagem vai) e quem EXECUTA (move, reescreve referências, guarda diário para desfazer).
 * Este arquivo é a única coisa que as duas compartilham. O executor não sabe por que uma imagem
 * vai para um lugar; o planejador não sabe como o arquivo chega lá.
 *
 * Nenhum arquivo do motor importa `@tauri-apps`: o app injeta `tauriFs` + `hashArquivo`, o CLI de
 * disco real injeta `node:fs` + `node:crypto`, e os testes injetam `criarFakeFs()`.
 *
 * Convenção de caminho em todo o contrato: `rel` é relativo à raiz do cofre, separado por '/',
 * sem barra inicial, em NFC — exatamente a string que os JSON do cofre guardam em `retrato`,
 * `imagens[].rel`, `meta.rel` do tldraw e `data-rel` das notas. Caminho absoluto é sempre
 * `${raiz}/${rel}`, como `caminhoAbsolutoImagem` (`lib/caminhos.ts`) já faz.
 */

/** I/O que o motor usa. Tudo que toca disco passa por aqui. */
export interface PortasOrganizar {
  fs: FsBridge
  /** SHA-256 hex (minúsculo) do conteúdo do arquivo no caminho absoluto dado. */
  hash(caminhoAbsoluto: string): Promise<string>
}

/** Mover um arquivo de imagem de `de` para `para`, ambos `rel`. */
export interface Movimento {
  de: string
  para: string
  /** Conteúdo do arquivo quando o plano foi feito. O executor recusa mover se mudou. */
  sha256: string
}

/**
 * Troca de uma referência dentro de um arquivo de texto do cofre.
 *
 * Regra da troca (executor): num `.json`, todo valor de string IGUAL a `de` vira `para`
 * (comparação do valor inteiro, nunca substring — `a.png` não pode casar com `aa.png`); dentro
 * de qualquer valor de string com HTML, e em arquivo `.html`, o atributo `data-rel="<de>"`
 * (com escape de HTML) vira `data-rel="<para>"`. Nada mais no arquivo muda de valor.
 */
export interface ParTroca {
  de: string
  para: string
}

/** Todas as trocas de um arquivo de texto, feitas de uma vez. */
export interface Reescrita {
  /** `rel` do arquivo que cita as imagens (JSON de entidade, snapshot de canvas, entrada da lixeira, nota). */
  arquivo: string
  pares: ParTroca[]
}

/** Arquivo que sai do cofre (vai para a quarentena do diário; nunca é apagado direto). */
export interface Remocao {
  rel: string
  sha256: string
  motivo: 'copia-de-imagem-com-dono' | 'duplicata-interna'
  /** `rel` (depois do plano) da cópia que continua no cofre com o mesmo conteúdo. */
  mantida: string
}

export interface Plano {
  versao: 1
  /**
   * Determinístico: hash do cofre (caminho sem caixa nem barra) e do conteúdo do plano. Mesmo cofre +
   * mesmas sugestões = mesmo id; duas cópias do cofre em pastas diferentes nunca dividem o id.
   */
  id: string
  /**
   * Impressão do cofre no momento do plano. `aplicar` recalcula e recusa se não bater: o cofre
   * mudou entre a revisão e a execução, e o plano revisado já não descreve a realidade.
   */
  hashEntrada: string
  movimentos: Movimento[]
  reescritas: Reescrita[]
  remocoes: Remocao[]
  /** Coisas que o usuário precisa saber e o motor não resolve (ex.: referência que já estava quebrada). */
  avisos: string[]
  /**
   * Imagens de mesmo conteúdo que ficaram separadas por serem de donos diferentes: juntar faria
   * trocar a de um estragar a do outro. Cada grupo tem dois `rel` ou mais (de antes do plano), em
   * ordem, e os grupos vêm em ordem pelo primeiro. Fica fora de `avisos` porque num cofre de verdade
   * são dezenas, e a tela os resume numa linha só para não enterrar os avisos que pedem ação.
   */
  repetidasEntreDonos: string[][]
}

/** Onde e com o quê o executor trabalha. */
export interface OpcoesExecucao {
  /** Caminho absoluto da raiz do cofre. */
  raiz: string
  /**
   * Pasta absoluta do diário desta execução, FORA do cofre (não sincroniza; desfazer é por máquina).
   * Ex.: `%APPDATA%/com.gedasio.grimorio/organizar/<plano.id>`.
   */
  dirDiario: string
  portas: PortasOrganizar
  /** Progresso para a interface. `fase` é legível ('movendo', 'reescrevendo', ...). */
  aoProgresso?: (feito: number, total: number, fase: string) => void
  /**
   * Chamado uma vez, com o diário já gravado e antes de a primeira imagem sair do lugar: é onde o app
   * anota esta organização como a última do cofre, para o botão de desfazer achá-la mesmo se o app
   * cair no meio. Se falhar, o executor recusa sem mexer no cofre.
   */
  registrarDesfazer?: () => Promise<void>
}

export type FaseExecucao = 'preparado' | 'movendo' | 'reescrevendo' | 'removendo' | 'verificando' | 'concluido'

export interface ResultadoExecucao {
  fase: FaseExecucao
  movidos: number
  reescritos: number
  removidos: number
  /** Problemas encontrados na verificação final. Vazio = tudo no lugar. */
  problemas: string[]
}
