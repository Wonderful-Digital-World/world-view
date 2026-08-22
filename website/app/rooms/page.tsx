/* eslint-disable react-refresh/only-export-components */

import type { Metadata } from "next";

import { RoomsWorldLoader } from "@src/views/RoomsWorldLoader";

export const metadata: Metadata = {
	title: "World View",
	description: "A state-driven 2D isometric world rendered with PixiJS.",
};

interface RoomsPageProps {
	searchParams: Promise<{ mode?: string | Array<string> }>;
}

export default async function RoomsPage({
	searchParams,
}: RoomsPageProps): Promise<React.ReactElement> {
	const { mode } = await searchParams;
	const selectedMode = Array.isArray(mode) ? mode[0] : mode;
	return <RoomsWorldLoader displayOnly={selectedMode === "display"} />;
}
