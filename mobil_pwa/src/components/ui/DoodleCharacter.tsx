export type DoodleMood = 'curious' | 'calm' | 'warn' | 'celebrate';

interface DoodleCharacterProps {
  size?: number;
  className?: string;
  mood?: DoodleMood;
}

const FILL: Record<DoodleMood, string> = {
  curious: '#d9e6da',
  calm: '#d9e6da',
  warn: '#ffd9bf',
  celebrate: '#c8f2d3',
};

const MOUTH: Record<DoodleMood, string> = {
  curious: 'M44,66 Q50,68 56,66',
  calm: 'M45,65 Q50,70 55,65',
  warn: 'M44,67 L56,67',
  celebrate: 'M42,64 Q50,74 58,64',
};

function DoodleSvg({
  size,
  mood = 'calm',
  className,
  stroke = '#1A1A1A',
}: {
  size: number;
  mood?: DoodleMood;
  className?: string;
  stroke?: string;
}) {
  const fill = FILL[mood];
  const tilt = mood === 'curious' ? -6 : 0;
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      style={tilt ? { transform: `rotate(${tilt}deg)` } : undefined}
    >
      <path
        d="M30,40 C20,35 15,45 15,55 C15,70 30,85 50,85 C70,85 85,70 85,55 C85,45 80,35 70,40 C75,30 70,20 60,15 C50,10 40,15 35,25 C25,20 20,30 30,40"
        fill={fill}
        stroke={stroke}
        strokeWidth="1.5"
      />
      <circle cx="40" cy="55" r={mood === 'curious' ? 3.5 : 3} fill={stroke} />
      <circle cx="60" cy="55" r={mood === 'curious' ? 3.5 : 3} fill={stroke} />
      <path d={MOUTH[mood]} fill="none" stroke={stroke} strokeLinecap="round" strokeWidth="1.5" />
      <path d="M40,85 L40,95 M60,85 L60,95" stroke={stroke} strokeWidth="1.5" />
      {mood === 'celebrate' && (
        <>
          <path
            d="M78,22 l1.5,4.5 4.5,1.5 -4.5,1.5 -1.5,4.5 -1.5-4.5 -4.5-1.5 4.5-1.5z"
            fill={stroke}
            opacity="0.85"
          />
          <path
            d="M18,28 l1,3 3,1 -3,1 -1,3 -1-3 -3-1 3-1z"
            fill={stroke}
            opacity="0.7"
          />
        </>
      )}
    </svg>
  );
}

export default function DoodleCharacter({
  size = 100,
  className,
  mood = 'calm',
}: DoodleCharacterProps) {
  return (
    <div className={className}>
      <DoodleSvg size={size} mood={mood} />
    </div>
  );
}

export function CharacterIcon({
  size = 100,
  className,
  mood = 'calm',
}: DoodleCharacterProps) {
  return <DoodleSvg size={size} mood={mood} className={className} stroke="#1c1b1b" />;
}

export function SparkleIcon({
  size = 24,
  className,
  color = 'currentColor',
}: DoodleCharacterProps & { color?: string }) {
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
