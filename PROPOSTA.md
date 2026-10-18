# Sistema de Comissão das Congregações — diagnóstico e proposta

Documento de análise, sem nenhuma alteração de código. Base: o backend e o frontend em `financeiro-backend/` e `financeiro-frontend/`, as duas planilhas, e os bancos de dados do repositório.

---

## 1. O achado que muda a prioridade de tudo

Antes de qualquer proposta de melhoria, três fatos medidos:

O **banco de dados do sistema está vazio**. Zero registros em todas as nove tabelas, nos três arquivos `.db` do repositório (`data/financeiro.db`, `financeiro-backend/data/financeiro.db`, `test.db`). O sistema está publicado, tem Docker, tem `atualiza.sh` com backup e seed, e nunca recebeu um lançamento real.

A planilha **`Comissão do 9.xlsx` também está vazia**. Doze meses de estrutura, fórmulas corretas, proteção de células, portal de acesso, instruções de virada de ano — e todos os doze meses com relatório semanal em zero e nenhuma despesa lançada.

A planilha **`Relatório Financeiro 2026.xlsx` é a única coisa viva**: 1.217 lançamentos reais, nove meses, quatro congregações, R$ 200.423,63 em contribuições.

A conclusão é desconfortável mas útil: existem três sistemas, dois estão vazios e o que funciona é o do tesoureiro. O problema não é falta de software. O problema é que **o software existente não entrega a única informação que o dirigente precisa**, e eu vou mostrar exatamente onde isso quebra.

---

## 2. O sistema já calcula a comissão. E nunca mostra.

Esta é a falha central, e ela é pequena de corrigir.

O backend calcula a comissão corretamente. Em `crud.py:533`, dentro de `recalcular_saldos_mes`, a cada lançamento de renda ou despesa o sistema recalcula semana a semana: soma a renda bruta, aplica 33%, subtrai as despesas, encadeia o saldo para a semana seguinte e fecha o mês. O valor fica gravado em `Semana.comissao` e em `Semana.saldo_final_semana`. A conta está certa e é a conta que você descreveu.

O frontend recebe esse valor e o joga no lixo. O campo `comissao` existe em `lib/types.ts:45`, existe em `AnaliseMes.totais.comissao`, existe `taxa_comissao` — e tem **zero renderizações em todo o frontend**. Em `GestaoMes.tsx`, que é a tela principal do tesoureiro, a semana mostra "+ Rendas", "- Despesas" e "Fim", e pula exatamente a linha da comissão. A palavra "caixa" aparece uma única vez no código inteiro, dentro de um texto decorativo de um componente que não é importado por ninguém.

Ou seja: o dirigente não sabe quanto tem em caixa porque **a tela não mostra**, não porque o sistema não saiba. O número está no banco, trafega pela API e morre no componente.

Junto com isso, três ausências de papel:

O papel **dirigente não existe**. Os papéis são `administrador`, `supervisor_denominacao`, `supervisor_area` e `tesoureiro`. Busquei "dirigente" no projeto todo: nenhuma ocorrência. A pessoa que administra os 33% não tem login.

O **pastor não tem nenhuma tela financeira**. O `PainelAdministrador` é cem por cento cadastral: cria área, cria congregação, cria usuário. Um `supervisor_area` ou `supervisor_denominacao` não vê um único número de dinheiro no sistema. A função `listarMeses` exige uma congregação específica, então não existe nem a possibilidade técnica de uma visão consolidada da área.

Não existe **importador de planilha**. Verifiquei: `openpyxl`, `pandas`, `read_excel`, `csv` — nenhuma ocorrência no backend. O único upload que existe é `/restore/`, que substitui o banco inteiro por um arquivo `.db`.

---

## 3. O que as planilhas dizem sobre o dinheiro

Números extraídos de `Relatório Financeiro 2026.xlsx`, janeiro a setembro de 2026, já com as datas corrigidas:

| | Valor |
|---|---|
| Dízimos (902 lançamentos) | R$ 169.183,11 |
| Ofertas (315 lançamentos) | R$ 31.240,52 |
| **Total das contribuições** | **R$ 200.423,63** |
| Comissão 33% (caixa dos dirigentes) | R$ 66.139,80 |
| Salário do pastor da área, 20% | R$ 40.084,73 |

O caixa que cada dirigente deveria ter administrado no período, por congregação:

| Congregação | Entrou | 33% do dirigente |
|---|---|---|
| 9 | R$ 85.839,20 | R$ 28.326,94 |
| 13 | R$ 87.038,51 | R$ 28.722,71 |
| 17 | R$ 13.336,62 | R$ 4.401,08 |
| 23 | R$ 14.209,30 | R$ 4.689,07 |

