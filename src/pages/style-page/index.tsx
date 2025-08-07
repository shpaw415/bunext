import "@static/test.css";
import moduleCss from "./my-style.module.css";

export default function StyleTestPage() {

  return <StyleTestPageElement />;
}


function StyleTestPageElement() {
  return <div className={moduleCss.test}>Test 3</div>;
}