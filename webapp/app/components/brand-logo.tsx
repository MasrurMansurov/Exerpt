"use client";

export function BrandLogo({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 48 48"
      role="img"
      aria-label="Codepact"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="48" height="48" rx="12" fill="#091413" />
      <path
        d="M15 16.5 9.8 24 15 31.5"
        fill="none"
        stroke="#B0E4CC"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="3.2"
      />
      <path
        d="M33 16.5 38.2 24 33 31.5"
        fill="none"
        stroke="#B0E4CC"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="3.2"
      />
      <path
        d="M25.5 11.5 20.5 36.5"
        fill="none"
        stroke="#408A71"
        strokeLinecap="round"
        strokeWidth="3.2"
      />
      <circle cx="24" cy="24" r="6.5" fill="#285A48" stroke="#B0E4CC" strokeWidth="2.2" />
      <circle cx="24" cy="24" r="2.2" fill="#B0E4CC" />
    </svg>
  );
}
