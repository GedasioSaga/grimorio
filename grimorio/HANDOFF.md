# HANDOFF — Grimório (16/08/2026)

Retrato para retomar sem contexto. **Código ganha de qualquer afirmação daqui.**

## Estado

- Suíte: **1638 PASS / 0 FAIL**. `npx tsc --noEmit` limpo. `npm run build` verde.
- O `mapaComponentes.test.ts` **não era flaky por isolamento** — diagnóstico errado que circulou nesta sessão até ser conferido. Era TIMEOUT: o primeiro `import()` dele arrasta o subsistema de mapa inteiro (tldraw + 13 shapeUtils + ferramentas) e, sob a carga da suíte completa, passava dos 5s padrão. A falha aparecia como `Error: STACK_TRACE_ERROR` apontando para a linha de DECLARAÇÃO do teste, sem asserção nenhuma quebrada — é assim que timeout se disfarça de defeito de isolamento. Corrigido com `describe(..., { timeout: 30_000 }, ...)` só naquele arquivo; o resto da suíte segue em 5s, onde tempo ainda é sinal.
- **Nada commitado nesta leva** — ~90 arquivos entre modificados e novos na árvore de trabalho.
- Última versão publicada continua a **v0.9.1**. Os outros computadores ainda rodam código antigo.
- Grafo graphify em dia: 2869 nós, 7555 arestas.

## Leva mais recente — quatro queixas de mapa

| Queixa do usuário | Causa raiz | Agora |
|---|---|---|
| "As camadas simplesmente não funcionam" | `meta.camada` só era carimbada no NASCIMENTO da peça; não havia caminho para mudá-la depois | botão ⤵ por linha do painel move a seleção de camada, herdando trava/ocultação do destino; a linha da camada onde a seleção mora ganha um ponto dourado; cada linha mostra quantas peças tem; ordem se muda por ▲▼ **ou arrastando a linha** |
| "Ponho a porta numa camada superior e ela fica embaixo" | por projeto: `ordemMapa.ts` dizia que camada nunca mexe em `index`; só a banda do tipo decidia | camada virou a chave EXTERNA do empilhamento, banda a INTERNA — `rank = índiceCamada × 6 + rankBanda`. Diagrama: `docs/diagrams/empilhamento-mapa.html` |
| "Quero linhas e retângulos, escolhendo arredondado ou reto" | não existia; retângulo era o `geo` nativo, que não tem raio de canto | peça própria `retangulo-mapa` (canto, cor livre, espessura, preenchimento) + `strokeLinecap/linejoin` na linha; par de botões ⌐/◜ na barra vale para a seleção E para as próximas peças |
| "Escolho linha e a peça fica grudada na mão" | `line` do tldraw cria linha de comprimento ~zero no clique sem arrasto e continua armada (`toolStates/Pointing.ts`) | `LinhaMapaTool` troca só o estado `idle`: clique COLOCA um segmento de 2 quadrados centrado e volta para a seleção; arrasto e shift-emenda intocados |

Verificado no navegador (bancada), não só em teste: clique da linha, clique do retângulo, troca de canto lado a lado, ⤵ movendo peça de camada (inclusive saindo de camada TRAVADA), ▲ e ARRASTO reordenando camada, 👁 ocultando, e criar/renomear/excluir camada pelo painel.

Armadilha ao testar arrasto de camada à mão: com só DUAS camadas, metade dos gestos é legitimamente "soltar onde já estava" e não muda nada — parece defeito e não é. Crie uma terceira antes de concluir qualquer coisa.

### A primeira versão desta leva foi REPROVADA pelos critics — leia antes de mexer

Quatro critics adversariais de contexto fresco derrubaram a primeira implementação, com repro em vitest. **O buraco era um só, em quatro lugares:** todo o eixo ordem/camada escrevia com `editor.updateShapes` cru, e o tldraw **descarta em silêncio** qualquer update sobre shape travado (`Editor.ts:8447-8459`, só passa partial que traga `isLocked:false`). Como o cadeado do próprio `PainelCamadas` trava TODOS os shapes da camada, o subsistema que a leva veio consertar era o que se desligava:

