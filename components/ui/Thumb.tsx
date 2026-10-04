/**
 * Small square image for list rows. Images are public Supabase Storage URLs;
 * next/image would need remotePatterns config for what is only a thumbnail.
 */
export function Thumb({
  src,
  size = 40,
  placeholder = "—",
  round = false,
}: {
  src: string | null | undefined;
  size?: number;
  placeholder?: string;
  round?: boolean;
}) {
  const shape = round ? "rounded-full" : "rounded-lg";
  if (!src) {
    return (
      <div
        style={{ width: size, height: size }}
        className={`flex shrink-0 items-center justify-center border border-border bg-slate-50 px-1 text-center text-[10px] leading-tight text-muted ${shape}`}
      >
        {placeholder}
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      style={{ width: size, height: size }}
      className={`shrink-0 border border-border object-cover ${shape}`}
    />
  );
}
