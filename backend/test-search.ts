import dotenv from 'dotenv';
import { searchVkVideos } from './src/services/vk.js';
import { searchRutubeVideos } from './src/services/rutube.js';

dotenv.config();

async function test() {
  const query = 'Интерстеллар обзор';
  console.log(`🔍 Searching for: "${query}"...`);

  console.log('\n--- VK Results ---');
  const vk = await searchVkVideos(query, 2);
  vk.forEach(v => console.log(`[VK] ${v.title} | ${v.embedUrl}`));

  console.log('\n--- Rutube Results ---');
  const rutube = await searchRutubeVideos(query, 2);
  rutube.forEach(v => console.log(`[Rutube] ${v.title} | https://rutube.ru/video/${v.externalId}/`));
}

test();