São R$ 66 mil que passaram pela mão de quatro dirigentes em nove meses sem nenhum deles ter como consultar o próprio saldo. É a dimensão real do problema.

A planilha tem 320 contribuintes distintos. Isso é o cadastro de dizimistas pronto, só esperando importação.

### Um lançamento que você deveria olhar

Na congregação 13, agosto, linha 75: uma **oferta de R$ 15.000,00** classificada como "Oferta Ordinária", recibo 65753, dia 31/08. A mediana das ofertas é R$ 31,75 — esse lançamento é 472 vezes a mediana, e sozinho ele responde por 90% de tudo que a congregação 13 arrecadou em ofertas naquele mês (R$ 16.712 de um total de R$ 16.712, sendo R$ 1.712 todo o resto).

Não mexi nele, porque é valor e não data, e porque pode ser legítimo (uma doação, a venda de algo, uma campanha). Mas ele infla a comissão de agosto em R$ 4.950 e distorce qualquer comparação entre meses. Vale confirmar com o tesoureiro da 13 se é real, e se for, se devia estar classificado como oferta ordinária.

---

## 4. As datas que corrigi

Você pediu para corrigir as datas erradas usando os números de recibo. Fiz isso. Encontrei 28 lançamentos com data ausente ou impossível e corrigi todos, em uma **cópia nova** — o arquivo original não foi alterado.

O método: os recibos são sequenciais por congregação e acompanham o tempo, então eles funcionam como âncora. Reconstruí a série recibo → data de cada congregação a partir dos 1.189 lançamentos com data válida, identifiquei as faixas de talonário, e usei a posição do recibo problemático dentro da faixa para deduzir a data.

Seis correções de confiança alta, onde o recibo confirma a data de forma inequívoca:

| Aba | Célula | Era | Virou | Por quê |
|---|---|---|---|---|
| C09-08-26 | F71 | 2026-04-02 | 2026-08-02 | O recibo 18643 fica entre o 18642 e o 18644, ambos de 02/08. Mês digitado errado, dia correto. |
| C09-09-26 | F73 | 2026-07-06 | 2026-09-06 | Recibo 18708, vizinhos 18707 e 18709 são de 06/09. |
| C9-04-3-26 | G7 | 2026-01-03 | 2026-04-03 | Recibo 33493, vizinhos de 03/04. |
| C17-03-26 | G9 | 2026-08-03 | 2026-03-03 | Recibo 203444, vizinhos de 03/03. Provável troca de dia e mês. |
| C17-01-26 | G8 | `04/01/` (texto) | 2026-01-04 | Data incompleta digitada como texto, completada com o ano. |
| C9-02-26 | G30 | vazia | 2026-02-15 | Recibo 33383, entre o 33382 e o 33384, ambos de 15/02. |

Cinco de confiança média, deduzidas pelos vizinhos cronológicos do mesmo bloco — incluindo a célula F60 de C9-02-26, que tinha `1900-01-21`, resultado clássico de um número digitado numa célula formatada como data.

E dezessete de confiança baixa, que são **lançamentos sem data e sem recibo**. Doze deles estão em sequência na congregação 9, maio (células G49 a G60, de "Maria José" a "Marly Santos", somando R$ 3.405,70). Para esses não há como deduzir o dia: só sei que estão no fim do bloco de maio, depois do último lançamento datado (28/05). Atribuí essa data e marquei como baixa confiança. **Esses doze merecem conferência contra os recibos físicos**, se existirem.

Verificação do resultado: as 28 datas gravadas corretamente, **nenhum valor monetário alterado** (comparei célula por célula, 36 abas), as 390 fórmulas preservadas, as 3 imagens embutidas preservadas, a proteção das planilhas preservada, e zero datas inválidas restantes. O total de R$ 200.423,63 é idêntico antes e depois — como deve ser, já que mexi só em datas.

Cada correção está registrada numa aba nova chamada **Auditoria de Datas** dentro da própria planilha, com valor antigo, valor novo, confiança e o critério usado. Também exportei como CSV.

### Uma coisa que notei e não corrigi

As fórmulas de consolidação da área estão frágeis de um jeito que vai dar problema. Elas são escritas à mão em cada aba de janeiro, referenciando as outras três congregações por nome literal: `=S75+'C13-09-26'!S67+'C17-09-23'!S67+'C23-09-23'!S67`. Três consequências:

As abas foram renomeadas sem padrão (`C9-04-3-26`, `C17-09-23`, `C23-09-23` — essas duas últimas terminam em 23 em vez de 26), e a célula de origem muda de aba para aba (ora `L56`, ora `S67`, ora `L58`), porque as linhas foram inseridas em momentos diferentes. Qualquer linha nova desloca a referência e ninguém percebe.

