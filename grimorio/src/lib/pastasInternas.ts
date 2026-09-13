/**
 * Pasta de retratos. Comparada sem distinguir maiúscula porque o cofre vive em disco
 * Windows/macOS, onde `Assets` e `assets` são o MESMO diretório — filtrar só a grafia
 * minúscula deixaria a pasta reaparecer na árvore depois de um rename casual.
 */
const PASTA_DE_RETRATOS = 'assets'

/**
 * Pasta oculta por convenção (`.git`, `.obsidian`, `.trash`). Separada do resto porque quem
 * varre o disco precisa descartá-la ANTES de descer: `.git` pode ter milhares de arquivos.
 */
export function ehPastaComPonto(nome: string): boolean {
  return nome.startsWith('.')
}

/**
 * Decide se um diretório fica fora da barra lateral. Existe porque a árvore é montada a
 * partir do disco cru, e o disco tem pastas que são infraestrutura (retratos, `.git`,
 * `.obsidian`), não conteúdo do mestre — mostrá-las convida a "organizar" o que o app
 * gerencia sozinho. O diretório continua existindo e sendo usado; só não é exibido.
 *
 * `temMarcadorDeConteudo` é o que separa a pasta de retrato do conteúdo do mestre com o
 * MESMO nome: `slugify('Assets')` devolve `assets`, então um cenário ou pasta que o
 * usuário batiza de "Assets" vai parar num diretório idêntico ao de retratos. A diferença
 * está dentro — o app só grava imagem na pasta de retrato, e o conteúdo tem `cenario.json`,
 * `pasta.json`, ou algo que a árvore mostraria (ficha, cenário, subpasta) posto à mão no
 * disco. Sem essa distinção o conteúdo do usuário sumia da árvore sem erro nenhum.
 * Pasta com ponto é sempre infraestrutura: o marcador não a salva.
 */
export function ehPastaInternaDaArvore(nome: string, temMarcadorDeConteudo: boolean): boolean {
  if (ehPastaComPonto(nome)) return true
  return nome.toLowerCase() === PASTA_DE_RETRATOS && !temMarcadorDeConteudo
}
