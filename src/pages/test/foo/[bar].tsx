type Props = {
  params: {
    bar: string;
  };
};

export default function BarPage({ params }: Props) {
  return <div>{params.bar}</div>;
}
