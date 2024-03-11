function ElementA() {
  return <div>A</div>;
}

export function ElementB() {
  return <p>B</p>;
}

export const a = (
  <>
    <ElementA />
    <ElementB />
  </>
);

function ElB() {
  return <></>;
}
