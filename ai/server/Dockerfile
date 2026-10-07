FROM node:22-alpine
WORKDIR /app
COPY ai/contract.v1.js ./ai/contract.v1.js
COPY ai/server/firestore.mjs ai/server/server.mjs ./ai/server/
USER node
ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "ai/server/server.mjs"]
