# AitoVideo — Brand Guide

> Референс: Telegram Mini App нативный стиль + тёмный плеер в духе YouTube Shorts.
> Принцип: мы внутри Telegram — не пытаемся выглядеть как отдельное приложение.
> Цель: лаконично, функционально, без декора ради декора.

---

## Цвета

### Система токенов (CSS custom properties)

Все цвета — через Telegram theme tokens. Никаких хардкоженных hex в компонентах UI.

| Токен | Назначение |
|---|---|
| `var(--tg-theme-bg-color)` | Основной фон, разделители внутри карточек |
| `var(--tg-theme-secondary-bg-color)` | Фон карточек, скелетонов, вторичных элементов |
| `var(--tg-theme-text-color)` | Основной текст |
| `var(--tg-theme-hint-color)` | Подсказки, мета-инфо, неактивные кнопки |
| `var(--tg-theme-button-color)` | Акцент: активные кнопки, прогресс-бар, watched-бейдж |
| `var(--tg-theme-button-text-color)` | Текст на акцентных кнопках |
| `var(--tg-theme-link-color)` | Ссылки (не использовать как акцент) |

### Оверлейные цвета (фиксированные, не из темы)

Используются только поверх видео/тёмных оверлеев — никогда в светлом UI.

| Цвет | Применение |
|---|---|
| `rgba(0, 0, 0, 0.95)` | Фон плеера |
| `rgba(0, 0, 0, 0.75)` | Оверлей resume modal |
| `rgba(0, 0, 0, 0.65)` | Platform badge на thumbnail |
| `rgba(0, 0, 0, 0.5)` | Кнопки управления плеером |
| `rgba(128, 128, 128, 0.25)` | Граница alt-chip |
| `#fff` | Текст поверх тёмных оверлеев |

---

## Типографика

Шрифт: системный стек — `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`

| Уровень | Size | Weight | Применение |
|---|---|---|---|
| Заголовок экрана | 20px | 600 | `app-header h1` |
| Заголовок раздела | 18px | 600 | Empty state h3, Error h3 |
| Основной текст | 15px | 500–600 | Кнопки действий |
| Body | 14px | 500 | Название видео, Player title |
| Secondary | 14px | 400 | User name, body text |
| Meta / Caption | 13px | 500 | Кнопки действий в карточке |
| Small | 12px | 400–500 | Channel name, alt-chip |
| Tiny | 11px | 500–600 | Duration badge, platform badge, alt-label |
| Micro | 10px | 400 | Alt-label uppercase |

Межстрочный интервал: `1.4` (body), `1.5` (modal text)
Clamp для названий видео: `-webkit-line-clamp: 2`

---

## Отступы

| Контекст | Значение |
|---|---|
| Внешний padding экрана | `16px` |
| Внутренний padding карточки | `10px 12px` |
| Gap между карточками | `12px` |
| Gap между элементами внутри | `4–8px` |
| Gap между кнопками alt-chip | `6px` |
| Padding кнопки действия | `10px 8px` |
| Padding alt-chip | `5px 10px` |
| Padding resume modal | `28px 24px 24px` |
| Safe area bottom | `env(safe-area-inset-bottom, 0px)` — всегда учитывать в плеере |

---

## Border Radius

| Элемент | Radius |
|---|---|
| Карточка (card) | `12px` |
| Кнопка (primary/secondary) | `10px` |
| Alt-chip | `12px` |
| Duration badge | `4px` |
| Platform badge | `10px` |
| Watched badge | `50%` (круг) |
| Кнопка назад в плеере | `50%` (круг) |
| Modal | `16px` |
| Прогресс-бар / скролл | `2–4px` |
| Skeleton line | `4px` |

---

## Интерактивность

### Нажатие (active states)
- Карточка: `transform: scale(0.98)` — плавно, `transition: 0.1s`
- Alt-chip: `transform: scale(0.95)`, `opacity` fade — `0.1s / 0.15s`
- Кнопка действия: `background: var(--tg-theme-bg-color)` (подсветка)
- Primary button: `opacity: 0.8` или `scale(0.96)`

**Правило:** Всегда давать тактильный отклик на tap. Никаких мёртвых зон.

### Переходы
- Основной: `0.1s–0.2s ease` / `ease-out`
- Цвет/opacity: `0.15s`
- Трансформация плеера: `0.22s ease-out`
- Анимации: только `transform` и `opacity` — никаких `width/height` transitions

