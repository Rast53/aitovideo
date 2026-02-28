import { useId } from 'react';

interface IconProps {
  size?: number;
  className?: string;
}

export function VKIcon({ size = 20, className }: IconProps) {
  const uid = useId();
  const bgId = `vk-bg-${uid}`;
  const shadowId = `vk-shadow-${uid}`;

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
          <stop offset="0%" stopColor="#5B8DEF" />
          <stop offset="100%" stopColor="#0054AF" />
        </linearGradient>
        <linearGradient id={shadowId} x1="256" y1="400" x2="256" y2="512" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="black" stopOpacity="0" />
          <stop offset="100%" stopColor="black" stopOpacity="0.12" />
        </linearGradient>
      </defs>
      <circle cx="256" cy="256" r="240" fill={`url(#${bgId})`} />
      <circle cx="256" cy="256" r="240" fill={`url(#${shadowId})`} />
      <path
        d="M148 192 Q148 192 192 320 Q210 368 240 320 L256 288 L272 320 Q302 368 320 320 Q364 192 364 192"
        stroke="white"
        strokeWidth="36"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

export default VKIcon;
