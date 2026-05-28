import Link from "next/link";

interface LogoProps {
  size?: "sm" | "lg";
  className?: string;
}

export default function Logo({ size = "sm", className = "" }: LogoProps) {
  const iconClass = size === "lg" ? "h-14" : "h-10";
  const textSize  = size === "lg" ? "text-2xl" : "text-lg";

  return (
    <Link href="/" className={`flex items-center gap-2.5 ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.png" alt="" aria-hidden="true" className={`${iconClass} w-auto block`} />
      <span className={`${textSize} font-bold leading-none tracking-tight`}>
        <span style={{ color: "#1B3868" }}>Tailor</span>
        <span style={{ color: "#10C9A0" }}>MyCv</span>
      </span>
    </Link>
  );
}
