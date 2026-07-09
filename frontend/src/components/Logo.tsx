import Link from "next/link";

interface LogoProps {
  size?: "sm" | "lg";
  className?: string;
  /** "dark" renders white text for use on the deep-teal sidebar */
  variant?: "light" | "dark";
}

export default function Logo({ size = "sm", className = "", variant = "light" }: LogoProps) {
  const iconClass = size === "lg" ? "h-14" : "h-10";
  const textSize  = size === "lg" ? "text-2xl" : "text-lg";
  const tailorColor = variant === "dark" ? "#ffffff" : "#1E5854";
  // The logo art is dark — on the deep-teal sidebar it sits on a white tile
  const imgClass = variant === "dark"
    ? `${iconClass} w-auto block bg-white rounded-lg p-1`
    : `${iconClass} w-auto block`;

  return (
    <Link href="/" className={`flex items-center gap-2.5 ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.png" alt="" aria-hidden="true" className={imgClass} />
      <span className={`${textSize} font-bold leading-none tracking-tight`}>
        <span style={{ color: tailorColor }}>CV</span>
        <span style={{ color: "#10B981" }}>Tailora</span>
      </span>
    </Link>
  );
}
