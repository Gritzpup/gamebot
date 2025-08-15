import * as fs from 'fs';
import * as path from 'path';

// Read text files and convert to JSON
const answersText = fs.readFileSync(path.join(__dirname, 'wordle-answers.txt'), 'utf-8');
const allowedText = fs.readFileSync(path.join(__dirname, 'wordle-allowed.txt'), 'utf-8');

// Convert to arrays and clean up
const answers = answersText.split('\n').filter(word => word.trim().length === 5).map(word => word.trim().toLowerCase());
const allowed = allowedText.split('\n').filter(word => word.trim().length === 5).map(word => word.trim().toLowerCase());

// Combine both lists for all valid guesses (answers are also valid guesses)
const allValidGuesses = Array.from(new Set([...answers, ...allowed])).sort();

// Create JSON files
fs.writeFileSync(
  path.join(__dirname, 'wordle-answers.json'),
  JSON.stringify(answers, null, 2)
);

fs.writeFileSync(
  path.join(__dirname, 'wordle-allowed.json'),
  JSON.stringify(allValidGuesses, null, 2)
);

console.log(`Created wordle-answers.json with ${answers.length} words`);
console.log(`Created wordle-allowed.json with ${allValidGuesses.length} words`);