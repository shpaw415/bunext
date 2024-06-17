type LayoutProps = {
  children: JSX.Element;
};

export default function MainLayout({ children }: LayoutProps) {
  return (
    <div>
      Layout
      {children}
    </div>
  );
}
