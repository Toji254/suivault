# Use Node 20 as base image
FROM node:20-slim

# Install system dependencies if needed (e.g., for certain npm packages)
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy the entire repository
COPY . .

# Install dependencies for the SDK and build it
WORKDIR /app/sdk
RUN npm install --legacy-peer-deps && npm run build

# Install dependencies for the Dashboard
WORKDIR /app/dashboard
RUN npm install --legacy-peer-deps

# Build the dashboard (optional, but ensures compatibility)
RUN npm run build

# Expose the dashboard port
EXPOSE 3000

# Default command starts the dashboard in production mode
# Use "npm run dev" if you want development mode with hot-reloading
CMD ["npm", "run", "start"]
