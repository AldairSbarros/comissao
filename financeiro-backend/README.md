# Financeiro Backend

## Visão Geral

Este é o backend do sistema de controle financeiro eclesiástico, construído com **FastAPI** e **SQLAlchemy**. Ele foi projetado com uma arquitetura **multitenant**, permitindo a gestão financeira de múltiplas denominações, áreas e congregações de forma isolada e segura.

## Funcionalidades Principais

*   **Autenticação e Autorização (JWT):** Gerenciamento de usuários com controle de acesso rigoroso baseado em funções (Superusuário, Administrador, Supervisor de Denominação, Supervisor de Área, Tesoureiro), garantindo que cada usuário acesse apenas os dados de sua jurisdição.
*   **Setup Inicial e Painel Master (Superuser):**
    *   **Setup:** `GET /setup/status` e `POST /setup/initialize` criam o superusuário da plataforma (dono do sistema, sem denominação) na primeira execução.
    *   **Painel Master:** endpoints `/master/*` exclusivos do superusuário para gerenciar a plataforma — estatísticas globais, listagem de tenants, **criação de Denominação (Tenant) + seu administrador em uma única transação**, ativar/desativar, renomear e excluir tenants (com exclusão em cascata), **gestão de usuários** (listar, redefinir senha, suspender/ativar) e personificação de usuários para suporte.
    *   **Mudar senha:** `PUT /users/me/password` permite ao usuário alterar a própria senha informando a senha atual.
*   **Gestão de Hierarquia Eclesiástica (CRUD):**
    *   Gestão de Denominações, Áreas Eclesiásticas e Congregações.
    *   Proteção contra exclusão acidental (soft-block) que impede deletar instâncias se existirem dados dependentes.
*   **Gestão Completa de Equipe da Denominação:** Cadastro, listagem, edição completa (`nome`, `email`, `password`, `telefone` WhatsApp, `funcao` e vínculo de congregação/área) e exclusão de usuários pelo Administrador da Denominação (`/denominacoes/{id}/usuarios/`).
*   **Gestão de Membros/Dizimistas:** Cadastro e histórico de dizimistas e ofertantes.
*   **Controle Financeiro Rigoroso:**
    *   Gestão de finanças organizadas por Meses e Semanas.
    *   Lançamento de Rendas (Dízimos e Ofertas) com validação de período e histórico do dizimista.
    *   Lançamento de Despesas por semana, com suporte a data exata.
    *   **Fechamento de Mês:** Trava de segurança que impede edições e exclusões de dados financeiros após o fechamento do mês (reabertura permitida apenas para administradores).
    *   Recálculo automático e inteligente de saldos a cada nova inserção ou exclusão.
*   **OCR Inteligente Multi-Recibos e Cruzamento 1ª × 2ª Via:** Leitura automática via Gemini Vision / Meta Muse de fotos avulsas ou folhas escaneadas com até 4 recibos IEADAM (com recorte e rotação automáticos via PyMuPDF, leitura de valor por extenso e alerta de divergência, classificação de Dízimo/Oferta, conversão de algarismos romanos de congregação, vínculo automático com dizimistas cadastrados e pareamento automático entre 1ª via branca e 2ª via azul pelo número do recibo, com confirmação em lote).
*   **Integração WhatsApp (Evolution API):** Recebimento automático de fotos da 1ª via enviadas pelo WhatsApp dos tesoureiros cadastrados (`POST /webhooks/evolution`) com filtro triplo e encaminhamento transparente de mensagens ignoradas (`EVOLUTION_FORWARD_WEBHOOK_URL`), além de envio de mensagem de agradecimento com a foto do recibo ao contribuinte.
*   **Relatórios e Planilhas:** Geração de balancetes financeiros mensais em PDF, lista de dizimistas do mês em PDF (sem valores, para mural/dirigente) e exportação de planilhas Excel (`.xlsx`) semanais e mensais com cálculo automático da comissão de 33%.

## Estrutura do Projeto

*   `main.py`: O ponto de entrada da aplicação FastAPI, define os endpoints principais e a lógica de roteamento.
*   `models.py`: Define os modelos de dados (SQLAlchemy) para o banco de dados.
*   `schemas.py`: Define os esquemas de validação e serialização de dados (Pydantic) para a API.
*   `crud.py`: Contém as operações de Create, Read, Update, Delete (CRUD) para interagir com o banco de dados.
*   `ocr.py`: Integração com modelos de visão (Meta Muse / Google Gemini) para leitura de recibos manuscritos avulsos ou múltiplos na mesma página.
*   `recibos.py`: Endpoints e fluxo de upload de recibos (PDF/imagem), recorte/rotação via PyMuPDF, pareamento 1ª × 2ª via, conferência manual/em lote e confirmação.
*   `evolution.py`: Integração com Evolution API para envio de agradecimentos por WhatsApp e webhook de recebimento de recibos (`POST /webhooks/evolution`).
*   `planilha.py`: Geração de planilhas Excel (`.xlsx`) semanais e mensais com soma e cálculo de 33%.
*   `importador.py`: Ferramentas de importação de planilhas e dados financeiros existentes.
*   `database.py`: Configuração da conexão com o banco de dados.
*   `security.py`: Funções para hashing de senhas e manipulação de tokens JWT.
*   `seed.py`: (Opcional) Script para popular o banco de dados com o superusuário inicial. Aceita `--recover` para recuperar uma conta superuser afetada por um erro antigo.
*   `tests/`: Contém os testes automatizados para a aplicação.

## Configuração do Ambiente

1.  **Pré-requisitos:** Certifique-se de ter Python 3.8+ e `pip` instalados.
2.  **Clonar o Repositório:**
    ```bash
    git clone <URL_DO_SEU_REPOSITORIO>
    cd financeiro-backend
    ```
3.  **Criar e Ativar Ambiente Virtual:**
    ```bash
    python -m venv .venv
    # No Windows:
    .venv\Scripts\activate
    # No Linux/macOS:
    source .venv/bin/activate
    ```
4.  **Instalar Dependências:**
    ```bash
    pip install -r requirements.txt
    ```
5.  **Variáveis de Ambiente:** Se o projeto usar variáveis de ambiente (ex: `SECRET_KEY` para JWT), crie um arquivo `.env` na raiz do projeto e configure-as:
    ```
    SECRET_KEY="sua_chave_secreta_aqui"
    # Outras variáveis de ambiente
    ```

## Execução da Aplicação

Para iniciar o servidor FastAPI, use Uvicorn:

```bash
uvicorn main:app --reload
```
A API estará disponível em `http://127.0.0.1:8000`. Você pode acessar a documentação interativa em `http://127.0.0.1:8000/docs`.

## Testes

Para executar os testes automatizados com Pytest:

```bash
pytest tests/
```
Certifique-se de que todas as dependências de teste (como `pytest`, `pytest-cov`, `httpx` ou `httpx2`) estejam instaladas.
