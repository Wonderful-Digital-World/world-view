import Link from "next/link";

export default function NotFound(): React.ReactElement {
	return (
		<main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-black p-8 text-white">
			<h1 className="text-2xl font-semibold">World View</h1>
			<p className="text-sm text-neutral-300">That view does not exist.</p>
			<Link
				className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black"
				href="/rooms"
			>
				Open World View
			</Link>
		</main>
	);
}