Os rótulos estão errados por cópia: a aba de setembro da congregação 13 diz "Total da Área em Janeiro", e sete outras abas repetem rótulos de meses errados. Como essas células não têm fórmula, são só texto morto — mas quem lê a planilha não sabe disso.

Não corrigi porque mexer nessas fórmulas é mudar a estrutura da planilha, e isso precisa da sua decisão. Se o sistema assumir a consolidação, elas deixam de importar.

---

## 5. O que precisa ser dito sobre segurança

Três itens que não são opinião de estilo.

**A chave secreta do sistema está publicada no repositório.** Em `security.py:11`, `SECRET_KEY = "09d25e094faa6ca2556c818166b7a9563b93f7099f6f0f4caa6cf63b88e8d3e7"`, em texto puro, versionada no git. Com essa chave, qualquer pessoa que tenha acesso ao repositório gera um token de superusuário válido e entra como dono da plataforma, em qualquer denominação. O arquivo até importa `os`, mas nunca usa — a intenção de ler de variável de ambiente ficou no meio do caminho. Isso precisa ser trocado por uma chave nova em variável de ambiente, e a chave atual deve ser considerada comprometida.

**Há uma chave de API do Google em `docs/config-yaml.txt`**, igualmente versionada, repetida em vários blocos do arquivo. Se essa chave é real e está ativa, ela deve ser revogada no console do Google, porque está exposta no histórico do git e assim permanece mesmo que o arquivo seja apagado hoje.

**O isolamento entre denominações tem furos.** O mais direto: `GET /denominacoes/` não filtra nada e devolve todas as denominações da plataforma, com áreas e congregações aninhadas, para qualquer usuário autenticado — um tesoureiro enxerga a estrutura de todas as igrejas do sistema. Além disso, `GET /meses/{id}/semanas/` não tem nenhuma verificação de permissão, só exige um token válido: qualquer usuário logado lê os saldos e a comissão de qualquer congregação de qualquer denominação. E o padrão de verificação usado nos endpoints financeiros é negativo — `if ... and current_user.funcao == 'tesoureiro'` — então ele barra o tesoureiro de outra congregação e deixa passar um supervisor de outra denominação.

Para um sistema cujo propósito é tirar o monopólio da informação financeira de uma pessoa, essas falhas são o oposto do objetivo: hoje qualquer login vê o dinheiro de todo mundo.

---

## 6. Bugs reais, com localização

Três que afetam o funcionamento, e um que afeta o seu backup.

**Despesa recorrente não funciona pela API.** Em `main.py:1248`, o endpoint instancia `models.Despesa` manualmente com quatro campos e descarta `recorrente` e `periodicidade`. O schema aceita os campos, o `MANUAL_API.md` documenta que funciona, existe um endpoint para duplicar recorrentes, e o frontend nem tem o campo no formulário. O único teste que cobre recorrência chama `crud.create_despesa` direto, pulando o endpoint — então o bug passa verde no `pytest`.

**Congregação sem área derruba o servidor.** Em cinco lugares a autorização navega `congregacao.area.denominacao_id`, mas `Congregacao.area_id` é opcional. Quando a congregação não tem área, `area` é `None` e o acesso ao atributo levanta exceção: HTTP 500 em `/dizimistas/{id}` e `/rendas/{id}`. O caminho certo existe e é mais curto: `congregacao.denominacao_id`, que é obrigatório.

**O backup não copia o banco em uso.** `/backup/` e `/restore/` apontam para `./financeiro.db`, mas `database.py` abre `./data/financeiro.db`. São arquivos diferentes, com schemas diferentes — confirmei que o primeiro tem o schema antigo, sem `is_active` nem `fechado`. Então o backup pela interface baixa um arquivo velho e o restore grava num lugar que a aplicação não lê. O `atualiza.sh` faz o backup certo, por fora, com `tar` na pasta `financeiro_data` — esse funciona. Mas a tela de backup, que aliás **não está acessível na interface** (o componente `PainelBackup.tsx` está pronto e não é importado por ninguém), daria ao usuário uma falsa sensação de segurança.

**Dinheiro está em `Float`.** Todos os valores e saldos usam ponto flutuante binário, que não representa decimais exatamente. Os saldos são encadeados de semana em semana e de mês em mês, então o erro de arredondamento se acumula indefinidamente. Já aparece nos dados: `2.703` numa linha de dízimo, e comissões como `1630.0680000000002`. Para dinheiro, o correto é `Numeric`/`Decimal` ou centavos inteiros.

