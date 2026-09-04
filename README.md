# СПРЕД — сайт-визитка

Иммерсивная визитка: видео (Caramelldansen HD PV) + синхронные спецэффекты на чистом
HTML/CSS/JS (WebAudio beat-движок, частицы-звёзды, глитч на склейках, кинетическая типографика).

## Структура
```
public/
  index.html          — разметка
  style.css           — дизайн-система
  app.js              — FX-движок (video + canvas + webaudio)
  assets/dance.mp4    — веб-луп 15s 720p (сегмент 15–30с исходника)
  assets/poster.jpg   — постер (кадр t=19с)
wrangler.toml         — конфиг Cloudflare Workers (static assets)
```

## Локальный запуск
```bash
python -m http.server 8080 -d public   # или npx serve public
# открой http://localhost:8080
```

## Деплой на Cloudflare Workers

### Вариант A — Git-интеграция (из GitHub, автоматически при пуше)
1. Запушь репозиторий на GitHub (owner: HVHBIGNAME, repo: spred).
2. Cloudflare Dashboard → Workers & Pages → Create → Workers → **Git integration** (Builds).
3. Подключи GitHub-аккаунт, выбери репозиторий `spred`, branch `main`.
4. Build settings: build command — пусто, root directory — пусто (файлы уже в корне).
5. Deploy. После каждого пуша сайт передеплоится сам.

### Вариант B — wrangler CLI
```bash
npm i -g wrangler        # или npx wrangler
wrangler login
wrangler deploy
# URL: https://spred.<ваш-subdomain>.workers.dev
```

### Вариант C — Cloudflare Pages (если захочешь Pages вместо Workers)
Dashboard → Pages → Create → Connect to Git → тот же репозиторий, build command пустой,
output dir `public`. Pages умеет отдавать mp4 (Range-запросы) без проблем.

## Пересборка видео-лупа
```bash
# исходник: source.mp4 (не в git). Луп = 15.0–30.0с исходника
ffmpeg -ss 15.0 -i source.mp4 -t 15 -vf "scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720" \
  -c:v libx264 -pix_fmt yuv420p -crf 23 -preset slow -movflags +faststart \
  -c:a aac -b:a 128k public/assets/dance.mp4
```

## Ограничения
- Cloudflare Workers static assets: файл ≤ 25 MiB (dance.mp4 ~10 МБ — ок).
- Автоплей со звуком требует жеста пользователя — для этого на сайте есть consent-gate.
- Discord-ссылка ведёт на профиль по user-id (открывается в приложении Discord).

© 2026 СПРЕД
