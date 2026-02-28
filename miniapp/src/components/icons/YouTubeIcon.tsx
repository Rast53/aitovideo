import { useId } from 'react';

interface IconProps {
  size?: number;
  className?: string;
}

export function YouTubeIcon({ size = 20, className }: IconProps) {
  const uid = useId();
  const bgId = `yt-bg-${uid}`;
  const glossId = `yt-gloss-${uid}`;

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
        <linearGradient id={bgId} x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FF1A1A" />
          <stop offset="100%" stopColor="#CC0000" />
        </linearGradient>
        <linearGradient id={glossId} x1="256" y1="0" x2="256" y2="256" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="white" stopOpacity="0.18" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect x="16" y="16" width="480" height="480" rx="96" fill={`url(#${bgId})`} />
      <rect x="16" y="16" width="480" height="240" rx="96" fill={`url(#${glossId})`} />
      <path d="M208 176 L352 256 L208 336Z" fill="white" />
    </svg>
  );
}

export default YouTubeIcon;
