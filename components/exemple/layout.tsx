export default function MainLayout({ children }: { children: JSX.Element }) {
  return (
    <>
      <h1>Main layout heading!</h1>
      {children}
      <h1>Main layout Footer!</h1>
    </>
  );
}
