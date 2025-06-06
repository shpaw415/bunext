import Image from "bunext-js/image";

export default function ImageOptimisationTest() {
  return (
    <div>
      <Image
        src="/bunext.png"
        width={40}
        height={40}
        alt="error"
        placeholder="blur"
      />
    </div>
  );
}
