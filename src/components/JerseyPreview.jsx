export default function JerseyPreview({ primary, secondary, size = 100 }) {
  return (
    <svg viewBox="0 0 100 90" width={size} height={size * 0.9} aria-hidden="true">
      <path
        d="M50,12 L20,18 L4,34 L17,40 L17,80 L50,80 Z"
        fill={primary}
        stroke="rgba(0,0,0,0.08)"
        strokeWidth="0.5"
      />
      <path
        d="M50,12 L80,18 L96,34 L83,40 L83,80 L50,80 Z"
        fill={secondary}
        stroke="rgba(0,0,0,0.08)"
        strokeWidth="0.5"
      />
      <path
        d="M38,13 Q50,24 62,13"
        fill="none"
        stroke="rgba(255,255,255,0.6)"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}
