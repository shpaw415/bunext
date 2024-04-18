export function ErrorFallback(ErrorInfo: Error) {
  return (
    <>
      <h1>Oups Something Whent wrong...</h1>
      <p dangerouslySetInnerHTML={{ __html: ErrorInfo.message }} />
    </>
  );
}