---

## 7. Proposta

Pelas suas respostas, o desenho fica assim: a comissão continua **semanal, sobre o que entra na semana** — ou seja, a regra que o backend já implementa está correta e a planilha é que simplifica. O sistema cuida **apenas do caixa do dirigente (33%)**, sem modelar os outros 67%. E o **tesoureiro lança**, o **dirigente e o pastor consultam**, com o **pastor da área podendo lançar e corrigir qualquer congregação** da área dele.

Isso tem uma consequência boa: o dirigente é um papel só de leitura. Você não precisa de telas novas de lançamento para ele, precisa de **uma tela de consulta que mostre o que já está calculado**. É muito menos trabalho do que parecia.

### Fase 1 — Fazer aparecer o que já existe

O menor trabalho com o maior efeito. Criar o papel `dirigente`, somente leitura, com escopo na própria congregação. Mostrar na tela da semana a linha da comissão que hoje é omitida, e no topo do mês um painel com quatro números: quanto entrou, quanto são os 33%, quanto já foi gasto, e **quanto sobra para gastar** — que é a pergunta real do dirigente. Trocar o componente de análise que está em uso pelo que está órfão, que é mais completo e já tem os cartões de totais prontos.

Nada disso exige mudança no banco nem na regra de cálculo. É exibir o que a API já responde.

### Fase 2 — Tirar a chave do repositório e fechar os furos

Chave nova em variável de ambiente, chave antiga invalidada, chave do Google revogada. Verificação de permissão nos endpoints que não têm, e troca das verificações negativas por positivas: em vez de barrar o tesoureiro de fora, permitir só quem é de dentro. Isso é pré-requisito para o sistema receber dado real: enquanto qualquer login vê o dinheiro de todos, ele não pode substituir a planilha.

### Fase 3 — Importar a planilha

Um importador que leia o formato real do `Relatório Financeiro`, que agora está mapeado: blocos de dízimo e de oferta localizados pelos marcadores `Qtde Dizimistas` e `Data`, nome da aba dando congregação e mês, recibo como chave para não duplicar. Traz os 320 contribuintes, os 1.217 lançamentos e os nove meses de histórico. Com isso o sistema deixa de estar vazio e o dirigente passa a ver o saldo real dele, não um sistema em branco pedindo cadastro.

O importador precisa de dois cuidados que os dados mostraram ser necessários: um relatório de conferência comparando o total importado com o total da planilha, e uma normalização dos tipos de oferta — hoje há **29 variações de texto para cerca de oito conceitos reais** ("Culto de Celebração", "Culto Celebração", "C. Celebração", "Cultyo de Celebração" são a mesma coisa; "Culro de Doutrina" e "Culto de Doutrina" também). Como `tipo` é texto livre tanto na planilha quanto no banco, qualquer relatório agrupado por tipo sai errado. Vale resolver na importação e, no cadastro, trocar texto livre por lista fechada.

### Fase 4 — Visão do pastor

A tela que hoje não existe: o pastor abre e vê as quatro congregações da área lado a lado, com o que entrou, o caixa de cada dirigente, o que foi gasto e o saldo. É o que a planilha tenta fazer com `=S75+'C13-09-26'!S67+...` e falha, porque é fórmula escrita à mão referenciando aba por nome.

### Fase 5 — Dívida técnica, quando houver dado real rodando

Valores em decimal em vez de `Float`, com reprocessamento dos saldos. Mês com ano e número em vez de texto livre (hoje `Mes.nome` é string, e como o encadeamento de saldo usa a ordem de inserção, criar "Janeiro" depois de "Fevereiro" corrompe a cadeia em silêncio). Datas de semana como data em vez de texto. Taxa de comissão configurável, porque hoje os 33% estão escritos em quatro lugares do código — e a planilha `Comissão do 9`, ironicamente, já faz melhor: a taxa está na célula `D5` e as fórmulas a referenciam. Correção dos bugs da seção 6. Migrações com Alembic, que já está instalado e não é usado, em vez do script caseiro que só funciona em SQLite e derruba a aplicação no import se encontrar uma coluna obrigatória sem valor padrão.

---

## 7.1 Duas funcionalidades que você pediu depois da análise

### Foto do recibo original, contra a fraude do papel-carbono

Você descreveu o problema certo: bloco de 3 vias com carbono, e um cartão entre as vias deixa o tesoureiro escrever um valor na via do contribuinte e outro nas vias que ficam com ele. A segunda via só chega para você na prestação de contas — tarde demais para impedir, a tempo só de descobrir.

