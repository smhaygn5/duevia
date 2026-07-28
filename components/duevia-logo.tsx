import Image from "next/image";

type DueviaLogoProps = {
  compactOnMobile?: boolean;
  priority?: boolean;
};

export function DueviaLogo({
  compactOnMobile = false,
  priority = false,
}: DueviaLogoProps) {
  const className = compactOnMobile
    ? "brand-logo brand-logo-compact"
    : "brand-logo";

  return (
    <span className={className} aria-hidden="true">
      <Image
        className="brand-logo-full"
        src="/duevia-logo-dark.svg"
        alt=""
        width={600}
        height={216}
        priority={priority}
        unoptimized
      />
      <Image
        className="brand-logo-mark"
        src="/duevia-mark-dark.svg"
        alt=""
        width={192}
        height={192}
        priority={priority}
        unoptimized
      />
    </span>
  );
}
