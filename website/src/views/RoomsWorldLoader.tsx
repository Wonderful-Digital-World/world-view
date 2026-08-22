"use client";

import dynamic from "next/dynamic";

import type { ReactElement } from "react";

// WebGPU / canvas code must never run during SSR, so the world is loaded
// client-only.
const RoomsWorld = dynamic(
	() => import("@src/views/RoomsWorld").then((module) => module.RoomsWorld),
	{ ssr: false }
);

interface RoomsWorldLoaderProps {
	displayOnly?: boolean;
}

export const RoomsWorldLoader = ({
	displayOnly = false,
}: RoomsWorldLoaderProps): ReactElement => {
	return <RoomsWorld displayOnly={displayOnly} />;
};
