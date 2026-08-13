/**
 * SafeImage.tsx — Reusable Image Component with Error Handling
 * -----------------------------------------------------------------------------
 * Handles broken Cloudinary URLs gracefully by:
 * 1. Showing image with loading state
 * 2. On error → Falls back to initials/avatar placeholder with gradient
 * 3. Supports different shapes (circle, rounded, square)
 * 4. Different sizes (sm, md, lg, xl)
 * 5. Gradient background for fallback
 * 6. Accessible alt text
 * 7. Optional onClick handler
 */

import { useState, useEffect } from "react";

interface SafeImageProps {
  src: string | null | undefined;
  alt?: string;
  fallbackText?: string; // For initials (e.g., "SA" for "Storm Eagle")
  className?: string;
  shape?: "circle" | "rounded" | "square";
  size?: "sm" | "md" | "lg" | "xl";
  onClick?: () => void;
}

// Size configurations mapping
const sizeConfig = {
  sm: { container: "w-8 h-8", text: "text-xs" },
  md: { container: "w-10 h-10", text: "text-sm" },
  lg: { container: "w-12 h-12", text: "text-base" },
  xl: { container: "w-16 h-16", text: "text-lg" },
};

// Shape class mapping
const shapeClass = {
  circle: "rounded-full",
  rounded: "rounded-lg",
  square: "rounded-none",
};

// Generate initials from a name string
function generateInitials(name?: string): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "?";
}

// Gradient combinations for visual variety based on name
function getGradientColors(text: string): string {
  const gradients = [
    "from-blue-500 to-purple-600",
    "from-emerald-500 to-teal-600",
    "from-orange-500 to-red-500",
    "from-pink-500 to-rose-600",
    "from-indigo-500 to-blue-600",
    "from-amber-500 to-orange-600",
    "from-cyan-500 to-blue-500",
    "from-violet-500 to-purple-600",
  ];
  
  // Use the text to pick a consistent gradient
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = text.charCodeAt(i) + ((hash << 5) - hash);
  }
  return gradients[Math.abs(hash) % gradients.length];
}

export function SafeImage({
  src,
  alt = "",
  fallbackText,
  className = "",
  shape = "circle",
  size = "md",
  onClick,
}: SafeImageProps) {
  const [imgError, setImgError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [currentSrc, setCurrentSrc] = useState<string | null | undefined>(src);

  // Reset error state when src changes
  useEffect(() => {
    setImgError(false);
    setIsLoading(true);
    setCurrentSrc(src);
  }, [src]);

  // Determine display text for fallback
  const displayText = fallbackText || generateInitials(alt);
  const gradientClass = getGradientColors(displayText);
  const sizeClasses = sizeConfig[size];
  const shapeClasses = shapeClass[shape];

  // Combined container classes
  const containerClassName = `
    ${sizeClasses.container}
    ${shapeClasses}
    flex items-center justify-center
    font-bold text-white
    bg-gradient-to-br ${gradientClass}
    shrink-0
    overflow-hidden
    ${onClick ? "cursor-pointer" : ""}
    ${className}
  `.trim().replace(/\s+/g, " ");

  // If no src or there was an error, show fallback
  if (!currentSrc || imgError) {
    return (
      <div
        className={containerClassName}
        onClick={onClick}
        role={onClick ? "button" : undefined}
        tabIndex={onClick ? 0 : undefined}
        onKeyDown={onClick ? (e) => e.key === "Enter" && onClick() : undefined}
        aria-label={alt || "User avatar"}
      >
        <span className={`${sizeClasses.text} leading-none select-none`}>
          {displayText}
        </span>
      </div>
    );
  }

  return (
    <div className={`relative ${sizeClasses.container} ${shapeClasses} shrink-0 overflow-hidden ${className}`}>
      {/* Loading skeleton */}
      {isLoading && (
        <div className="absolute inset-0 bg-muted animate-pulse" />
      )}
      
      {/* Actual image */}
      <img
        src={currentSrc}
        alt={alt}
        className={`
          w-full h-full object-cover
          ${isLoading ? "opacity-0" : "opacity-100"}
          transition-opacity duration-200
          ${onClick ? "cursor-pointer" : ""}
        `.trim().replace(/\s+/g, " ")}
        onError={() => {
          setImgError(true);
          setIsLoading(false);
        }}
        onLoad={() => setIsLoading(false)}
        loading="lazy"
        decoding="async"
        onClick={onClick}
        tabIndex={onClick ? 0 : undefined}
        onKeyDown={onClick ? (e) => e.key === "Enter" && onClick() : undefined}
      />
    </div>
  );
}

/**
 * Hook-based version for inline usage in existing components.
 * Returns { imgError, setImgError, isLoading } state and a helper function
 * to render either an img or fallback div.
 */
export function useSafeImage(src: string | null | undefined) {
  const [imgError, setImgError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Reset when src changes
  useEffect(() => {
    setImgError(false);
    setIsLoading(true);
  }, [src]);

  return {
    imgError,
    setImgError,
    isLoading,
    hasError: !src || imgError,
    shouldShowImage: src && !imgError,
  };
}

/**
 * Helper function to generate initials from a full name.
 * Can be used independently of the SafeImage component.
 */
export { generateInitials };

export default SafeImage;
