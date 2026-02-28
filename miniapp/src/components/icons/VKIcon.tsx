interface IconProps {
  size?: number;
  className?: string;
}

// VK Video icon: two overlapping rounded squares — blue behind-left, red in front
// Matches VK Video app icon design
export function VKIcon({ size = 20, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Blue square — behind, offset left */}
      <rect x="16" y="64" width="340" height="340" rx="76" fill="#2787F5" />
      {/* Red square — front */}
      <rect x="120" y="108" width="340" height="340" rx="76" fill="#ED1C24" />
      {/* White play triangle — centered on red square */}
      <path d="M258 218 L370 278 L258 338Z" fill="white" />
    </svg>
  );
}

export default VKIcon;
