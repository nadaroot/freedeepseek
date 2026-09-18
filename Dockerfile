FROM node:20-alpine

# Set working directory
WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV PORT=9655
ENV HOST=0.0.0.0

# Copy package metadata and source code
COPY package.json ./
COPY server.js client.js ./
COPY scripts/ ./scripts/
COPY auth.example.json ./

# Expose server port
EXPOSE 9655

# Healthcheck to verify proxy is responding
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:9655/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1); }).on('error', () => process.exit(1));"

# Run as non-root user
USER node

# Start FreeDeepseekAPI proxy server
CMD ["node", "server.js"]
