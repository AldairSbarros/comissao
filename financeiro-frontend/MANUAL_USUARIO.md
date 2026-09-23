# Manual do Usuário (Frontend) - Sistema Financeiro Eclesiástico

Bem-vindo ao manual de uso do frontend do sistema financeiro. Este guia prático foi criado para ajudar tesoureiros, administradores e o superusuário da plataforma a navegarem e utilizarem as funcionalidades da aplicação de forma eficiente.

> **Visão geral do fluxo:** o sistema é **multitenant**. O **superusuário** (dono da plataforma) cadastra as **denominações** e seus administradores. Cada **administrador de denominação** cria áreas, congregações e usuários (ex: tesoureiros). Cada **tesoureiro** faz os lançamentos financeiros da sua congregação. Siga as seções na ordem para configurar tudo do zero.

---

## 1. Primeiros Passos e Acesso

A aplicação é uma plataforma web. Acesse a URL fornecida pela administração da sua igreja.

### 1.1. Inicialização do Sistema (apenas na primeira vez)

Na primeira execução, quando ainda não existe nenhum superusuário, a tela de **Inicialização do Sistema** é exibida automaticamente.

1. Informe o **E-mail** e a **Senha** do **Superusuário da Plataforma**.
2. Clique em **Concluir Inicialização**.
3. O superusuário é o dono do sistema, tem acesso total e **não pertence a nenhuma denominação**.
4. Depois do setup, você é redirecionado para a tela de login.

> O setup só pode ser executado uma única vez. Se já existir um superusuário, a tela de login normal é exibida.

### 1.2. Como fazer login

Na tela de login:

1. Digite o seu **E-mail** cadastrado.
2. Digite sua **Senha**.
   - **Mostrar/ocultar senha:** clique no ícone de **olho** à direita do campo para ver a senha digitada (útil para conferir se digitou certo).
3. Clique em **Entrar**.

*Se as credenciais estiverem corretas, você será redirecionado para o painel correspondente ao seu nível de acesso:*

| Perfil | Painel exibido |
| :--- | :--- |
| Superusuário | **Painel Master** (gestão da plataforma) |
| Administrador / Supervisores | Painel de supervisão da denominação |
| Tesoureiro | **Painel do Tesoureiro** (lançamentos financeiros) |

### 1.3. Mensagens de erro no login

O sistema avisa claramente o que aconteceu:

- **"Email ou senha incorretos"** — as credenciais estão erradas. Confira o e-mail e a senha (use o ícone de olho para conferir a senha).
- **"Acesso suspenso. Por favor, entre em contato com o suporte."** — a sua denominação foi desativada pelo superusuário.
- **"Não foi possível conectar ao servidor"** — o backend está fora do ar. Verifique com a administração.

### 1.4. Esqueci minha senha

Por segurança, a recuperação de senha **não é feita pelo sistema** (não há envio de e-mail). Se você esqueceu a senha:

1. Clique no link **"Esqueci minha senha"** abaixo do campo de senha na tela de login.
2. Uma janela explicará que a redefinição deve ser feita pelo **administrador** da sua denominação, área ou congregação.
3. Entre em contato com o administrador para que ele redefina a sua senha.

---

## 2. Painel Master (Superusuário)

Ao logar como **Superusuário**, você acessa o **Painel Master**, o painel de gestão de toda a plataforma.

### O que você vê

- **Indicadores (KPIs):** total de denominações, tenants ativos, tenants suspensos e volume financeiro global.
- **Gráfico de crescimento:** novas denominações cadastradas ao longo do tempo.
- **Ranking:** top 5 denominações mais ativas (por total de transações).
- **Informações do sistema:** tamanho do banco de dados e total de usuários.

### 2.1. Criar uma nova Denominação (Tenant) e seu Administrador

Esta é a ação principal do superusuário. Em uma única operação, o sistema cria a denominação **e** o administrador dela.

1. No cartão **"Criar Nova Denominação (Tenant)"**, preencha:
   - **Nome da Denominação** (ex: `Assembleias de Deus`).
   - **E-mail do Administrador** (ex: `admin@denominacao.com`).
   - **Senha do Administrador** (obrigatória, não pode ser vazia).
