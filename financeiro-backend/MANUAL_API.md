# Manual de Integração e Uso da API - Controle Financeiro Eclesiástico

Bem-vindo ao manual da API do Sistema de Gestão Financeira Eclesiástica. Este documento tem como objetivo guiar desenvolvedores (Frontend, Mobile, ou integrações de terceiros) no uso correto dos endpoints, fluxos de autenticação e regras de negócio da aplicação.

---

## 1. Acesso Rápido e Documentação Interativa

A API foi construída usando FastAPI, o que significa que a documentação interativa baseada em OpenAPI está disponível nativamente.
Ao rodar o servidor localmente (ex: `uvicorn main:app --reload`), você pode acessar:

*   **Swagger UI (Recomendado para testes):** `http://127.0.0.1:8000/docs`
*   **ReDoc (Recomendado para leitura):** `http://127.0.0.1:8000/redoc`

---

## 2. Autenticação e Autorização (JWT)

A API utiliza tokens JWT (JSON Web Tokens) para segurança. Quase todos os endpoints exigem que o usuário esteja autenticado.

### Como Autenticar (Login)
1. Faça uma requisição `POST` para `/token`.
2. Envie os dados no formato `application/x-www-form-urlencoded` (Padrão OAuth2):
   * `username`: (E-mail do usuário)
   * `password`: (Senha do usuário)
3. A resposta será um JSON contendo o token:
   ```json
   {
     "access_token": "eyJhbGciOiJIUzI1NiIsInR5c...",
     "token_type": "bearer"
   }
   ```

### Como usar o Token
Em todas as requisições subsequentes para endpoints protegidos, envie o token no cabeçalho (Header) da requisição:
```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5c...
```

### Perfis de Acesso (RBAC)
O sistema bloqueia ações automaticamente dependendo do nível do usuário logado:
*   **`superuser`**: Dono da plataforma. Acesso total a **todas** as denominações. Não pertence a nenhum tenant. Criado apenas pelo setup inicial ou pelo script de seed. Exclusivo dos endpoints `/master/*`.
*   **`administrador`**: Acesso total ao sistema. Pode reabrir meses fechados.
*   **`supervisor_denominacao`**: Acesso total a todas as áreas e congregações pertencentes à sua Denominação.
*   **`supervisor_area`**: Acesso total a todas as congregações pertencentes à sua Área Eclesiástica.
*   **`tesoureiro`**: Acesso restrito *apenas* à sua própria Congregação. Não consegue ver dados de outras igrejas.

### Regras de Login
*   **Tenant inativo:** se o usuário **não** for superuser e a sua denominação estiver inativa (`is_active = false`), o login é bloqueado com `403` e a mensagem *"Acesso suspenso. Por favor, entre em contato com o suporte."*
*   **Credenciais inválidas:** e-mail ou senha incorretos retornam `401` com a mensagem *"Email ou senha incorretos"*.
*   **Mudar a própria senha:** `PUT /users/me/password` com `{ "senha_atual": "...", "nova_senha": "..." }`. Se a senha atual estiver errada, retorna erro.

### Setup Inicial (Público)
*   `GET /setup/status` → `{ "setup_complete": true|false }`. Indica se já existe um superusuário. O frontend usa isso para decidir entre a tela de setup e a de login.
*   `POST /setup/initialize` → cria **apenas** o superusuário da plataforma. Payload: `{ "superuser_email": "...", "superuser_password": "..." }`. Só pode ser chamado se nenhum superusuário existir. As denominações são criadas depois via `/master/tenants`.

