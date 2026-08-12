/* eslint-disable react-refresh/only-export-components */

import type { Metadata } from "next";

import { RoomsWorldLoader } from "@src/views/RoomsWorldLoader";

export const metadata: Metadata = {
	title: "World View",
	description: "A state-driven 2D isometric world rendered with PixiJS.",
};

export default function RoomsPage(): React.ReactElement {
	return <RoomsWorldLoader />;
}