A foto resolve a parte que é possível resolver por software: criar prova do que foi escrito no momento em que foi escrito, antes de qualquer segunda chance de alterar. Desenho:

No momento de lançar a renda no sistema, o tesoureiro anexa uma foto do recibo (celular, a própria tela de lançamento abre a câmera). O sistema grava essa imagem associada ao lançamento — mesmo registro de `Renda`, um campo novo de anexo, não uma tabela nova. A foto fica carimbada com data e hora do upload, que não é algo que o tesoureiro controla.

Quando a segunda via física chega para você, a tela de conferência mostra lado a lado: o valor lançado no sistema, a foto do recibo anexada, e um campo para você marcar "confere" ou "não confere". Se não confere, fica registrado qual lançamento está em disputa — você não precisa decorar nem catalogar à mão.

O que isso garante e o que não garante: garante que existe uma prova datada do que foi escrito antes da via sair de mãos do tesoureiro — se a foto mostra R$ 100 e a segunda via física mostra R$ 150, a manipulação ficou documentada. Não garante que o tesoureiro não possa fraudar antes de fotografar — ele ainda escreve primeiro e fotografa depois. Reduz a janela de fraude a quase zero, não a elimina, porque elimina-la por completo exigiria o contribuinte fotografar a própria via, o que está fora do seu controle.

Trabalho real: um campo de upload de imagem por lançamento (não existe hoje — o único upload do sistema inteiro é `/restore/`, que troca o banco inteiro), armazenamento das imagens em disco com referência no banco, e uma tela de conferência comparando foto × valor lançado. Médio porte, não trivial, mas bem delimitado.

### PDF mensal de dizimistas por congregação, sem valores

Essa é mais simples e você já validou que funciona: é exatamente o que a sua planilha faz manualmente hoje, e ajuda a motivar contribuição porque o dizimista se vê na lista.

O sistema já tem os três dados que a lista precisa — `nome` (via `DizimistaOfertante`), `numero_recibo` e `data_registro` (ambos em `Renda`) — e já gera PDF (balancete do mês usa `fpdf2`). É o mesmo mecanismo, um template novo: puxa as rendas do mês de uma congregação, mostra nome, recibo e data, omite valor, agrupa por congregação, um botão "Gerar lista do mês" ao lado do que já existe para o balancete.

Cabe na Fase 1, junto com fazer a comissão aparecer: é a mesma classe de trabalho, exibir o que o banco já tem.



**Não criaria um sistema novo.** O backend já tem a hierarquia certa (denominação, área, congregação), o cálculo certo e 1.649 linhas de teste. O problema está na camada de exibição e em permissões, não na modelagem.

**Não modelaria os outros 67%**, conforme você decidiu. Mas registro o efeito colateral: como só os 33% entram no caixa, o sistema nunca mostra a renda bruta e o saldo na mesma conta. Isso já aparece como inconsistência no gráfico de `/meses/{id}/analises`, que plota entradas brutas e acumula saldo pela comissão — dois eixos diferentes no mesmo desenho. Vale decidir se o gráfico mostra bruto ou comissão, e rotular com clareza.

**Não migraria para Postgres agora.** SQLite com quatro congregações e mil lançamentos por ano está folgado. Vira problema quando houver escrita concorrente de várias congregações ao mesmo tempo, porque cada lançamento dispara o recálculo em cascata dos saldos do mês. Quando chegar lá, o impeditivo não é o banco, é o `migrations.py`, que ignora qualquer dialeto que não seja SQLite e sai em silêncio sem aplicar nada.

**Não investiria na planilha `Comissão do 9`.** Ela está bem feita — proteção de células, portal de acesso, instruções de virada de ano sem macro — e está completamente vazia. Ela é a tentativa de resolver em Excel exatamente o que o sistema deve resolver. Manter as duas é garantir que as duas fiquem desatualizadas.

---

## 9. Resumo

O sistema já calcula a comissão corretamente e não a mostra em lugar nenhum. O papel de dirigente não existe. O pastor não tem nenhuma tela com números. Não há importador, então a planilha do tesoureiro continua sendo a verdade. A chave secreta está no repositório e qualquer login autenticado consegue ler o dinheiro de qualquer congregação.

O caminho mais curto até a sua dor — o dirigente saber quanto tem e quanto pode gastar — é a Fase 1, que é trabalho de tela sobre dados que a API já devolve. Mas ela só vale se vier junto com a Fase 2, porque colocar dado financeiro real num sistema onde todo mundo vê tudo trocaria um problema de transparência por um problema de privacidade.

As 28 datas foram corrigidas, documentadas uma por uma e verificadas: nenhum valor alterado, fórmulas e imagens intactas, nenhuma data inválida restante.
