/* eslint-disable react-refresh/only-export-components */

import type { Metadata } from "next";
import type { ReactNode } from "react";

import "@src/styles/tailwind.css";

export const metadata: Metadata = {
	title: "World View",
	description: "A standalone isometric World View rendered with PixiJS.",
};

type RootLayoutProperties = {
	children: ReactNode;
};

export default function RootLayout({
	children,
}: RootLayoutProperties): React.ReactElement {
	return (
		<html lang="en">
			<body>{children}</body>
		</html>
	);
}
