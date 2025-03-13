#!/usr/bin/env node

/**
 * This script prepares all necessary assets for the Tauri build
 * It ensures that PGlite WASM files are copied to the correct locations
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Setup dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Project directories
const ROOT_DIR = path.resolve(__dirname, '..');
const STATIC_DIR = path.join(ROOT_DIR, 'static');
const BUILD_DIR = path.join(ROOT_DIR, 'build');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');

// PGlite asset directories
const PGLITE_STATIC = path.join(STATIC_DIR, 'pglite-assets');
const PGLITE_BUILD = path.join(BUILD_DIR, 'pglite-assets');
const PGLITE_PUBLIC = path.join(PUBLIC_DIR, 'pglite-assets');

// Create directories if they don't exist
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    console.log(`Creating directory: ${dir}`);
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Copy file with logging
function copyFile(src, dest) {
  if (fs.existsSync(src)) {
    console.log(`Copying ${path.basename(src)} to ${dest}`);
    fs.copyFileSync(src, dest);
  } else {
    console.error(`Source file not found: ${src}`);
  }
}

// Copy directory contents
function copyDirContents(srcDir, destDir) {
  if (!fs.existsSync(srcDir)) {
    console.error(`Source directory not found: ${srcDir}`);
    return;
  }

  ensureDir(destDir);
  
  const files = fs.readdirSync(srcDir);
  
  files.forEach(file => {
    const srcFile = path.join(srcDir, file);
    const destFile = path.join(destDir, file);
    
    if (fs.statSync(srcFile).isFile()) {
      copyFile(srcFile, destFile);
    }
  });
}

// Main function
async function main() {
  console.log('Preparing assets for Tauri build...');
  
  // Ensure directories exist
  ensureDir(BUILD_DIR);
  ensureDir(PUBLIC_DIR);
  ensureDir(PGLITE_BUILD);
  ensureDir(PGLITE_PUBLIC);

  // Copy PGlite assets to build directory
  console.log('\nCopying PGlite assets to build directory...');
  copyDirContents(PGLITE_STATIC, PGLITE_BUILD);
  
  // Copy PGlite assets to public directory for development
  console.log('\nCopying PGlite assets to public directory...');
  copyDirContents(PGLITE_STATIC, PGLITE_PUBLIC);

  console.log('\nAssets prepared successfully!');
}

// Execute main function
main().catch(err => {
  console.error('Error preparing assets:', err);
  process.exit(1);
}); 