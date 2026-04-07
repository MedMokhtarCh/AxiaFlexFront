FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
# Install all dependencies (including dev for ts-node-dev)
RUN npm ci
COPY . .
EXPOSE 3000
ENV NODE_ENV=development
# Use the dev command so the container runs via ts-node-dev and avoids build-time TS compilation
CMD ["npm","run","dev"]
