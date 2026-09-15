# Manual do Usuário (Frontend) - Sistema Financeiro Eclesiástico

Bem-vindo ao manual de uso do frontend do sistema financeiro. Este guia prático foi criado para ajudar tesoureiros e administradores a navegarem e utilizarem as funcionalidades da aplicação de forma eficiente.

---

## 1. Primeiros Passos e Acesso

A aplicação é uma plataforma web. Acesse a URL fornecida pela administração da sua igreja.
Logo na tela inicial, você verá o formulário de login.

### Como fazer login:
1. Digite o seu **E-mail** cadastrado.
2. Digite sua **Senha**.
3. Clique em **Entrar**.
*Se as credenciais estiverem corretas, você será redirecionado para o painel correspondente ao seu nível de acesso (ex: Painel do Tesoureiro).*

---

## 2. Visão do Tesoureiro (O dia a dia)

Ao logar como **Tesoureiro**, você verá um painel dividido em duas abas principais: **Financeiro (Meses)** e **Dizimistas / Ofertantes**.

### Aba 1: Dizimistas / Ofertantes (Cadastro de Membros)
Recomendamos que você cadastre os membros da sua congregação antes de começar a lançar finanças.

*   **Para Cadastrar:** Preencha o formulário à esquerda ("Novo Dizimista/Ofertante") com Nome, E-mail e Telefone, e clique em "Cadastrar".
*   **Para Excluir:** Na lista à direita, encontre o nome do membro e clique no botão de lixeira (apenas se ele não possuir rendas vinculadas).

### Aba 2: Financeiro (Meses)
Esta é a área onde toda a movimentação financeira acontece. O trabalho é organizado por Meses e Semanas.

#### 1. Criar um Novo Mês
No topo da tela, no cartão "Iniciar Novo Mês", digite o nome do mês (ex: `Fevereiro/2024`), confira o saldo inicial sugerido e clique em **Criar Mês**.

#### 2. Abrir uma Nova Semana
1. Encontre o mês desejado na lista abaixo e clique sobre ele para expandir os detalhes.
2. Ao final da lista de semanas (se houver), clique no botão tracejado **"+ Adicionar Semana"**.
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

---

## 3. Fechamento de Mês e Relatórios

Esta é a etapa mais importante para a segurança e transparência financeira.

### Como gerar o Relatório (Balancete) em PDF
1. Expanda o painel do mês desejado.
2. No topo direito do painel cinza do mês, clique no botão **"Gerar PDF"**.
3. Uma nova aba do seu navegador se abrirá exibindo o relatório formatado e pronto para impressão ou envio por WhatsApp/Email.

### O Fechamento do Mês (Cadeado)
Após lançar todas as rendas e despesas do mês, bater o caixa físico e gerar o relatório em PDF final para prestação de contas, você deve **Fechar o Mês**.

1. Clique no botão **"Fechar Mês"** (que fica ao lado do botão de PDF).
2. O sistema pedirá uma confirmação.
3. **ATENÇÃO:** Ao fechar o mês, ele fica com um cadeado vermelho na lista. Isso significa que os botões de "+ Nova" Renda ou Despesa, bem como os botões de exclusão (lixeiras) sumirão. Ninguém poderá alterar os valores daquele mês para garantir a fidelidade do relatório impresso.

### Errei e fechei o mês. O que fazer?
Tesoureiros não podem reabrir meses. Caso um erro grave seja detectado após o fechamento, você deve entrar em contato com o **Administrador** do sistema. Apenas usuários logados como Administrador visualizarão o botão **"Reabrir Mês (Admin)"** na interface.

---

## 4. Dicas Rápidas
*   **Recálculo Automático:** Você não precisa calcular nada. A cada renda ou despesa excluída ou inserida, o sistema recalcula todos os saldos em tempo real.
*   **Mensagens Verdes e Vermelhas:** Fique de olho no canto da tela. O sistema usa notificações (toasts) para avisar quando algo deu certo (verde) ou quando houve um erro (vermelho), como esquecer de preencher um campo obrigatório.
