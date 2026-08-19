import { useId } from 'react';
import { getAvatarDef, type AvatarAccessory, type AvatarMood } from '../../design/avatars';

type Props = {
  avatarKey?: string | null;
  size?: number;
  className?: string;
};

const MOUTH: Record<AvatarMood, string> = {
  curious: 'M44,67 Q50,69 56,67',
  calm: 'M44,66 Q50,72 56,66',
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

function Accessory({
  type,
  accent,
  spark,
  stroke,
}: {
  type: AvatarAccessory;
  accent: string;
  spark: string;
  stroke: string;
}) {
  if (type === 'leaf') {
    return (
      <>
        <path d="M62,16 C68,8 78,12 74,20 C70,18 66,18 62,16Z" fill={accent} stroke={stroke} strokeWidth="1.3" />
        <path
          d="M28,22 C18,18 16,30 24,34 C22,28 24,24 28,22Z"
          fill={accent}
          stroke={stroke}
          strokeWidth="1.2"
        />
      </>
    );
  }
  if (type === 'drop') {
    return (
      <path
        d="M72,12 C72,12 80,24 76,28 C73,31 69,29 68,25 C66,20 72,12 72,12Z"
        fill={accent}
        stroke={stroke}
        strokeWidth="1.3"
      />
    );
  }
  if (type === 'apple') {
    return (
      <g>
        <path d="M70,10 Q74,6 78,10" fill="none" stroke={stroke} strokeWidth="1.3" strokeLinecap="round" />
        <circle cx="70" cy="18" r="6.2" fill={accent} stroke={stroke} strokeWidth="1.3" />
        <path d="M70,12 C72,10 76,11 76,14" fill="#5f9f72" stroke={stroke} strokeWidth="1" />
      </g>
    );
  }
  if (type === 'flame') {
    return (
      <path
        d="M72,8 C72,8 82,22 74,28 C70,30 66,26 67,20 C68,16 70,14 72,8Z"
        fill={accent}
        stroke={stroke}
        strokeWidth="1.3"
      />
    );
  }
  if (type === 'spark') {
    return (
      <>
        <path d="M62,16 C68,8 78,12 74,20 C70,18 66,18 62,16Z" fill={accent} stroke={stroke} strokeWidth="1.3" />
        <Spark cx={84} cy={22} r={5} fill={spark} />
        <Spark cx={16} cy={28} r={3.4} fill={spark} />
      </>
    );
  }
  return (
    <path d="M62,16 C68,8 78,12 74,20 C70,18 66,18 62,16Z" fill={accent} stroke={stroke} strokeWidth="1.3" />
  );
}

export default function DoodleAvatar({ avatarKey, size = 72, className }: Props) {
  const uid = useId();
  const def = getAvatarDef(avatarKey);
  const stroke = '#1c1b1b';
  const tilt = def.mood === 'curious' ? -6 : def.mood === 'celebrate' ? 4 : 0;
  const eyeLook = def.mood === 'curious' ? 1.3 : 0;
  const pupilR = def.mood === 'curious' ? 2.6 : 2.2;

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="6 8 88 90"
      aria-hidden
      style={tilt ? { transform: `rotate(${tilt}deg)` } : undefined}
    >
      <defs>
        <linearGradient id={`${uid}-body`} x1="30%" y1="10%" x2="80%" y2="90%">
          <stop offset="0%" stopColor="#fff" />
          <stop offset="45%" stopColor={def.body} />
          <stop offset="100%" stopColor={def.belly} />
        </linearGradient>
      </defs>

      <ellipse cx="50" cy="90" rx="16" ry="4" fill={stroke} opacity="0.08" />

      <path
        d="M30,40 C20,35 15,45 15,55 C15,70 30,85 50,85 C70,85 85,70 85,55 C85,45 80,35 70,40 C75,30 70,20 60,15 C50,10 40,15 35,25 C25,20 20,30 30,40"
        fill={`url(#${uid}-body)`}
        stroke={stroke}
        strokeWidth="1.5"
      />

      <ellipse cx="50" cy="68" rx="16" ry="10" fill={def.belly} opacity="0.95" />
      <path
        d="M38,22 C42,16 50,14 58,18"
        fill="none"
        stroke="#fff"
        strokeWidth="2.2"
        strokeLinecap="round"
        opacity="0.55"
      />

      <ellipse cx="34" cy="62" r="3.6" fill={def.accent} opacity="0.22" />
      <ellipse cx="66" cy="62" r="3.6" fill={def.accent} opacity="0.22" />

      <ellipse cx="39.5" cy="53.5" rx="6.2" ry="7" fill="#fff" stroke={stroke} strokeWidth="1.2" />
      <ellipse cx="60.5" cy="53.5" rx="6.2" ry="7" fill="#fff" stroke={stroke} strokeWidth="1.2" />
      <circle cx={39.5 + eyeLook} cy="54.5" r={pupilR} fill={stroke} />
      <circle cx={60.5 + eyeLook} cy="54.5" r={pupilR} fill={stroke} />
      <circle cx={37.6 + eyeLook} cy="52.4" r="1.15" fill="#fff" />
      <circle cx={58.6 + eyeLook} cy="52.4" r="1.15" fill="#fff" />

      {def.mood === 'curious' && (
        <path d="M32,44 Q36,40 42,42" fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" />
      )}

      <path d={MOUTH[def.mood]} fill="none" stroke={stroke} strokeLinecap="round" strokeWidth="1.6" />
      {def.mood === 'celebrate' && (
        <path d="M42,65 Q50,76 58,65 Q50,70 42,65" fill={def.accent} opacity="0.18" />
      )}

      <path d="M40,85 L40,95 M60,85 L60,95" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="40" cy="95.5" r="1.6" fill={def.accent} stroke={stroke} strokeWidth="1.1" />
      <circle cx="60" cy="95.5" r="1.6" fill={def.accent} stroke={stroke} strokeWidth="1.1" />

      <Accessory type={def.accessory} accent={def.accent} spark={def.spark} stroke={stroke} />
    </svg>
  );
}
