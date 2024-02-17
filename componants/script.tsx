type _Script = {
  fn: Function;
  call?: boolean;
};

/**
 * @param fn (use \\\\\\n to insert \\n in string)
 */
export function Script({ fn, call }: _Script) {
  const fnString = `${fn}`.replaceAll("\\n", "\n").replaceAll("\\\\\\n", "\\n");
  return (
    <script
      type="text/javascript"
      dangerouslySetInnerHTML={{ __html: `const Bunextfn = ${fnString}` }}
    >
      {call && "Bunextfn();"}
    </script>
  );
}
