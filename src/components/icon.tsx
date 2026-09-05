type IconProps = {
  name: string;
  className?: string;
  filled?: boolean;
  size?: number | string;
};

/** Google Material Symbols (fonts.google.com/icons) */
export function Icon({ name, className, filled, size }: IconProps) {
  return (
    <span
      className={`material-symbols-outlined${className ? ` ${className}` : ""}`}
      style={{
        ...(filled
          ? { fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" }
          : undefined),
        ...(size != null
          ? {
              fontSize: typeof size === "number" ? `${size}px` : size,
            }
          : undefined),
      }}
      aria-hidden
    >
      {name}
    </span>
  );
}
