import { searchRutubeVideos } from './src/services/rutube.js';
async function test() {
  const query = '24e74f3a5def9c3e329cb9b508f9ba90';
  console.log('Searching via Search API for ID:', query);
  const results = await searchRutubeVideos(query, 5);
  console.log('Results:', JSON.stringify(results, null, 2));
}
test();
