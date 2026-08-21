/** Google "G" mark in Google's brand colors, used on the Skippe model picker. */
export function GoogleGlyph({ className = "h-4 w-4 shrink-0" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={`${className} shrink-0`} aria-hidden focusable="false">
      <path
        fill="#EA4335"
        d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.1.5 24 .5 14.6.5 6.5 5.8 2.6 13.6l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.5 24c0-1.6-.15-3.1-.4-4.5H24v9h12.6c-.55 2.9-2.2 5.3-4.6 7l7.7 6c4.5-4.2 6.8-10.3 6.8-17.5z"
      />
      <path fill="#FBBC05" d="M10.5 19.7A14.6 14.6 0 009.7 24c0 1.5.3 3 .8 4.3l-7.9 6.1A23.6 23.6 0 01.5 24c0-3.8.9-7.3 2.1-10.4l7.9 6.1z" />
      <path
        fill="#34A853"
        d="M24 47.5c6.1 0 11.3-2 15.1-5.5l-7.7-6c-2.1 1.4-4.8 2.3-7.4 2.3-6.3 0-11.6-4.1-13.5-9.9l-7.9 6.1C6.5 42.2 14.6 47.5 24 47.5z"
      />
    </svg>
  );
}
