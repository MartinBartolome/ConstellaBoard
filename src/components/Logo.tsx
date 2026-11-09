export function LogoMark({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="16" fill="#5b7a5a" />
      <path d="M22 24 L44 22 M22 24 L34 44 M44 22 L34 44" stroke="#f7f3ec" strokeWidth="2.5" opacity=".6" />
      <circle cx="22" cy="24" r="7" fill="#f7f3ec" />
      <circle cx="44" cy="22" r="6" fill="#e8c9a0" />
      <circle cx="34" cy="44" r="8" fill="#f7f3ec" />
    </svg>
  )
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark size={compact ? 30 : 36} />
      <span className={`font-serif font-semibold tracking-tight text-ink ${compact ? 'text-lg' : 'text-xl'}`}>
        ConstellaBoard
      </span>
    </span>
  )
}
