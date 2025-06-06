import { useEffect, useState } from "react";

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
  ...props
}: ImageProps) {
  const [didLoad, setDidLoad] = useState(false);
  const srcset = responsiveWidths
    ?.filter((w) => w <= width)
    .map((w) => {
      const resizedHeight = Math.round((height / width) * w);
      return `/bunext/image?src=${encodeURIComponent(
        src
      )}&w=${w}&h=${resizedHeight}&q=${quality} ${w}w`;
    })
    .join(", ");

  const [optimizedSrc, setOptimizedSrc] = useState(
    `/bunext/image?src=${encodeURIComponent(
      src
    )}&w=${width}&h=${height}&q=${quality}`
  );

  useEffect(() => {
    if (placeholder != "blur") return;
    let objURL: string | null = null;
    fetch(optimizedSrc)
      .then((res) => res.blob())
      .then((img) => {
        objURL = URL.createObjectURL(img);
        setOptimizedSrc(objURL);
      })
      .finally(() => setDidLoad(true));
    return () => {
      if (objURL) URL.revokeObjectURL(objURL);
    };
  }, [placeholder, src]);

  return placeholder == "blur" && !didLoad ? (
    <img
      src={globalThis?.blurImages?.find((b) => b.img_path == src)?.encoded}
      data-bunext-img-src={src}
      width={width}
      height={height}
      aria-hidden="true"
      {...props}
      style={{
        filter: "blur(8px)",
        ...props.style,
      }}
    />
  ) : (
    <img
      src={optimizedSrc}
      width={width}
      height={height}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      style={{ aspectRatio: `${width} / ${height}`, display: "block" }}
      srcSet={srcset}
      {...props}
    />
  );
}

export { Image };
export default Image;
