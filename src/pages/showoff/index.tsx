import { Head } from "@bunpmjs/bunext/head";
import Arrow from "./arrow.svg";
Head.setHead({
  path: "/showoff",
  data: {
    link: [
      {
        rel: "stylesheet",
        href: "index.css",
      },
    ],
  },
});

export default function Page() {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        marginTop: 20,
      }}
    >
      <div
        style={{
          width: "80%",
          maxWidth: 1080,
        }}
      >
        <div
          style={{
            width: "100%",
          }}
        >
          <div id="get-started">
            <p
              style={{
                marginRight: 5,
              }}
            >
              Get started by editing
            </p>
            <strong>/src/pages/index.tsx</strong>
          </div>
        </div>
        <div id="welcome-box">
          <h1
            style={{
              textAlign: "center",
            }}
          >
            Welcome to Bunext
          </h1>
          <div
            className="image-wrapper"
            style={{
              width: "100%",
              height: "150px",
              display: "flex",
              justifyContent: "center",
            }}
          >
            <img
              src="/bunext.png"
              style={{
                width: "150px",
                height: "150px",
                border: "1px solid black",
                borderRadius: "15px",
              }}
            />
          </div>
        </div>
        <footer>
          <section
            style={{
              display: "flex",
              width: "100%",
              minWidth: "100%",
            }}
          >
            <div
              style={{
                width: 200,
                padding: "0 5px 0 15px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  width: "50%",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <h3>Docs</h3>
                <ArrowElement />
              </div>
              <p
                style={{
                  color: "rgba(255,255,255, 0.7)",
                }}
              >
                Read all information about features and API
              </p>
            </div>
          </section>
        </footer>
      </div>
    </div>
  );
}

function ArrowElement() {
  return (
    <Arrow
      style={{
        stroke: "rgb(255,255,255)",
        strokeLinecap: "round",
        strokeLinejoin: "round",
        strokeWidth: 1.5,
        width: 60,
        height: 40,
      }}
    />
  );
}
