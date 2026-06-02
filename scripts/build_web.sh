#!/bin/bash

# Navigate to the web directory
cd ../web || exit

# Install dependencies
yarn install

# Set environment variable (specific to macOS)
export REACT_APP_API_BASE_URL="/dashboard"

# Build the project
npm run build

# Navigate back to the root directory
cd ..

# Remove the existing public directory
rm -rf lib/public

# Create the public directory
mkdir -p lib/public

# Copy the build output to the public directory
cp -R ./web/build/* ./lib/public/