### Painel Master (Exclusivo Superuser)
Todos os endpoints abaixo exigem um usuário `superuser` autenticado (senão retornam `403`):
*   `GET /master/stats` → estatísticas globais da plataforma (KPIs, crescimento mensal, ranking de tenants).
*   `GET /master/tenants` → lista todas as denominações (tenants).
*   `POST /master/tenants` → cria uma denominação **e** o administrador dela em uma transação. Payload: `{ "nome_denominacao": "...", "admin_email": "...", "admin_password": "..." }` (a senha do admin exige **mínimo de 12 caracteres**). O admin criado pertence ao tenant e **não** é superuser.
*   `PUT /master/tenants/{tenant_id}/status` → ativa/desativa um tenant. Payload: `{ "is_active": true|false }`.
*   `POST /master/users/{user_id}/impersonate` → gera um token JWT para "personificar" outro usuário (suporte/depuração).

---

## 3. Fluxo de Trabalho Típico (Passo a Passo)

Para entender como a API foi desenhada, siga este fluxo padrão de uso:

### Etapa 1: Setup Inicial (Superusuário)
Antes de qualquer coisa, o sistema precisa do superusuário da plataforma.
1.  **Verificar status:** `GET /setup/status` → se `setup_complete` for `false`, execute o setup.
2.  **Criar o Superusuário:** `POST /setup/initialize` (apenas uma vez).

### Etapa 2: Criar a Denominação (Tenant) e seu Administrador (Superuser)
1.  **Criar Tenant + Admin:** `POST /master/tenants` (nome da denominação, e-mail e senha do administrador). Em uma única transação, cria a denominação e o administrador dela.

### Etapa 3: Setup Estrutural (Apenas Admins/Supervisores)
Com o administrador do tenant logado, a estrutura física da igreja é criada.
1.  **Criar Área:** `POST /areas_eclesiasticas/` (vinculada à denominação)
2.  **Criar Congregação:** `POST /congregacoes/` (vinculada à denominação e opcionalmente à área)
3.  **Criar Usuários:** `POST /usuarios/` (Crie um usuário com função `tesoureiro` e vincule-o ao ID da Congregação criada).

### Etapa 4: Cadastro de Membros
Os tesoureiros devem cadastrar os membros que contribuem.
1.  **Criar Dizimista/Ofertante:** `POST /congregacoes/{id}/dizimistas/`

### Etapa 5: Operação Financeira Mensal
Este é o fluxo que o tesoureiro fará todas as semanas.

1.  **Abrir o Mês:** `POST /meses/` (Informa o nome do mês, ex: "Janeiro/2024", e a congregação).
2.  **Abrir uma Semana:** `POST /meses/{mes_id}/semanas/` (Informa o número da semana (1 a 5) e as datas de início e fim).
3.  **Lançar Rendas (Entradas):** `POST /semanas/{semana_id}/rendas/`
    *   *Regra:* A API validará se a data informada (`data_registro`) está dentro do período da semana aberta.
    *   *Dica:* Pode-se vincular opcionalmente o ID de um dizimista criado na Etapa 4.
4.  **Lançar Despesas (Saídas):** `POST /meses/{mes_id}/semanas/{semana_numero}/despesas/`
    *   *Nota:* O recálculo de saldo é automático. O sistema atualizará o Saldo Final do Mês a cada renda ou despesa inserida.
    *   *Recorrência:* É possível cadastrar despesas com as flags `recorrente=True` e `periodicidade` ("semanal", "quinzenal" ou "mensal"). Use `POST /despesas/recorrentes/duplicar` para gerar as cópias automáticas.

### Etapa 6: Fechamento e Relatórios
Ao final do mês, o tesoureiro gera o balancete e congela os dados.

1.  **Gerar Balancete PDF:** `GET /meses/{mes_id}/balancete/pdf`
    *   A API processará os dados e retornará um arquivo `.pdf` binário. No frontend, isso deve ser tratado como um download (Blob).
2.  **Ver Dados do Balancete (JSON):** `GET /meses/{mes_id}/balancete/`
    *   Retorna os totais (entradas, saídas, comissão de 33%, saldo final) em formato JSON para montar dashboards no app.
