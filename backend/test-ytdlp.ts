import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

async function test() {
  const query = 'ИИ вышел из под контроля? Почему люди хотят поверить в восстание машин.';
  // Using --flat-playlist to get list of videos from search result without downloading
  const cmd = `yt-dlp "ytsearch3:${query}" --flat-playlist --print "title,uploader,url,duration,thumbnail"`;
  
  console.log('Running:', cmd);
  try {
    const { stdout } = await execAsync(cmd);
    console.log('Output:', stdout);
  } catch (e) {
    console.error('Error:', e);
  }
}
test();
