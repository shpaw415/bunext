function fakeFunction() {
  `someText}`;
  return {};
}

const fakeFunction2 = () => {
  `someText}`;
  return {};
};

function FindFunction({ name, content }: { name: string; content: string }) {
  if (!content.includes(name)) return null;
  content.indexOf(name);
}

const found = FindFunction({
  name: "fakeFunction",
  content: await Bun.file("utils.ts").text(),
});

console.log(found);
