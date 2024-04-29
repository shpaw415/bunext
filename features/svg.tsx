export default function Svg({ src }: { src: string }) {
  return <object data={src} type="image/svg+xml"></object>;
}
