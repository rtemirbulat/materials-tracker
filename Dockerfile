FROM node:20-alpine
WORKDIR /app
COPY server.js ./
COPY web ./web
RUN mkdir -p /data && chown node:node /data
ENV PORT=3000 DATA_DIR=/data
USER node
EXPOSE 3000
CMD ["node", "server.js"]
