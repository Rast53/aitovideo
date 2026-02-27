import { searchRutubeVideos } from './src/services/rutube.js';
async function test() {
  const query = 'ИИ вышел из под контроля? Почему люди хотят поверить в восстание машин.';
  console.log('Searching for:', query);
  const results = await searchRutubeVideos(query, 5);
  console.log('Results:', JSON.stringify(results, null, 2));
}
test();
