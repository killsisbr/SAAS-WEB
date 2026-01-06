# ============================================================
# Dockerfile - DeliveryHub SaaS
# ============================================================

FROM node:18-alpine

# Metadata
LABEL maintainer="killsis (Lucas Larocca)"
LABEL description="DeliveryHub - Plataforma SaaS Multi-Tenant para Delivery"

# Variaveis de ambiente
ENV NODE_ENV=production
ENV PORT=3000

# Criar diretorio de trabalho
WORKDIR /app

# Copiar package.json primeiro (cache layer)
COPY server/package*.json ./server/

# Instalar dependencias
WORKDIR /app/server
RUN npm ci --only=production

# Voltar ao diretorio raiz
WORKDIR /app

# Copiar codigo fonte
COPY server/ ./server/
COPY public/ ./public/

# Criar diretorio de dados
RUN mkdir -p /app/data /app/uploads

# Expor porta
EXPOSE 3000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# Usuario nao-root
RUN addgroup -g 1001 -S nodejs && \
    adduser -S deliveryhub -u 1001 -G nodejs && \
    chown -R deliveryhub:nodejs /app

USER deliveryhub

# Iniciar servidor
CMD ["node", "server/server.js"]
