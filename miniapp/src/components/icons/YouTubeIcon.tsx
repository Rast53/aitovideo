import { useId } from 'react';

interface IconProps {
  size?: number;
  className?: string;
}

// YouTube icon: classic red rounded rect + white play container + red triangle
// Matches YouTube brand style (not a copy — unique composition)
export function YouTubeIcon({ size = 20, className }: IconProps) {
  const uid = useId();
  const bgId = `yt-bg-${uid}`;
  const clipId = `yt-clip-${uid}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id={bgId} x1="0" y1="0" x2="0" y2="512" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FF1A1A" />
          <stop offset="100%" stopColor="#C4000D" />
        </linearGradient>
        <clipPath id={clipId}>
          <rect width="512" height="512" rx="112" />
        </clipPath>
      </defs>
      <rect width="512" height="512" rx="112" fill={`url(#${bgId})`} />
      <g clipPath={`url(#${clipId})`}>
        {/* White rounded play container */}
        <rect x="56" y="148" width="400" height="216" rx="48" fill="white" />
        {/* Red play triangle */}
        <path d="M214 196 L348 256 L214 316Z" fill="#C4000D" />
      </g>
    </svg>
  );
}

export default YouTubeIcon;
