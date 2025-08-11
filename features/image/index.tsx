import { useCallback, useEffect, useMemo, useState } from "react";

type ImageProps = {
  width: number;
  height: number;
  sizes?: string;
  priority?: boolean;
  quality?: number;
  placeholder?: "empty" | "blur";
  /**
   * ex: [400, 800, 1200]
   */
  responsiveWidths?: number[];
  /**
   * from "static" path
   * ex: "/images/logo.png" resolve to "static/images/logo.png"
   */
  src: string;
} & React.ImgHTMLAttributes<HTMLImageElement>;

function Image({
  src,
  width,
  height,
  priority,
  quality = 75,
  placeholder = "empty",
  responsiveWidths,
  sizes,
  ...props
}: ImageProps) {
  const [didLoad, setDidLoad] = useState(false);
  const [isLoading, setIsLoading] = useState(placeholder === "blur");
  const [error, setError] = useState<string | null>(null);

  // Memoize the optimized src to avoid recalculation on every render
  const optimizedSrc = useMemo(() =>
    `/bunext/image?src=${encodeURIComponent(src)}&w=${width}&h=${height}&q=${quality}`,
    [src, width, height, quality]
  );

  // Memoize the srcset to avoid recalculation on every render
  const srcset = useMemo(() => {
    if (!responsiveWidths) return undefined;

    return responsiveWidths
      .filter((w) => w <= width)
      .map((w) => {
        const resizedHeight = Math.round((height / width) * w);
        return `/bunext/image?src=${encodeURIComponent(
          src
        )}&w=${w}&h=${resizedHeight}&q=${quality} ${w}w`;
      })
      .join(", ");
  }, [responsiveWidths, width, height, src, quality]);

  // Get blur placeholder from global cache
  const blurPlaceholder = useMemo(() =>
    globalThis?.blurImages?.find((b) => b.img_path === src)?.encoded,
    [src]
  );

  const handleImageLoad = useCallback(() => {
    setDidLoad(true);
    setIsLoading(false);
    setError(null);
  }, []);

  const handleImageError = useCallback(() => {
    setError("Failed to load image");
    setIsLoading(false);
  }, []);

  // Handle blur placeholder loading
  useEffect(() => {
    if (placeholder !== "blur") return;

    let objURL: string | null = null;
    let isCancelled = false;

    const loadBlurImage = async () => {
      try {
        setIsLoading(true);
        const response = await fetch(optimizedSrc);

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const blob = await response.blob();

        if (isCancelled) return;

        objURL = URL.createObjectURL(blob);
        setDidLoad(true);
      } catch (err) {
        if (!isCancelled) {
          setError(err instanceof Error ? err.message : "Failed to load image");
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    loadBlurImage();

    return () => {
      isCancelled = true;
      if (objURL) {
        URL.revokeObjectURL(objURL);
      }
    };
  }, [placeholder, optimizedSrc]);

  // Show error state
  if (error) {
    return (
      <div
        style={{
          width,
          height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#f3f4f6",
          color: "#6b7280",
          fontSize: "14px",
          ...props.style,
        }}
        {...props}
      >
        Failed to load image
      </div>
    );
  }

  // Show blur placeholder while loading
  if (placeholder === "blur" && (!didLoad || isLoading)) {
    return (
      <img
        src={blurPlaceholder}
        data-bunext-img-src={src}
        width={width}
        height={height}
        aria-hidden="true"
        {...props}
        style={{
          filter: "blur(8px)",
          aspectRatio: `${width} / ${height}`,
          display: "block",
          ...props.style,
        }}
        alt="" // Empty alt for decorative blur placeholder
      />
    );
  }

  // Main image
  return (
    <img
      src={optimizedSrc}
      width={width}
      height={height}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      onLoad={handleImageLoad}
      onError={handleImageError}
      style={{
        aspectRatio: `${width} / ${height}`,
        display: "block",
        ...props.style,
      }}
      srcSet={srcset}
      sizes={sizes}
      {...props}
    />
  );
} export { Image };
export default Image;
