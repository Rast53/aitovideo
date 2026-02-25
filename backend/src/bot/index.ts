import dotenv from 'dotenv';
import TelegramBot from 'node-telegram-bot-api';
import { parseVideoUrl } from '../services/parser.js';
import type { AddVideoResponse, ErrorResponse } from '../types/api.js';
import type { Video, VideoPlatform } from '../types/video.js';

dotenv.config();

const BOT_TOKEN = process.env.BOT_TOKEN;
const API_URL = process.env.API_URL ?? 'http://localhost:3000';
const MINI_APP_URL = process.env.MINI_APP_URL;

if (!BOT_TOKEN) {
  console.error('BOT_TOKEN is required!');
  process.exit(1);
}

// Create bot
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Start command
bot.onText(/\/start/, async (msg: TelegramBot.Message) => {
  const chatId = msg.chat.id;

  const welcomeText = `
🎬 *Добро пожаловать в Video Queue!*

Отправь мне ссылку на видео с:
• YouTube
• Rutube  
• VK Video

Я сохраню её, и ты сможешь смотреть через Mini App на любом устройстве.
  `;

  const keyboard = MINI_APP_URL
    ? {
        reply_markup: {
          inline_keyboard: [[{ text: '📺 Открыть Video Queue', web_app: { url: MINI_APP_URL } }]]
        }
      }
    : {};

  await bot.sendMessage(chatId, welcomeText, {
    parse_mode: 'Markdown',
    ...keyboard
  });
});

// Help command
bot.onText(/\/help/, (msg: TelegramBot.Message) => {
  const chatId = msg.chat.id;

  void bot.sendMessage(
    chatId,
    `
*Как использовать:*

1️⃣ Отправь ссылку на видео
2️⃣ Я сохраню её в твою очередь
3️⃣ Открой Mini App для просмотра

*Поддерживаемые ссылки:*
• https://youtube.com/watch?v=...
• https://youtu.be/...
• https://rutube.ru/video/...
• https://vk.com/video...

*Команды:*
/start — начать
/help — помощь
/queue — открыть очередь
  `,
    { parse_mode: 'Markdown' }
  );
});

// Queue command
bot.onText(/\/queue/, (msg: TelegramBot.Message) => {
  const chatId = msg.chat.id;

  if (!MINI_APP_URL) {
    void bot.sendMessage(chatId, 'Mini App URL не настроен. Обратитесь к администратору.');
    return;
  }

  void bot.sendMessage(chatId, '📺 Твоя очередь видео:', {
    reply_markup: {
      inline_keyboard: [[{ text: 'Открыть', web_app: { url: MINI_APP_URL } }]]
    }
  });
});

// Handle text messages (video URLs)
bot.on('message', async (msg: TelegramBot.Message) => {
  // Skip commands
  if (msg.text?.startsWith('/')) {
    return;
  }

  const chatId = msg.chat.id;
  const text = msg.text;
  const user = msg.from;

  if (!text || !user) {
    return;
  }

  // Check if it's a video URL
  const parsed = parseVideoUrl(text);

  if (!parsed) {
    void bot.sendMessage(
      chatId,
      '❌ Не распознал ссылку. Отправь ссылку на YouTube, Rutube или VK Video.'
    );
    return;
  }

  // Show typing
  void bot.sendChatAction(chatId, 'typing');

  try {
    // Send to API
    const response = await fetch(`${API_URL}/api/videos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: text,
        telegramId: user.id,
        username: user.username,
        firstName: user.first_name,
        lastName: user.last_name
      })
    });

    const data = (await response.json()) as Partial<AddVideoResponse & ErrorResponse>;

    if (response.status === 409) {
      void bot.sendMessage(chatId, '⚠️ Это видео уже есть в твоей очереди.');
      return;
    }

    if (!response.ok) {
      throw new Error(data.error ?? 'API error');
    }

    const video = data.video as Video | undefined;
    if (!video) {
      throw new Error('Invalid API response: missing video');
    }

    const platformEmoji: Record<VideoPlatform, string> = {
      youtube: '📺',
      rutube: '▶️',
      vk: '🔴'
    };

    const message = `
${platformEmoji[video.platform] ?? '📹'} *${video.title}*

👤 ${video.channel_name ?? 'Unknown'}
💾 Добавлено в очередь
    `;

    const keyboard = MINI_APP_URL
      ? {
          reply_markup: {
            inline_keyboard: [[{ text: '📺 Открыть очередь', web_app: { url: MINI_APP_URL } }]]
          }
        }
      : {};

    // Send thumbnail if available; fall back to text if Telegram can't fetch the URL
    if (video.thumbnail_url) {
      try {
        await bot.sendPhoto(chatId, video.thumbnail_url, {
          caption: message,
          parse_mode: 'Markdown',
          ...keyboard
        });
      } catch {
        // Telegram couldn't fetch the photo (e.g. VK CDN blocks external requests)
        void bot.sendMessage(chatId, message, {
          parse_mode: 'Markdown',
          ...keyboard
        });
      }
    } else {
      void bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        ...keyboard
      });
    }
  } catch (error) {
    console.error('Bot error:', error);
    void bot.sendMessage(chatId, '❌ Ошибка при добавлении видео. Попробуй позже.');
  }
});

// Error handling
bot.on('polling_error', (error: Error) => {
  console.error('Polling error:', error);
});

console.log('Bot started');

export default bot;
