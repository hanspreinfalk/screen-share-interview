"use client";

import { useState } from "react";

import { resolveAppLogo, type AppLogo as AppLogoData } from "@/lib/app-logos";
import { cn } from "@/lib/utils";

/**
 * Renders the real logo for an application name.
 *
 * Favicon loads can fail offline or for an unmapped guess, so those degrade to
 * a neutral monogram rather than a broken image. Returns null for generic
 * surfaces ("browser", "spreadsheet") so we never show a misleading brand.
 */
export function AppLogo({
  name,
  size = 16,
  className,
  onDark = false,
}: {
  name?: string | null;
  size?: number;
  className?: string;
  onDark?: boolean;
}) {
  const logo = resolveAppLogo(name);
  if (!logo) return null;
  return (
    <LogoMark
      logo={logo}
      size={size}
      className={className}
      onDark={onDark}
    />
  );
}

function LogoMark({
  logo,
  size,
  className,
  onDark,
}: {
  logo: AppLogoData;
  size: number;
  className?: string;
  onDark: boolean;
}) {
  const [faviconFailed, setFaviconFailed] = useState(false);

  const box = cn("inline-flex shrink-0 items-center justify-center", className);
  const style = { width: size, height: size };

  if (logo.kind === "svg") {
    // Pure-black marks disappear on dark panels, so invert those to white.
    const isNearBlack = /^#(0{6}|1[0-9a-f]{5})$/i.test(logo.hex);
    const fill = onDark && isNearBlack ? "#fafafa" : logo.hex;
    return (
      <span className={box} style={style} title={logo.title}>
        <svg
          role="img"
          aria-label={logo.title}
          viewBox="0 0 24 24"
          width={size}
          height={size}
          fill={fill}
        >
          <path d={logo.path} />
        </svg>
      </span>
    );
  }

  if (logo.kind === "favicon" && !faviconFailed) {
    return (
      <span className={box} style={style} title={logo.title}>
        {/* eslint-disable-next-line @next/next/no-img-element -- remote
            favicon host, intentionally not run through the image optimizer */}
        <img
          src={logo.src}
          alt={logo.title}
          width={size}
          height={size}
          // Eager: these are tiny, and lazy loading inside a transformed
          // React Flow canvas can leave them unloaded.
          loading="eager"
          decoding="async"
          className="size-full rounded-[2px] object-contain"
          onError={() => setFaviconFailed(true)}
        />
      </span>
    );
  }

  const initial =
    logo.kind === "monogram"
      ? logo.initial
      : (logo.title.match(/[a-z0-9]/i)?.[0] ?? "?").toUpperCase();

  return (
    <span
      className={cn(
        box,
        "rounded-[3px] font-medium",
        onDark ? "bg-white/15 text-white/80" : "bg-black/[0.07] text-black/55",
      )}
      style={{ ...style, fontSize: Math.max(8, Math.round(size * 0.6)) }}
      title={logo.title}
      aria-label={logo.title}
    >
      {initial}
    </span>
  );
}
