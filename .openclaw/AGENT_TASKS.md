# AI Agent Task Template

## Как использовать

1. Создать issue в GitHub с описанием задачи
2. Запустить агента через Cursor Cloud Agent или CLI
3. Агент выполняет задачу и создаёт PR с пометкой `[auto]`

## Формат задачи для агента

```
Задача: [краткое описание]

Контекст:
- Прочитай .openclaw/ARCHITECTURE.md
- Прочитай .openclaw/CONSTRAINTS.md
- Прочитай .openclaw/DECISIONS.md

Что нужно сделать:
1. [шаг 1]
2. [шаг 2]
3. [шаг 3]

Проверка:
- [ ] Тесты проходят (npm test)
- [ ] TypeScript компилируется без ошибок
- [ ] Код соответствует CONSTRAINTS.md

После выполнения:
1. Создай ветку: feat/[номер-issue]-[краткое-название]
2. Закоммить с сообщением: "feat: описание (#issue)"
3. Создай PR с заголовком: "[auto] feat: описание (#issue)"
4. Опиши в PR что было сделано и как проверить
```

## Примеры задач

### Добавить парсер для нового видео-хостинга
```
Задача: Добавить поддержку видео с TikTok

Контекст:
- Смотри .openclaw/ARCHITECTURE.md раздел "Добавление нового парсера"
- Паттерн: backend/src/services/parsers/youtube.ts

Что нужно:
1. Создать backend/src/services/parsers/tiktok.ts
2. Реализовать parseVideo(url) → VideoInfo
3. Добавить в backend/src/services/videoService.ts
4. Написать простой тест

Проверка:
- [ ] Тесты проходят
- [ ] TypeScript компилируется
```

### Исправить баг
```
Задача: Исправить ошибку при добавлении видео без превью

Контекст:
- Файл: backend/src/services/parsers/youtube.ts
- Ошибка: Cannot read property 'url' of undefined

Что нужно:
1. Добавить проверку на существование thumbnails
2. Вернуть fallback изображение если превью нет
3. Проверить другие парсеры на ту же проблему

Проверка:
- [ ] Тесты проходят
- [ ] TypeScript компилируется
```

## Команды для запуска

### Через Cursor Cloud Agent (рекомендуется)
```bash
# В Cursor IDE: Cmd+Shift+P → "Cursor: Open Cloud Agent"
# Или через API
```

### Через CLI (если Cursor API недоступен)
```bash
cd /root/.openclaw/workspace/aitovideo
# Ручной запуск агента через OpenClaw
```

## После создания PR

1. GitHub Actions запускает проверки
2. Если всё зелёное и PR от агента ([auto]) — автомерж
3. Если проверки упали — агент получает уведомление и чинит
4. Если нужен human review — добавляется label `needs-review`
