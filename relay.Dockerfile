FROM node:20-alpine
WORKDIR /app
COPY relay-package.json ./package.json
RUN npm install --omit=dev
COPY relay-server.js ./relay.js
ENV PORT=8080
EXPOSE 8080
CMD ["node","relay.js"]
