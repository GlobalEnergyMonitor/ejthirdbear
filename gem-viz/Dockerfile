# GEM Viz SSR Docker Image
# For deploying to VPS, Railway, Fly.io, etc.

FROM node:20-slim

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy built SSR output
COPY build-ssr/ ./build-ssr/
COPY static/ ./static/

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Expose port
EXPOSE 3000

# Start the server
CMD ["node", "build-ssr/index.js"]
