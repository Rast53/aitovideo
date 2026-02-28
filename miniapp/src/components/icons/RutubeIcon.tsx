import { useId } from 'react';

interface IconProps {
  size?: number;
  className?: string;
}

export function RutubeIcon({ size = 20, className }: IconProps) {
  const uid = useId();
  const bgId = `rt-bg-${uid}`;
  const waveId = `rt-wave-${uid}`;

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
          <stop offset="0%" stopColor="#2ECC71" />
          <stop offset="100%" stopColor="#1A9B52" />
        </linearGradient>
        <linearGradient id={waveId} x1="0" y1="256" x2="512" y2="256" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="white" stopOpacity="0.08" />
          <stop offset="50%" stopColor="white" stopOpacity="0.15" />
          <stop offset="100%" stopColor="white" stopOpacity="0.05" />
        </linearGradient>
      </defs>
      <rect x="16" y="16" width="480" height="480" rx="96" fill={`url(#${bgId})`} />
      <path
        d="M16 280 Q128 240 256 270 Q384 300 496 260 L496 496 Q496 496 480 496 L32 496 Q16 496 16 480Z"
        fill={`url(#${waveId})`}
      />
      <path d="M208 176 L352 256 L208 336Z" fill="white" fillOpacity="0.95" />
      <path
        d="M100 380 Q180 350 256 370 Q332 390 412 360"
        stroke="white"
        strokeWidth="6"
        strokeOpacity="0.3"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

export default RutubeIcon;
