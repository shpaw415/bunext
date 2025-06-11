"use client";

import { Link } from "../../../features/router/components";

/**
 * Renders the client-side page for the link feature.
 *
 * Displays the {@link Test} component, which provides navigation to a dynamic route.
 */
export default function LinkPage() {
  return <Test />;
}

/**
 * Renders a button labeled "Test" that navigates to "/dynamic/static/one" when clicked.
 *
 * The button is wrapped in a {@link Link} component for client-side navigation.
 */
function Test() {
  return (
    <Link href="/dynamic/static/one/" preloadOnHover>
      <button>Test</button>
    </Link>
  );
}