3.  **Fechar o Mês:** `PUT /meses/{mes_id}/fechar`
    *   *Segurança:* Uma vez fechado, a API retornará erro HTTP 400 se alguém tentar adicionar, deletar ou alterar Rendas, Despesas ou Semanas daquele mês.

*(Apenas Administradores podem usar `PUT /meses/{mes_id}/reabrir` caso o tesoureiro tenha errado).*

---

## 4. Tratamento de Erros e Exclusões (Soft-Block)

A API possui mecanismos de defesa robustos:
*   **Erro 404 (Not Found):** Quando você tenta acessar um ID de recurso que não existe.
*   **Erro 403 (Forbidden):** Quando seu usuário não tem o nível hierárquico necessário para ver aquele dado ou não pertence àquela jurisdição.
*   **Erro 400 (Bad Request):** Geralmente acompanhado de uma mensagem clara no `detail`. Ocorre em validações de negócio, por exemplo:
    *   Tentar deletar uma congregação que já possui meses financeiros lançados (a API proíbe para evitar perda de dados).
    *   Tentar inserir uma renda com data incompatível com a semana.
    *   Tentar alterar dados de um Mês já `fechado`.

---

## 5. Endpoints Principais (Resumo)

| Método | Endpoint | Descrição |
| :--- | :--- | :--- |
| **GET** | `/setup/status` | Verifica se o setup inicial (superusuário) já foi concluído. |
| **POST** | `/setup/initialize` | Cria o superusuário da plataforma (apenas na primeira vez). |
| **POST** | `/token` | Autenticação e geração do JWT. |
| **GET** | `/users/me/` | Retorna os dados do usuário atualmente logado. |
| **PUT** | `/users/me/password` | Muda a própria senha (requer a senha atual). |
| **POST** | `/usuarios/` | Cria um usuário (exige superuser). |
| **CRUD** | `/denominacoes/` | Gerenciamento da hierarquia principal. |
| **CRUD** | `/areas_eclesiasticas/` | Gerenciamento de Áreas/Zonas. |
| **CRUD** | `/congregacoes/` | Gerenciamento de Igrejas/Congregações. |
| **CRUD** | `/congregacoes/{id}/dizimistas/` | Gestão de membros/dizimistas de uma congregação. |
| **POST** | `/meses/` | Cria (Abre) um novo mês financeiro. |
| **PUT** | `/meses/{id}/fechar` | Trava o mês para edições (Fechamento). |
| **PUT** | `/meses/{id}/reabrir` | Reabre um mês fechado (apenas administradores). |
| **CRUD** | `/meses/{id}/semanas/` | Gerenciamento das semanas (máximo 5 por mês). |
| **CRUD** | `/semanas/{id}/rendas/` | Lançamento e gestão de Dízimos e Ofertas. |
| **POST** | `/meses/{id}/semanas/{numero}/despesas/`| Lançamento de despesas de uma semana específica. |
| **POST** | `/despesas/recorrentes/duplicar`| Duplica as despesas marcadas como recorrentes para o próximo período. |
| **GET** | `/meses/{id}/balancete/` | Resumo financeiro total do mês em JSON. |
| **GET** | `/meses/{id}/balancete/pdf` | Gera e baixa o relatório em PDF pronto para impressão. |
| **GET** | `/master/stats` | Estatísticas globais da plataforma (superuser). |
| **GET** | `/master/tenants` | Lista todas as denominações/tenants (superuser). |
| **POST** | `/master/tenants` | Cria uma denominação + seu administrador (superuser). |
| **PUT** | `/master/tenants/{id}/status` | Ativa/desativa um tenant (superuser). |
| **POST** | `/master/users/{id}/impersonate` | Personifica um usuário para suporte (superuser). |

> **Dica para Desenvolvedores Frontend:** Em requisições de download do PDF (`/balancete/pdf`), configure o seu client HTTP (como Axios) para aceitar `responseType: 'blob'`.