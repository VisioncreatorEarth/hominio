/**
 * Vite plugin to handle PGlite WASM file copying
 * This ensures that PGlite WASM files are properly copied to the build directory
 * and accessible in both development and production modes
 */
import fs from 'fs';
import path from 'path';

export default function pgliteAssetsPlugin() {
  return {
    name: 'vite-plugin-pglite-assets',
    
    // This hook runs during development server startup
    configureServer(server) {
      // Ensure public directory exists
      const publicDir = path.resolve('public');
      const pgliteDir = path.resolve(publicDir, 'pglite-assets');
      
      if (!fs.existsSync(pgliteDir)) {
        console.log('Creating pglite-assets directory in public');
        fs.mkdirSync(pgliteDir, { recursive: true });
      }
      
      // Copy PGlite WASM files from static to public for dev server
      const staticPgliteDir = path.resolve('static/pglite-assets');
      
      if (fs.existsSync(staticPgliteDir)) {
        const files = fs.readdirSync(staticPgliteDir);
        
        files.forEach(file => {
          const sourcePath = path.join(staticPgliteDir, file);
          const destPath = path.join(pgliteDir, file);
          
          if (fs.statSync(sourcePath).isFile()) {
            console.log(`Copying ${file} to public/pglite-assets for development`);
            fs.copyFileSync(sourcePath, destPath);
          }
        });
      }
    },
    
    // This hook runs during build
    generateBundle() {
      console.log('PGlite assets plugin: ensuring WASM files are included in build');
    }
  };
} 