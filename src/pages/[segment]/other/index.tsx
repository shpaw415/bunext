type Params = {
  segment: string;
};

export default function Page({ params }: { params: Params }) {
  return <p>{params.segment}</p>;
}