2. Clique em **Criar Denominação**.
3. O administrador criado **pertence ao tenant** e **não** tem privilégios de superuser.
4. Anote o e-mail e a senha do administrador — será com eles que essa denominação fará login.

> O superusuário pode criar quantas denominações quiser.

### 2.2. Ativar / Desativar, Renomear e Excluir uma Denominação

Na tabela **"Denominações Criadas"**, cada linha tem as ações disponíveis:

- **Ativar / Suspender:** o superusuário pode suspender o acesso de uma denominação. Um tenant **inativo** não permite que seus usuários (exceto superusers) façam login — eles verão a mensagem *"Acesso suspenso"*.
- **Renomear:** altera o nome exibido da denominação. O nome deve ser único entre os tenants.
- **Excluir:** remove a denominação **e todos os seus dados** (usuários, áreas, congregações, meses, semanas, rendas e despesas) em cascata. A ação é **irreversível** — confirme com cuidado.

### 2.3. Gerenciar os Usuários de uma Denominação

Ao clicar em **Usuários** em uma denominação, abre um painel para gerenciar as contas daquela denominação:

- **Criar Usuário:** cadastre um novo usuário informando e-mail, senha inicial e **função**:
  - `administrador`, `supervisor_denominacao`, `supervisor_area` ou `tesoureiro`.
- **Redefinir Senha:** defina uma nova senha para um usuário (útil em suporte). A nova senha não fica visível após a ação.
- **Suspender / Ativar:** um usuário **suspenso** não consegue fazer login. O superusuário da plataforma nunca é suspenso.

### 2.4. Personificar um usuário (suporte)

Para fins de suporte e depuração, o superusuário pode "entrar" em uma conta de outro usuário (personificação), gerando um token de acesso para aquela conta.

- Clique em **Ver** na linha do usuário para personificá-lo. Você será levado ao painel daquela conta.
- Enquanto personificado, um banner âmbar aparece no topo: **"Você está personificando {e-mail}"**, com o botão **Voltar ao modo superuser**.
- Clique em **Voltar ao modo superuser** para restaurar sua sessão de superusuário e retornar ao Painel Master — sem precisar sair e entrar de novo.

---

## 3. Configuração da Denominação (Administrador)

Depois que o superusuário criou a denominação, o **administrador dela** faz login e configura a estrutura antes de os lançamentos começarem.

1. **Criar Áreas Eclesiásticas:** agrupe congregações em áreas/zonas.
2. **Criar Congregações:** cadastre cada igreja/congregação, vinculando-a à denominação (e, se houver, à área).
3. **Criar Usuários:** cadastre os usuários com a função adequada e vincule-os à estrutura:
   - **`administrador`**: acesso total à denominação.
   - **`supervisor_denominacao`**: acesso a todas as áreas e congregações da denominação.
   - **`supervisor_area`**: acesso às congregações da sua área.
   - **`tesoureiro`**: acesso **apenas** à sua congregação. Vincule o tesoureiro ao **ID da congregação** correspondente.

> **Dica:** para o tesoureiro conseguir fazer lançamentos, ele **precisa** estar vinculado a uma **congregação**. Sem congregação vinculada, o painel financeiro não carrega.

---

## 4. Visão do Tesoureiro (O dia a dia)

Ao logar como **Tesoureiro**, você verá um painel dividido em duas abas principais: **Financeiro (Meses)** e **Dizimistas / Ofertantes**.

### Aba 1: Dizimistas / Ofertantes (Cadastro de Membros)
Recomendamos que você cadastre os membros da sua congregação antes de começar a lançar finanças.

*   **Para Cadastrar:** Preencha o formulário ("Novo Dizimista/Ofertante") com Nome, E-mail e Telefone, e clique em "Cadastrar".
*   **Para Excluir:** Na lista, encontre o nome do membro e clique no botão de lixeira (apenas se ele não possuir rendas vinculadas).

### Aba 2: Financeiro (Meses)
Esta é a área onde toda a movimentação financeira acontece. O trabalho é organizado por Meses e Semanas.