### Состояния кнопок
- Неактивная: `var(--tg-theme-hint-color)`
- Активная (watched): `var(--tg-theme-button-color)`

---

## Компоненты

### Карточка видео (VideoCard)

```
┌─────────────────────────────────┐
│  [Thumbnail 16:9]               │
│  [Platform badge]  [Duration]   │  ← оверлей на thumbnail
├─────────────────────────────────┤
│  Название видео (2 строки max)  │  padding: 10px 12px 0
│  Канал                          │
│  [Также на:] [chip] [chip]      │
├─────────────────────────────────┤
│  [Смотреть]  │  [Удалить]       │  border-top разделитель
└─────────────────────────────────┘
```

- Фон: `secondary-bg-color`, `border-radius: 12px`
- Thumbnail: `aspect-ratio: 16/9`, `object-fit: cover`
- Platform badge: левый нижний угол thumbnail, `rgba(0,0,0,0.65)`, blur

### Alt-chip (платформенная ссылка)

Иконка платформы (SVG, `16×16`) + название. Border: `rgba(128,128,128,0.25)`. Прозрачный фон.

### Кнопки действий в карточке

Flex-row, каждая `flex: 1`. Разделители — `border-left: 1px solid bg-color`. Высота: `~40px` (padding 10px + текст).

### Модальное окно (Resume / общий паттерн)

- Оверлей: `rgba(0,0,0,0.75)`, full-screen, `align-items: center`
- Карточка: `bg-color`, `border-radius: 16px`, `max-width: 320px`
- Иконка: `36px` emoji вверху
- Текст: `16px / 1.5`, акцент через `button-color`
- Прогресс: тонкий трек `3px`, `secondary-bg-color`, fill `button-color`
- Кнопки: два `flex: 1`, primary = `button-color`, secondary = `secondary-bg-color`

**Стиль модалок — единый стандарт для всего приложения.** Не изобретать новые варианты.

### Плеер

- Фон: `rgba(0,0,0,0.95)`, full-screen fixed
- Кнопка назад: `48×48`, `rgba(0,0,0,0.5)`, круг, `backdrop-filter: blur(8px)`
- Bottom bar: gradient `transparent → rgba(0,0,0,0.7)`, blur, safe-area-aware
- Управление: pointer-events раздельно — stage без pointer events, контролы с

---

## Иконки платформ

SVG-компоненты, не PNG/эмодзи:

| Платформа | Компонент | Размер в badge | Размер в chip |
|---|---|---|---|
| YouTube | `YouTubeIcon` | `16×16` | `16×16` |
| VK Video | `VKIcon` | `16×16` | `16×16` |
| Rutube | `RutubeIcon` | `16×16` | `16×16` |

Иконки используют `useId()` для уникальных SVG-дескрипторов.

---

## Скелетон (loading state)

- Фон: `secondary-bg-color`, border-radius как у карточки
- Пульсация: `opacity 0.4 → 0.15`, `1.4s ease-in-out infinite`
- Структура: thumbnail + 2 строки текста + actions row
- Никаких spinner'ов в списке — только скелетон

Spinner (`24px`, `border 2px`) — только для изолированных состояний загрузки (плеер).

---

## Запрещено

- ❌ Хардкодить hex-цвета в компонентах (только через `var(--tg-*)` или оверлейные константы)
- ❌ Градиенты в UI (только в плеере: bottom bar gradient)
- ❌ Box-shadow на карточках (разделение через цвет фона)
- ❌ Border у карточек (только у alt-chip и разделителей `bg-color`)
- ❌ Анимации через `width/height` — только `transform/opacity`
- ❌ Новые паттерны модалок — использовать существующий resume-modal как шаблон
- ❌ Emoji как иконки платформ — только SVG-компоненты
- ❌ Шрифты отличные от системного стека

---

## Tone of voice (текст в UI)

Русский язык. Коротко, без пафоса:
- «Видео» (не «Мои видео» / «Коллекция»)
- «Просмотрено» (не «Отмечено как просмотренное»)
- «Подписки» (не «Отслеживаемые каналы»)
- «Продолжить с X:XX» (не «Возобновить воспроизведение с отметки»)
- «Начать заново» (не «Начать просмотр сначала»)
- Ошибки: «Не удалось удалить видео» — факт, без извинений

---

*Создан: 2026-03-01. Референс: нативный стиль Telegram Mini App.*
