#!/bin/bash

set -e

PROJECT_DIR="/var/www/aiwatch"

echo "======================================"
echo "Starting deployment..."
echo "======================================"

cd "$PROJECT_DIR"

echo "Current commit:"
OLD_COMMIT=$(git rev-parse HEAD)
echo "$OLD_COMMIT"

echo "Fetching latest code..."

git fetch origin

echo "Resetting to origin/main..."

git reset --hard origin/main

NEW_COMMIT=$(git rev-parse HEAD)

echo "New commit:"
echo "$NEW_COMMIT"

if [ "$OLD_COMMIT" = "$NEW_COMMIT" ]; then
    echo "No new changes found."
    echo "Skipping deployment."
    exit 0
fi

echo "Checking for dependency changes..."

if git diff --name-only "$OLD_COMMIT" "$NEW_COMMIT" | grep -Eq '(^|/)(package\.json|package-lock\.json)$'; then

    echo "Dependencies changed. Installing..."

    rm -rf node_modules

    npm ci

else

    echo "Dependencies unchanged. Skipping npm install."

fi

echo "Building CSS..."

npm run build:css

echo "Building assessment editor..."

npm run build:editor

echo "Running database migrations..."

npm run migrate

echo "Reloading PM2..."

pm2 reload aiwatch --update-env

echo "Saving PM2 process list..."

pm2 save

echo "======================================"
echo "Deployment successful!"
echo "======================================"