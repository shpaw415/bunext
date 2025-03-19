import Arrow from "./arrow.svg";

export default function Page() {
  return (
    <>
      <title>Welcome to Bunext</title>
      <header className="header">
        <h1 className="title">
          Welcome to <span className="highlight">Bunext</span>
        </h1>
        <p className="subtitle">
          Get started by editing <strong>/src/pages/index.tsx</strong>
        </p>
      </header>
      <main className="main">
        <div className="image-wrapper">
          <img src="/bunext.png" alt="Bunext Logo" className="logo" />
        </div>
        <section className="info-section">
          <h2 className="section-title">Documentation</h2>
          <p className="section-description">
            Read all information about features and API.
          </p>
          <ArrowElement />
        </section>
      </main>
    </>
  );
}

function ArrowElement() {
  //@ts-ignore
  return <Arrow className="arrow" />;
}