| Sintoma | Causa |
|---|---|
| camada travada nunca reordenava, e `normalizarOrdemMapa` ainda REPORTAVA sucesso | falta de `ignoreShapeLock` |
| dois shapes com o mesmo `IndexKey`, gravados no arquivo | reindexação PARCIAL: os pulados guardavam índice da mesma faixa |
| clique com a Linha em camada travada deixava a linha degenerada, invisível E travada | o `updateShape` que estica era descartado |
| excluir camada travada deixava peça órfã travada para sempre | nenhum 🔓 alcança camada que não existe mais |
| Ctrl+Z revertia a normalização e devolvia a porta para baixo da sala | falta de `history: 'ignore'` |

Fechado por `OPCOES_ORDEM = { ignoreShapeLock: true, history: 'ignore' }` (`montagemMapa.tsx`), aplicado nos quatro sites. **Por que 1584 testes verdes não pegaram: nenhum criava shape com `isLocked: true` nem ligava `isToolLocked`** — os dois estados que a própria UI expõe por botão. A suíte media só o caminho feliz. Os testes novos (`camadasAcoesEditor.test.tsx`, e os casos de travado/tool-lock em `camadasOrdemEditor` e `ferramentasDesenhoMapa`) existem exatamente para isso: cada um falha se a flag sumir.

Outros achados confirmados e corrigidos na mesma rodada: normalização no `onMount` rodava com a pilha vazia e ACHATAVA o mapa por banda (sujando o doc e regravando o arquivo a cada abertura); a linha ignorava o cadeado de ferramenta; os botões de canto acendiam para peças sem canto; a inversão da convenção de ordem não tinha migração; o retângulo sumia com traço grosso em peça baixa; grupo movido de camada não levava os filhos.

E um defeito que os testes novos acharam sozinhos, PRÉ-EXISTENTE: **`meta` do tldraw é MESCLADA chave a chave** (`applyPartialToRecordWithProps`, `Editor.ts:10872-10879`), então `delete` numa cópia nunca removia a marca `travadoPelaCamada` do shape gravado — ela ficava para trás e um cadeado posto à mão DEPOIS seria solto pelo destravar seguinte da camada. Agora a marca é escrita como `false`.

### A bancada estava mentindo sobre o painel de camadas

Um juiz cego reprovou o painel comparando com o Photopea, e a razão principal era da BANCADA, não do app: criar e renomear camada usam `pedirTexto` (diálogo in-app do `dialogos.tsx`) e a bancada nunca montou `HostDialogos`/`HostEscolha` — o pedido abria e ninguém renderizava. Excluir usa o `ask` nativo do Tauri, que fora do Tauri estoura. Os três ficavam **inertes: clique sem resposta e sem erro visível**.

Corrigido em `amostra/AmostraApp.tsx` (monta os dois hosts, como o `App.tsx`) e no shim de `CenaOpcoes.tsx` (responde `plugin:dialog|*`). **Lição que vale além desta leva:** a bancada é a única superfície onde a interface é conferida fora do Tauri, então um controle que só funciona no app empacotado é um controle não verificado. Ao acrescentar UI que passa por diálogo, confira na bancada antes de dar por pronto.

## Sessão anterior

Seis frentes, todas pedidas pelo usuário exceto a bancada (que existe para tornar as outras verificáveis).

| Área | Antes | Agora |
|---|---|---|
| Aba Itens | fileira de chips de texto, emoji 💎 fixo, tudo igual | grade de inventário: arte por item, contador no canto, quantidade/remover no hover |
| Inventário no Personagem | não existia | `VersaoPersonagem.acervo` + aba "Itens" no `PerfilModal` |
| Localização | nenhuma indicação de onde a ficha mora | barra no topo das 3 fichas: caminho legível + mover + sub-cenário + absorver como versão |
| Mapa: linhas | cor fixa `#9fa8b2` | paleta fechada + cor livre, conta-gotas, borracha que corta trecho |
| Mapa: empilhamento | 3 `bringToFront` avulsos na criação | bandas semânticas em `ordemMapa.ts`, valendo sempre, com migração de mapa antigo |
| Modelo de IA do mapa | constante fixa no código | seletor próprio na aba IA, com "Automático" que não grava id |
| Verificação de UI | impossível (app só abre no Tauri) | bancada `amostra.html` com cenas `#ficha`, `#mapa`, `#opcoes` |

