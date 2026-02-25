import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import type { Video, VideoPlatform, VideoProgress } from '../types/api';
import './Player.css';

const platformIcons: Record<VideoPlatform, string> = {
  youtube: '📺',
  rutube: '▶️',
  vk: '🔴'
};

interface PlayerProps {
  video: Video;
  onClose: () => void;
}

type ExtendedDocument = Document & {
  webkitFullscreenElement?: Element;
  webkitExitFullscreen?: () => void;
};

type ExtendedHTMLElement = HTMLElement & {
  webkitRequestFullscreen?: () => void;
};

type ExtendedScreenOrientation = ScreenOrientation & {
  lock?: (orientation: string) => Promise<void>;
  unlock?: () => void;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function getEmbedUrl(platform: VideoPlatform, externalId: string, startSeconds: number): string | null {
  const t = Math.floor(startSeconds);
  switch (platform) {
    case 'youtube':
      return `https://www.youtube-nocookie.com/embed/${externalId}?autoplay=1${t > 0 ? `&start=${t}` : ''}`;
    case 'rutube':
      return `https://rutube.ru/play/embed/${externalId}${t > 0 ? `?t=${t}` : ''}`;
    case 'vk': {
      const [oid, vid] = externalId.split('_');
      if (!oid || !vid) return null;
      return `https://vk.com/video_ext.php?oid=${oid}&id=${vid}&hd=2&autoplay=1`;
    }
    default:
      return null;
  }
}

const MIN_RESUME_SECONDS = 10;
const SAVE_INTERVAL_MS = 10_000;

// ─── Component ────────────────────────────────────────────────────────────────

export function Player({ video, onClose }: PlayerProps) {
  const [loading, setLoading] = useState(true);

  // Progress / resume
  const [savedProgress, setSavedProgress] = useState<VideoProgress | null>(null);
  const [showResumeModal, setShowResumeModal] = useState(false);
  const [startFrom, setStartFrom] = useState(0);
  const [playbackReady, setPlaybackReady] = useState(false);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const elapsedRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const videoIdRef = useRef(video.id);
  useEffect(() => { videoIdRef.current = video.id; }, [video.id]);

  function clearTimers() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (saveTimerRef.current) { clearInterval(saveTimerRef.current); saveTimerRef.current = null; }
  }

  // ── Unmount: flush final position ────────────────────────────────────────
  useEffect(() => {
    return () => {
      clearTimers();
      const pos = elapsedRef.current;
      if (pos >= MIN_RESUME_SECONDS) {
        api.saveProgress(videoIdRef.current, pos).catch(() => {});
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Enter fullscreen on mount ─────────────────────────────────────────────
  useEffect(() => {
    const enterFullscreen = async () => {
      if (window.Telegram?.WebApp?.requestFullscreen) {
        try { window.Telegram.WebApp.requestFullscreen(); } catch { /* */ }
      }
      const el = wrapperRef.current as ExtendedHTMLElement | null;
      if (el && !document.fullscreenElement) {
        try {
          if (el.requestFullscreen) await el.requestFullscreen();
          else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
        } catch { /* */ }
      }
      try {
        const o = screen.orientation as ExtendedScreenOrientation;
        if (o?.lock) await o.lock('landscape');
      } catch { /* */ }
    };

    void enterFullscreen();

    return () => {
      if (window.Telegram?.WebApp?.exitFullscreen) {
        try { window.Telegram.WebApp.exitFullscreen(); } catch { /* */ }
      }
      const doc = document as ExtendedDocument;
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      } else if (doc.webkitFullscreenElement && doc.webkitExitFullscreen) {
        try { doc.webkitExitFullscreen(); } catch { /* */ }
      }
      try {
        const o = screen.orientation as ExtendedScreenOrientation;
        if (o?.unlock) o.unlock();
      } catch { /* */ }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Fetch saved progress on mount ─────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    api.getProgress(video.id)
      .then((res) => {
        if (cancelled) return;
        const p = res.progress;
        if (p && p.position_seconds >= MIN_RESUME_SECONDS) {
          setSavedProgress(p);
          setShowResumeModal(true);
        } else {
          setPlaybackReady(true);
        }
      })
      .catch(() => {
        if (!cancelled) setPlaybackReady(true);
      });
    return () => { cancelled = true; };
  }, [video.id]);

  // ── Start elapsed timer once playback begins ──────────────────────────────
  useEffect(() => {
    if (!playbackReady) return;

    elapsedRef.current = startFrom;

    timerRef.current = setInterval(() => { elapsedRef.current += 1; }, 1000);

    saveTimerRef.current = setInterval(() => {
      const pos = elapsedRef.current;
      if (pos >= MIN_RESUME_SECONDS) {
        api.saveProgress(videoIdRef.current, pos).catch(() => {});
      }
    }, SAVE_INTERVAL_MS);

    return clearTimers;
  }, [playbackReady, startFrom]);

  // ── Resume handlers ───────────────────────────────────────────────────────
  const handleResumeYes = () => {
    setStartFrom(savedProgress?.position_seconds ?? 0);
    setShowResumeModal(false);
    setPlaybackReady(true);
  };

  const handleResumeNo = () => {
    setStartFrom(0);
    setShowResumeModal(false);
    setPlaybackReady(true);
    api.saveProgress(video.id, 0).catch(() => {});
  };

  // ─────────────────────────────────────────────────────────────────────────
  if (!video) return null;

  const isProgressLoading = !showResumeModal && !playbackReady;
  const embedUrl = playbackReady ? getEmbedUrl(video.platform, video.external_id, startFrom) : null;

  return (
    <div className="player-overlay" onClick={onClose}>
      <div className="player-container" onClick={(e) => e.stopPropagation()} ref={wrapperRef}>

        {/* ── Back button ──────────────────────────────────────────────── */}
        <button
          className="player-back-btn"
          onClick={onClose}
          aria-label="Назад к списку"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
          </svg>
        </button>

        {/* ── Video title overlay ───────────────────────────────────────── */}
        <div className="player-title-overlay">
          {platformIcons[video.platform]} {video.title}
        </div>

        {/* ── Resume modal ─────────────────────────────────────────────── */}
        {showResumeModal && savedProgress && (
          <div className="resume-modal-overlay" onClick={(e) => e.stopPropagation()}>
            <div className="resume-modal">
              <div className="resume-modal__icon">▶️</div>
              <p className="resume-modal__text">
                Продолжить просмотр с{' '}
                <strong>{formatTime(savedProgress.position_seconds)}</strong>?
              </p>
              <div className="resume-modal__actions">
                <button className="resume-modal__btn resume-modal__btn--primary" onClick={handleResumeYes}>
                  Продолжить
                </button>
                <button className="resume-modal__btn resume-modal__btn--secondary" onClick={handleResumeNo}>
                  С начала
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Video area ───────────────────────────────────────────────── */}
        {(loading || isProgressLoading) && (
          <div className="player-loading"><div className="spinner" /></div>
        )}

        {embedUrl ? (
          <iframe
            ref={iframeRef}
            src={embedUrl}
            title={video.title}
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
            onLoad={() => setLoading(false)}
          />
        ) : (
          !isProgressLoading && !showResumeModal && (
            <div className="player-error">Не удалось загрузить видео</div>
          )
        )}
      </div>
    </div>
  );
}

export default Player;
