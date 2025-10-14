FROM node:18-slim
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm i --production --no-audit --no-fund
COPY . .
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
CMD ["node","server.js"]
