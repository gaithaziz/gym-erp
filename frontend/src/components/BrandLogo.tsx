import Image from "next/image";

type BrandImageProps = {
  alt?: string;
  className?: string;
  priority?: boolean;
};

export function BrandLockup({
  alt = "OmniGYM",
  className,
  priority = false,
}: BrandImageProps) {
  return (
    <Image
      src="/brand/omnigym-logo.png"
      alt={alt}
      width={1024}
      height={1024}
      className={className}
      priority={priority}
    />
  );
}

export function BrandMark({
  alt = "OmniGYM",
  className,
  priority = false,
}: BrandImageProps) {
  return (
    <Image
      src="/brand/omnigym-mark.png"
      alt={alt}
      width={512}
      height={512}
      className={className}
      priority={priority}
    />
  );
}