## Decisões que doeriam se revertidas sem saber por quê

Somam-se às dos handoffs anteriores.

1. **`montagemMapa.tsx` é fonte única da montagem do editor.** `MapaView` (app) e `CenaMapa` (bancada) consomem a MESMA lista de shapeUtils, tools e handler de criação. Antes a bancada remontava por fora e ficou para trás em uma única leva — ferramenta nova existia no app e não na bancada, e o teste julgava o editor velho. Se as duas divergirem de novo, a extração falhou.
2. **A bancada NÃO vai no build de produção.** `vite.config.ts` só a inclui com `GRIMORIO_BANCADA=1`. Ela monta dados falsos e expõe `window.__editorMapa`; nada disso tem por que viajar no instalador.
3. **`window.__editorMapa` existe só em `CenaMapa.tsx`.** O tldraw resolve forma por COORDENADA e captura ponteiro no container — seletor CSS não alcança o canvas, e evento sintético dá `NotFoundError: setPointerCapture`. Sem esse gancho não há automação possível do mapa. Nunca exponha equivalente no app real.
4. **Gravação pendente só sai da fila quando o disco CONFIRMA.** Flag `sujo` separada do timer, nos 3 modais e nos 5 `Set`s de `store.ts`. Custou 4 auditorias: a versão que zerava o timer antes do `await` fazia a segunda tentativa de mover reportar "nada pendente" e mover sem gravar. Quem re-otimizar isso reintroduz perda silenciosa de texto.
5. **Mover/absorver aborta se a gravação de segurança falhar.** Mover arquivo é adiável; perder texto não é. Falha na própria entidade bloqueia; falha em entidade alheia só avisa dizendo qual.
6. **Absorção grava o destino ANTES de mandar a origem para a lixeira.** Se falhar no meio, nada some — no máximo duplica.
7. **`redirecionarVinculosAbsorcao` recebe o LOTE de origens, não uma por vez.** Encadear a chamada fazia o vínculo do 2º sub-cenário colidir com o do 1º e ser descartado em silêncio. Em colisão intra-lote as notas se fundem; contra vínculo pré-existente do destino, mescla como antes.
8. **Cor de fundo do slot vem de paleta DISCRETA de 6 matizes a 60°.** Hash contínuo de matiz produzia pares quase iguais (dist. 16,6 entre poção e manto) — colisão era propriedade da abordagem, não azar. A garantia agora é geométrica: idêntico ou claramente distinto.
9. **Arte de inventário mora em `arteInventario.tsx`, não em `desenhoSimbolo.tsx`.** O segundo é código de mapa, compartilhado com a gaveta de peças; inchar ele tem consequência fora da ficha.
10. **Camada é a chave EXTERNA do empilhamento; banda é a INTERNA.** `rank = índiceCamada × BANDAS.length + rankBanda` (`ordemMapa.ts`). Multiplicar pelo número de bandas é o que garante que NENHUMA diferença de banda alcance a distância de uma camada — sem isso "camada manda" vira tendência, não regra. Quem trocar a ordem das duas chaves reintroduz a queixa "porta na camada de cima aparece embaixo".
11. **A lista `CanvasDoc.camadas` vai do FUNDO pro topo; o painel é que desenha invertido.** Três coisas dependem disso: `camadaDoShape` manda órfã para `camadas[0]` (o fundo, a "Base"); `criarCamada` acrescenta no fim, então camada nova nasce na FRENTE; `moverCamada(id,'cima')` anda para o fim do array. Desenhar na ordem crua faria o ▲ subir a linha e AFUNDAR a camada.
12. **O arrasto de camada usa MIME próprio (`application/x-grimorio-camada`).** O `.mapa-wrap` inteiro tem handlers de drop em fase de CAPTURA para soltar cenário/personagem/imagem no mapa (`dropsDeEntidade.tsx`), e eles decidem se engolem o evento OLHANDO O MIME. Um tipo desconhecido passa intacto — é o que mantém os dois arrastos isolados sem nenhum dos dois conhecer o outro. `text/plain` ali seria colisão na certa. `reordenarCamadaSoltando` fala em `antes`/`depois` na ordem da TELA e faz a inversão internamente: espalhar `length - 1 - i` pelo componente é como se erra metade dos casos de arrasto, e a remoção antes da inserção é o que evita o clássico "para uma posição antes do que mirei".
13. **`useCamadasMapa` (`lib/camadasMapaEditor.tsx`) é fonte única das camadas, como `montagemMapa.tsx` é da montagem.** `MapaView` passa `persistir`; a bancada não passa nada. Enquanto isso viveu dentro do `MapaView`, camada era a única parte grande do mapa impossível de ver funcionando fora do Tauri.
14. **`LinhaMapaTool` reescreve só o estado `idle` e reaproveita o `pointing` nativo, buscado por `id` em `LineShapeTool.children()` — nunca por posição no array.** Copiar o `pointing` nativo significaria manter ~90 linhas de máquina de estados da biblioteca — e este projeto já pagou por reimplementar a linha uma vez (o cadáver `linha-mapa`). O `idle` é o único ponto onde dá para saber "houve clique que não virou arrasto", porque o arrasto termina em `select.dragging_handle` e nunca passa por lá.
15. **O canto do retângulo sai do `getDefaultProps`, não do `registerBeforeCreateHandler`.** No handler o canto JÁ teria sido preenchido pelo default e não haveria como distinguir "valor padrão" de "escolha que veio na forma" — sobrescrever sempre quebraria duplicar/colar um retângulo de canto diferente do ativo. A linha é o caso oposto: `meta` não ganha default de lugar nenhum, então ela é carimbada no handler.
16. **A cor da linha vive em `meta.corPersonalizada`, não em `props`.** `DefaultColorStyle` é validada contra 13 nomes fixos e rejeita hex; e dois shapeUtils com o mesmo `type` fazem `createTLStore` recusar. `LinhaMapaColoridaShapeUtil` ESTENDE a `LineShapeUtil` nativa (filtrada de `defaultShapeUtils`) só para trocar o `stroke` — herda handles e resize, que foi o motivo de a linha própria ter sido abandonada antes.

