// First paint is from index.html; this only switches state. Progress follows the real start-up
// steps ('kc-stage' events, 0 to 1): no timed progress and no minimum hold.
const COPY = {
  "ko": [
    "불러오는 중…",
    "시작에 실패했습니다. 다시 시도해 주세요.",
    "다시 시도"
  ],
  "en": [
    "Loading…",
    "Could not start. Please try again.",
    "Retry"
  ],
  "ja": [
    "読み込み中…",
    "起動できませんでした。再試行してください。",
    "再試行"
  ],
  "zh-CN": [
    "正在加载…",
    "无法启动，请重试。",
    "重试"
  ],
  "zh-TW": [
    "載入中…",
    "無法啟動，請再試一次。",
    "重試"
  ],
  "es": [
    "Cargando…",
    "No se pudo iniciar. Inténtalo de nuevo.",
    "Reintentar"
  ],
  "fr": [
    "Chargement…",
    "Le démarrage a échoué. Réessayez.",
    "Réessayer"
  ],
  "de": [
    "Wird geladen…",
    "Der Start ist fehlgeschlagen. Bitte erneut versuchen.",
    "Erneut versuchen"
  ],
  "it": [
    "Caricamento…",
    "Avvio non riuscito. Riprova.",
    "Riprova"
  ],
  "nl": [
    "Laden…",
    "Opstarten mislukt. Probeer opnieuw.",
    "Opnieuw proberen"
  ],
  "pt-BR": [
    "Carregando…",
    "Não foi possível iniciar. Tente novamente.",
    "Tentar novamente"
  ],
  "ru": [
    "Загрузка…",
    "Не удалось запустить приложение. Повторите попытку.",
    "Повторить"
  ]
};
export function startSplash({splash, app, lang = 'en', retry, timeout = 15000}) {
  const message = splash.querySelector('.kc-boot-msg');
  const button = splash.querySelector('.kc-boot-retry');
  const [loading, failed, retryText] = COPY[lang] || COPY[lang.toLowerCase()] || COPY.en;
  message.textContent = loading;
  button.textContent = retryText;
  button.addEventListener('click', retry, { once:true });
  const watchdog = setTimeout(fail, timeout);
  const onStage = (e) => {
    if (splash.dataset.state !== 'loading') return;
    const p = Math.max(0, Math.min(1, Number(e.detail) || 0));
    splash.style.setProperty('--p', p);
    message.textContent = `${loading} ${Math.round(p * 100)}%`;
  };
  window.addEventListener('kc-stage', onStage);
  function fail() {
    clearTimeout(watchdog);
    if(splash.dataset.state === 'ready') return;
    splash.dataset.state = 'failed';
    message.textContent = failed;
    button.hidden = false;
  }
  function ready() {
    clearTimeout(watchdog);
    const keyboardWasInSplash = splash.contains(document.activeElement);
    splash.dataset.state = 'ready';
    window.removeEventListener('kc-stage', onStage);
    splash.setAttribute('aria-hidden','true');
    splash.inert = true;
    app.inert = false;
    app.removeAttribute('aria-busy');
    if(keyboardWasInSplash) { app.tabIndex = -1; app.focus({preventScroll:true}); }
    const hide = () => { splash.hidden = true; };
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) hide();
    else { splash.addEventListener('transitionend', hide, {once:true}); setTimeout(hide, 230); }
  }
  return { fail, ready };
}
export function startupLanguage() {
  try { const saved = localStorage.getItem('keycast.lang'); if (saved && Object.hasOwn(COPY, saved)) return saved; } catch { /* Storage can be disabled. */ }
  const tag = (navigator.language || 'en').toLowerCase();
  if (tag.startsWith('zh')) return /^zh-(tw|hk|mo|hant)/.test(tag) ? 'zh-TW' : 'zh-CN';
  if (tag.startsWith('pt')) return 'pt-BR';
  const base = tag.split('-')[0];
  return Object.hasOwn(COPY, base) ? base : 'en';
}
