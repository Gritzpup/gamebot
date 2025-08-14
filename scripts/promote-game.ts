#!/usr/bin/env tsx
import * as fs from 'fs/promises';
import * as path from 'path';

const GAMES_DIR = path.join(__dirname, '..', 'src', 'games');
const DEV_DIR = path.join(GAMES_DIR, 'development');
const PROD_DIR = path.join(GAMES_DIR, 'production');

async function promoteGame(gameName: string) {
  if (!gameName) {
    console.error('❌ Please provide a game name to promote');
    console.log('Usage: npm run promote-game <game-name>');
    process.exit(1);
  }

  try {
    // Find the game file in development
    const devFiles = await fs.readdir(path.join(DEV_DIR, 'board-games')).catch(() => []);
    const devCardFiles = await fs.readdir(path.join(DEV_DIR, 'card-games')).catch(() => []);
    
    let sourceFile: string | null = null;
    let category: string | null = null;
    
    // Search for the game file (case insensitive)
    const gameNameLower = gameName.toLowerCase();
    
    for (const file of devFiles) {
      if (file.toLowerCase().includes(gameNameLower)) {
        sourceFile = path.join(DEV_DIR, 'board-games', file);
        category = 'board-games';
        break;
      }
    }
    
    if (!sourceFile) {
      for (const file of devCardFiles) {
        if (file.toLowerCase().includes(gameNameLower)) {
          sourceFile = path.join(DEV_DIR, 'card-games', file);
          category = 'card-games';
          break;
        }
      }
    }
    
    if (!sourceFile || !category) {
      console.error(`❌ Game "${gameName}" not found in development folder`);
      process.exit(1);
    }
    
    // Get the filename
    const filename = path.basename(sourceFile);
    const destFile = path.join(PROD_DIR, category, filename);
    
    // Copy the file
    await fs.copyFile(sourceFile, destFile);
    
    // Delete from development
    await fs.unlink(sourceFile);
    
    // Update development index.ts
    await updateIndex(path.join(DEV_DIR, 'index.ts'), gameName, false);
    
    // Update production index.ts
    await updateIndex(path.join(PROD_DIR, 'index.ts'), gameName, true);
    
    console.log(`✅ Successfully promoted "${gameName}" to production!`);
    console.log(`📁 Moved from: ${sourceFile}`);
    console.log(`📁 Moved to: ${destFile}`);
    console.log('\n🎮 The game is now available in production environment.');
    
  } catch (error) {
    console.error('❌ Error promoting game:', error);
    process.exit(1);
  }
}

async function updateIndex(indexPath: string, gameName: string, isProduction: boolean) {
  try {
    let content = await fs.readFile(indexPath, 'utf-8');
    
    if (isProduction) {
      // Add export and metadata for production
      const className = gameName.charAt(0).toUpperCase() + gameName.slice(1);
      const importLine = `export { ${className} } from './board-games/${className}';`;
      const metadataLine = `  { id: '${gameName.toLowerCase()}', name: '${className}', path: './board-games/${className}' },`;
      
      // Add import if not exists
      if (!content.includes(importLine)) {
        const lastExportIndex = content.lastIndexOf('export {');
        if (lastExportIndex !== -1) {
          const nextLineIndex = content.indexOf('\n', lastExportIndex) + 1;
          content = content.slice(0, nextLineIndex) + importLine + '\n' + content.slice(nextLineIndex);
        } else {
          content = importLine + '\n' + content;
        }
      }
      
      // Add to metadata array
      const metadataMatch = content.match(/export const productionGames = \[([\s\S]*?)\];/);
      if (metadataMatch) {
        const metadataContent = metadataMatch[1];
        if (!metadataContent.includes(`id: '${gameName.toLowerCase()}'`)) {
          const updatedMetadata = metadataContent.trimEnd() + '\n' + metadataLine;
          content = content.replace(metadataMatch[0], `export const productionGames = [${updatedMetadata}\n];`);
        }
      }
    } else {
      // Remove from development
      const className = gameName.charAt(0).toUpperCase() + gameName.slice(1);
      const importRegex = new RegExp(`export \\{ ${className} \\} from.*\\n`, 'g');
      const metadataRegex = new RegExp(`.*id: '${gameName.toLowerCase()}'.*\\n`, 'g');
      
      content = content.replace(importRegex, '');
      content = content.replace(metadataRegex, '');
    }
    
    await fs.writeFile(indexPath, content);
  } catch (error) {
    console.error(`Warning: Could not update ${indexPath}:`, error);
  }
}

// Run the script
const gameName = process.argv[2];
promoteGame(gameName);