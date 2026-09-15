# Dockerfile (para o Frontend - Next.js)

# 1. Estágio de Build
FROM node:20-alpine AS builder
WORKDIR /app

# Copia os arquivos de dependência e instala
COPY package*.json ./
RUN npm install

# Copia o restante do código da aplicação
COPY . .

# Builda a aplicação para produção
RUN npm run build

# 2. Estágio de Produção
FROM node:20-alpine AS runner
WORKDIR /app

# Define o ambiente como produção
ENV NODE_ENV=production

# Cria um usuário não-root para rodar a aplicação
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001

# Copia os artefatos do build do estágio anterior
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Muda o dono dos arquivos para o usuário não-root
RUN chown -R nextjs:nodejs ./.next

# Define o usuário que vai rodar a aplicação
USER nextjs

# Expõe a porta que a aplicação vai rodar
EXPOSE 3000

# Define a variável de ambiente para a porta
ENV PORT 3000

# Comando para iniciar o servidor Next.js
CMD ["node", "server.js"]
