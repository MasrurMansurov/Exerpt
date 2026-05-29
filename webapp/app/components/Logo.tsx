"use client";

type LogoProps = {
  className?: string;
  iconClassName?: string;
  wordmarkClassName?: string;
  showWordmark?: boolean;
};

export function Logo({
  className = "",
  iconClassName = "h-8 w-8",
  wordmarkClassName = "font-mono text-sm font-semibold tracking-normal",
  showWordmark = true
}: LogoProps) {
  return (
    <span className={`inline-flex min-w-0 items-center gap-2 text-primary ${className}`}>
      <svg
        className={`shrink-0 text-current ${iconClassName}`}
        width="24"
        height="24"
        viewBox="0 0 24 24"
        role="img"
        aria-label="Exerpt"
        focusable="false"
        xmlns="http://www.w3.org/2000/svg"
      >
        <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7">
          <path d="M3.75 6.75h7.5" opacity="0.44" />
          <path d="M3.75 12h5.75" opacity="0.7" />
          <path d="M3.75 17.25h7.5" opacity="0.44" />
          <path d="M11.5 7.25 16.25 12l-4.75 4.75" opacity="0.78" />
        </g>
        <rect
          x="15.7"
          y="9.7"
          width="4.6"
          height="4.6"
          rx="0.9"
          fill="currentColor"
          transform="rotate(45 18 12)"
        />
        <circle cx="18" cy="12" r="0.95" fill="rgb(var(--cp-bg))" />
      </svg>
      {showWordmark ? <span className={`truncate ${wordmarkClassName}`}>Exerpt</span> : null}
    </span>
  );
}
