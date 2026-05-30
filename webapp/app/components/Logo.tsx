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
  const wordmark = (
    <span className={`exerpt-wordmark ${wordmarkClassName}`} aria-label="Exerpt">
      <span aria-hidden="true">E</span>
      <svg
        aria-hidden="true"
        className="exerpt-wordmark__x"
        viewBox="0 0 24 24"
        focusable="false"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M5 5.75 19 18.25" />
        <path d="M19 5.75 5 18.25" />
        <circle cx="12" cy="12" r="1.65" />
      </svg>
      <span aria-hidden="true">erpt</span>
    </span>
  );

  return (
    <span className={`inline-flex min-w-0 items-center gap-2 text-primary ${className}`}>
      {showWordmark ? wordmark : <LogoGlyph iconClassName={iconClassName} />}
    </span>
  );
}

function LogoGlyph({ iconClassName }: { iconClassName: string }) {
  return (
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
  );
}
