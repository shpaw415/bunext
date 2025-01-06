// this is called on server start

import { clearCache } from "../plugins/svg/init";

export default function Make() {
  clearCache();
}
