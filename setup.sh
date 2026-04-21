#!/bin/bash
cd "$(dirname "$0")"

echo "==============================="
echo "Starting Gemini MCP Setup..."
echo "==============================="

if ! command -v node &> /dev/null
then
    echo "[ERROR] Node.js is not installed or not in PATH!"
    echo "Please download and install Node.js from: https://nodejs.org/"
    echo "Or install via package manager (e.g. sudo apt install nodejs)"
    echo "==============================="
    exit 1
fi

node setup.js