## Como verificar a interface (leia antes de dizer "não dá pra testar")

O app é Tauri: tudo passa por `invoke` e o seletor de cofre usa diálogo nativo, então `localhost:1420` num browser comum trava no `VaultPicker`. Dois harnesses resolvem:

```
# catálogo estático de peças do mapa
npx vitest run src/test/amostraMapa.test.ts   # gera .amostra/mapa.html
node scripts/servirAmostra.mjs                # serve em 127.0.0.1:4599

# bancada interativa (React real, sem Tauri) — dev server já serve
http://localhost:1420/amostra.html#ficha | #mapa | #opcoes
```

Diagrama do fluxo: `docs/diagrams/como-verificar.html`. Arquitetura: `mapa-subsistema.html`, `organizacao-entidades.html`.

Para dirigir o mapa por automação use `window.__editorMapa` (API do tldraw) — clique por seletor CSS NÃO funciona. Clique sintético só acerta se o marcador for filho de `.tl-background` com `position:absolute` calculado de `getBoundingClientRect()`; `fixed` erra porque um ancestral do tldraw tem `transform`.

## Pendências e riscos declarados

**Pré-existentes, NÃO introduzidos nesta leva — decisão do usuário se vale mexer:**

1. **`recarregarDoDisco` sobrescreve o cache sem guarda para modal aberto** (`store.ts:613-635`). Se um ciclo de sync baixar mudança de outro computador enquanto o usuário digita numa ficha, o campo volta ao valor antigo na tela e o debounce grava o valor revertido 800ms depois. `GrafoVinculos.tsx:183-198` tem guarda explícita contra esse mesmo caminho; as fichas não têm.
2. **Desmonte de modal faz `void salvar()` fire-and-forget** (`CenarioModal.tsx:104-109` e equivalentes). Se falhar, ninguém reagenda. Único gatilho hoje fora do fechar normal é `trocarCofre()`, que já documenta o risco.

**Da leva de mapa (camadas/formas), declarados — nenhum é regressão, são deltas conhecidos:**

