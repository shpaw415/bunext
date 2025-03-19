import "./style.css";

export default function Layout({ children }: { children: any }) {
  return (
    <div className="container">
      {children}
      <footer className="footer">
        <p className="footer-text">© 2025 Bunext. All rights reserved.</p>
      </footer>
    </div>
  );
}
