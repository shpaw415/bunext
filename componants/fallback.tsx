import { Dev } from "../dev/dev";
import "../internal/globals";

export function ErrorFallback(ErrorInfo: Error) {
  return (
    <>
      <h1>Oups Something Whent wrong...</h1>
      <p dangerouslySetInnerHTML={{ __html: ErrorInfo.message }} />
      {process.env.NODE_ENV == "development" && <Dev />}
    </>
  );
}
