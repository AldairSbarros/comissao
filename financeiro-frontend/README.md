# Frontend do Controle Financeiro Eclesiástico

Este é o frontend da aplicação web de gestão financeira eclesiástica, construído com **Next.js 15**, **React**, e **Tailwind CSS**. A interface foi desenvolvida para ser intuitiva, responsiva e alinhada com as regras de negócio do backend (API).

## Principais Funcionalidades Implementadas

*   **Painel Administrativo:** Permite o cadastro e a gestão estrutural (Denominações, Áreas Eclesiásticas, Congregações e Usuários).
*   **Gestão de Tesouraria:**
    *   **Dashboard em Abas:** Separa as funções financeiras do cadastro de membros.
    *   **Controle Mensal:** Capacidade de criar (abrir) novos meses financeiros.
    *   **Ciclo de Fechamento:** Trava visual e lógica na interface (botão "Fechar Mês") que bloqueia interações (inputs/botões de excluir) para meses já consolidados.
    *   **Rendas e Despesas:** Modais ricos e validados com `react-hook-form` para lançamento de finanças, incluindo seletores (ex: Tipo de Renda, Metódo de Pagamento) e datas controladas (restritas visualmente às datas de início/fim da semana).
    *   **Vínculo Dizimistas:** O lançamento de rendas possui um campo autocomplete/select para vincular Dízimos/Ofertas a membros previamente cadastrados.
*   **Gestão de Dizimistas/Ofertantes:** CRUD para cadastrar os membros contribuintes com dados essenciais, separados logicamente por congregação logada.
*   **Integração de Relatórios (PDF):** Download seguro do balancete em PDF, fazendo o fetch binário (Blob) com JWT na API e disponibilizando no navegador com `URL.createObjectURL()`.

## Stack Tecnológica

*   [Next.js 15](https://nextjs.org/) (App Router)
*   [React](https://reactjs.org/)
*   [Tailwind CSS](https://tailwindcss.com/)
*   [Shadcn UI](https://ui.shadcn.com/) (Componentes de UI acessíveis e altamente customizáveis, como Tabs, Modais, Cards, Selects, Accordion).
*   [React Hook Form](https://react-hook-form.com/) (Gestão de estado de formulários e validação fluida).
*   [Sonner](https://sonner.emilkowal.ski/) (Para feedback de notificações / toasts).
*   [Lucide React](https://lucide.dev/) (Biblioteca de ícones SVG leves).

## Configuração do Ambiente e Execução

### Pré-requisitos
*   Node.js (versão 18 ou superior)
*   npm, yarn ou pnpm
*   O Backend (FastAPI) estar em execução localmente em `http://localhost:8000`.

### Passos

1.  Acesse a pasta raiz do frontend:
    ```bash
    cd financeiro-frontend
    ```
2.  Instale as dependências:
    ```bash
    npm install
    ```
3.  Inicie o servidor de desenvolvimento:
    ```bash
    npm run dev
    ```
4.  Abra o navegador em `http://localhost:3000`.

*(Nota: O endereço base da API (`API_BASE_URL`) está configurado no arquivo `lib/api.ts`. Modifique-o se o seu backend estiver sendo executado numa porta ou host diferente em ambiente de produção).*
