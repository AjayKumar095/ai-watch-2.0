#!/bin/bash

set -e

PROJECT_DIR="/var/www/aiwatch"

echo "======================================"
echo "Starting deployment..."
echo "======================================"

echo "Changing directory..."

cd "$PROJECT_DIR"

OLD_COMMIT=$(git rev-parse HEAD)

echo "Current commit:"
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

echo "Building assets..."

npm run build

echo "Running database migrations..."

npx sequelize-cli db:migrate --env production

echo "Reloading PM2..."

pm2 reload aiwatch --update-env

echo "Saving PM2 process list..."

pm2 save

echo "======================================"
echo "Deployment successful!"
echo "======================================"