#### 1. Criar um Novo Mês
No cartão "Iniciar Novo Mês", digite o nome do mês (ex: `Fevereiro/2024`), confira o saldo inicial sugerido e clique em **Criar Mês**.

#### 2. Abrir uma Nova Semana
1. Encontre o mês desejado na lista abaixo e clique sobre ele para expandir os detalhes.
2. Ao final da lista de semanas (se houver), clique no botão **"+ Adicionar Semana"**.
3. O sistema solicitará a **Data de Início** e a **Data de Fim** da semana. Preencha e confirme.

#### 3. Lançar Rendas (Entradas)
Rendas representam todo o dinheiro que entra na igreja.
1. Dentro do painel da Semana desejada, localize a coluna "Rendas Lançadas" e clique em **"+ Nova"**.
2. Uma janela (Modal) se abrirá. Preencha os dados:
    *   **Tipo de Renda:** Selecione (Dízimo, Oferta, Campanha, etc.).
    *   **Valor:** Digite o valor recebido.
    *   **Data do Recebimento:** Escolha o dia exato. *Atenção:* O calendário só permitirá escolher datas que pertençam àquela semana específica.
    *   **Método de Pagamento:** Pix, Espécie, Cartão, etc.
    *   **Dizimista / Ofertante:** Se a entrada foi de um membro específico, selecione-o na lista (opcional).
3. Clique em **"Lançar Renda"**. O saldo da semana e do mês será atualizado instantaneamente.

#### 4. Lançar Despesas (Saídas)
Despesas representam as contas pagas pela igreja.
1. Na mesma Semana, na coluna "Despesas Lançadas", clique em **"+ Nova"**.
2. Na janela que abrir, informe a **Descrição** (ex: Conta de Luz) e o **Valor**. A data é opcional.
3. Clique em **"Salvar Despesa"**.

> **Despesas recorrentes:** é possível marcar uma despesa como recorrente (semanal, quinzenal ou mensal). O sistema pode duplicá-la automaticamente para o próximo período.

---

## 5. Fechamento de Mês e Relatórios

Esta é a etapa mais importante para a segurança e transparência financeira.

### Como gerar o Relatório (Balancete) em PDF
1. Expanda o painel do mês desejado.
2. No topo do painel do mês, clique no botão **"Gerar PDF"**.
3. Uma nova aba do seu navegador se abrirá exibindo o relatório formatado e pronto para impressão ou envio por WhatsApp/Email.

### O Fechamento do Mês (Cadeado)
Após lançar todas as rendas e despesas do mês, bater o caixa físico e gerar o relatório em PDF final para prestação de contas, você deve **Fechar o Mês**.

1. Clique no botão **"Fechar Mês"** (que fica ao lado do botão de PDF).
2. O sistema pedirá uma confirmação.
3. **ATENÇÃO:** Ao fechar o mês, ele fica com um cadeado vermelho na lista. Isso significa que os botões de "+ Nova" Renda ou Despesa, bem como os botões de exclusão (lixeiras) somem. Ninguém poderá alterar os valores daquele mês para garantir a fidelidade do relatório impresso.

### Errei e fechei o mês. O que fazer?
Tesoureiros não podem reabrir meses. Caso um erro grave seja detectado após o fechamento, você deve entrar em contato com o **Administrador** do sistema. Apenas usuários com privilégio de administrador visualizarão o botão **"Reabrir Mês (Admin)"** na interface.

---

## 6. Dicas Rápidas
*   **Recálculo Automático:** Você não precisa calcular nada. A cada renda ou despesa excluída ou inserida, o sistema recalcula todos os saldos em tempo real.
*   **Mensagens Verdes e Vermelhas:** Fique de olho no canto da tela. O sistema usa notificações (toasts) para avisar quando algo deu certo (verde) ou quando houve um erro (vermelho), como esquecer de preencher um campo obrigatório.
*   **Senhas fortes:** use senhas fortes para todos os usuários. A senha só precisa ser não vazia, mas quanto mais forte, melhor.
*   **Isolamento de dados:** cada usuário só vê os dados da sua jurisdição. O tesoureiro não vê outras congregações; o supervisor de área não vê outras áreas, e assim por diante.