a. **Retângulo `geo` de mapa ANTIGO não ganha canto arredondado.** O `geo` do tldraw não tem raio de canto, e converter em `retangulo-mapa` perderia rótulo/fill/dash da peça. Os botões de canto ficam DESABILITADOS com esse tipo selecionado (antes acendiam e não faziam nada). Converter sob demanda, com aviso, é o próximo passo se incomodar.
b. **`LINHA_COMPRIMENTO_MINIMO` é 4px de página fixo**, enquanto o limiar de arrasto do tldraw é `4/zoom`. Em zoom alto e com o cadeado de ferramenta ligado, um arrasto muito curto pode ser lido como clique e virar segmento padrão.
c. **`RetanguloMapaShapeUtil` não declara `static migrations`** — consistente com os outros shapes próprios do projeto, mas vira armadilha no dia em que `cantos`/`espessura` mudarem de forma.
d. **Botões só-glifo (▲▼👁🔒🗑⤵, ⌐◜) não têm `aria-label`/`aria-pressed`.** Leitor de tela anuncia o nome Unicode do símbolo; `title` não aparece no foco por teclado.
e. **A LISTA de camadas está fora do desfazer.** Criar, renomear, reordenar e excluir camada rodam com `history: 'ignore'` (`OPCOES_ORDEM`) porque a lista não vive no store do tldraw — vive no `atom` e no arquivo do cofre. Consequência para quem usa: um Ctrl+Z logo depois de excluir uma camada não a traz de volta; ele desfaz a ação ANTERIOR, o que confunde. Não é meio-desfazer (verificado: todo o caminho de exclusão é ignorado pelo histórico), e o estrago é contido — a exclusão pede confirmação e as peças MIGRAM para a camada herdeira em vez de sumir. Colocar a lista na pilha de undo do tldraw é projeto, não polimento.

f. **Não há histórico nomeado das ações de camada** (o Photopea registra "Ordem de Camada", "Alterar Nome"…).

**Como a comparação cega terminou:** três rodadas contra o Photopea, cada uma perdida por um gap DIFERENTE — nunca secou, e cada gap virou trabalho: 1ª não dizia o que havia em cada camada → contagem por linha; 2ª truncava o nome em ~7 caracteres → item em duas fileiras; 3ª não tinha arrastar para reordenar → arrasto com traço de inserção. **Na 4ª rodada o nosso venceu às cegas**, pelo que o painel do Photopea não tem: para onde vai a próxima peça, quantas peças cada camada guarda, em qual camada está a seleção, e ação por linha em vez de cluster no topo.

**Da leva anterior, declarados:**

3. `absorverCenario` não é idempotente — retry após falha parcial duplicaria versões no destino.
4. `redirecionarSalasDeCenario` é best-effort: documento canvas corrompido deixa a sala órfã em silêncio.
5. Restaurar da lixeira devolve a origem, mas NÃO desfaz a fusão no destino. O aviso na tela já diz isso.
6. Repertório de arte do inventário cobre 14 categorias; escudo, armadura, elmo, anel, amuleto e cajado ainda caem no ícone genérico.
7. `npm run build` avisa que o bundle passa de 500 kB (pendência antiga).

## Como o inventário foi julgado

5 rodadas de comparação cega contra o inventário do Resident Evil 2 (`.amostra/referencias/bar-inventario-re2.png`). Perdeu 4, venceu a 5ª com 0 erros de identificação em 5 células contra 1 confusão confirmada na referência. O gap mudou em toda rodada — glifo repetido → cor de fundo por família → cores de hash vizinhas → ícone que não parece o objeto. A vitória é por margem: a contagem não foi simétrica, porque o nosso tem nome embaixo do slot e a referência não tem.

## Contexto operacional

- Convenções: pt-BR; TDD nas libs puras; `npx tsc --noEmit` + `npx vitest run` antes de cada commit; **API do tldraw sempre conferida em `node_modules/`** (v4.5.12).
- Cofre do usuário: `C:\Users\gedasio.filho\OneDrive - Vertis Capital\Documentos\Grimorio`.
- Ao mudar aparência, **pedir referência visual antes de implementar**.
- Publicar versão: subir `version` em `src-tauri/tauri.conf.json`, commit, push, `gh workflow run release.yml`, testar o rascunho, `gh release edit v<version> --draft=false`.
