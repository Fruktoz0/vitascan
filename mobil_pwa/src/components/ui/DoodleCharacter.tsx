interface DoodleCharacterProps {
  size?: number;
  className?: string;
}

export default function DoodleCharacter({ size = 100, className }: DoodleCharacterProps) {
  return (
    <div className={className}>
      <svg width={size} height={size} viewBox="0 0 100 100">
        <path
          d="M30,40 C20,35 15,45 15,55 C15,70 30,85 50,85 C70,85 85,70 85,55 C85,45 80,35 70,40 C75,30 70,20 60,15 C50,10 40,15 35,25 C25,20 20,30 30,40"
          fill="#d9e6da"
          stroke="#1A1A1A"
          strokeWidth="1.5"
        />
        <circle cx="40" cy="55" r="3" fill="#1A1A1A" />
        <circle cx="60" cy="55" r="3" fill="#1A1A1A" />
        <path d="M45,65 Q50,70 55,65" fill="none" stroke="#1A1A1A" strokeLinecap="round" strokeWidth="1.5" />
        <path d="M40,85 L40,95 M60,85 L60,95" stroke="#1A1A1A" strokeWidth="1.5" />
      </svg>
    </div>
  );
}

export function CharacterIcon({ size = 100, className }: DoodleCharacterProps) {
  return (
    <svg className={className} viewBox="0 0 100 100" width={size} height={size}>
      <path
        d="M30,40 C20,35 15,45 15,55 C15,70 30,85 50,85 C70,85 85,70 85,55 C85,45 80,35 70,40 C75,30 70,20 60,15 C50,10 40,15 35,25 C25,20 20,30 30,40"
        fill="#d9e6da"
        stroke="#1c1b1b"
        strokeWidth="1.5"
      />
      <circle cx="40" cy="55" fill="#1c1b1b" r="3" />
      <circle cx="60" cy="55" fill="#1c1b1b" r="3" />
      <path d="M45,65 Q50,70 55,65" fill="none" stroke="#1c1b1b" strokeLinecap="round" strokeWidth="1.5" />
      <path d="M40,85 L40,95 M60,85 L60,95" stroke="#1c1b1b" strokeWidth="1.5" />
    </svg>
  );
}

export function SparkleIcon({ size = 24, className, color = 'currentColor' }: DoodleCharacterProps & { color?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke={color}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.5"
      viewBox="0 0 24 24"
      width={size}
      height={size}
    >
      <path d="M12 3v3m0 12v3m9-9h-3M6 12H3m14.485-6.364l-2.121 2.121M7.636 17.657l-2.121 2.121m14.485 0l-2.121-2.121M7.636 6.343L5.515 4.222" />
    </svg>
  );
}
