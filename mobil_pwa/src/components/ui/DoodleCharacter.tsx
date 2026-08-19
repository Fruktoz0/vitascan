export type DoodleMood = 'curious' | 'calm' | 'warn' | 'celebrate';

interface DoodleCharacterProps {
  size?: number;
  className?: string;
  mood?: DoodleMood;
}

const BODY = '#eef7ef';

const MOOD: Record<
  DoodleMood,
  { belly: string; accent: string; sparkA: string; sparkB: string }
> = {
  curious: { belly: '#cfe8d5', accent: '#6eae7e', sparkA: '#8fbf9a', sparkB: '#c8f2d3' },
  calm: { belly: '#c8f2d3', accent: '#5f9f72', sparkA: '#c8f2d3', sparkB: '#a8d4b4' },
  warn: { belly: '#d7e6c9', accent: '#7a9a62', sparkA: '#b5c99a', sparkB: '#c8f2d3' },
  celebrate: { belly: '#b6e8c4', accent: '#3f9a68', sparkA: '#7dcaa0', sparkB: '#c8f2d3' },
};

const MOUTH: Record<DoodleMood, string> = {
  curious: 'M44,67 Q50,69 56,67',
  calm: 'M44,66 Q50,72 56,66',
  warn: 'M44,68 Q50,66 56,68',
  celebrate: 'M42,65 Q50,76 58,65',
};

function Spark({ cx, cy, r, fill }: { cx: number; cy: number; r: number; fill: string }) {
  return (
    <path
      d={`M${cx},${cy - r} l${r * 0.28},${r * 0.72} ${r * 0.72},${r * 0.28} ${-r * 0.72},${r * 0.28} ${-r * 0.28},${r * 0.72} ${-r * 0.28},${-r * 0.72} ${-r * 0.72},${-r * 0.28} ${r * 0.72},${-r * 0.28}z`}
      fill={fill}
    />
  );
}

function DoodleSvg({
  size,
  mood = 'calm',
  className,
  stroke = '#1c1b1b',
}: {
  size: number;
  mood?: DoodleMood;
  className?: string;
  stroke?: string;
}) {
  const palette = MOOD[mood];
  const tilt = mood === 'curious' ? -7 : mood === 'celebrate' ? 4 : 0;
  const uid = `doodle-${mood}`;
  const eyeLook = mood === 'curious' ? 1.4 : 0;
  const pupilR = mood === 'curious' ? 2.6 : 2.2;

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      style={tilt ? { transform: `rotate(${tilt}deg)` } : undefined }
    >
      <defs>
        <linearGradient id={`${uid}-body`} x1="30%" y1="10%" x2="80%" y2="90%">
          <stop offset="0%" stopColor="#f7fcf7" />
          <stop offset="50%" stopColor={BODY} />
          <stop offset="100%" stopColor={palette.belly} />
        </linearGradient>
      </defs>

      <ellipse cx="50" cy="90" rx="16" ry="4" fill={stroke} opacity="0.08" />

      <path
        d="M30,40 C20,35 15,45 15,55 C15,70 30,85 50,85 C70,85 85,70 85,55 C85,45 80,35 70,40 C75,30 70,20 60,15 C50,10 40,15 35,25 C25,20 20,30 30,40"
        fill={`url(#${uid}-body)`}
        stroke={stroke}
        strokeWidth="1.5"
      />

      <ellipse cx="50" cy="68" rx="16" ry="10" fill={palette.belly} opacity="0.95" />
      <path
        d="M38,22 C42,16 50,14 58,18"
        fill="none"
        stroke="#fff"
        strokeWidth="2.2"
        strokeLinecap="round"
        opacity="0.55"
      />

      <ellipse cx="34" cy="62" r="3.6" fill={palette.accent} opacity="0.22" />
      <ellipse cx="66" cy="62" r="3.6" fill={palette.accent} opacity="0.22" />

      <ellipse cx="39.5" cy="53.5" rx="6.2" ry="7" fill="#fff" stroke={stroke} strokeWidth="1.2" />
      <ellipse cx="60.5" cy="53.5" rx="6.2" ry="7" fill="#fff" stroke={stroke} strokeWidth="1.2" />
      <circle cx={39.5 + eyeLook} cy="54.5" r={pupilR} fill={stroke} />
      <circle cx={60.5 + eyeLook} cy="54.5" r={pupilR} fill={stroke} />
      <circle cx={37.6 + eyeLook} cy="52.4" r="1.15" fill="#fff" />
      <circle cx={58.6 + eyeLook} cy="52.4" r="1.15" fill="#fff" />

      {mood === 'curious' && (
        <path
          d="M32,44 Q36,40 42,42"
          fill="none"
          stroke={stroke}
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      )}
      {mood === 'warn' && (
        <>
          <path
            d="M32,45 L42,47"
            fill="none"
            stroke={stroke}
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <path
            d="M78,38 C78,32 84,34 83,40 C82,44 78,44 78,38Z"
            fill="#c5ddc9"
            stroke={stroke}
            strokeWidth="1.2"
          />
        </>
      )}

      <path d={MOUTH[mood]} fill="none" stroke={stroke} strokeLinecap="round" strokeWidth="1.6" />
      {mood === 'celebrate' && (
        <path d="M42,65 Q50,76 58,65 Q50,70 42,65" fill={palette.accent} opacity="0.18" />
      )}

      <path d="M40,85 L40,95 M60,85 L60,95" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="40" cy="95.5" r="1.6" fill={palette.accent} stroke={stroke} strokeWidth="1.1" />
      <circle cx="60" cy="95.5" r="1.6" fill={palette.accent} stroke={stroke} strokeWidth="1.1" />

      <path
        d="M62,16 C68,8 78,12 74,20 C70,18 66,18 62,16Z"
        fill={palette.accent}
        stroke={stroke}
        strokeWidth="1.3"
      />

      {(mood === 'celebrate' || mood === 'curious') && (
        <>
          <Spark cx={82} cy={24} r={mood === 'celebrate' ? 5.5 : 4} fill={palette.sparkA} />
          <Spark cx={18} cy={30} r={3.4} fill={palette.sparkB} />
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
