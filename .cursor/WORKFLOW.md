---
agent:
  max_turns: 30
  stall_timeout_min: 10        # убить агента если нет активности > 10 мин
  approval_policy: auto        # auto-approve shell commands
branch_pattern: "{type}/#{issue}-{slug}"
pr_prefix: "[auto]"
---

# AitoVideo — Agent Workflow Policy

## Старт каждой задачи

1. Прочитать `AGENTS.md` — стек, команды, ограничения
2. Прочитать `.openclaw/CONSTRAINTS.md` — красные линии
3. Если есть протокол — прочитать `.cursor/protocols/TASK-N/{context,plan,progress}.md`

## Формула промпта (XS/S задачи)

```
Context: Read AGENTS.md and .openclaw/CONSTRAINTS.md first.
Task: [описание задачи]
Verification: Run ./scripts/check.sh after all changes.
Branch: fix/#N-name or feat/#N-name
PR: [auto] fix: описание (#N)
```

## Формула промпта (M+ задачи с протоколом)

```
Context: Read AGENTS.md and .openclaw/ARCHITECTURE.md first.
Protocol: Read .cursor/protocols/TASK-N/{context,plan,progress}.md for task protocol.
Task:
  - Follow plan.md step by step
  - After each step: update progress.md (mark done, set next step), then commit
  - If blocked: set status HALT_BLOCKING in progress.md, describe question, stop
  - On completion: set status SUCCESS in progress.md
Git: Commit after each step — "feat: step K of #N — description"
Verification: Run ./scripts/check.sh after each step.
Branch: feat/#N-name or fix/#N-name
PR: [auto] feat: description (#N), include plan checklist in body
```

## После запуска агента — сразу ставить мониторы

```bash
# 1. watch-agent (сразу, с PID агента)
./scripts/watch-agent.sh <TASK_N> $(pwd) $AGENT_PID --install

# 2. watch-pr (после создания PR)
./scripts/watch-pr.sh <PR_N> Rast53/aitovideo --install
```

## Скрипты

| Команда | Что делает |
|---------|-----------|
| `./scripts/check.sh` | TypeScript typecheck + lint |
| `./scripts/build.sh` | Build + push Docker images |
| `./scripts/deploy.sh` | Deploy to Swarm + health check |
| `./scripts/logs.sh` | Tail сервисных логов |
| `./scripts/health.sh` | Health-check всех эндпоинтов |
| `./scripts/watch-agent.sh` | Монитор прогресса агента (progress.md → Telegram) |
| `./scripts/watch-pr.sh` | Монитор CI + автомерж PR |

## Terminal states (progress.md)

- `IN_PROGRESS` — работа идёт
- `SUCCESS` — всё выполнено, PR создан
- `HALT_BLOCKING` — нужно решение от человека (describe in ### Blocking question)
- `HALT_FAILURE` — агент упал, ручная диагностика

## Правила

- Никаких `console.log` — только `logger.ts` (pino)
- Никаких хардкоженных секретов
- Схема БД — священная (не дропать таблицы/колонки без миграции)
- ES modules — импорты с `.js` расширением
- При HALT_BLOCKING — останавливаться, не угадывать
