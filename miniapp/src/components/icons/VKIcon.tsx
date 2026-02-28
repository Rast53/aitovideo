import { useId } from 'react';

interface IconProps {
  size?: number;
  className?: string;
}

// VK icon: official blue background + VK letterform from simple-icons
// Brand color: #0077FF (VK official blue)
export function VKIcon({ size = 20, className }: IconProps) {
  const uid = useId();
  const bgId = `vk-bg-${uid}`;
  const clipId = `vk-clip-${uid}`;

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
          <stop offset="0%" stopColor="#2787F5" />
          <stop offset="100%" stopColor="#0D5FCC" />
        </linearGradient>
        <clipPath id={clipId}>
          <rect width="512" height="512" rx="112" />
        </clipPath>
      </defs>
      <rect width="512" height="512" rx="112" fill={`url(#${bgId})`} />
      <g clipPath={`url(#${clipId})`}>
        {/*
          VK logotype — scaled from 24×24 simple-icons path to 512×512.
          Scale factor: 512/24 ≈ 21.33
          Translation: path starts near (4,0) so we shift to center
        */}
        <g transform="translate(256, 256) scale(17) translate(-12, -12)">
          <path
            d="M6.79 7.3H4.05c.13 6.24 3.25 9.99 8.72 9.99h.31v-3.57c2.01.2 3.53 1.67 4.14 3.57h2.84c-.78-2.84-2.83-4.41-4.11-5.01 1.28-.74 3.08-2.54 3.51-4.98h-2.58c-.56 1.98-2.22 3.78-3.8 3.95V7.3H10.5v6.92c-1.6-.4-3.62-2.34-3.71-6.92Z"
            fill="white"
          />
        </g>
      </g>
    </svg>
  );
}

export default VKIcon;
