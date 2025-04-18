const cwd = process.cwd();

export default () =>
  Bun.$`bunx @tailwindcss/cli -i ./static/input-tailwind.css -o ./static/style.css`
    .cwd(cwd)
    .quiet();
