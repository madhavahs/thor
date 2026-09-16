# ESP32 Worldwide AI Forge & Remote Fleet Manager - Production Dockerfile for Render
FROM node:20-bookworm-slim

# Install system dependencies needed for arduino-cli and ESP32 compiler toolchain
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    python3 \
    python3-pip \
    git \
    ca-certificates \
    tar \
    bzip2 \
    xz-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install arduino-cli into /app/bin
RUN mkdir -p bin && \
    curl -fsSL https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh | BINDIR="/app/bin" sh

ENV PATH="/app/bin:${PATH}"

# Configure Arduino CLI with ESP32 board manager and pre-install ESP32 Core 3.1.1
RUN arduino-cli config init --overwrite && \
    arduino-cli config set board_manager.additional_urls "https://espressif.github.io/arduino-esp32/package_esp32_index.json" && \
    arduino-cli core update-index && \
    arduino-cli core install esp32:esp32@3.1.1 && \
    arduino-cli lib install "WebSockets" "ArduinoJson"

# Install Node dependencies
COPY server/package*.json ./server/
RUN cd server && npm install --omit=dev

# Copy application source code
COPY . .

# Pre-warm compilation cache with ESP32 core & system libraries so builds complete in 3-5 seconds without hitting Render timeouts
RUN mkdir -p /app/server/workspace/cache /tmp/warmup && \
    printf "#include <WiFi.h>\n#include <Update.h>\n#include <WiFiClientSecure.h>\nvoid setup(){}\nvoid loop(){}\n" > /tmp/warmup/warmup.ino && \
    arduino-cli compile --fqbn esp32:esp32:esp32 --build-path /app/server/workspace/cache --jobs 0 /tmp/warmup && \
    rm -rf /tmp/warmup

# Set environment variables for production
ENV PORT=3000
ENV NODE_ENV=production
ENV ARDUINO_CLI_PATH=/app/bin/arduino-cli
ENV WORKSPACE_DIR=/app/server/workspace

EXPOSE 3000

# Start server
CMD ["node", "server/server.js"]
